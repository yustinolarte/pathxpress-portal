/**
 * Route lifecycle and dispatch tools — the admin-side writes that used to need
 * one-off scripts (scripts/fix-status-*, reassign-route-*, fix-route-status-*).
 *
 * Every function takes the route row lock (the same lock the stop engine and
 * the route editors take), checks the transition is legal, and records what it
 * did in routeAuditLog. Stop status corrections go through applyStopStatus so
 * the order, COD and route stay consistent with the driver path.
 */
import { and, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb, markCODCollectedOnDelivery } from './db';
import { driverRoutes, drivers, orders, routeAuditLog, routeOrders, trackingEvents } from '../drizzle/schema';
import {
    RouteGuardError, generateUniqueRouteId, stopHasEvidence, withRouteLock, writeStopSequence,
    type DbHandle,
} from './driverAdmin';
import {
    applyStopStatus, audit, autoCompleteRoute, findCurrentStopId, revertOutForDelivery,
    type StopUpdateResult,
} from './stopStatus';
import { isRouteSettled, isStopFinal, isStopOpen, legOf, orderStatusForStop, type StopStatus } from '@shared/stopTransitions';
import { findPrecedenceViolation } from '@shared/routeSequence';
import { deliveredStatusFor } from '@shared/rto';

const STOP_ORDER_SQL = sql`${routeOrders.sequence} IS NULL`;
const OPEN_ROUTE_STATUSES = ['pending', 'in_progress'];

async function requireDb(): Promise<DbHandle> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    return db;
}

/**
 * Orders whose CURRENT delivery stop is an open stop on this route — the ones
 * the customer may be seeing "Out for Delivery" for. Read BEFORE the route
 * changes status: once it's cancelled, findCurrentStopId no longer sees it.
 */
async function currentOpenDeliveryOrders(tx: DbHandle, routeId: string): Promise<number[]> {
    const stops = await tx.select({ id: routeOrders.id, orderId: routeOrders.orderId, type: routeOrders.type, status: routeOrders.status })
        .from(routeOrders).where(eq(routeOrders.routeId, routeId));
    const result: number[] = [];
    for (const s of stops) {
        if (legOf(s.type) !== 'delivery' || !isStopOpen(s.status)) continue;
        if (await findCurrentStopId(tx, s.orderId, 'delivery') === s.id) result.push(s.orderId);
    }
    return result;
}

async function countUnworked(tx: DbHandle, routeId: string): Promise<number> {
    const stops = await tx.select({ type: routeOrders.type, status: routeOrders.status })
        .from(routeOrders).where(eq(routeOrders.routeId, routeId));
    return stops.filter(s => isStopOpen(s.status)).length;
}

/**
 * Cancel a route that's pending or on the road. Its stops stay as history; open
 * legs go back to the pool (cancelled routes never occupy an order), and orders
 * already "Out for Delivery" return to in_transit.
 */
export async function cancelRoute(routeId: string, actor: string, reason?: string | null) {
    const db = await requireDb();
    return withRouteLock(db, routeId, async (tx, route) => {
        if (route.status === 'cancelled') throw new RouteGuardError('This route is already cancelled');
        if (route.status === 'completed') throw new RouteGuardError('A completed route cannot be cancelled — reopen it first if work is still pending.');

        const toRevert = await currentOpenDeliveryOrders(tx, routeId);
        const unworked = await countUnworked(tx, routeId);
        await tx.update(driverRoutes).set({ status: 'cancelled' }).where(eq(driverRoutes.id, routeId));
        const backToWarehouse = await revertOutForDelivery(tx, toRevert, `Route ${routeId} cancelled`, actor, routeId);
        await audit(tx, {
            routeId, action: 'route_cancelled', fromValue: route.status, toValue: 'cancelled', actor,
            reason: reason ?? null, payload: JSON.stringify({ unworked, backToWarehouse }),
        });
        return { success: true, unworked, backToWarehouse };
    });
}

/**
 * Close a route by hand (driver forgot to finish, or dispatch pulls the van
 * back). Open stops stay on the route as history and their legs are released;
 * out-for-delivery orders go back to in_transit.
 */
export async function closeRoute(routeId: string, actor: string, reason?: string | null) {
    const db = await requireDb();
    return withRouteLock(db, routeId, async (tx, route) => {
        if (!OPEN_ROUTE_STATUSES.includes(route.status)) {
            throw new RouteGuardError(`This route is already ${route.status}`);
        }
        const toRevert = await currentOpenDeliveryOrders(tx, routeId);
        const unworked = await countUnworked(tx, routeId);
        await tx.update(driverRoutes)
            .set({ status: 'completed', finishedAt: route.finishedAt ?? new Date() })
            .where(eq(driverRoutes.id, routeId));
        const backToWarehouse = await revertOutForDelivery(tx, toRevert, `Route ${routeId} closed by dispatch with this stop not worked`, actor, routeId);
        await audit(tx, {
            routeId, action: 'route_closed', fromValue: route.status, toValue: 'completed', actor,
            reason: reason ?? null, payload: JSON.stringify({ unworked, backToWarehouse }),
        });
        return { success: true, unworked, backToWarehouse };
    });
}

/**
 * Put a completed route back on the road — only while its unfinished legs
 * still belong to it. If dispatch already re-planned a leg on another route,
 * re-opening this one would put the package on two routes at once.
 */
export async function reopenRoute(routeId: string, actor: string, reason?: string | null) {
    const db = await requireDb();
    return withRouteLock(db, routeId, async (tx, route) => {
        if (route.status !== 'completed') throw new RouteGuardError('Only a completed route can be reopened');

        const stops = await tx.select({ id: routeOrders.id, orderId: routeOrders.orderId, type: routeOrders.type, status: routeOrders.status, waybillNumber: orders.waybillNumber })
            .from(routeOrders).innerJoin(orders, eq(orders.id, routeOrders.orderId))
            .where(eq(routeOrders.routeId, routeId));
        const unfinished = stops.filter(s => !isStopFinal(legOf(s.type), s.status));
        if (unfinished.length === 0) throw new RouteGuardError('Every stop on this route is already done — there is nothing to reopen.');

        const moved: string[] = [];
        for (const s of unfinished) {
            if (await findCurrentStopId(tx, s.orderId, legOf(s.type)) !== s.id) moved.push(s.waybillNumber);
        }
        if (moved.length > 0) {
            throw new RouteGuardError(`These packages were already planned on another route: ${moved.join(', ')}. Remove them there first.`);
        }

        await tx.update(driverRoutes).set({ status: 'in_progress', finishedAt: null }).where(eq(driverRoutes.id, routeId));
        await audit(tx, { routeId, action: 'route_reopened', fromValue: 'completed', toValue: 'in_progress', actor, reason: reason ?? null });
        return { success: true, reopenedStops: unfinished.length };
    });
}

/**
 * The admin "change route status" entry point, mapped onto the guarded
 * transitions above. It used to write any status blindly: "completed" left
 * open stops and their out-for-delivery orders dangling, and completed or
 * cancelled routes could be flipped back to in_progress with their legs
 * already re-planned elsewhere.
 */
export async function setRouteStatus(routeId: string, status: 'pending' | 'in_progress' | 'completed' | 'cancelled', actor: string, reason?: string | null) {
    if (status === 'completed') return closeRoute(routeId, actor, reason);
    if (status === 'cancelled') return cancelRoute(routeId, actor, reason);
    if (status === 'pending') {
        throw new RouteGuardError('A route cannot be put back to pending — reassign it or cancel it instead.');
    }
    const db = await requireDb();
    const [route] = await db.select({ status: driverRoutes.status }).from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
    if (!route) throw new RouteGuardError('Route not found');
    if (route.status === 'completed') return reopenRoute(routeId, actor, reason);
    if (route.status === 'cancelled') throw new RouteGuardError('A cancelled route cannot be restarted — create a new route instead.');
    return withRouteLock(db, routeId, async (tx, locked) => {
        if (locked.status === 'in_progress') return { success: true };
        await tx.update(driverRoutes).set({ status: 'in_progress' }).where(eq(driverRoutes.id, routeId));
        await audit(tx, { routeId, action: 'route_started_by_admin', fromValue: locked.status, toValue: 'in_progress', actor, reason: reason ?? null });
        return { success: true };
    });
}

/**
 * Give a route nobody has worked yet to another driver (or unassign it). A
 * route with worked stops has cash and POD attributed to its driver — moving
 * the whole route would hand driver A's cash to driver B — so that case is
 * refused and dispatch uses moveStops ("Hand over remaining stops") instead.
 */
export async function reassignRoute(routeId: string, driverId: number | null, actor: string) {
    const db = await requireDb();
    if (driverId !== null) {
        const [driver] = await db.select({ id: drivers.id, status: drivers.status }).from(drivers).where(eq(drivers.id, driverId)).limit(1);
        if (!driver) throw new RouteGuardError('Driver not found');
        if (driver.status !== 'active') throw new RouteGuardError('This driver is not active');
    }
    return withRouteLock(db, routeId, async (tx, route) => {
        if (!OPEN_ROUTE_STATUSES.includes(route.status)) throw new RouteGuardError(`A ${route.status} route cannot be reassigned`);
        if (route.driverId === driverId) return { success: true, changed: false };

        const stops = await tx.select().from(routeOrders).where(eq(routeOrders.routeId, routeId));
        if (stops.some(stopHasEvidence)) {
            throw new RouteGuardError('This route already has worked stops — use "Hand over stops" to move what is left to another driver.');
        }
        // A scan from the old driver started the clock and linked their shift;
        // the new driver's own scan will set both again.
        await tx.update(driverRoutes)
            .set({ driverId, shiftId: null, startedAt: null, status: 'pending' })
            .where(eq(driverRoutes.id, routeId));
        await audit(tx, {
            routeId, action: 'route_reassigned', fromValue: route.driverId === null ? null : String(route.driverId),
            toValue: driverId === null ? null : String(driverId), actor,
        });
        return { success: true, changed: true };
    });
}

export interface MoveStopsInput {
    fromRouteId: string;
    /** Existing open route to move the stops to… */
    toRouteId?: string;
    /** …or a brand-new route for this driver. */
    newRoute?: { driverId: number; date: Date; plannedStartAt?: Date | null };
    stopIds: number[];
}

/**
 * Hand over unworked stops to another route (existing or new). Only open stops
 * with no field evidence move, and an order's other open leg moves with it so a
 * pickup is never split from its delivery. Both routes are locked in id order.
 * Cash already collected stays with the route — and driver — that collected it.
 */
export async function moveStops(input: MoveStopsInput, actor: string) {
    if (!!input.toRouteId === !!input.newRoute) throw new RouteGuardError('Choose either an existing route or a new one');
    if (input.stopIds.length === 0) throw new RouteGuardError('Select at least one stop to move');
    if (input.toRouteId === input.fromRouteId) throw new RouteGuardError('Pick a different route to move the stops to');
    const db = await requireDb();

    if (input.newRoute) {
        const [driver] = await db.select({ status: drivers.status }).from(drivers).where(eq(drivers.id, input.newRoute.driverId)).limit(1);
        if (!driver) throw new RouteGuardError('Driver not found');
        if (driver.status !== 'active') throw new RouteGuardError('This driver is not active');
    }

    return db.transaction(async (txRaw) => {
        const tx = txRaw as unknown as DbHandle;
        const lockIds = [input.fromRouteId, ...(input.toRouteId ? [input.toRouteId] : [])].sort();
        const locked = new Map<string, typeof driverRoutes.$inferSelect>();
        for (const id of lockIds) {
            const [r] = await tx.select().from(driverRoutes).where(eq(driverRoutes.id, id)).limit(1).for('update');
            if (!r) throw new RouteGuardError(`Route ${id} not found`);
            locked.set(id, r);
        }
        const from = locked.get(input.fromRouteId)!;
        if (!OPEN_ROUTE_STATUSES.includes(from.status)) throw new RouteGuardError(`Stops can't be moved off a ${from.status} route`);

        let target: typeof driverRoutes.$inferSelect;
        if (input.toRouteId) {
            target = locked.get(input.toRouteId)!;
            if (!OPEN_ROUTE_STATUSES.includes(target.status)) throw new RouteGuardError(`Stops can't be moved onto a ${target.status} route`);
        } else {
            const id = await generateUniqueRouteId(tx);
            await tx.insert(driverRoutes).values({
                id, driverId: input.newRoute!.driverId, date: input.newRoute!.date, zone: from.zone,
                status: 'pending', plannedStartAt: input.newRoute!.plannedStartAt ?? null,
                startAddress: from.startAddress, startLat: from.startLat, startLng: from.startLng,
            });
            [target] = await tx.select().from(driverRoutes).where(eq(driverRoutes.id, id)).limit(1).for('update');
        }

        const fromStops = await tx.select().from(routeOrders).where(eq(routeOrders.routeId, from.id))
            .orderBy(STOP_ORDER_SQL, routeOrders.sequence, routeOrders.id);
        const requested = new Set(input.stopIds);
        const selected = fromStops.filter(s => requested.has(s.id));
        if (selected.length !== requested.size) throw new RouteGuardError('Some of these stops are no longer on this route. Reload and try again.');
        if (selected.some(s => !isStopOpen(s.status) || stopHasEvidence(s))) {
            throw new RouteGuardError("Only stops the driver hasn't worked yet can be moved.");
        }

        // Keep each order's open legs together.
        const moveIds = new Set(selected.map(s => s.id));
        for (const s of selected) {
            for (const o of fromStops) {
                if (o.orderId === s.orderId && isStopOpen(o.status) && !stopHasEvidence(o)) moveIds.add(o.id);
            }
        }
        const moving = fromStops.filter(s => moveIds.has(s.id));

        const targetStops = await tx.select().from(routeOrders).where(eq(routeOrders.routeId, target.id))
            .orderBy(STOP_ORDER_SQL, routeOrders.sequence, routeOrders.id);
        const targetLegs = new Set(targetStops.map(s => `${s.orderId}:${s.type}`));
        if (moving.some(s => targetLegs.has(`${s.orderId}:${s.type}`))) {
            throw new RouteGuardError('The target route already has one of these stops.');
        }
        const newTarget = [...targetStops, ...moving];
        const violation = findPrecedenceViolation(newTarget.map(s => ({ key: s.id, orderId: s.orderId, type: legOf(s.type) })));
        if (violation) throw new RouteGuardError('Moving these stops would put a delivery before its pickup on the target route.');

        await tx.update(routeOrders).set({ routeId: target.id, status: 'pending' }).where(inArray(routeOrders.id, Array.from(moveIds)));
        await writeStopSequence(tx, target.id, newTarget.map(s => s.id));
        await writeStopSequence(tx, from.id, fromStops.filter(s => !moveIds.has(s.id)).map(s => s.id));

        await audit(tx, {
            routeId: from.id, action: 'stops_moved_out', toValue: target.id, actor,
            payload: JSON.stringify({ stopIds: Array.from(moveIds), orderIds: Array.from(new Set(moving.map(s => s.orderId))) }),
        });
        await audit(tx, {
            routeId: target.id, action: 'stops_moved_in', fromValue: from.id, actor,
            payload: JSON.stringify({ stopIds: Array.from(moveIds) }),
        });
        // Whatever is left on the source may now be all done.
        await autoCompleteRoute(tx, from, new Date(), { kind: 'admin', email: actor });

        return { success: true, moved: moveIds.size, toRouteId: target.id };
    });
}

export interface RouteMetaPatch {
    date?: Date;
    zone?: string | null;
    vehicleInfo?: string | null;
    startAddress?: string | null;
    startLat?: string | null;
    startLng?: string | null;
    plannedStartAt?: Date | null;
}

export async function updateRouteMeta(routeId: string, patch: RouteMetaPatch, actor: string) {
    const db = await requireDb();
    for (const key of ['startLat', 'startLng'] as const) {
        const v = patch[key];
        if (v !== undefined && v !== null && v !== '' && !Number.isFinite(Number(v))) {
            throw new RouteGuardError('The start point coordinates are not valid numbers');
        }
    }
    return withRouteLock(db, routeId, async (tx, route) => {
        if (route.status === 'cancelled') throw new RouteGuardError('A cancelled route cannot be edited');
        const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as RouteMetaPatch;
        if (Object.keys(values).length === 0) return { success: true };
        await tx.update(driverRoutes).set(values).where(eq(driverRoutes.id, routeId));
        const before = Object.fromEntries(Object.keys(values).map(k => [k, (route as Record<string, unknown>)[k]]));
        await audit(tx, { routeId, action: 'route_edited', actor, payload: JSON.stringify({ before, after: values }) });
        return { success: true };
    });
}

/**
 * Correct a stop the driver (or an admin) marked wrong — "marked returned but it
 * was delivered", "marked delivered on the wrong package". Runs the same engine
 * as the app with admin rights, then removes the tracking event the wrong status
 * produced (kept in the audit payload) so the customer's timeline reads right.
 * A correction TO delivered records the COD as collected; a correction AWAY
 * from delivered is refused once its COD is in a remittance (applyStopStatus).
 */
export async function correctStop(input: {
    stopId: number;
    status: StopStatus;
    reason: string;
    notes?: string | null;
    codMethod?: 'cash' | 'card';
}, actor: string): Promise<StopUpdateResult> {
    if (!input.reason.trim()) throw new RouteGuardError('A reason is required to correct a stop');
    const db = await requireDb();

    const [before] = await db.select({ stop: routeOrders, order: orders })
        .from(routeOrders).innerJoin(orders, eq(orders.id, routeOrders.orderId))
        .where(eq(routeOrders.id, input.stopId)).limit(1);
    if (!before) throw new RouteGuardError('Stop not found');
    const leg = legOf(before.stop.type);
    const toDeliveredCod = leg === 'delivery' && input.status === 'delivered' && before.order.codRequired === 1;

    const result = await applyStopStatus(db, {
        stopId: input.stopId,
        status: input.status,
        actor: { kind: 'admin', email: actor },
        notes: input.notes?.trim() || `Status corrected by PathXpress — ${input.reason.trim()}`,
        reason: input.reason.trim(),
        collectedAmount: toDeliveredCod ? (before.order.codAmount || '0') : undefined,
    });
    if (result.outcome !== 'applied') return result;

    const now = new Date();
    if (toDeliveredCod) await markCODCollectedOnDelivery(before.order.id, now, { method: input.codMethod });

    // Remove the customer-facing events the wrong status produced.
    const previous = before.stop.status as StopStatus;
    if (!isStopOpen(previous)) {
        const wrong = orderStatusForStop(leg, previous, {
            hasDeliveryLegOnRoute: leg === 'pickup',
            deliveredStatus: deliveredStatusFor(before.order),
            routeInProgress: true,
        }).events.map(e => e.statusCode);
        const stamp = before.stop.deliveredAt ?? before.stop.pickedUpAt ?? before.stop.attemptedAt;
        if (wrong.length > 0) {
            await db.transaction(async (txRaw) => {
                const tx = txRaw as unknown as DbHandle;
                const candidates = await tx.select().from(trackingEvents).where(and(
                    eq(trackingEvents.shipmentId, before.order.id),
                    inArray(trackingEvents.statusCode, wrong),
                    or(eq(trackingEvents.createdBy, 'driver'), sql`${trackingEvents.createdBy} LIKE '%@%'`),
                )).orderBy(desc(trackingEvents.eventDatetime), desc(trackingEvents.id));
                const removed: typeof candidates = [];
                for (const code of Array.from(new Set(wrong))) {
                    const hit = candidates.find(e => e.statusCode === code
                        && (!stamp || Math.abs(e.eventDatetime.getTime() - stamp.getTime()) < 15 * 60 * 1000));
                    if (hit) removed.push(hit);
                }
                if (removed.length === 0) return;
                await tx.delete(trackingEvents).where(inArray(trackingEvents.id, removed.map(e => e.id)));
                await audit(tx, {
                    routeId: result.routeId, stopId: input.stopId, orderId: before.order.id, action: 'tracking_event_removed',
                    fromValue: previous, toValue: input.status, actor, reason: input.reason.trim(),
                    payload: JSON.stringify(removed),
                });
            });
        }
    }
    return result;
}

/**
 * Close the driver's on-road routes that are fully worked (every stop final or
 * a retryable attempt/hold). Called at clock-out: the driver is going home, so a
 * settled route left "in_progress" is a forgotten "Finish route", not work.
 */
export async function closeSettledRoutesForDriver(db: DbHandle, driverId: number): Promise<number> {
    const routes = await db.select({ id: driverRoutes.id }).from(driverRoutes)
        .where(and(eq(driverRoutes.driverId, driverId), eq(driverRoutes.status, 'in_progress')));
    let closed = 0;
    for (const { id } of routes) {
        const didClose = await withRouteLock(db, id, async (tx, route) => {
            if (route.status !== 'in_progress') return false;
            const stops = await tx.select({ type: routeOrders.type, status: routeOrders.status })
                .from(routeOrders).where(eq(routeOrders.routeId, id));
            if (!isRouteSettled(stops)) return false;
            await tx.update(driverRoutes).set({ status: 'completed', finishedAt: route.finishedAt ?? new Date() })
                .where(eq(driverRoutes.id, id));
            await audit(tx, {
                routeId: id, action: 'route_closed_at_clock_out', fromValue: 'in_progress', toValue: 'completed',
                actor: `driver:${driverId}`, reason: 'Every stop was worked; the driver clocked out',
            });
            return true;
        });
        if (didClose) closed++;
    }
    return closed;
}

/** What happened on a route, newest first — the route details "History" tab. */
export async function getRouteAuditLog(routeId: string) {
    const db = await requireDb();
    const stopOrders = await db.select({ orderId: routeOrders.orderId }).from(routeOrders).where(eq(routeOrders.routeId, routeId));
    const orderIds = Array.from(new Set(stopOrders.map(s => s.orderId)));
    const rows = await db.select().from(routeAuditLog)
        .where(orderIds.length > 0
            ? or(eq(routeAuditLog.routeId, routeId), and(isNull(routeAuditLog.routeId), inArray(routeAuditLog.orderId, orderIds)))
            : eq(routeAuditLog.routeId, routeId))
        .orderBy(desc(routeAuditLog.createdAt), desc(routeAuditLog.id))
        .limit(200);
    const waybills = orderIds.length > 0
        ? new Map((await db.select({ id: orders.id, waybillNumber: orders.waybillNumber }).from(orders).where(inArray(orders.id, orderIds))).map(o => [o.id, o.waybillNumber]))
        : new Map<number, string>();
    // Payloads can hold whole rows (POD URLs, deleted events): the UI only needs the summary.
    return rows.map(({ payload: _payload, ...r }) => ({ ...r, waybillNumber: r.orderId ? waybills.get(r.orderId) ?? null : null }));
}

/** Driver updates the server ignored recently (late replays, wrong route) — a Dispatch alert. */
export async function getIgnoredDriverUpdates(sinceHours = 48) {
    const db = await requireDb();
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    return db.select({
        id: routeAuditLog.id, routeId: routeAuditLog.routeId, orderId: routeAuditLog.orderId,
        fromValue: routeAuditLog.fromValue, toValue: routeAuditLog.toValue, actor: routeAuditLog.actor,
        reason: routeAuditLog.reason, createdAt: routeAuditLog.createdAt, waybillNumber: orders.waybillNumber,
    })
        .from(routeAuditLog)
        .leftJoin(orders, eq(orders.id, routeAuditLog.orderId))
        .where(and(
            inArray(routeAuditLog.action, ['driver_update_ignored', 'driver_route_update_ignored']),
            gte(routeAuditLog.createdAt, since),
        ))
        .orderBy(desc(routeAuditLog.createdAt))
        .limit(50);
}
