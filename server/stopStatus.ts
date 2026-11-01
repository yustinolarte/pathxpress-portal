/**
 * The one place a route stop changes status — driver app and admin alike.
 *
 * Every write runs in a single transaction holding the route row lock (the
 * same lock the admin route editors take) and the order row lock, and applies
 * the rules in shared/stopTransitions.ts:
 *   - a replayed status is a no-op: no duplicate tracking events, no COD re-stamp;
 *   - a worked stop never changes from the app (only an admin can correct it);
 *   - a stop on an old route never overwrites the order once the package moved
 *     to a newer route;
 *   - delivering with the pickup still open completes the pickup, a failed
 *     pickup fails its delivery, and a route whose every stop is final closes.
 *
 * Network work (POD uploads, fee lookups) happens BEFORE calling in here —
 * keep the transaction short.
 */
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { getDb } from './db';
import {
    codRecords, codRemittanceItems, codRemittances, driverRoutes, orders, routeAuditLog, routeOrders, trackingEvents,
} from '../drizzle/schema';
import {
    checkStopTransition, isRouteFinished, isStopFinal, isStopOpen, legOf, orderStatusForStop, siblingEffect,
    stopStatusForOrderStatus,
    type StopLeg, type StopStatus,
} from '@shared/stopTransitions';
import { OUT_FOR_DELIVERY_FROM_STATUSES, needsPickup } from '@shared/orderStatus';
import { deliveredStatusFor } from '@shared/rto';

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Stop = typeof routeOrders.$inferSelect;
type Route = typeof driverRoutes.$inferSelect;
type Order = typeof orders.$inferSelect;

export class StopStatusError extends Error {
    constructor(message: string, readonly httpStatus: 400 | 403 | 404 | 409 = 400) {
        super(message);
        this.name = 'StopStatusError';
    }
}

export type StopActor =
    | { kind: 'driver'; driverId: number; driverName?: string | null }
    | { kind: 'admin'; email: string };

export interface StopCodCollection {
    /** What gets recorded as collected (request amount, or what was due). */
    amount: string;
    method: 'cash' | 'card';
    paymentReference: string | null;
    /** Fee frozen at collection time — computed by the caller, outside the transaction. */
    feeAmount: string;
}

export interface StopUpdateInput {
    stopId: number;
    status: string;
    actor: StopActor;
    notes?: string | null;
    /** Already-resolved POD URLs. Undefined keeps the current ones. */
    photoUrls?: [string | null, string | null];
    /** routeOrders.collectedAmount for a delivered stop. */
    collectedAmount?: string | null;
    /** COD to record when a COD delivery is delivered (driver path only). */
    cod?: StopCodCollection | null;
    deliveredLat?: number | null;
    deliveredLng?: number | null;
    /** Admin corrections: why. Stored in the audit log. */
    reason?: string | null;
}

export interface StopUpdateResult {
    outcome: 'applied' | 'noop' | 'ignored';
    /** Why it was ignored — sent back to the app, logged in routeAuditLog. */
    reason?: string;
    stopId: number;
    stopType: StopLeg;
    /** Authoritative stop status after the call. */
    stopStatus: string;
    orderId: number;
    orderStatus: string;
    routeId: string;
    routeStatus: string;
    routeCompleted: boolean;
    /** The route went on the road through this call — the caller should markRouteStarted(). */
    routeStarted: boolean;
}

const actorLabel = (actor: StopActor) => actor.kind === 'admin' ? actor.email : `driver:${actor.driverId}`;

export async function audit(tx: Db, entry: typeof routeAuditLog.$inferInsert) {
    await tx.insert(routeAuditLog).values({
        ...entry,
        reason: entry.reason ? entry.reason.slice(0, 2000) : null,
        // Stamped here, not by the column default: MySQL's now() follows the
        // server's time zone, while every timestamp the app writes is UTC.
        createdAt: entry.createdAt ?? new Date(),
    });
}

/**
 * The stop that currently owns this order leg: the newest one on a route that
 * wasn't cancelled. A package re-dispatched after a failed attempt has stops on
 * both routes; only the newest may move the order.
 */
export async function findCurrentStopId(db: Db, orderId: number, leg: StopLeg): Promise<number | null> {
    const [row] = await db
        .select({ id: routeOrders.id })
        .from(routeOrders)
        .innerJoin(driverRoutes, eq(routeOrders.routeId, driverRoutes.id))
        .where(and(
            eq(routeOrders.orderId, orderId),
            eq(routeOrders.type, leg),
            ne(driverRoutes.status, 'cancelled'),
        ))
        .orderBy(desc(routeOrders.id))
        .limit(1);
    return row?.id ?? null;
}

/** Stop columns for reaching `to` — timestamps stamped once, evidence cleared on an admin revert. */
function stopPatch(stop: Stop, to: StopStatus, now: Date, actor: StopActor): Partial<Stop> {
    const patch: Partial<Stop> = { status: to };
    if (to === 'picked_up') patch.pickedUpAt = stop.pickedUpAt ?? now;
    if (to === 'delivered') patch.deliveredAt = stop.deliveredAt ?? now;
    if (to === 'attempted' || to === 'failed' || to === 'returned') patch.attemptedAt = now;
    if (to !== 'delivered') patch.collectedAmount = null;
    if (actor.kind === 'admin' && isStopOpen(to)) {
        // An admin re-opening a stop says "this didn't happen": drop the evidence
        // so the stop can be removed or re-worked. The audit payload keeps it.
        Object.assign(patch, {
            pickedUpAt: null, deliveredAt: null, attemptedAt: null,
            proofPhotoUrl: null, proofPhotoUrl2: null, deliveredLat: null, deliveredLng: null,
        });
    }
    return patch;
}

/** Remittance a COD record is already part of (draft or approved), if any. */
async function remittanceHolding(tx: Db, codRecordId: number) {
    const [row] = await tx
        .select({ number: codRemittances.remittanceNumber, status: codRemittances.status })
        .from(codRemittanceItems)
        .innerJoin(codRemittances, eq(codRemittances.id, codRemittanceItems.remittanceId))
        .where(eq(codRemittanceItems.codRecordId, codRecordId))
        .limit(1);
    return row ?? null;
}

/** Record a driver's COD collection — never touching a record that's settled or spoken for. */
async function collectCod(tx: Db, order: Order, cod: StopCodCollection, now: Date) {
    const [existing] = await tx.select().from(codRecords).where(eq(codRecords.shipmentId, order.id)).limit(1);
    const collection = {
        status: 'collected' as const,
        collectedDate: now,
        codAmount: cod.amount,
        collectedMethod: cod.method,
        paymentReference: cod.method === 'card' ? cod.paymentReference : null,
        feeAmount: cod.feeAmount,
    };
    if (!existing) {
        await tx.insert(codRecords).values({
            shipmentId: order.id,
            codCurrency: order.codCurrency || 'AED',
            allowedMethods: order.codPaymentMethod || 'cash',
            ...collection,
        });
        return;
    }
    // collected / remitted / disputed: already settled — a replay must not move
    // collectedDate (and with it the weekly cutoff) or recompute the fee, and
    // must never pull a remitted record back into the next payout.
    if (existing.status !== 'pending_collection' && existing.status !== 'cancelled') return;
    if (await remittanceHolding(tx, existing.id)) return;
    await tx.update(codRecords).set(collection).where(eq(codRecords.id, existing.id));
}

/**
 * Undo a COD collection when a delivered stop is corrected to anything else.
 * Refuses (admin sees why) once the money is in a remittance.
 */
async function revertCodCollection(tx: Db, orderId: number, mode: 'refuse' | 'skip'): Promise<'reverted' | 'none' | 'blocked'> {
    const [existing] = await tx.select().from(codRecords).where(eq(codRecords.shipmentId, orderId)).limit(1);
    if (!existing || existing.status === 'pending_collection' || existing.status === 'cancelled') return 'none';
    const holding = existing.status === 'collected' ? await remittanceHolding(tx, existing.id) : null;
    if (existing.status !== 'collected' || holding) {
        if (mode === 'skip') return 'blocked';
        const where = holding ? `remittance ${holding.number} (${holding.status})` : `a ${existing.status} COD record`;
        throw new StopStatusError(`The COD for this order is already in ${where}. Adjust the remittance before correcting the stop.`, 409);
    }
    await tx.update(codRecords).set({
        status: 'pending_collection', collectedDate: null, collectedMethod: null, paymentReference: null, feeAmount: null,
    }).where(eq(codRecords.id, existing.id));
    return 'reverted';
}

/** Close the route when every stop is final. Returns true when it just closed. */
export async function autoCompleteRoute(tx: Db, route: Route, now: Date, actor: StopActor): Promise<boolean> {
    if (route.status !== 'pending' && route.status !== 'in_progress') return false;
    const stops = await tx.select({ type: routeOrders.type, status: routeOrders.status })
        .from(routeOrders).where(eq(routeOrders.routeId, route.id));
    if (!isRouteFinished(stops)) return false;
    await tx.update(driverRoutes)
        .set({ status: 'completed', finishedAt: route.finishedAt ?? now })
        .where(eq(driverRoutes.id, route.id));
    await audit(tx, {
        routeId: route.id, action: 'route_auto_completed', fromValue: route.status, toValue: 'completed',
        actor: actorLabel(actor), reason: 'Every stop reached a final status',
    });
    return true;
}

/**
 * Apply a stop status change requested by the driver app or an admin.
 * Throws StopStatusError for requests that are malformed or not allowed
 * (bad status, wrong driver, COD already remitted); returns `ignored` for
 * legitimate-but-stale requests so the app's offline queue can drain.
 */
export async function applyStopStatus(db: Db, input: StopUpdateInput): Promise<StopUpdateResult> {
    const to = (input.status ?? '').toString().trim().toLowerCase();
    const now = new Date();

    return db.transaction(async (txRaw) => {
        const tx = txRaw as unknown as Db;

        const [head] = await tx.select({ routeId: routeOrders.routeId }).from(routeOrders)
            .where(eq(routeOrders.id, input.stopId)).limit(1);
        if (!head) throw new StopStatusError('Stop not found', 404);

        const [lockedRoute] = await tx.select().from(driverRoutes)
            .where(eq(driverRoutes.id, head.routeId)).limit(1).for('update');
        if (!lockedRoute) throw new StopStatusError('Route not found', 404);
        let route: Route = lockedRoute;
        const [stop] = await tx.select().from(routeOrders).where(eq(routeOrders.id, input.stopId)).limit(1);
        if (!stop) throw new StopStatusError('Stop not found', 404);
        const [order] = await tx.select().from(orders).where(eq(orders.id, stop.orderId)).limit(1).for('update');
        if (!order) throw new StopStatusError('Order not found', 404);

        const leg = legOf(stop.type);
        const result = (outcome: StopUpdateResult['outcome'], extra: Partial<StopUpdateResult> = {}): StopUpdateResult => ({
            outcome, stopId: stop.id, stopType: leg, stopStatus: stop.status, orderId: order.id, orderStatus: order.status,
            routeId: route.id, routeStatus: route.status, routeCompleted: false, routeStarted: false, ...extra,
        });
        const ignore = async (reason: string, action = 'driver_update_ignored') => {
            await audit(tx, {
                routeId: route.id, stopId: stop.id, orderId: order.id, action,
                fromValue: stop.status, toValue: to.slice(0, 50), actor: actorLabel(input.actor), reason,
            });
            return result('ignored', { reason });
        };

        // --- Access -------------------------------------------------------------
        let routeStarted = false;
        if (input.actor.kind === 'driver') {
            if (route.driverId !== null && route.driverId !== input.actor.driverId) {
                throw new StopStatusError('Access denied', 403);
            }
            if (route.status === 'cancelled') return ignore('This route was cancelled');
            if (route.driverId === null) {
                // Same as scanning the route QR: the first driver to work an
                // unassigned route claims it; everyone else is then locked out.
                await tx.update(driverRoutes).set({ driverId: input.actor.driverId }).where(eq(driverRoutes.id, route.id));
                route = { ...route, driverId: input.actor.driverId };
            }
        }

        // --- Validity -----------------------------------------------------------
        const verdict = checkStopTransition(leg, stop.status, to, input.actor.kind);
        if (verdict.kind === 'invalid') throw new StopStatusError(verdict.reason, 400);
        if (verdict.kind === 'noop') return result('noop');

        const currentStopId = await findCurrentStopId(tx, order.id, leg);
        if (currentStopId !== null && currentStopId !== stop.id) {
            if (input.actor.kind === 'driver') return ignore('This package was moved to a newer route');
            throw new StopStatusError('This stop is not the current one for this package — correct it on its newest route', 409);
        }
        if (verdict.kind === 'conflict') return ignore(verdict.reason);

        const toStatus = to as StopStatus;
        const siblings = await tx.select().from(routeOrders).where(and(
            eq(routeOrders.routeId, route.id), eq(routeOrders.orderId, order.id), ne(routeOrders.id, stop.id),
        ));
        const otherLeg: StopLeg = leg === 'pickup' ? 'delivery' : 'pickup';
        const sameOrderOtherLeg = siblings.filter(s => legOf(s.type) === otherLeg);
        const sibling = sameOrderOtherLeg[0];
        const effect = siblingEffect(leg, toStatus, sibling?.status, input.actor.kind);
        if (effect.kind === 'conflict') return ignore(effect.reason);

        // --- Admin correction of a delivered stop: undo the COD first (may refuse) ---
        if (input.actor.kind === 'admin' && leg === 'delivery' && stop.status === 'delivered' && toStatus !== 'delivered') {
            await revertCodCollection(tx, order.id, 'refuse');
        }

        // --- Route goes on the road with its first worked stop -----------------
        if (input.actor.kind === 'driver' && route.status === 'pending') {
            await tx.update(driverRoutes).set({ status: 'in_progress' }).where(eq(driverRoutes.id, route.id));
            route = { ...route, status: 'in_progress' };
            routeStarted = true;
        }

        // --- Stop ---------------------------------------------------------------
        const patch = stopPatch(stop, toStatus, now, input.actor);
        // The stop note is the driver's own words (shown as "Driver: …"). An admin
        // correction's note goes to the tracking event and the audit log instead.
        if (input.notes && input.actor.kind === 'driver') patch.notes = input.notes;
        if (input.photoUrls) [patch.proofPhotoUrl, patch.proofPhotoUrl2] = input.photoUrls;
        if (toStatus === 'delivered' && input.collectedAmount !== undefined) patch.collectedAmount = input.collectedAmount;
        if (typeof input.deliveredLat === 'number' && typeof input.deliveredLng === 'number') {
            patch.deliveredLat = input.deliveredLat;
            patch.deliveredLng = input.deliveredLng;
        }
        await tx.update(routeOrders).set(patch).where(eq(routeOrders.id, stop.id));

        // --- The other leg of the same order on this route ---------------------
        const events: { statusCode: string; statusLabel: string }[] = [];
        const orderPatch: Partial<Order> = {};
        if (effect.kind === 'completeSiblingPickup') {
            for (const p of sameOrderOtherLeg.filter(s => isStopOpen(s.status) || s.status === 'on_hold')) {
                await tx.update(routeOrders).set({ status: 'picked_up', pickedUpAt: p.pickedUpAt ?? now }).where(eq(routeOrders.id, p.id));
            }
            if (needsPickup(order.status)) {
                events.push({ statusCode: 'picked_up', statusLabel: 'Picked Up' });
                orderPatch.pickupDate = order.pickupDate ?? now;
                if (input.actor.kind === 'driver') orderPatch.pickupDriverId = input.actor.driverId;
            }
        } else if (effect.kind === 'failSiblingDelivery') {
            for (const d of sameOrderOtherLeg.filter(s => !isStopFinal('delivery', s.status))) {
                await tx.update(routeOrders)
                    .set({ status: 'failed', attemptedAt: now, notes: 'Pickup failed', collectedAmount: null })
                    .where(eq(routeOrders.id, d.id));
            }
        }

        // --- Order + tracking ---------------------------------------------------
        // The app marking a stop in_progress (on its way) is stop-level only:
        // the order already went out for delivery at route scan. Only an admin
        // re-opening a worked stop moves the order back.
        const change = input.actor.kind === 'driver' && isStopOpen(toStatus)
            ? { status: null, events: [] }
            : orderStatusForStop(leg, toStatus, {
                hasDeliveryLegOnRoute: leg === 'pickup' && sameOrderOtherLeg.length > 0,
                deliveredStatus: deliveredStatusFor(order),
                routeInProgress: route.status === 'in_progress',
            });
        events.push(...change.events);
        if (change.status) {
            orderPatch.status = change.status;
            orderPatch.lastStatusUpdate = now;
        }
        if (leg === 'pickup' && toStatus === 'picked_up') {
            orderPatch.pickupDate = order.pickupDate ?? now;
            if (input.actor.kind === 'driver') orderPatch.pickupDriverId = input.actor.driverId;
        }
        if (leg === 'delivery' && toStatus === 'delivered') orderPatch.deliveryDateReal = now;
        if (Object.keys(orderPatch).length > 0) {
            await tx.update(orders).set(orderPatch).where(eq(orders.id, order.id));
        }

        if (events.length > 0) {
            const location = (leg === 'pickup' ? order.shipperCity : order.city) || 'Unknown';
            const by = input.actor.kind === 'driver'
                ? `by driver ${input.actor.driverName || 'Unknown'}`
                : 'by PathXpress';
            const [photo1, photo2] = input.photoUrls ?? [null, null];
            await tx.insert(trackingEvents).values(events.map((e, i) => {
                const isLast = i === events.length - 1;
                return {
                    shipmentId: order.id,
                    // Keep the timeline in order without inventing a gap: 1s apart.
                    eventDatetime: new Date(now.getTime() - (events.length - 1 - i) * 1000),
                    location,
                    statusCode: e.statusCode,
                    statusLabel: e.statusLabel,
                    description: isLast && input.notes ? input.notes : `${e.statusLabel} ${by}`,
                    podFileUrl: isLast ? photo1 || undefined : undefined,
                    podFileUrl2: isLast ? photo2 || undefined : undefined,
                    createdBy: input.actor.kind === 'driver' ? 'driver' : input.actor.email,
                };
            }));
        }

        // --- COD ----------------------------------------------------------------
        if (input.cod && leg === 'delivery' && toStatus === 'delivered' && order.codRequired) {
            await collectCod(tx, order, input.cod, now);
        }

        // --- Audit what isn't a plain driver update ----------------------------
        if (input.actor.kind === 'admin') {
            await audit(tx, {
                routeId: route.id, stopId: stop.id, orderId: order.id, action: 'stop_corrected',
                fromValue: stop.status, toValue: toStatus, actor: actorLabel(input.actor), reason: input.reason ?? null,
                payload: JSON.stringify({ before: stop, orderStatusBefore: order.status }),
            });
        } else if (route.status === 'completed') {
            await audit(tx, {
                routeId: route.id, stopId: stop.id, orderId: order.id, action: 'late_update_accepted',
                fromValue: stop.status, toValue: toStatus, actor: actorLabel(input.actor),
                reason: 'Stop updated after its route was closed (offline replay)',
            });
        }

        const routeCompleted = await autoCompleteRoute(tx, route, now, input.actor);
        return result('applied', {
            stopStatus: toStatus,
            orderStatus: orderPatch.status ?? order.status,
            routeStatus: routeCompleted ? 'completed' : route.status,
            routeCompleted,
            routeStarted,
        });
    });
}

/**
 * Keep the route stops truthful after an admin sets an order status directly
 * (Change status / Add tracking event). The order row and its tracking event
 * are already written by the caller; this only moves the order's CURRENT stops
 * to the status that order status implies, per leg — never a pickup to
 * 'delivered', never a delivery to 'picked_up', never a stop on an old route.
 *
 * Going backwards is a correction (delivered → pending_pickup re-opens both
 * legs). A collected COD is undone with it unless it's already remitted, in
 * which case the stop still moves and the blocked COD is logged for review.
 */
export async function syncStopsToOrderStatus(db: Db, orderId: number, orderStatus: string, actor: string): Promise<void> {
    const now = new Date();
    const admin: StopActor = { kind: 'admin', email: actor };
    for (const leg of ['pickup', 'delivery'] as const) {
        const target = stopStatusForOrderStatus(leg, orderStatus);
        if (!target) continue;
        const stopId = await findCurrentStopId(db, orderId, leg);
        if (stopId === null) continue;

        await db.transaction(async (txRaw) => {
            const tx = txRaw as unknown as Db;
            const [head] = await tx.select({ routeId: routeOrders.routeId }).from(routeOrders).where(eq(routeOrders.id, stopId)).limit(1);
            if (!head) return;
            const [route] = await tx.select().from(driverRoutes).where(eq(driverRoutes.id, head.routeId)).limit(1).for('update');
            const [stop] = await tx.select().from(routeOrders).where(eq(routeOrders.id, stopId)).limit(1);
            if (!route || !stop) return;

            if (stop.status === target) return;
            if (isStopOpen(target) && isStopOpen(stop.status)) return; // pending vs in_progress: nothing to fix

            let codNote: string | null = null;
            if (leg === 'delivery' && stop.status === 'delivered' && target !== 'delivered') {
                const cod = await revertCodCollection(tx, orderId, 'skip');
                if (cod === 'blocked') codNote = 'COD already remitted — not reverted, review the remittance';
            }

            await tx.update(routeOrders).set(stopPatch(stop, target, now, admin)).where(eq(routeOrders.id, stop.id));

            if (leg === 'pickup' && (target === 'failed' || target === 'attempted')) {
                const deliveries = await tx.select().from(routeOrders).where(and(
                    eq(routeOrders.routeId, route.id), eq(routeOrders.orderId, orderId), eq(routeOrders.type, 'delivery'),
                ));
                for (const d of deliveries.filter(s => !isStopFinal('delivery', s.status))) {
                    await tx.update(routeOrders)
                        .set({ status: 'failed', attemptedAt: now, notes: 'Pickup failed', collectedAmount: null })
                        .where(eq(routeOrders.id, d.id));
                }
            }

            await audit(tx, {
                routeId: route.id, stopId: stop.id, orderId, action: 'stop_synced_from_order',
                fromValue: stop.status, toValue: target, actor,
                reason: [`Order status set to ${orderStatus}`, codNote].filter(Boolean).join('. '),
                payload: JSON.stringify({ before: stop }),
            });
            await autoCompleteRoute(tx, route, now, admin);
        });
    }
}

/**
 * A route went on the road: its delivery-only orders (no pickup leg on this
 * route — the package is already with us) go out for delivery. Only orders
 * whose CURRENT delivery stop is on this route, and only from statuses before
 * out_for_delivery (OUT_FOR_DELIVERY_FROM_STATUSES), so a re-scan never revives
 * a delivered order, never double-logs, and an old stuck route re-scanned can't
 * drag a package that was re-dispatched elsewhere.
 */
export async function sendDeliveryOnlyOrdersOut(db: Db, routeId: string): Promise<number> {
    const stops = await db.select({ id: routeOrders.id, orderId: routeOrders.orderId, type: routeOrders.type })
        .from(routeOrders).where(eq(routeOrders.routeId, routeId));
    const pickupOrders = new Set(stops.filter(s => s.type === 'pickup').map(s => s.orderId));
    const candidates = stops.filter(s => s.type === 'delivery' && !pickupOrders.has(s.orderId));
    let sent = 0;
    for (const stop of candidates) {
        if (await findCurrentStopId(db, stop.orderId, 'delivery') !== stop.id) continue;
        const now = new Date();
        const updated = await db.update(orders)
            .set({ status: 'out_for_delivery', lastStatusUpdate: now })
            .where(and(eq(orders.id, stop.orderId), inArray(orders.status, OUT_FOR_DELIVERY_FROM_STATUSES)));
        if ((updated as any)?.[0]?.affectedRows > 0) {
            await db.insert(trackingEvents).values({
                shipmentId: stop.orderId,
                eventDatetime: now,
                location: 'Driver Route',
                statusCode: 'out_for_delivery',
                statusLabel: 'Out for Delivery',
                description: 'Package is out for delivery with driver',
                createdBy: 'driver',
            });
            sent++;
        }
    }
    return sent;
}

/**
 * Pull an order back off the road when its stop leaves a route that was
 * already scanned: an out_for_delivery order whose current delivery stop is
 * being released goes back to in_transit (decided 2026-10-31), so the customer
 * stops seeing "Out for Delivery" for a package sitting at the warehouse.
 */
export async function revertOutForDelivery(tx: Db, orderIds: number[], reason: string, actor: string, routeId?: string): Promise<number> {
    let reverted = 0;
    const now = new Date();
    for (const orderId of Array.from(new Set(orderIds))) {
        const [order] = await tx.select({ id: orders.id, status: orders.status, city: orders.city })
            .from(orders).where(eq(orders.id, orderId)).limit(1).for('update');
        if (!order || order.status !== 'out_for_delivery') continue;
        await tx.update(orders).set({ status: 'in_transit', lastStatusUpdate: now }).where(eq(orders.id, orderId));
        await tx.insert(trackingEvents).values({
            shipmentId: orderId,
            eventDatetime: now,
            location: 'Warehouse',
            statusCode: 'in_transit',
            statusLabel: 'In Transit',
            description: 'Removed from route — back at warehouse',
            createdBy: actor,
        });
        await audit(tx, { routeId: routeId ?? null, orderId, action: 'order_back_to_warehouse', fromValue: 'out_for_delivery', toValue: 'in_transit', actor, reason });
        reverted++;
    }
    return reverted;
}
