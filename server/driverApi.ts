/**
 * REST API endpoints for the Driver mobile app
 * These endpoints are accessed via /api/driver/*
 */
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, and, or, inArray, isNull, desc, sql } from 'drizzle-orm';
import { getDb, calculateCODFeeByMethod } from './db';
import { drivers, driverRoutes, routeOrders, orders, driverReports, driverShifts, driverLocations, trackingEvents, codRecords, routeAuditLog } from '../drizzle/schema';
import { uploadImageToCloudinary } from './cloudinary';
import { extractDeliveryPhotoBase64s, extractDeliveryPhotoUrls, getProofPhotoUrls } from '../shared/podPhotos';
import { isStaleOpenShift } from './driverShiftRules';
import {
    StopStatusError, applyStopStatus, findCurrentStopId, revertOutForDelivery, sendDeliveryOnlyOrdersOut,
    type StopCodCollection,
} from './stopStatus';
import { checkDriverRouteTransition, isStopOpen, isStopSettled, legOf } from '@shared/stopTransitions';
import { closeSettledRoutesForDriver } from './routeLifecycle';

const router = Router();

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * The driver's currently open shift, or undefined.
 *
 * MUST use isNull(): `eq(driverShifts.endTime, null)` compiles to `endTime = NULL`,
 * which is never true in SQL. That silently broke the whole shift feature —
 * /shifts/start created a duplicate shift on every call, /shifts/end always 404'd
 * so nothing ever closed, /shifts/status always reported off-duty, and
 * /shifts/route-report never found a shift to link, leaving driverRoutes.shiftId
 * permanently NULL.
 *
 * Ordered newest-first so the pre-fix backlog of duplicate open shifts resolves to
 * the most recent one rather than an arbitrary row.
 */
export async function findOpenShift(db: Db, driverId: number) {
    const [shift] = await db
        .select()
        .from(driverShifts)
        .where(and(
            eq(driverShifts.driverId, driverId),
            isNull(driverShifts.endTime),
        ))
        .orderBy(desc(driverShifts.startTime))
        .limit(1);
    return shift;
}

/**
 * Latest real activity timestamp across the stops of routes linked to this shift
 * (driverRoutes.shiftId), or null if it has none. Mirrors exactly what
 * scripts/repair-orphan-driver-shifts.ts does offline to close a shift nobody
 * clocked out of — this is the same repair, just applied live instead of in a
 * batch script.
 */
async function lastAttributableActivity(db: Db, shiftId: number): Promise<Date | null> {
    const linkedRoutes = await db.select({ id: driverRoutes.id })
        .from(driverRoutes).where(eq(driverRoutes.shiftId, shiftId));
    if (linkedRoutes.length === 0) return null;

    const stops = await db.select({
        attemptedAt: routeOrders.attemptedAt,
        deliveredAt: routeOrders.deliveredAt,
        pickedUpAt: routeOrders.pickedUpAt,
    }).from(routeOrders).where(inArray(routeOrders.routeId, linkedRoutes.map(r => r.id)));

    let latest: Date | null = null;
    for (const s of stops) {
        for (const ts of [s.deliveredAt, s.pickedUpAt, s.attemptedAt]) {
            if (ts && (!latest || ts > latest)) latest = ts;
        }
    }
    return latest;
}

/**
 * Finds the driver's open shift, or opens one right now if there isn't one.
 * Shared by /shifts/start (explicit clock-in) and markRouteStarted (starting
 * a route is itself proof the driver is on duty, even if the app never called
 * /shifts/start) so there is exactly one place that has to get the race right.
 *
 * Check-and-insert has to be atomic. A bare "look for an open shift, then
 * insert" loses a double-tap or an offline-queue replay: both requests find
 * nothing and both insert, producing two shifts with the same start time and
 * a driver who can never be cleanly clocked out. Locking the driver row
 * serialises concurrent clock-ins for that driver.
 *
 * A STALE open shift (isStaleOpenShift — open past MAX_SHIFT_HOURS) is never
 * handed back as "the" open shift: that's a missed clock-out, not proof the
 * driver is still on duty, and attaching a new route/clock-in to it would bill
 * the whole dead window as worked time (production shift #265: 31h+ open,
 * driver 4, while dispatch already showed 0 active drivers). Instead it gets
 * closed at its last attributable activity — never at `now` and never at the
 * MAX_SHIFT_HOURS cap, both of which would invent paid hours nobody worked —
 * before a fresh shift is opened. This happens inside the same driver-row lock
 * as the rest of the function so a concurrent request can't race the close.
 *
 * clientRef is the app's own id for the shift (sent by /shifts/start). It is
 * attached to an open shift that doesn't have one yet — a route claim usually
 * opens the shift a moment before the app's clock-in call arrives — so a later
 * /shifts/end replayed from the offline queue can find this exact shift.
 */
export async function findOrCreateOpenShift(db: Db, driverId: number, clientRef?: string) {
    return db.transaction(async (tx) => {
        await tx.select({ id: drivers.id })
            .from(drivers)
            .where(eq(drivers.id, driverId))
            .for('update');

        const existing = await findOpenShift(tx as unknown as Db, driverId);
        const now = new Date();
        if (existing) {
            if (!isStaleOpenShift(existing, now)) {
                if (clientRef && !existing.clientRef) {
                    await tx.update(driverShifts).set({ clientRef }).where(eq(driverShifts.id, existing.id));
                    return { ...existing, clientRef };
                }
                return existing;
            }

            const closeAt = (await lastAttributableActivity(tx as unknown as Db, existing.id)) ?? existing.startTime;
            await tx.update(driverShifts).set({ endTime: closeAt }).where(eq(driverShifts.id, existing.id));
        }

        const startTime = now;
        const [inserted] = await tx
            .insert(driverShifts)
            .values({ driverId, startTime, clientRef: clientRef ?? null })
            .$returningId();
        return { id: inserted.id, driverId, startTime, endTime: null, clientRef: clientRef ?? null };
    });
}

/**
 * What scanning a route's QR should change on it.
 *
 * Claiming (taking an unassigned route) and starting (putting it on the road) are
 * independent: a route the admin already assigned to this driver has nothing to
 * claim but still has to start. Bundling them behind one "is it unassigned?" check
 * meant those routes stayed 'pending' forever while their stops went in_progress,
 * so the driver worked a route dispatch never saw begin.
 */
export function routeClaimPatch(
    route: { driverId: number | null; status: string },
    driverId: number,
): { driverId?: number; status?: 'in_progress' } {
    const patch: { driverId?: number; status?: 'in_progress' } = {};
    if (route.driverId === null) patch.driverId = driverId;
    if (route.status !== 'in_progress') patch.status = 'in_progress';
    return patch;
}

/**
 * Stamps when a route actually went on the road and links it to the driver's open
 * shift. Called the moment the driver claims/starts the route — waiting until
 * handleFinishRoute meant an in-flight route had no startedAt and no shiftId, so
 * the admin Shifts view couldn't see it until (and unless) it was finished.
 * startedAt is only written once so a re-scan of the same route doesn't restart the clock.
 *
 * If the driver has no open shift, one is opened here rather than leaving
 * shiftId NULL — the app is supposed to call /shifts/start first, but when it
 * doesn't (or the call is lost), starting a route is itself proof the driver
 * is on duty. This is the fix for 116/116 production routes having shiftId
 * NULL: markRouteStarted used to only ever *link* an existing open shift, and
 * plenty of driving days had none.
 */
export async function markRouteStarted(db: Db, routeId: string, driverId: number, route: { startedAt: Date | null; shiftId: number | null }) {
    const patch: { startedAt?: Date; shiftId?: number } = {};
    if (!route.startedAt) patch.startedAt = new Date();
    if (route.shiftId === null) {
        const shift = await findOrCreateOpenShift(db, driverId);
        patch.shiftId = shift.id;
    }
    if (Object.keys(patch).length > 0) {
        await db.update(driverRoutes).set(patch).where(eq(driverRoutes.id, routeId));
    }
}

/**
 * Computes the driverRoutes patch for a /shifts/route-report call.
 *
 * clockIn is reported at *finish* time (handleFinishRoute), well after
 * markRouteStarted already stamped the real moment the route went on the
 * road at claim/start time. Applying it unconditionally overwrote that true
 * startedAt with a stale finish-time value on every report — it's only
 * needed to fill a gap for legacy/offline-queued reports on a route
 * markRouteStarted never touched.
 */
export function buildRouteReportPatch(
    route: { shiftId: number | null; startedAt: Date | null },
    openShift: { id: number } | undefined,
    fields: { clockIn?: string; clockOut?: string; activeSeconds?: number; codCollected?: number; completedStops?: number },
): Record<string, unknown> {
    const updateData: Record<string, unknown> = {};
    // Keep whatever link route start already established; only fill a missing one.
    if (openShift && route.shiftId === null) updateData.shiftId = openShift.id;
    if (fields.clockIn && !route.startedAt) updateData.startedAt = new Date(fields.clockIn);
    if (fields.clockOut) updateData.finishedAt = new Date(fields.clockOut);
    if (typeof fields.activeSeconds === 'number' && Number.isFinite(fields.activeSeconds)) {
        updateData.activeSeconds = Math.max(0, Math.round(fields.activeSeconds));
    }
    if (typeof fields.codCollected === 'number' && Number.isFinite(fields.codCollected)) {
        updateData.codCollectedReported = fields.codCollected.toFixed(2);
    }
    if (typeof fields.completedStops === 'number' && Number.isFinite(fields.completedStops)) {
        updateData.completedStopsReported = Math.max(0, Math.round(fields.completedStops));
    }
    return updateData;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// A client-sent timestamp, or null when it's missing or unparseable.
const parseClientDate = (value: unknown): Date | null => {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

const clampDate = (d: Date, min: Date, max: Date): Date =>
    d < min ? min : d > max ? max : d;

export interface WalletSummaryOrder {
    id: number;
    waybillNumber: string;
    customerName: string;
    expectedAmount: number;
    collectedAmount: number;
    paymentMethod: string;
    paymentReference: string | null;
    status: string | undefined;
    isDelivered: boolean;
}

export interface WalletSummary {
    /** Cash due on delivered cash-COD stops. */
    totalExpected: number;
    /** Cash the stops recorded as collected. */
    totalCollected: number;
    /** totalCollected − totalExpected: negative means short. */
    discrepancy: number;
    /** Charged by card — never passes through the driver, so it's outside the cash figures. */
    cardCollected: number;
    orders: WalletSummaryOrder[];
}

/**
 * COD expected vs collected across the given routes (the caller has already
 * scoped them to one driver). Expected comes from orders.codAmount, collected
 * from routeOrders.collectedAmount, and codRecords only decides cash vs card.
 * Only delivered stops count toward the totals.
 */
export async function computeWalletSummary(db: Db, routeIds: string[]): Promise<WalletSummary> {
    if (routeIds.length === 0) {
        return { totalExpected: 0, totalCollected: 0, discrepancy: 0, cardCollected: 0, orders: [] };
    }

    const codStops = await db
        .select({ routeOrder: routeOrders, order: orders })
        .from(routeOrders)
        .innerJoin(orders, eq(routeOrders.orderId, orders.id))
        .where(and(
            inArray(routeOrders.routeId, routeIds),
            eq(routeOrders.type, 'delivery'), // only delivery stops carry COD
            eq(orders.codRequired, 1),
        ));

    // Collection method lives on codRecords — card payments are charged on
    // the driver's phone and must stay out of the cash reconciliation
    const shipmentIds = codStops.map(s => s.order.id);
    const codRecordRows = shipmentIds.length > 0
        ? await db.select().from(codRecords).where(inArray(codRecords.shipmentId, shipmentIds))
        : [];
    const codRecordByShipment = new Map(codRecordRows.map(r => [r.shipmentId, r]));

    let totalExpected = 0;   // cash the driver should have in hand
    let totalCollected = 0;  // cash actually reported
    let cardCollected = 0;   // charged by card — never passes through the driver

    const codOrders = codStops.map(s => {
        const expected = parseFloat(s.order.codAmount || '0');
        const collected = s.routeOrder.collectedAmount ? parseFloat(s.routeOrder.collectedAmount) : 0;
        const status = s.routeOrder.status?.toLowerCase();
        const isDelivered = status === 'delivered';
        const codRecord = codRecordByShipment.get(s.order.id);
        const paymentMethod = codRecord?.collectedMethod
            || (isDelivered ? 'cash' : (s.order.codPaymentMethod || 'cash'));

        // Only count towards totals if delivered; card stays out of the cash discrepancy
        if (isDelivered) {
            if (paymentMethod === 'card') {
                cardCollected += collected || expected;
            } else {
                totalExpected += expected;
                totalCollected += collected;
            }
        }

        return {
            id: s.order.id,
            waybillNumber: s.order.waybillNumber,
            customerName: s.order.customerName,
            expectedAmount: expected,
            // Never report a collected amount for a non-delivered stop, even if
            // routeOrders.collectedAmount has a stale/leftover value — mirrors the
            // isDelivered gate already applied to the totals above.
            collectedAmount: isDelivered ? collected : 0,
            paymentMethod,
            paymentReference: codRecord?.paymentReference || null,
            status: status, // delivered, returned, etc.
            isDelivered
        };
    });

    return {
        totalExpected,
        totalCollected,
        discrepancy: totalCollected - totalExpected,
        cardCollected,
        orders: codOrders,
    };
}

/**
 * The routes a shift's reconciliation covers: every route linked to it
 * (driverRoutes.shiftId — set when the route is claimed/started), plus any of
 * the driver's in-progress routes that never got linked to a shift (legacy rows).
 */
export async function resolveShiftRouteIds(db: Db, driverId: number, shiftId: number | null): Promise<string[]> {
    const unlinkedInProgress = and(eq(driverRoutes.status, 'in_progress'), isNull(driverRoutes.shiftId));
    const rows = await db
        .select({ id: driverRoutes.id })
        .from(driverRoutes)
        .where(and(
            eq(driverRoutes.driverId, driverId),
            shiftId !== null ? or(eq(driverRoutes.shiftId, shiftId), unlinkedInProgress) : unlinkedInProgress,
        ));
    return rows.map(r => r.id);
}

export interface ShiftReconciliation {
    expectedCash: number;
    collectedCash: number;
    cardCollected: number;
    declaredCash: number;
    /** collectedCash − expectedCash */
    cashDiscrepancy: number;
    /** declaredCash − collectedCash */
    declaredVariance: number;
}

export interface EndShiftInput {
    clientRef?: unknown;
    clockIn?: unknown;
    clockOut?: unknown;
    declaredCash?: unknown;
    note?: unknown;
}

export type EndShiftResult =
    | { ok: true; shiftId: number; alreadyClosed: boolean; reconciliation: ShiftReconciliation | null }
    | {
        ok: false;
        status: 400 | 404;
        code: 'NO_ACTIVE_SHIFT' | 'INVALID_DECLARED_CASH' | 'NOTE_REQUIRED';
        error: string;
        reconciliation?: ShiftReconciliation;
    };

/**
 * Clock-out, optionally with the driver's end-of-shift cash reconciliation.
 *
 * Which shift: the one carrying the app's clientRef if there is one, else the
 * open shift. A clientRef match that is already closed means this is a replay
 * (offline queue) of a clock-out that already landed, or an admin/stale close
 * that beat it — nothing moves, but a reconciliation that hasn't been recorded
 * yet is still attached. With no shift at all (clock-in never reached the
 * server) a closed shift is recorded from the app's clockIn/clockOut.
 *
 * endTime is the phone's clockOut clamped to [startTime, now], so a clock-out
 * sent later from the offline queue records when the driver actually stopped.
 *
 * Reconciliation (when declaredCash is sent): the money figures are computed
 * here from the shift's routes, never taken from the app. A note is required
 * whenever the stops don't match what was due or the declared cash doesn't
 * match what the stops recorded. A body with no declaredCash (older app
 * builds) closes the shift exactly like before, unreconciled.
 */
export async function endShiftWithReconciliation(db: Db, driverId: number, input: EndShiftInput, now: Date = new Date()): Promise<EndShiftResult> {
    const clientRef = typeof input.clientRef === 'string' && input.clientRef.trim()
        ? input.clientRef.trim().slice(0, 64)
        : null;
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, 1000) : '';
    const reconciling = input.declaredCash !== undefined && input.declaredCash !== null && input.declaredCash !== '';
    const declaredCash = reconciling ? Number(input.declaredCash) : null;
    if (declaredCash !== null && (!Number.isFinite(declaredCash) || declaredCash < 0)) {
        return { ok: false, status: 400, code: 'INVALID_DECLARED_CASH', error: 'declaredCash must be a non-negative number' };
    }
    const clockIn = parseClientDate(input.clockIn);
    const clockOut = parseClientDate(input.clockOut);

    return db.transaction(async (tx) => {
        const t = tx as unknown as Db;
        // Same driver-row lock as findOrCreateOpenShift: a clock-out racing a
        // clock-in (or its own replay) must not both act on the same shift.
        await tx.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, driverId)).for('update');

        const reconcile = async (shiftId: number | null): Promise<ShiftReconciliation> => {
            const summary = await computeWalletSummary(t, await resolveShiftRouteIds(t, driverId, shiftId));
            const declared = round2(declaredCash ?? 0);
            const collectedCash = round2(summary.totalCollected);
            return {
                expectedCash: round2(summary.totalExpected),
                collectedCash,
                cardCollected: round2(summary.cardCollected),
                declaredCash: declared,
                cashDiscrepancy: round2(summary.totalCollected - summary.totalExpected),
                declaredVariance: round2(declared - collectedCash),
            };
        };
        const reconciliationColumns = (rec: ShiftReconciliation) => ({
            reconciledAt: now,
            expectedCash: rec.expectedCash.toFixed(2),
            collectedCash: rec.collectedCash.toFixed(2),
            cardCollected: rec.cardCollected.toFixed(2),
            declaredCash: rec.declaredCash.toFixed(2),
            cashDiscrepancy: rec.cashDiscrepancy.toFixed(2),
            declaredVariance: rec.declaredVariance.toFixed(2),
            reconciliationNote: note || null,
        });
        const noteMissing = (rec: ShiftReconciliation) =>
            (rec.cashDiscrepancy !== 0 || rec.declaredVariance !== 0) && !note;
        const noteRequired = (rec: ShiftReconciliation): EndShiftResult => ({
            ok: false, status: 400, code: 'NOTE_REQUIRED',
            error: 'A note is required when the cash does not match', reconciliation: rec,
        });

        const [byRef] = clientRef
            ? await tx.select().from(driverShifts)
                .where(and(eq(driverShifts.driverId, driverId), eq(driverShifts.clientRef, clientRef)))
                .orderBy(desc(driverShifts.startTime))
                .limit(1)
            : [];

        if (byRef?.endTime) {
            if (!reconciling || byRef.reconciledAt) {
                return { ok: true, shiftId: byRef.id, alreadyClosed: true, reconciliation: null };
            }
            const rec = await reconcile(byRef.id);
            if (noteMissing(rec)) return noteRequired(rec);
            await tx.update(driverShifts).set(reconciliationColumns(rec)).where(eq(driverShifts.id, byRef.id));
            return { ok: true, shiftId: byRef.id, alreadyClosed: true, reconciliation: rec };
        }

        const shift = byRef ?? await findOpenShift(t, driverId);

        if (!shift) {
            if (!clockIn) return { ok: false, status: 404, code: 'NO_ACTIVE_SHIFT', error: 'No active shift found' };
            const rec = reconciling ? await reconcile(null) : null;
            if (rec && noteMissing(rec)) return noteRequired(rec);
            const startTime = clockIn > now ? now : clockIn;
            const [inserted] = await tx.insert(driverShifts).values({
                driverId,
                startTime,
                endTime: clampDate(clockOut ?? now, startTime, now),
                clientRef,
                ...(rec ? reconciliationColumns(rec) : {}),
            }).$returningId();
            return { ok: true, shiftId: inserted.id, alreadyClosed: false, reconciliation: rec };
        }

        const rec = reconciling ? await reconcile(shift.id) : null;
        if (rec && noteMissing(rec)) return noteRequired(rec);
        await tx.update(driverShifts).set({
            endTime: clampDate(clockOut ?? now, shift.startTime, now),
            // Stamp the ref so a replay of this same clock-out matches the
            // now-closed shift instead of closing whatever opens next.
            ...(clientRef ? { clientRef } : {}),
            ...(rec ? reconciliationColumns(rec) : {}),
        }).where(eq(driverShifts.id, shift.id));
        return { ok: true, shiftId: shift.id, alreadyClosed: false, reconciliation: rec };
    });
}

/** Most points accepted per ping — the app's offline buffer is capped at the same size. */
export const MAX_LOCATION_POINTS = 20;
// A fix older than this is history, not a position worth putting on the live map.
const MAX_LOCATION_AGE_MS = 12 * 60 * 60 * 1000;

const finiteOrNull = (value: unknown, min = -Infinity, max = Infinity): number | null => {
    const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/**
 * Stores the newest valid fix from a ping as the driver's live position.
 *
 * Only while the driver has an open, non-stale shift: off duty nothing is
 * stored and `tracking: false` tells the app to switch its GPS watcher off,
 * so a driver is never tracked outside their shift. A fix older than the one
 * already stored (a late offline batch) is ignored.
 */
export async function upsertDriverLocation(
    db: Db,
    driverId: number,
    input: { points?: unknown; routeId?: unknown },
    now: Date = new Date(),
): Promise<{ tracking: boolean; accepted: number }> {
    const openShift = await findOpenShift(db, driverId);
    if (!openShift || isStaleOpenShift(openShift, now)) return { tracking: false, accepted: 0 };

    const raw = Array.isArray(input.points) ? input.points.slice(-MAX_LOCATION_POINTS) : [];
    const points = raw.flatMap((p) => {
        if (!p || typeof p !== 'object') return [];
        const point = p as Record<string, unknown>;
        const lat = finiteOrNull(point.lat, -90, 90);
        const lng = finiteOrNull(point.lng, -180, 180);
        if (lat === null || lng === null || (lat === 0 && lng === 0)) return [];
        const taken = parseClientDate(point.recordedAt) ?? now;
        const recordedAt = taken > now ? now : taken;
        if (now.getTime() - recordedAt.getTime() > MAX_LOCATION_AGE_MS) return [];
        return [{
            lat,
            lng,
            accuracy: finiteOrNull(point.accuracy, 0),
            heading: finiteOrNull(point.heading, 0, 360),
            speed: finiteOrNull(point.speed, 0),
            recordedAt,
        }];
    });
    if (points.length === 0) return { tracking: true, accepted: 0 };

    const newest = points.reduce((a, b) => (b.recordedAt > a.recordedAt ? b : a));
    // Timestamps are stored to the second; compare at that precision.
    newest.recordedAt = new Date(Math.floor(newest.recordedAt.getTime() / 1000) * 1000);

    const [existing] = await db.select({ recordedAt: driverLocations.recordedAt })
        .from(driverLocations).where(eq(driverLocations.driverId, driverId)).limit(1);
    if (existing && existing.recordedAt >= newest.recordedAt) return { tracking: true, accepted: 0 };

    const routeId = typeof input.routeId === 'string' && input.routeId.trim()
        ? input.routeId.trim().slice(0, 50)
        : typeof input.routeId === 'number' ? String(input.routeId) : null;
    const values = { ...newest, routeId, receivedAt: now };
    await db.insert(driverLocations)
        .values({ driverId, ...values })
        .onDuplicateKeyUpdate({ set: values });
    return { tracking: true, accepted: points.length };
}

async function resolveDeliveryPhotoUrls(
    body: unknown,
    currentPhotoUrl: string | null,
    currentPhotoUrl2: string | null,
): Promise<[string | null, string | null]> {
    const photoUrls: [string | null, string | null] = [currentPhotoUrl, currentPhotoUrl2];

    // Fast path: the client already uploaded the images and sent us URLs. Use them
    // directly — no Cloudinary round-trip, so the status request stays tiny.
    const preUploaded = extractDeliveryPhotoUrls(body);
    if (preUploaded.length > 0) {
        preUploaded.forEach((url, index) => { photoUrls[index] = url; });
        return photoUrls;
    }

    // Fallback (offline-queue replay / legacy clients): images arrive as base64 and
    // we upload them here.
    const photoPayloads = extractDeliveryPhotoBase64s(body);

    // Upload the photo and signature in parallel — they're independent, so serial
    // awaits just added the two Cloudinary round-trips together for no reason.
    const uploaded = await Promise.all(
        photoPayloads.map(async (payload, index) => {
            try {
                return await uploadImageToCloudinary(payload, 'pathxpress/deliveries');
            } catch (error) {
                console.error(`Error uploading delivery photo ${index + 1} to Cloudinary:`, error);
                return null;
            }
        }),
    );

    uploaded.forEach((url, index) => {
        // Keep the existing URL if this upload failed, rather than wiping it to null.
        if (url) photoUrls[index] = url;
    });

    return photoUrls;
}

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');

// Extend Request to include driver info
interface DriverRequest extends Request {
    driverId?: number;
    driverUsername?: string;
}

// Auth middleware for driver routes. The token is valid for 7 days, so without
// re-checking status here a suspended/deactivated driver would keep full API
// access until their token expires — this makes the very next request after a
// suspension get rejected instead.
const driverAuthMiddleware = async (req: DriverRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string };

        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });
        const [driver] = await db.select().from(drivers).where(eq(drivers.id, decoded.id)).limit(1);
        if (!driver || driver.status !== 'active') {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.driverId = decoded.id;
        req.driverUsername = decoded.username;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// ============ AUTH ============

router.post('/auth/login', async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const [driver] = await db
            .select()
            .from(drivers)
            .where(eq(drivers.username, username))
            .limit(1);

        if (!driver) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, driver.passwordHash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (driver.status !== 'active') {
            return res.status(403).json({ error: 'Account is not active' });
        }

        const token = jwt.sign(
            { id: driver.id, username: driver.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            driver: {
                id: driver.id,
                username: driver.username,
                fullName: driver.fullName,
                email: driver.email,
                phone: driver.phone,
                vehicleNumber: driver.vehicleNumber,
            },
        });
    } catch (error) {
        console.error('Driver login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============ PROFILE ============

router.get('/profile', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const [driver] = await db
            .select()
            .from(drivers)
            .where(eq(drivers.id, req.driverId!))
            .limit(1);

        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        // Get delivery stats for this driver
        const driverRoutesData = await db
            .select()
            .from(driverRoutes)
            .where(eq(driverRoutes.driverId, req.driverId!));

        const routeIds = driverRoutesData.map(r => r.id);

        let deliveryStats = {
            total: 0,
            delivered: 0,
            pending: 0,
            attempted: 0,
        };

        if (routeIds.length > 0) {
            // Get all route orders for this driver's routes
            const allDeliveries = await db
                .select()
                .from(routeOrders);

            const driverDeliveries = allDeliveries.filter(d => routeIds.includes(d.routeId));

            deliveryStats = {
                total: driverDeliveries.length,
                delivered: driverDeliveries.filter(d => d.status === 'delivered').length,
                pending: driverDeliveries.filter(d => d.status === 'pending' || d.status === 'in_progress').length,
                attempted: driverDeliveries.filter(d => d.status === 'attempted').length,
            };
        }

        // Calculate metrics based on stats
        const metrics = {
            efficiency: deliveryStats.total > 0
                ? `${Math.round((deliveryStats.delivered / deliveryStats.total) * 100)}%`
                : '100%',
            totalDeliveries: deliveryStats.delivered,
            hoursWorked: 8, // Placeholder for now, could be calculated from shifts
            deliveryStats // Include raw stats too just in case
        };

        // Remove password hash from response
        const { passwordHash, ...driverData } = driver;

        // Return structure expected by the mobile app: { driver: ..., metrics: ... }
        res.json({
            driver: driverData,
            metrics
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============ ROUTES ============

/**
 * Shapes one routeOrders+orders row into what the app displays for a stop.
 *
 * A stop's real-world location/contact is always the shipper's on the
 * pickup leg and the consignee's on the delivery leg. For a return/exchange
 * order this still holds because the return-order creation code already
 * writes shipperName/shipperLat as whoever the package is physically
 * collected from and customerName/latitude as whoever it's delivered to
 * (see doCreateReturn / doCreateManualReturnExchange in portalRouters.ts) —
 * do NOT re-invert based on isReturn here, that double-swaps it back to
 * wrong. Same rule as server/driverAdmin.ts `resolveStopCoords`.
 */
function formatDriverStop(
    item: { routeOrder: typeof routeOrders.$inferSelect; order: typeof orders.$inferSelect },
    isDisabled: boolean,
) {
    const stopType = item.routeOrder.type || 'delivery';
    const isPickup = stopType === 'pickup';
    const isShipperSide = isPickup;

    const shipperLat = item.order.shipperLat ? parseFloat(item.order.shipperLat) : null;
    const shipperLng = item.order.shipperLng ? parseFloat(item.order.shipperLng) : null;
    const consigneeLat = item.order.latitude ? parseFloat(item.order.latitude) : null;
    const consigneeLng = item.order.longitude ? parseFloat(item.order.longitude) : null;
    const lat = isShipperSide ? shipperLat : consigneeLat;
    const lng = isShipperSide ? shipperLng : consigneeLng;
    const addr = isShipperSide ? item.order.shipperAddress : item.order.address;
    const city = isShipperSide ? item.order.shipperCity : item.order.city;

    return {
        id: item.routeOrder.id,
        orderId: item.order.id,
        sequence: item.routeOrder.sequence,
        stopType, // 'pickup' or 'delivery'
        isDisabled, // delivery disabled until its pickup is done

        // Waybill info
        waybillNumber: item.order.waybillNumber,
        packageRef: item.order.waybillNumber,
        pieces: item.order.pieces,
        weight: item.order.weight,
        serviceType: item.order.serviceType,

        // This stop's actual location/contact — shipper or consignee depending on
        // stop type AND return status (see isShipperSide above).
        contactName: isShipperSide ? item.order.shipperName : item.order.customerName,
        contactPhone: isShipperSide ? item.order.shipperPhone : item.order.customerPhone,
        address: addr,
        city,

        // Keep full info (both sides, raw) for the detail view.
        shipperName: item.order.shipperName,
        shipperPhone: item.order.shipperPhone,
        shipperAddress: item.order.shipperAddress,
        shipperCity: item.order.shipperCity,
        shipperLat,
        shipperLng,
        customerName: item.order.customerName,
        customerPhone: item.order.customerPhone,
        deliveryAddress: item.order.address,
        deliveryCity: item.order.city,

        latitude: lat,
        longitude: lng,

        // Navigation links for driver app
        mapsUrl: (lat && lng)
            ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${addr}, ${city}, UAE`)}`,
        wazeUrl: (lat && lng)
            ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
            : `https://waze.com/ul?q=${encodeURIComponent(`${addr}, ${city}`)}&navigate=yes`,

        // COD info (only relevant for delivery)
        codRequired: item.order.codRequired === 1,
        codAmount: item.order.codRequired === 1 && item.order.codAmount ? parseFloat(item.order.codAmount) : 0,
        codPaymentMethod: item.order.codRequired === 1 ? (item.order.codPaymentMethod || 'cash') : null,

        // Fit on Delivery (FOD) — customer gets ~20 min to try the item on at
        // the door and can return it on the spot if it doesn't fit.
        fitOnDelivery: item.order.fitOnDelivery === 1,

        // Return/exchange linkage — an exchange is two orders pointing at each
        // other via exchangeOrderId, both pointing at the original via originalOrderId
        orderType: item.order.orderType,
        isReturn: item.order.isReturn,
        originalOrderId: item.order.originalOrderId,
        // Return to Origin: this same waybill is going back to the shipper —
        // customerName/address already hold the shipper (swapped in place).
        isRto: item.order.isRto === 1,
        exchangeOrderId: item.order.exchangeOrderId,

        // Status
        status: item.routeOrder.status?.toUpperCase() || 'PENDING',
        proofPhotoUrl: item.routeOrder.proofPhotoUrl,
        proofPhotoUrl2: item.routeOrder.proofPhotoUrl2,
        proofPhotoUrls: getProofPhotoUrls(item.routeOrder),
        notes: item.routeOrder.notes,
        // The note the client wrote when creating/editing the waybill.
        specialInstructions: item.order.specialInstructions,
    };
}

router.get('/routes/:routeId', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const { routeId } = req.params;
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        // Get the route
        const [route] = await db
            .select()
            .from(driverRoutes)
            .where(eq(driverRoutes.id, routeId))
            .limit(1);

        if (!route) {
            return res.status(404).json({ error: 'Route not found' });
        }

        // Check if route belongs to this driver or is unassigned
        if (route.driverId !== null && route.driverId !== req.driverId) {
            return res.status(403).json({ error: 'This route is assigned to another driver' });
        }

        // Get the stops (pickups and deliveries) for this route
        const routeOrdersList = await db
            .select({
                routeOrder: routeOrders,
                order: orders,
            })
            .from(routeOrders)
            .innerJoin(orders, eq(routeOrders.orderId, orders.id))
            .where(eq(routeOrders.routeId, routeId))
            .orderBy(sql`${routeOrders.sequence} IS NULL`, routeOrders.sequence, routeOrders.id);

        // First pass: collect pickup status by orderId
        const pickupStatusByOrderId = new Map<number, string>();
        routeOrdersList.forEach((item) => {
            if (item.routeOrder.type === 'pickup') {
                pickupStatusByOrderId.set(item.order.id, item.routeOrder.status || 'pending');
            }
        });

        // Format stops for the app - include both pickup and delivery info
        const stops = routeOrdersList.map((item) => {
            const isPickup = (item.routeOrder.type || 'delivery') === 'pickup';

            // Delivery stops are disabled until their corresponding pickup is completed
            let isDisabled = false;
            if (!isPickup) {
                const pickupStatus = pickupStatusByOrderId.get(item.order.id);
                // Delivery is disabled if there's a pickup for this order that isn't completed
                if (pickupStatus && pickupStatus !== 'picked_up') {
                    isDisabled = true;
                }
            }

            return formatDriverStop(item, isDisabled);
        });

        // Calculate stats
        const pickupCount = stops.filter(s => s.stopType === 'pickup').length;
        const deliveryCount = stops.filter(s => s.stopType === 'delivery').length;
        const completedCount = stops.filter(s =>
            s.status === 'PICKED_UP' || s.status === 'DELIVERED'
        ).length;

        res.json({
            ...route,
            status: route.status?.toUpperCase() || 'PENDING',
            stops, // New unified list
            deliveries: stops, // Keep for backward compatibility
            stats: {
                total: stops.length,
                completed: completedCount,
                pickups: pickupCount,
                deliveries: deliveryCount,
            }
        });
    } catch (error) {
        console.error('Get route error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Take an unassigned route / start an assigned one, atomically. The write only
 * lands while the route is still free or already ours, so two drivers scanning
 * the same QR at once can't both "win" (the old read-check-write let the last
 * writer silently take it). Returns false when someone else got it first.
 */
async function claimRouteAtomically(db: Db, route: typeof driverRoutes.$inferSelect, driverId: number): Promise<boolean> {
    const patch = routeClaimPatch(route, driverId);
    if (Object.keys(patch).length === 0) return true;
    const updated = await db.update(driverRoutes).set(patch).where(and(
        eq(driverRoutes.id, route.id),
        or(isNull(driverRoutes.driverId), eq(driverRoutes.driverId, driverId)),
        inArray(driverRoutes.status, ['pending', 'in_progress']),
    ));
    return ((updated as any)?.[0]?.affectedRows ?? 0) > 0;
}

/** Fresh route row — after a claim, never reuse the pre-claim read (its shiftId may be stale). */
async function readRoute(db: Db, routeId: string) {
    const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
    return route;
}

router.post('/routes/:routeId/claim', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const { routeId } = req.params;
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const route = await readRoute(db, routeId);

        if (!route) {
            return res.status(404).json({ error: 'Route not found' });
        }

        if (route.status === 'completed') {
            return res.status(400).json({ error: 'This route is already completed' });
        }

        if (route.status === 'cancelled') {
            return res.status(400).json({ error: 'This route was cancelled' });
        }

        if (route.driverId !== null && route.driverId !== req.driverId) {
            return res.status(403).json({ error: 'This route is already assigned to another driver' });
        }

        if (!(await claimRouteAtomically(db, route, req.driverId!))) {
            return res.status(403).json({ error: 'This route is already assigned to another driver' });
        }

        // Scanning the QR is the moment the route goes on the road — record it now
        // and attach it to the driver's open shift, instead of waiting for finish.
        await markRouteStarted(db, routeId, req.driverId!, (await readRoute(db, routeId))!);

        // --- Auto set delivery stops to in_progress ---
        // Only delivery-type stops that are still pending become in_progress.
        // Pickup stops stay 'pending' until the driver physically picks them up.
        // Already-terminal stops (picked_up, delivered, etc.) are not touched.
        await db
            .update(routeOrders)
            .set({ status: 'in_progress' })
            .where(
                and(
                    eq(routeOrders.routeId, routeId),
                    eq(routeOrders.type, 'delivery'),
                    eq(routeOrders.status, 'pending')
                )
            );

        // Delivery-only orders (no pickup leg here — already on the van) go out for delivery.
        await sendDeliveryOnlyOrdersOut(db, routeId);

        // Get updated route
        const updatedRoute = await readRoute(db, routeId);

        // Get the stops (pickups and deliveries) for this route - same format as GET route
        const routeOrdersList = await db
            .select({
                routeOrder: routeOrders,
                order: orders,
            })
            .from(routeOrders)
            .innerJoin(orders, eq(routeOrders.orderId, orders.id))
            .where(eq(routeOrders.routeId, routeId))
            .orderBy(sql`${routeOrders.sequence} IS NULL`, routeOrders.sequence, routeOrders.id);

        // First pass: collect pickup status by orderId (same rule as GET route)
        const pickupStatusByOrderId = new Map<number, string>();
        routeOrdersList.forEach((item) => {
            if (item.routeOrder.type === 'pickup') {
                pickupStatusByOrderId.set(item.order.id, item.routeOrder.status || 'pending');
            }
        });

        // Format stops for the app - same as GET route
        const stops = routeOrdersList.map((item) => {
            const isPickup = (item.routeOrder.type || 'delivery') === 'pickup';

            let isDisabled = false;
            if (!isPickup) {
                const pickupStatus = pickupStatusByOrderId.get(item.order.id);
                if (pickupStatus && pickupStatus !== 'picked_up') {
                    isDisabled = true;
                }
            }

            return formatDriverStop(item, isDisabled);
        });

        const pickupCount = stops.filter(s => s.stopType === 'pickup').length;
        const deliveryCount = stops.filter(s => s.stopType === 'delivery').length;
        const completedCount = stops.filter(s =>
            s.status === 'PICKED_UP' || s.status === 'DELIVERED'
        ).length;

        res.json({
            ...updatedRoute,
            status: updatedRoute?.status?.toUpperCase() || 'PENDING',
            stops,
            deliveries: stops, // backward compatibility
            stats: {
                total: stops.length,
                completed: completedCount,
                pickups: pickupCount,
                deliveries: deliveryCount,
            }
        });
    } catch (error) {
        console.error('Claim route error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * The app starts a route and finishes it — nothing else. A late replay of
 * "in_progress" used to resurrect completed routes, and any string (even
 * "cancelled") was written as-is. Refused changes answer 200 with
 * `ignored: true` so the offline queue drains.
 *
 * Finishing with stops still open is allowed (the driver is back at base):
 * those stops stay on the closed route as history, its legs go back to the
 * pool, and orders the customer sees "Out for Delivery" return to in_transit.
 */
router.put('/routes/:routeId/status', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const { routeId } = req.params;
        const { status } = req.body ?? {};
        if (typeof status !== 'string' || !status.trim()) {
            return res.status(400).json({ error: 'status is required' });
        }
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const route = await readRoute(db, routeId);

        if (!route) {
            return res.status(404).json({ error: 'Route not found' });
        }

        if (route.driverId !== null && route.driverId !== req.driverId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const statusLower = status.trim().toLowerCase();
        const verdict = checkDriverRouteTransition(route.status, statusLower);
        if (verdict.kind === 'invalid') return res.status(400).json({ error: verdict.reason });
        if (verdict.kind === 'noop') return res.json({ message: 'Route status updated', ignored: true, status: route.status });
        if (verdict.kind === 'conflict') {
            await db.insert(routeAuditLog).values({
                createdAt: new Date(),
                routeId, action: 'driver_route_update_ignored', fromValue: route.status, toValue: statusLower.slice(0, 50),
                actor: `driver:${req.driverId}`, reason: verdict.reason,
            });
            return res.json({ message: verdict.reason, ignored: true, reason: verdict.reason, status: route.status });
        }

        if (statusLower === 'in_progress') {
            // Starting an unassigned route claims it, exactly like scanning its QR —
            // leaving driverId NULL hid its COD from every admin view.
            if (!(await claimRouteAtomically(db, route, req.driverId!))) {
                return res.status(403).json({ error: 'This route is already assigned to another driver' });
            }
            // Same as the claim path: starting the route is what stamps startedAt and
            // links the shift, so an in-flight route is visible in the admin Shifts view.
            await markRouteStarted(db, routeId, req.driverId!, (await readRoute(db, routeId))!);
            await sendDeliveryOnlyOrdersOut(db, routeId);
            return res.json({ message: 'Route status updated', status: 'in_progress' });
        }

        // in_progress → completed
        const now = new Date();
        await db.transaction(async (txRaw) => {
            const tx = txRaw as unknown as Db;
            const [locked] = await tx.select().from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1).for('update');
            if (!locked || locked.status !== 'in_progress') return;
            await tx.update(driverRoutes)
                .set({ status: 'completed', finishedAt: locked.finishedAt ?? now })
                .where(eq(driverRoutes.id, routeId));

            const stops = await tx.select().from(routeOrders).where(eq(routeOrders.routeId, routeId));
            const openDeliveries = stops.filter(s => legOf(s.type) === 'delivery' && isStopOpen(s.status));
            const current: number[] = [];
            for (const s of openDeliveries) {
                if (await findCurrentStopId(tx, s.orderId, 'delivery') === s.id) current.push(s.orderId);
            }
            await revertOutForDelivery(tx, current, `Route ${routeId} finished by the driver with this stop not worked`, `driver:${req.driverId}`, routeId);
            const unsettled = stops.filter(s => !isStopSettled(legOf(s.type), s.status)).length;
            await tx.insert(routeAuditLog).values({
                createdAt: new Date(),
                routeId, action: 'route_finished_by_driver', fromValue: 'in_progress', toValue: 'completed',
                actor: `driver:${req.driverId}`,
                reason: unsettled > 0 ? `${unsettled} stop(s) left unworked and released back to the pool` : null,
            });
        });

        res.json({ message: 'Route status updated', status: 'completed' });
    } catch (error) {
        console.error('Update route status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// NOTE: there is deliberately no endpoint for the driver app to write stop
// order. The sequence is dispatch's decision, set in the admin portal (route
// wizard / route detail sequencer) and shipped read-only to the app via
// GET /routes/:routeId. The old PUT /routes/:routeId/sequence let any
// authenticated driver renumber any unassigned route, with no validation that
// the ids formed a complete, gap-free, precedence-valid set.

// ============ STOPS (Pickups & Deliveries) ============

router.get('/stops/lookup', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const barcode = req.query.barcode as string;
        if (!barcode) return res.status(400).json({ error: 'Barcode is required' });

        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        // Look up the order by its waybill number (encoded in the label barcode)
        const [order] = await db.select().from(orders).where(eq(orders.waybillNumber, barcode)).limit(1);
        if (!order) return res.status(404).json({ error: 'Package not found in system!' });

        // The package's live stop: newest one on a route that isn't closed. An
        // order that went through several routes (retries, RTO) also has stops on
        // old completed routes — returning one of those sent the app to a dead stop.
        const liveStops = await db.select({ routeOrder: routeOrders, route: driverRoutes })
            .from(routeOrders)
            .innerJoin(driverRoutes, eq(routeOrders.routeId, driverRoutes.id))
            .where(and(eq(routeOrders.orderId, order.id), inArray(driverRoutes.status, ['pending', 'in_progress'])))
            .orderBy(desc(routeOrders.id));
        const live = liveStops.find(s => s.route.driverId === req.driverId)
            ?? liveStops.find(s => s.route.driverId === null)
            ?? liveStops[0];

        if (live && live.route.driverId !== null && live.route.driverId !== req.driverId) {
            return res.status(403).json({ error: 'Assigned to another driver!' });
        }

        // Return formatted package matching the driver app expectations. `id` is a
        // STOP id or null — it used to fall back to the order id, which the app then
        // sent to /stops/:id/status, updating whatever unrelated stop had that id.
        res.json({
            id: live ? live.routeOrder.id : null,
            stopId: live ? live.routeOrder.id : null,
            orderId: order.id,
            stopType: live ? live.routeOrder.type : null,
            packageRef: order.waybillNumber,
            status: live ? live.routeOrder.status : order.status,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            address: order.address,
            codAmount: order.codRequired === 1 && order.codAmount ? parseFloat(order.codAmount) : 0,
            codPaymentMethod: order.codRequired === 1 ? (order.codPaymentMethod || 'cash') : null,
            fitOnDelivery: order.fitOnDelivery === 1,
            type: order.codRequired === 1 ? 'COD' : 'PREPAID',
            weight: order.weight,
            routeId: live ? live.route.id : null,
        });
    } catch (error) {
        console.error('Lookup stop error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Dedicated POD image upload. The app uploads each photo/signature here (ideally
// in the background right after capture) and gets back a Cloudinary URL, so the
// status update below carries only URLs and never a multi-MB base64 body.
router.post('/pod/upload', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const { imageBase64 } = req.body || {};
        if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
            return res.status(400).json({ error: 'imageBase64 is required' });
        }
        const url = await uploadImageToCloudinary(imageBase64, 'pathxpress/deliveries');
        if (!url) return res.status(502).json({ error: 'Upload failed' });
        return res.json({ url });
    } catch (error) {
        console.error('POD upload error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Shared body of PUT /stops/:id/status and the legacy PUT /deliveries/:id/status.
 * Validation, POD upload and the COD fee lookup happen here, outside any lock;
 * the actual change goes through applyStopStatus (server/stopStatus.ts), which
 * owns the transition rules, idempotency and route auto-completion.
 *
 * Replays and stale updates answer 200 with `ignored: true` and the server's
 * real status — current app builds retry anything else forever from their
 * offline queue.
 */
async function handleStopStatusUpdate(req: DriverRequest, res: Response, legacy: boolean) {
    const stopId = Number.parseInt(req.params.id, 10);
    const { status, notes, collectedAmount, collectedMethod, paymentReference, deliveredLat, deliveredLng } = req.body ?? {};
    if (!Number.isInteger(stopId) || stopId <= 0) return res.status(404).json({ error: 'Stop not found' });
    if (typeof status !== 'string' || !status.trim()) return res.status(400).json({ error: 'status is required' });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: 'Database not available' });

    const [row] = await db
        .select({ routeOrder: routeOrders, route: driverRoutes, order: orders })
        .from(routeOrders)
        .innerJoin(driverRoutes, eq(routeOrders.routeId, driverRoutes.id))
        .innerJoin(orders, eq(routeOrders.orderId, orders.id))
        .where(eq(routeOrders.id, stopId))
        .limit(1);
    if (!row) return res.status(404).json({ error: legacy ? 'Delivery not found' : 'Stop not found' });

    // Checked again under the lock; here it just avoids uploading someone else's POD.
    if (row.route.driverId !== null && row.route.driverId !== req.driverId) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const statusLower = status.trim().toLowerCase();
    const isPickup = (row.routeOrder.type || 'delivery') === 'pickup';

    if (collectedAmount !== undefined && collectedAmount !== null && collectedAmount !== '') {
        const n = Number(collectedAmount);
        if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'collectedAmount must be a number ≥ 0' });
    }

    // CCOD validation — must pass before any writes so a failed card
    // collection can never mark the stop delivered
    const isCodDelivery = !isPickup && statusLower === 'delivered' && !!row.order.codRequired;
    const allowedCodMethods = row.order.codPaymentMethod || 'cash'; // legacy COD rows = cash
    const codMethod: 'cash' | 'card' = legacy ? 'cash'
        : collectedMethod === 'card' ? 'card'
            : collectedMethod === 'cash' ? 'cash'
                : allowedCodMethods === 'card' ? 'card' : 'cash';
    if (isCodDelivery) {
        if (legacy && allowedCodMethods === 'card') {
            return res.status(400).json({ error: 'This shipment is Card on Delivery — please update the driver app to collect card payments' });
        }
        if (codMethod === 'cash' && allowedCodMethods === 'card') {
            return res.status(400).json({ error: 'This shipment is Card on Delivery only — cash is not accepted' });
        }
        if (codMethod === 'card' && allowedCodMethods === 'cash') {
            return res.status(400).json({ error: 'This shipment accepts cash only — card is not enabled for it' });
        }
        if (codMethod === 'card' && !paymentReference) {
            return res.status(400).json({ error: 'Payment reference is required for card collection' });
        }
    }

    const photoUrls = await resolveDeliveryPhotoUrls(req.body, row.routeOrder.proofPhotoUrl, row.routeOrder.proofPhotoUrl2);

    // Save collected amount only for delivered stops. A COD delivery that
    // arrives without an amount (older builds, pre-uploaded POD path, the
    // legacy endpoint) falls back to what was due — leaving it null made the
    // cash reconciliation read "expected X, collected nothing".
    let stopCollected: string | null | undefined;
    if (statusLower === 'delivered') {
        if (collectedAmount) stopCollected = collectedAmount.toString();
        else if (!isPickup && row.order.codRequired) stopCollected = row.order.codAmount || '0';
    }

    let cod: StopCodCollection | null = null;
    if (isCodDelivery) {
        const amount = (collectedAmount ? collectedAmount.toString() : null) || row.order.codAmount || '0';
        // Freeze the fee at collection time, per the method actually used
        const feeAmount = (await calculateCODFeeByMethod(parseFloat(amount) || 0, row.order.clientId, codMethod)).toFixed(2);
        cod = {
            amount,
            method: codMethod,
            paymentReference: codMethod === 'card' && paymentReference ? paymentReference.toString().slice(0, 100) : null,
            feeAmount,
        };
    }

    const [driver] = await db.select({ fullName: drivers.fullName }).from(drivers).where(eq(drivers.id, req.driverId!)).limit(1);

    try {
        const result = await applyStopStatus(db, {
            stopId,
            status: statusLower,
            actor: { kind: 'driver', driverId: req.driverId!, driverName: driver?.fullName },
            notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
            photoUrls,
            collectedAmount: stopCollected,
            cod,
            deliveredLat: typeof deliveredLat === 'number' ? deliveredLat : null,
            deliveredLng: typeof deliveredLng === 'number' ? deliveredLng : null,
        });

        if (result.routeStarted) {
            const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, result.routeId)).limit(1);
            if (route) await markRouteStarted(db, route.id, req.driverId!, route);
        }

        const payload = {
            stopType: result.stopType,
            status: result.stopStatus,
            orderStatus: result.orderStatus,
            routeStatus: result.routeStatus,
            routeCompleted: result.routeCompleted,
        };
        if (result.outcome !== 'applied') {
            return res.json({
                message: result.reason ?? 'Already up to date',
                ignored: true,
                reason: result.reason ?? 'Already up to date',
                ...payload,
            });
        }
        return res.json({
            message: legacy ? 'Delivery updated successfully' : isPickup ? 'Pickup completed' : 'Delivery updated',
            ...payload,
        });
    } catch (error) {
        if (error instanceof StopStatusError) return res.status(error.httpStatus).json({ error: error.message });
        throw error;
    }
}

router.put('/stops/:id/status', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        await handleStopStatusUpdate(req, res, false);
    } catch (error) {
        console.error('Update stop error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Old endpoint, kept for app builds that still call it — same rules, cash only.
router.put('/deliveries/:id/status', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        await handleStopStatusUpdate(req, res, true);
    } catch (error) {
        console.error('Update delivery error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============ REPORTS ============

router.post('/reports', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const { issueType, notes, photo, location } = req.body;
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        if (!issueType) {
            return res.status(400).json({ error: 'Issue type is required' });
        }

        let photoUrl: string | null = null;
        if (photo) {
            photoUrl = await uploadImageToCloudinary(photo, 'pathxpress/reports');
        }

        const [report] = await db
            .insert(driverReports)
            .values({
                driverId: req.driverId!,
                issueType,
                description: notes,
                photoUrl,
                latitude: location?.latitude?.toString(),
                longitude: location?.longitude?.toString(),
                accuracy: location?.accuracy?.toString(),
            })
            .$returningId();

        res.status(201).json({
            message: 'Report created successfully',
            reportId: report.id,
        });
    } catch (error) {
        console.error('Create report error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============ SHIFTS ============

router.post('/shifts/start', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const { clientRef } = (req.body ?? {}) as { clientRef?: unknown };
        const ref = typeof clientRef === 'string' && clientRef.trim() ? clientRef.trim().slice(0, 64) : undefined;
        const shift = await findOrCreateOpenShift(db, req.driverId!, ref);

        res.json(shift);
    } catch (error) {
        console.error('Start shift error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Body (all optional): { clientRef, clockIn, clockOut, declaredCash, note }.
// With declaredCash this is the end-of-shift reconciliation and the shift is
// recorded as completed; see endShiftWithReconciliation.
router.post('/shifts/end', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const result = await endShiftWithReconciliation(db, req.driverId!, (req.body ?? {}) as EndShiftInput);
        if (!result.ok) {
            return res.status(result.status).json({ error: result.error, code: result.code, reconciliation: result.reconciliation });
        }

        // Going home with a fully worked route still "in progress" is a forgotten
        // "Finish route" — close it so dispatch doesn't see a stuck route. Never
        // let this fail the clock-out itself.
        try {
            await closeSettledRoutesForDriver(db, req.driverId!);
        } catch (error) {
            console.error('Close settled routes at clock-out failed:', error);
        }

        res.json({
            message: result.alreadyClosed ? 'Shift already ended' : 'Shift ended successfully',
            shiftId: result.shiftId,
            alreadyClosed: result.alreadyClosed,
            reconciliation: result.reconciliation,
        });
    } catch (error) {
        console.error('End shift error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/shifts/status', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const openShift = await findOpenShift(db, req.driverId!);

        res.json({
            isOnDuty: !!openShift,
            shift: openShift || null,
        });
    } catch (error) {
        console.error('Get shift status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Called by the app in handleFinishRoute. Persists per-route timing on
// driverRoutes and links it to whichever shift is currently open for this
// driver — a shift can span multiple routes, so the link lives on the route,
// not the other way around. codCollected/completedStops are stored as
// "*Reported" snapshots only; the admin view recomputes the authoritative
// figures from codRecords/routeOrders (delivered stops only) rather than
// trusting client-side math, same principle as the wallet/summary and
// stops/:id/status guards above.
router.post('/shifts/route-report', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const { routeId, clockIn, clockOut, activeSeconds, codCollected, completedStops } = req.body as {
            routeId?: string;
            clockIn?: string;
            clockOut?: string;
            activeSeconds?: number;
            codCollected?: number;
            completedStops?: number;
        };

        if (!routeId) {
            return res.status(400).json({ error: 'routeId is required' });
        }

        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
        if (!route) {
            return res.status(404).json({ error: 'Route not found' });
        }
        if (route.driverId !== null && route.driverId !== req.driverId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const openShift = await findOpenShift(db, req.driverId!);
        const updateData = buildRouteReportPatch(route, openShift, { clockIn, clockOut, activeSeconds, codCollected, completedStops });

        if (Object.keys(updateData).length > 0) {
            await db.update(driverRoutes).set(updateData).where(eq(driverRoutes.id, routeId));
        }

        res.json({ message: 'Route report saved' });
    } catch (error) {
        console.error('Route report error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============ PICKUPS ============

// Scan and mark a waybill as picked up (direct flow - no assignment required).
// When the package has a live pickup stop on a route, the scan goes through
// that stop (applyStopStatus) so the route, its delivery leg and dispatch all
// see it — it used to change only the order, leaving the stop pending and its
// delivery greyed out in the app forever.
router.put('/pickups/:waybillNumber', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const { waybillNumber } = req.params;
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        // Find the order by its waybill number.
        const [order] = await db
            .select()
            .from(orders)
            .where(eq(orders.waybillNumber, waybillNumber))
            .limit(1);

        if (!order) {
            return res.status(404).json({ error: 'Waybill not found' });
        }

        const pickedUp = (message: string) => res.json({
            success: true,
            message,
            waybillNumber,
            orderId: order.id,
            status: 'picked_up',
            shipperName: order.shipperName,
            customerName: order.customerName,
            pieces: order.pieces,
            weight: order.weight,
        });

        // Get driver info for the tracking event
        const [driver] = await db
            .select({ fullName: drivers.fullName })
            .from(drivers)
            .where(eq(drivers.id, req.driverId!))
            .limit(1);

        const [liveStop] = await db.select({ id: routeOrders.id, driverId: driverRoutes.driverId })
            .from(routeOrders)
            .innerJoin(driverRoutes, eq(routeOrders.routeId, driverRoutes.id))
            .where(and(
                eq(routeOrders.orderId, order.id),
                eq(routeOrders.type, 'pickup'),
                inArray(driverRoutes.status, ['pending', 'in_progress']),
            ))
            .orderBy(desc(routeOrders.id))
            .limit(1);

        if (liveStop) {
            if (liveStop.driverId !== null && liveStop.driverId !== req.driverId) {
                return res.status(403).json({ error: 'Assigned to another driver!' });
            }
            try {
                const result = await applyStopStatus(db, {
                    stopId: liveStop.id,
                    status: 'picked_up',
                    actor: { kind: 'driver', driverId: req.driverId!, driverName: driver?.fullName },
                });
                if (result.routeStarted) {
                    const route = await readRoute(db, result.routeId);
                    if (route) await markRouteStarted(db, route.id, req.driverId!, route);
                }
                if (result.outcome === 'applied') return pickedUp('Package marked as picked up');
                if (result.stopStatus === 'picked_up') return pickedUp('Package already marked as picked up');
                return res.status(400).json({ error: `Cannot pickup: ${result.reason ?? `stop is ${result.stopStatus}`}`, currentStatus: result.orderStatus });
            } catch (error) {
                if (error instanceof StopStatusError) return res.status(error.httpStatus).json({ error: error.message });
                throw error;
            }
        }

        // No route stop: order-only pickup, atomic so a double scan logs one event.
        const updated = await db
            .update(orders)
            .set({
                status: 'picked_up',
                pickupDate: new Date(),
                lastStatusUpdate: new Date(),
                pickupDriverId: req.driverId, // Record which driver picked it up
            })
            .where(and(eq(orders.id, order.id), inArray(orders.status, ['pending', 'pending_pickup', 'failed_pickup'])));

        if (((updated as any)?.[0]?.affectedRows ?? 0) === 0) {
            const [current] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, order.id)).limit(1);
            // Idempotent response: already picked up → success without duplicating tracking events.
            if (current?.status === 'picked_up') return pickedUp('Package already marked as picked up');
            return res.status(400).json({
                error: `Cannot pickup: order status is "${current?.status ?? order.status}"`,
                currentStatus: current?.status ?? order.status,
            });
        }

        // Create tracking event with driver info
        await db.insert(trackingEvents).values({
            shipmentId: order.id,
            eventDatetime: new Date(),
            location: order.shipperCity || 'Pickup Location',
            statusCode: 'picked_up',
            statusLabel: 'Picked Up',
            description: `Package picked up by driver ${driver?.fullName || 'Unknown'}`,
            createdBy: 'driver',
        });

        return pickedUp('Package marked as picked up');
    } catch (error) {
        console.error('Pickup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============ PUSH TOKENS ============

router.post('/push-token', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const { token, platform } = req.body as { token: string; platform?: string };
        if (!token) return res.status(400).json({ error: 'Token is required' });

        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        await db
            .update(drivers)
            .set({ pushToken: token, pushPlatform: platform || 'ios' })
            .where(eq(drivers.id, req.driverId!));

        res.json({ message: 'Push token registered' });
    } catch (error) {
        console.error('Register push token error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============ LIVE LOCATION ============

// Streamed by the app every ~15s while the driver is on duty (background GPS).
// Body: { points: [{ lat, lng, accuracy?, heading?, speed?, recordedAt }], routeId? }.
// `tracking: false` in the response tells the app the driver is off duty and to
// stop its GPS watcher. Has its own per-driver rate limit (server/_core/index.ts).
router.post('/location', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const body = (req.body ?? {}) as { points?: unknown; routeId?: unknown };
        res.json(await upsertDriverLocation(db, req.driverId!, body));
    } catch (error) {
        console.error('Driver location error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============ WALLET / RECONCILIATION ============

router.get('/wallet/summary', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const { routeId, shift } = req.query as { routeId?: string; shift?: string };

        let routeIds: string[];
        if (shift === 'current') {
            // End-of-shift reconciliation: every route worked under the open
            // shift — the same scope /shifts/end snapshots when it closes it.
            const openShift = await findOpenShift(db, req.driverId!);
            routeIds = await resolveShiftRouteIds(db, req.driverId!, openShift?.id ?? null);
        } else {
            const allRoutes = await db
                .select({ id: driverRoutes.id, status: driverRoutes.status, date: driverRoutes.date })
                .from(driverRoutes)
                .where(eq(driverRoutes.driverId, req.driverId!));

            if (routeId) {
                // Scoped to exactly the route the driver is currently on — the wallet
                // reads as "what this route collected", not a blend of every route
                // worked today (a driver can finish one route and start a second
                // one on the same day, and those shouldn't be summed together).
                routeIds = allRoutes.filter(r => String(r.id) === String(routeId)).map(r => r.id);
            } else {
                // No active route given (e.g. between routes) — fall back to
                // today's/in-progress routes so the screen still shows something.
                const todayStr = new Date().toISOString().slice(0, 10);
                routeIds = allRoutes.filter(r =>
                    r.status === 'in_progress' || new Date(r.date).toISOString().slice(0, 10) === todayStr
                ).map(r => r.id);
            }
        }

        res.json(await computeWalletSummary(db, routeIds));

    } catch (error) {
        console.error('Get wallet summary error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
