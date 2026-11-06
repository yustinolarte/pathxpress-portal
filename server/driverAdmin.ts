/**
 * Driver Admin Functions
 * Used by tRPC router for admin panel driver management
 */
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';
import { eq, and, or, desc, sql, gte, lt, ne, notInArray, inArray, isNull, isNotNull } from 'drizzle-orm';
import { getDb } from './db';
import { drivers, driverRoutes, driverShifts, driverLocations, routeOrders, orders, driverReports, clientAccounts, codRecords, driverCashHandovers, trackingEvents, botOrders } from '../drizzle/schema';
import { optimizeStops } from './routeOptimizer';
import type { OptimizableStop, LatLng } from './routeOptimizer';
import { findPrecedenceViolation } from '@shared/routeSequence';
import { CLOSED_ORDER_STATUSES, orderStatusGroup } from '@shared/orderStatus';
import { comparePriority, computeDispatchPriority, type DispatchPriority } from '@shared/dispatchPriority';
import { dubaiTimeOfDay, isSameDubaiDay } from '@shared/dubaiTime';
import { botStatusExpr } from './botStatus';
import { estimateStopEtas, etaClock, etaInputFor, type EtaOrderFields } from '@shared/routeEta';
import { audit, findCurrentStopId, revertOutForDelivery } from './stopStatus';
import { stopCoordinates } from '@shared/geo';
import { cachedQuery } from './_core/queryCache';
import { MAX_SHIFT_HOURS, isStaleOpenShift } from './driverShiftRules';

// ============ ROUTE STOP ORDER ============

/**
 * MySQL sorts NULL first on ASC, so a legacy row with no sequence used to jump
 * ahead of stop #1. Always sort with this first: `sequence IS NULL, sequence, id`.
 */
const STOP_ORDER_SQL = sql`${routeOrders.sequence} IS NULL`;

/**
 * Stops the driver has finished handling, regardless of outcome — used for the
 * "completed stops" count, and to decide which stops are frozen in place and
 * which ones may no longer be deleted. 'on_hold' is excluded: the driver
 * postponed it, it isn't done.
 */
const FINISHED_STOP_STATUSES = ['picked_up', 'delivered', 'attempted', 'returned', 'failed'];

/**
 * A rule the admin broke and can fix by changing what they sent — a stale stop
 * list, a delivery dragged above its pickup, deleting a route that already has
 * PODs. The tRPC layer turns these into BAD_REQUEST so the message reaches the
 * toast, instead of surfacing as a 500 next to genuine server faults.
 */
export class RouteGuardError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RouteGuardError';
    }
}

// ============ DASHBOARD STATS ============

export async function getDriverDashboardStats() {
    return cachedQuery('driver:dashboardStats', 30, async () => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [[driverStats], [routeTotal], [todayRoutes], [deliveryStats], [reportStats]] = await Promise.all([
            db.select({
                total: sql<number>`cast(count(*) as unsigned)`,
                active: sql<number>`cast(SUM(CASE WHEN ${drivers.status} = 'active' THEN 1 ELSE 0 END) as unsigned)`,
            }).from(drivers),

            db.select({ total: sql<number>`cast(count(*) as unsigned)` }).from(driverRoutes),

            db.select({ count: sql<number>`cast(count(*) as unsigned)` })
                .from(driverRoutes)
                .where(gte(driverRoutes.date, today)),

            db.select({
                delivered: sql<number>`cast(SUM(CASE WHEN ${routeOrders.status} = 'delivered' THEN 1 ELSE 0 END) as unsigned)`,
                pending: sql<number>`cast(SUM(CASE WHEN ${routeOrders.status} IN ('pending', 'in_progress') THEN 1 ELSE 0 END) as unsigned)`,
            }).from(routeOrders),

            db.select({ pending: sql<number>`cast(count(*) as unsigned)` })
                .from(driverReports)
                .where(eq(driverReports.status, 'pending')),
        ]);

        return {
            drivers: {
                total: Number(driverStats?.total || 0),
                active: Number(driverStats?.active || 0),
            },
            routes: {
                total: Number(routeTotal?.total || 0),
                today: Number(todayRoutes?.count || 0),
            },
            deliveries: {
                delivered: Number(deliveryStats?.delivered || 0),
                pending: Number(deliveryStats?.pending || 0),
            },
            reports: {
                pending: Number(reportStats?.pending || 0),
            },
        };
    });
}

// ============ DRIVERS CRUD ============

type DriverRow = typeof drivers.$inferSelect;
/** A driver row without its credentials — every admin payload goes through this.
 *  The full row (bcrypt hash, push token) used to reach the browser on the roster,
 *  the routes list and the route details. */
export type PublicDriver = Omit<DriverRow, 'passwordHash' | 'pushToken'>;
export function toPublicDriver(driver: DriverRow): PublicDriver {
    const { passwordHash: _hash, pushToken: _push, ...rest } = driver;
    return rest;
}

export async function getAllDrivers() {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const [rows, stopStats] = await Promise.all([
        db.select().from(drivers).orderBy(desc(drivers.createdAt)),
        // One grouped pass over every stop ever worked, so the roster can show a
        // success rate without a per-driver round trip. The full breakdown still
        // lives in getDriverPerformance().
        // Every counter is confined to delivery stops. The numerator used to count
        // any stop marked 'delivered', pickups included, while the denominator was
        // delivery stops only — a mismatch that can push the rate over 100%. Stops
        // still open are excluded from both: a driver mid-route is not failing them.
        db.select({
            driverId: driverRoutes.driverId,
            delivered: sql<number>`cast(SUM(CASE WHEN ${routeOrders.type} = 'delivery' AND ${routeOrders.status} = 'delivered' THEN 1 ELSE 0 END) as signed)`,
            attempted: sql<number>`cast(SUM(CASE WHEN ${routeOrders.type} = 'delivery' AND ${routeOrders.status} = 'attempted' THEN 1 ELSE 0 END) as signed)`,
            returned: sql<number>`cast(SUM(CASE WHEN ${routeOrders.type} = 'delivery' AND ${routeOrders.status} IN ('returned', 'failed') THEN 1 ELSE 0 END) as signed)`,
            deliveryStops: sql<number>`cast(SUM(CASE WHEN ${routeOrders.type} = 'delivery' THEN 1 ELSE 0 END) as signed)`,
            settledStops: sql<number>`cast(SUM(CASE WHEN ${routeOrders.type} = 'delivery' AND ${routeOrders.status} NOT IN ('pending', 'in_progress') THEN 1 ELSE 0 END) as signed)`,
        })
            .from(routeOrders)
            .innerJoin(driverRoutes, eq(routeOrders.routeId, driverRoutes.id))
            .groupBy(driverRoutes.driverId),
    ]);

    const statsByDriver = new Map(stopStats.map(s => [s.driverId, s]));

    return rows.map(driver => {
        const s = statsByDriver.get(driver.id);
        const deliveryStops = Number(s?.deliveryStops || 0);
        const settledStops = Number(s?.settledStops || 0);
        const delivered = Number(s?.delivered || 0);
        return {
            ...toPublicDriver(driver),
            stats: {
                delivered,
                attempted: Number(s?.attempted || 0),
                returned: Number(s?.returned || 0),
                deliveryStops,
                successRate: settledStops > 0 ? Math.round((delivered / settledStops) * 100) : null,
            },
        };
    });
}

export async function getDriverById(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, id)).limit(1);
    return driver ? toPublicDriver(driver) : null;
}

export async function createDriver(data: {
    username: string;
    password: string;
    fullName: string;
    email?: string;
    phone?: string;
    vehicleNumber?: string;
    photoUrl: string;
    emiratesId?: string;
    licenseNo?: string;
}) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Check if username exists
    const [existing] = await db.select().from(drivers).where(eq(drivers.username, data.username)).limit(1);
    if (existing) {
        throw new Error('Username already exists');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const [result] = await db
        .insert(drivers)
        .values({
            username: data.username,
            passwordHash,
            fullName: data.fullName,
            email: data.email || null,
            phone: data.phone || null,
            vehicleNumber: data.vehicleNumber || null,
            photoUrl: data.photoUrl,
            emiratesId: data.emiratesId || null,
            licenseNo: data.licenseNo || null,
            status: 'active',
        })
        .$returningId();

    return { id: result.id, username: data.username };
}

export async function updateDriver(id: number, data: {
    fullName?: string;
    email?: string;
    phone?: string;
    vehicleNumber?: string;
    photoUrl?: string;
    emiratesId?: string;
    licenseNo?: string;
    status?: 'active' | 'inactive' | 'suspended';
}) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    await db.update(drivers).set(data).where(eq(drivers.id, id));
    return { success: true };
}

export async function deleteDriver(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    await db.delete(drivers).where(eq(drivers.id, id));
    return { success: true };
}

// ============ ROUTES ============

export async function getAllDriverRoutes() {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const routes = await db
        .select()
        .from(driverRoutes)
        .orderBy(desc(driverRoutes.date));

    if (routes.length === 0) return [];

    // Batch 1: get all drivers for these routes in one query
    const driverIds = Array.from(new Set(
        routes.map(r => r.driverId).filter((id): id is number => id !== null && id !== undefined)
    ));
    const driversMap = new Map<number, PublicDriver>();
    if (driverIds.length > 0) {
        const allDrivers = await db.select().from(drivers).where(inArray(drivers.id, driverIds));
        for (const d of allDrivers) driversMap.set(d.id, toPublicDriver(d));
    }

    // Batch 2: get all route orders for all routes in one query
    const routeIds = routes.map(r => r.id);
    const allRouteOrders = await db.select().from(routeOrders).where(inArray(routeOrders.routeId, routeIds));

    // Batch 3: get all related orders in one query
    const orderIds = Array.from(new Set(allRouteOrders.map(ro => ro.orderId)));
    const ordersMap = new Map<number, typeof orders.$inferSelect>();
    if (orderIds.length > 0) {
        const allOrders = await db.select().from(orders).where(inArray(orders.id, orderIds));
        for (const o of allOrders) ordersMap.set(o.id, o);
    }

    // Batch 4: get all client names in one query
    const clientIds = Array.from(new Set(
        Array.from(ordersMap.values()).map(o => o.clientId)
    ));
    const clientsMap = new Map<number, string>();
    if (clientIds.length > 0) {
        const clientsList = await db.select({ id: clientAccounts.id, companyName: clientAccounts.companyName })
            .from(clientAccounts).where(inArray(clientAccounts.id, clientIds));
        for (const c of clientsList) clientsMap.set(c.id, c.companyName);
    }

    // Group routeOrders by routeId for fast lookup
    const routeOrdersByRoute = new Map<string, typeof routeOrders.$inferSelect[]>();
    for (const ro of allRouteOrders) {
        if (!routeOrdersByRoute.has(ro.routeId)) routeOrdersByRoute.set(ro.routeId, []);
        routeOrdersByRoute.get(ro.routeId)!.push(ro);
    }

    // Aggregate in JS (data already in memory, no more DB calls)
    return routes.map(route => {
        const deliveries = routeOrdersByRoute.get(route.id) || [];
        const delivered = deliveries.filter(d => d.status === 'delivered').length;
        const pickupCount = deliveries.filter(d => d.type === 'pickup').length;
        const deliveryCount = deliveries.filter(d => d.type === 'delivery').length;

        const routeOrderIds = Array.from(new Set(deliveries.map(d => d.orderId)));
        const companiesSet = new Set<string>();
        let codTotal = 0;
        let returnCount = 0;
        let totalPieces = 0;
        let totalWeight = 0;

        for (const orderId of routeOrderIds) {
            const o = ordersMap.get(orderId);
            if (!o) continue;
            if (o.codRequired === 1 && o.codAmount) codTotal += parseFloat(o.codAmount) || 0;
            if (o.isReturn === 1 || o.orderType === 'return') returnCount++;
            totalPieces += o.pieces || 0;
            totalWeight += parseFloat(o.weight as string) || 0;
            const companyName = clientsMap.get(o.clientId);
            if (companyName) companiesSet.add(companyName);
        }

        return {
            ...route,
            driver: route.driverId ? driversMap.get(route.driverId) || null : null,
            deliveryStats: {
                total: deliveries.length,
                delivered,
                pickups: pickupCount,
                deliveries: deliveryCount,
            },
            companies: Array.from(companiesSet),
            codTotal,
            returnCount,
            totalPieces,
            totalWeight: Math.round(totalWeight * 100) / 100,
        };
    });
}

/** A GPS fix older than this says nothing about where the van is now. */
const LIVE_POSITION_MAX_AGE_MS = 15 * 60 * 1000;

/** When a worked stop was worked — its "ETA" is that real time. */
function stopDoneAt(stop: { status: string | null; deliveredAt: Date | null; pickedUpAt: Date | null; attemptedAt: Date | null }): Date | null {
    if (stop.status === 'pending' || stop.status === 'in_progress' || !stop.status) return null;
    return stop.deliveredAt ?? stop.pickedUpAt ?? stop.attemptedAt ?? null;
}

/**
 * Admin-only stop ETAs for a route, or null when the route has no start time
 * yet (plannedStartAt, else the real startedAt). A route on the road is
 * projected live from now and the driver's last fresh GPS fix; one that should
 * have left but hasn't is projected from now (etaClock).
 */
export async function planRouteEtas(
    db: DbHandle,
    route: typeof driverRoutes.$inferSelect,
    stops: { stopId: number; type: string; status: string | null; deliveredAt: Date | null; pickedUpAt: Date | null; attemptedAt: Date | null; order: EtaOrderFields }[],
) {
    const clock = etaClock(route, new Date());
    if (!clock || stops.length === 0) return null;
    let livePosition: LatLng | null = null;
    if (clock.mode === 'live' && route.driverId) {
        const [fix] = await db.select().from(driverLocations).where(eq(driverLocations.driverId, route.driverId)).limit(1);
        if (fix && Date.now() - fix.recordedAt.getTime() <= LIVE_POSITION_MAX_AGE_MS) livePosition = { lat: fix.lat, lng: fix.lng };
    }
    const originLat = route.startLat ? Number(route.startLat) : NaN;
    const originLng = route.startLng ? Number(route.startLng) : NaN;
    const origin = Number.isFinite(originLat) && Number.isFinite(originLng) ? { lat: originLat, lng: originLng } : null;
    const plan = estimateStopEtas(
        stops.map(s => etaInputFor(s.stopId, s.type === 'pickup' ? 'pickup' : 'delivery', s.order, stopDoneAt(s))),
        { startAt: clock.startAt, origin, now: clock.now, livePosition },
    );
    return {
        startAt: clock.startAt.toISOString(),
        endAt: plan.endAt,
        live: clock.mode === 'live',
        mode: clock.mode,
        hasOrigin: !!origin,
        // The stop sequencer re-projects in the browser while dispatch drags —
        // it needs the same fix to land on the same times as this list.
        livePosition,
        byStop: new Map(plan.stops.map(e => [e.key as number, e])),
    };
}

/** Recent routes a default is learned from. */
const PLANNING_HISTORY = 30;

/**
 * What a new route form opens with, learned from recent routes rather than
 * hardcoded: the start point dispatch keeps using (used at least twice, so a
 * one-off pin doesn't stick), and the time drivers actually leave. Routes used
 * to open at 09:00 while drivers really left around 14:00 — every ETA was hours
 * early.
 */
export async function getRoutePlanningDefaults(): Promise<{
    startPoint: { address: string | null; lat: string; lng: string } | null;
    typicalStartTime: string | null;
}> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const withStart = await db
        .select({ startAddress: driverRoutes.startAddress, startLat: driverRoutes.startLat, startLng: driverRoutes.startLng })
        .from(driverRoutes)
        .where(and(isNotNull(driverRoutes.startLat), isNotNull(driverRoutes.startLng), ne(driverRoutes.status, 'cancelled')))
        .orderBy(desc(driverRoutes.createdAt))
        .limit(PLANNING_HISTORY);
    // ~110 m cells: two pins dropped on the same depot rarely match to the metre.
    const cells = new Map<string, { n: number; lat: string; lng: string; address: string | null }>();
    for (const r of withStart) {
        const lat = Number(r.startLat), lng = Number(r.startLng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const cell = `${lat.toFixed(3)},${lng.toFixed(3)}`;
        const seen = cells.get(cell);
        // Newest first: the first row of a cell is its most recent pin and label.
        if (seen) {
            seen.n++;
            if (!seen.address && r.startAddress?.trim()) seen.address = r.startAddress.trim();
        } else {
            cells.set(cell, { n: 1, lat: r.startLat!, lng: r.startLng!, address: r.startAddress?.trim() || null });
        }
    }
    let usual: { n: number; lat: string; lng: string; address: string | null } | null = null;
    for (const c of Array.from(cells.values())) if (c.n >= 2 && (!usual || c.n > usual.n)) usual = c;

    const started = await db
        .select({ startedAt: driverRoutes.startedAt })
        .from(driverRoutes)
        .where(isNotNull(driverRoutes.startedAt))
        .orderBy(desc(driverRoutes.startedAt))
        .limit(PLANNING_HISTORY);
    const minutes = started
        .map(r => dubaiTimeOfDay(r.startedAt!).split(':').map(Number))
        .map(([h, m]) => h * 60 + m)
        .sort((a, b) => a - b);
    let typicalStartTime: string | null = null;
    if (minutes.length >= 5) {
        const mid = minutes.length >> 1;
        const median = minutes.length % 2 ? minutes[mid] : (minutes[mid - 1] + minutes[mid]) / 2;
        const rounded = Math.min(23 * 60 + 45, Math.round(median / 15) * 15);
        typicalStartTime = `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
    }

    return {
        startPoint: usual ? { address: usual.address, lat: usual.lat, lng: usual.lng } : null,
        typicalStartTime,
    };
}

export async function getRouteDetails(routeId: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
    if (!route) return null;

    let driver = null;
    if (route.driverId) {
        const [d] = await db.select().from(drivers).where(eq(drivers.id, route.driverId)).limit(1);
        driver = d ? toPublicDriver(d) : null;
    }

    const routeOrdersList = await db
        .select({
            routeOrder: routeOrders,
            order: orders,
        })
        .from(routeOrders)
        .innerJoin(orders, eq(routeOrders.orderId, orders.id))
        .where(eq(routeOrders.routeId, routeId))
        .orderBy(STOP_ORDER_SQL, routeOrders.sequence, routeOrders.id);

    // Get company names for all client IDs
    const clientIds = Array.from(new Set(routeOrdersList.map(item => item.order.clientId)));
    let clientMap: Record<number, string> = {};
    if (clientIds.length > 0) {
        const clients = await db.select({ id: clientAccounts.id, companyName: clientAccounts.companyName })
            .from(clientAccounts).where(inArray(clientAccounts.id, clientIds));
        for (const c of clients) {
            clientMap[c.id] = c.companyName;
        }
    }

    const now = new Date();
    const attempts = await getOrderAttempts(db, Array.from(new Set(routeOrdersList.map(i => i.order.id))), now);
    const etaPlan = await planRouteEtas(db, route, routeOrdersList.map(i => ({
        stopId: i.routeOrder.id,
        type: i.routeOrder.type,
        status: i.routeOrder.status,
        deliveredAt: i.routeOrder.deliveredAt,
        pickedUpAt: i.routeOrder.pickedUpAt,
        attemptedAt: i.routeOrder.attemptedAt,
        order: i.order,
    })));

    const deliveries = routeOrdersList.map((item) => ({
        id: item.routeOrder.id,
        orderId: item.order.id,
        sequence: item.routeOrder.sequence,
        type: item.routeOrder.type,
        waybillNumber: item.order.waybillNumber,
        customerName: item.order.customerName,
        customerPhone: item.order.customerPhone,
        address: item.order.address,
        city: item.order.city,
        latitude: item.order.latitude,
        longitude: item.order.longitude,
        locationAccuracy: item.order.locationAccuracy,
        shipperName: item.order.shipperName,
        shipperPhone: item.order.shipperPhone,
        shipperAddress: item.order.shipperAddress,
        shipperCity: item.order.shipperCity,
        shipperLat: item.order.shipperLat,
        shipperLng: item.order.shipperLng,
        status: item.routeOrder.status,
        proofPhotoUrl: item.routeOrder.proofPhotoUrl,
        proofPhotoUrl2: item.routeOrder.proofPhotoUrl2,
        notes: item.routeOrder.notes,
        deliveredAt: item.routeOrder.deliveredAt,
        companyName: clientMap[item.order.clientId] || 'Unknown',
        isReturn: item.order.isReturn,
        orderType: item.order.orderType,
        codRequired: item.order.codRequired,
        codAmount: item.order.codAmount,
        pieces: item.order.pieces,
        weight: item.order.weight,
        serviceType: item.order.serviceType,
        preferredDeliveryDate: item.order.preferredDeliveryDate,
        preferredDeliveryTime: item.order.preferredDeliveryTime,
        createdAt: item.order.createdAt,
        isRto: item.order.isRto,
        orderStatus: item.order.status,
        pickedUpAt: item.routeOrder.pickedUpAt,
        attemptedAt: item.routeOrder.attemptedAt,
        collectedAmount: item.routeOrder.collectedAmount,
        // Which leg's pin is in play: the pickup is at the shipper.
        locationSource: item.routeOrder.type === 'pickup' ? item.order.shipperLocationSource : item.order.locationSource,
        attempts: attempts.get(item.order.id) ?? { count: 0, lastAt: null, lastReason: null, lastLeg: null, today: false },
        priority: computeDispatchPriority({
            serviceType: item.order.serviceType,
            createdAt: item.order.createdAt,
            preferredDeliveryDate: item.order.preferredDeliveryDate,
            deliveryDateEstimated: item.order.deliveryDateEstimated,
            priorityOverride: item.order.priorityOverride,
            attemptCount: attempts.get(item.order.id)?.count ?? 0,
        }, now),
        eta: etaPlan?.byStop.get(item.routeOrder.id) ?? null,
    }));

    return {
        ...route,
        driver,
        deliveries,
        eta: etaPlan ? { startAt: etaPlan.startAt, endAt: etaPlan.endAt, live: etaPlan.live, mode: etaPlan.mode, hasOrigin: etaPlan.hasOrigin, livePosition: etaPlan.livePosition } : null,
    };
}

// Random, non-sequential route IDs so routes can't be enumerated/claimed by guessing.
// Reuses the same unambiguous alphabet as the waybill generator (no I/O/0/1).
const routeIdSuffix = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

export async function generateUniqueRouteId(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<string> {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 6; attempt++) {
        const candidate = `DXB-${year}-${routeIdSuffix()}`;
        const [existing] = await db.select({ id: driverRoutes.id }).from(driverRoutes).where(eq(driverRoutes.id, candidate)).limit(1);
        if (!existing) return candidate;
    }
    // Astronomically unlikely fallback — extra entropy guarantees uniqueness.
    return `DXB-${year}-${routeIdSuffix()}${routeIdSuffix()}`;
}

/** One leg to create, in the position it should occupy. */
export interface RouteStopSpec { orderId: number; type: 'pickup' | 'delivery'; }

/**
 * Expand a flat order list into stop legs. "both" is atomic: the pair is only
 * emitted when both legs are actually open, so we never silently drop one (e.g.
 * dropping delivery because the package isn't picked up yet — that's expected,
 * since this same call is the one doing the pickup).
 *
 * Unknown order ids are a hard error, not a permissive default. The old
 * `?? { canPickup: true, ... }` fallback let a stale or foreign id create route
 * stops for an order that doesn't exist: they counted towards deliveryStats
 * (which doesn't join `orders`) but vanished from getRouteDetails (which does),
 * so a route showed "3/8 stops" with 5 invisible ones.
 */
export function expandStopSpecs(
    orderIds: number[],
    stopMode: OrderMode,
    flags: Map<number, AssignmentFlags>,
): RouteStopSpec[] {
    const unknown = orderIds.filter(id => !flags.has(id));
    if (unknown.length > 0) {
        throw new RouteGuardError(`These orders don't exist or can't be assigned: ${unknown.join(', ')}`);
    }

    const specs: RouteStopSpec[] = [];
    for (const orderId of orderIds) {
        const f = flags.get(orderId)!;
        if (stopMode === 'both') {
            if (f.canBoth) {
                specs.push({ orderId, type: 'pickup' });
                specs.push({ orderId, type: 'delivery' });
            }
        } else if (stopMode === 'pickup_only' && f.canPickup) {
            specs.push({ orderId, type: 'pickup' });
        } else if (stopMode === 'delivery_only' && f.canDeliver) {
            specs.push({ orderId, type: 'delivery' });
        }
    }
    return specs;
}

/**
 * Guard for an explicitly ordered stop list (the create wizard sends the exact
 * sequence it drew on the map). Same rule as expandStopSpecs, checked per order:
 * both legs need canBoth, a lone pickup needs canPickup, a lone delivery canDeliver.
 */
export function assertStopSpecsAssignable(
    specs: RouteStopSpec[],
    flags: Map<number, AssignmentFlags>,
): void {
    const legsByOrder = new Map<number, Set<string>>();
    for (const s of specs) {
        if (!legsByOrder.has(s.orderId)) legsByOrder.set(s.orderId, new Set());
        legsByOrder.get(s.orderId)!.add(s.type);
    }

    const rejected: number[] = [];
    for (const [orderId, legs] of Array.from(legsByOrder)) {
        const f = flags.get(orderId);
        if (!f) { rejected.push(orderId); continue; }
        const ok = legs.has('pickup') && legs.has('delivery')
            ? f.canBoth
            : legs.has('pickup') ? f.canPickup : f.canDeliver;
        if (!ok) rejected.push(orderId);
    }
    if (rejected.length > 0) {
        throw new RouteGuardError(
            `These orders can no longer be assigned (another route took them or they're already done): ${rejected.join(', ')}. Reload and try again.`,
        );
    }
}

/** Minimal shape the deletion guards need — satisfied by a routeOrders row. */
export interface GuardableStop {
    status: string | null;
    collectedAmount?: string | null;
    proofPhotoUrl?: string | null;
    proofPhotoUrl2?: string | null;
    deliveredAt?: Date | null;
    pickedUpAt?: Date | null;
    attemptedAt?: Date | null;
    waybillNumber?: string | null;
}

/**
 * A stop carries field evidence once the driver app actually recorded work on
 * it — a POD photo, a collected amount, or one of the completion timestamps.
 * Deliberately NOT keyed off `status` alone: updateOrderStatus's admin-side
 * sync (server/db.ts) can stamp a routeOrders row with a terminal status
 * (e.g. 'picked_up') without any of this evidence when an order's status is
 * corrected by hand, and once stamped that row can never be re-synced (the
 * sync only touches pending/in_progress rows) — so status alone goes stale
 * and would block removal of a stop nothing was ever actually done to.
 */
export function stopHasEvidence(s: GuardableStop): boolean {
    return !!s.collectedAmount
        || !!s.proofPhotoUrl
        || !!s.proofPhotoUrl2
        || !!s.deliveredAt
        || !!s.pickedUpAt
        || !!s.attemptedAt;
}

/**
 * routeOrders rows are the ONLY source of the COD reconciliation and the shift
 * report, and they hold the POD photos. Deleting a worked route silently
 * destroys the proof of delivery and moves yesterday's cash figures, so we send
 * the admin to cancellation instead — which keeps the row and the money trail.
 */
export function assertRouteDeletable(route: { status: string | null }, stops: GuardableStop[]): void {
    const worked = stops.filter(stopHasEvidence);
    if (route.status === 'completed' || worked.length > 0) {
        throw new RouteGuardError(
            'This route already has recorded work — deleting it would destroy the POD and the cash reconciliation. Cancel the route instead.',
        );
    }
}

export function assertStopsRemovable(stops: GuardableStop[]): void {
    const worked = stops.filter(stopHasEvidence);
    if (worked.length > 0) {
        const labels = worked.map(s => s.waybillNumber).filter(Boolean).join(', ');
        throw new RouteGuardError(
            `A package the driver already worked can't be removed from the route${labels ? ` (${labels})` : ''}: its POD and COD record would be lost. Use "Correct status" instead.`,
        );
    }
}

export type DbHandle = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Serialize every write that touches a route's stop set. create/add/remove/
 * reorder/optimize all read-then-write the sequence, so without a lock two
 * admins working the same route interleave into duplicate or gapped numbering.
 * Same row-lock pattern as findOrCreateOpenShift. Keep the body short — no
 * network calls inside.
 */
export async function withRouteLock<T>(
    db: DbHandle,
    routeId: string,
    fn: (tx: DbHandle, route: typeof driverRoutes.$inferSelect) => Promise<T>,
): Promise<T> {
    return db.transaction(async (tx) => {
        const [route] = await tx.select().from(driverRoutes)
            .where(eq(driverRoutes.id, routeId)).limit(1).for('update');
        if (!route) throw new RouteGuardError('Route not found');
        return fn(tx as unknown as DbHandle, route);
    });
}

/** Read a route's stops in their canonical order, joined to their order row. */
async function readRouteStops(db: DbHandle, routeId: string) {
    return db
        .select({ ro: routeOrders, o: orders })
        .from(routeOrders)
        .innerJoin(orders, eq(routeOrders.orderId, orders.id))
        .where(eq(routeOrders.routeId, routeId))
        .orderBy(STOP_ORDER_SQL, routeOrders.sequence, routeOrders.id);
}

export async function createDriverRoute(data: {
    id?: string;
    date: Date;
    driverId?: number;
    zone?: string;
    vehicleInfo?: string;
    /** Explicit, already-ordered stop list (the create wizard). Wins over orderIds. */
    stops?: RouteStopSpec[];
    /** Legacy/dispatch path: expanded through expandStopSpecs. */
    orderIds?: number[];
    stopMode?: 'pickup_only' | 'delivery_only' | 'both';
    startAddress?: string;
    startLat?: string;
    startLng?: string;
    /** When the driver is planned to leave — feeds the admin-only stop ETAs. */
    plannedStartAt?: Date | null;
}) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Resolve the stop legs and validate them BEFORE opening the transaction
    // (fast feedback); the same check re-runs under row locks inside it.
    let specs: RouteStopSpec[] = [];
    if (data.stops && data.stops.length > 0) {
        specs = data.stops;
        const legKeys = specs.map(s => `${s.orderId}:${s.type}`);
        if (new Set(legKeys).size !== legKeys.length) {
            throw new RouteGuardError('The same stop appears twice in this route. Remove the duplicate and try again.');
        }
        const flags = await getAssignmentFlags(Array.from(new Set(specs.map(s => s.orderId))));
        assertStopSpecsAssignable(specs, flags);
    } else if (data.orderIds && data.orderIds.length > 0) {
        const orderIds = Array.from(new Set(data.orderIds));
        const flags = await getAssignmentFlags(orderIds);
        specs = expandStopSpecs(orderIds, data.stopMode || 'both', flags);
    }

    const violation = findPrecedenceViolation(
        specs.map((s, i) => ({ key: i, orderId: s.orderId, type: s.type })),
    );
    if (violation) {
        throw new RouteGuardError('A delivery is placed before its own pickup. Reorder the stops and try again.');
    }

    // Resolve the route ID: use the (random) client-provided one if free, otherwise generate a fresh unique one.
    let routeId = data.id?.trim() || '';
    if (routeId) {
        const [clash] = await db.select({ id: driverRoutes.id }).from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
        if (clash) routeId = await generateUniqueRouteId(db);
    } else {
        routeId = await generateUniqueRouteId(db);
    }

    // Route + stops go in together: a failed stop insert used to leave an empty
    // route behind while the wizard reported "Error al crear la ruta".
    await db.transaction(async (txRaw) => {
        const tx = txRaw as unknown as DbHandle;
        if (specs.length > 0) {
            const locked = await getAssignmentFlags(Array.from(new Set(specs.map(s => s.orderId))), tx, { lock: true });
            assertStopSpecsAssignable(specs, locked);
        }
        await tx.insert(driverRoutes).values({
            id: routeId,
            date: data.date,
            driverId: data.driverId || null,
            zone: data.zone || null,
            vehicleInfo: data.vehicleInfo || null,
            status: 'pending',
            startAddress: data.startAddress || null,
            startLat: data.startLat || null,
            startLng: data.startLng || null,
            plannedStartAt: data.plannedStartAt ?? null,
        });

        if (specs.length > 0) {
            await tx.insert(routeOrders).values(
                specs.map((s, i) => ({
                    routeId,
                    orderId: s.orderId,
                    sequence: i + 1,
                    type: s.type,
                    status: 'pending' as const,
                })),
            );
        }
    });

    return { id: routeId };
}

export async function optimizeRoute(routeId: string, origin?: { lat: number; lng: number }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    return withRouteLock(db, routeId, async (tx, route) => {
        const stopsRaw = await readRouteStops(tx, routeId);

        // Stops the driver already worked keep the index they occupy: the van has
        // been there, so renumbering them would rewrite history under the driver.
        const isFinished = (s: typeof stopsRaw[number]) =>
            FINISHED_STOP_STATUSES.includes(s.ro.status ?? '');
        const open = stopsRaw.filter(s => !isFinished(s));
        if (open.length === 0) return { optimized: 0 };

        // Best starting point: where the driver actually is (last finished stop),
        // then the caller's origin, then the route's configured warehouse.
        const lastFinished = [...stopsRaw].reverse().find(isFinished);
        const startOrigin: LatLng | null =
            (lastFinished ? stopCoordinates(lastFinished.ro.type, lastFinished.o) : null) ??
            origin ??
            (route.startLat && route.startLng
                ? { lat: parseFloat(route.startLat), lng: parseFloat(route.startLng) }
                : null);

        const stops: OptimizableStop[] = open.map(({ ro, o }) => ({
            id: ro.id,
            orderId: ro.orderId,
            type: ro.type,
            coords: stopCoordinates(ro.type, o),
        }));

        const optimizedIds = optimizeStops(stops, startOrigin);

        // Weave the optimized open stops back into the frozen slots.
        let cursor = 0;
        const finalIds = stopsRaw.map(s => (isFinished(s) ? s.ro.id : optimizedIds[cursor++]));

        await writeStopSequence(tx, routeId, finalIds);
        return { optimized: optimizedIds.length };
    });
}

/**
 * Suggested order for stop legs that aren't a route yet — the create wizard
 * needs a starting sequence before anything exists in the database, so
 * optimizeRoute(routeId) has nothing to read. Same engine, same coordinate
 * rules, no writes.
 *
 * Returns the input specs reordered. Legs whose order can't be found are kept
 * at the end rather than dropped: the caller's stop list is the source of
 * truth, this is only a suggestion.
 */
export async function previewOptimizedOrder(
    specs: RouteStopSpec[],
    origin?: { lat: number; lng: number },
): Promise<RouteStopSpec[]> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    if (specs.length === 0) return [];

    const orderIds = Array.from(new Set(specs.map(s => s.orderId)));
    const rows = await db
        .select({
            id: orders.id,
            latitude: orders.latitude,
            longitude: orders.longitude,
            shipperLat: orders.shipperLat,
            shipperLng: orders.shipperLng,
            isReturn: orders.isReturn,
        })
        .from(orders)
        .where(inArray(orders.id, orderIds));
    const byOrderId = new Map(rows.map(r => [r.id, r]));

    // Index into `specs` doubles as the synthetic stop id.
    const stops: OptimizableStop[] = specs.map((spec, i) => {
        const o = byOrderId.get(spec.orderId);
        return {
            id: i,
            orderId: spec.orderId,
            type: spec.type,
            coords: o ? stopCoordinates(spec.type, o) : null,
        };
    });

    return optimizeStops(stops, origin ?? null).map(i => specs[i]);
}

/**
 * Persist a stop ordering as sequence 1..N in a single UPDATE. Scoped to the
 * route so a caller can never renumber another route's stops by passing foreign ids.
 */
export async function writeStopSequence(db: DbHandle, routeId: string, stopIds: number[]) {
    if (stopIds.length === 0) return;
    const cases = sql.join(stopIds.map((id, i) => sql`WHEN ${id} THEN ${i + 1}`), sql` `);
    await db.execute(sql`
        UPDATE ${routeOrders}
        SET ${routeOrders.sequence} = CASE ${routeOrders.id} ${cases} END
        WHERE ${routeOrders.routeId} = ${routeId}
          AND ${routeOrders.id} IN (${sql.join(stopIds, sql`, `)})
    `);
}

/**
 * Manual stop reordering. Three things must hold, and all three are checked
 * against the database rather than trusting the client's copy:
 *   1. stopIds is EXACTLY the route's current stop set (rejects a stale UI that
 *      doesn't know about stops added or removed meanwhile);
 *   2. finished stops stay at the index they already have;
 *   3. no delivery ends up ahead of its own pickup — otherwise the driver app
 *      shows that stop permanently blocked (isDisabled) mid-route.
 */
export async function reorderRouteStops(routeId: string, stopIds: number[]) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    return withRouteLock(db, routeId, async (tx) => {
        const current = await tx
            .select({
                id: routeOrders.id,
                orderId: routeOrders.orderId,
                type: routeOrders.type,
                status: routeOrders.status,
                waybillNumber: orders.waybillNumber,
            })
            .from(routeOrders)
            .innerJoin(orders, eq(routeOrders.orderId, orders.id))
            .where(eq(routeOrders.routeId, routeId))
            .orderBy(STOP_ORDER_SQL, routeOrders.sequence, routeOrders.id);

        const byId = new Map(current.map(r => [r.id, r]));
        // [1,1,2] on stops {1,2,3} has the right length and only known ids — the Set
        // check is what catches it (stop 3 would keep its old number, shared with another).
        if (stopIds.length !== byId.size || new Set(stopIds).size !== stopIds.length || stopIds.some(id => !byId.has(id))) {
            throw new RouteGuardError("The stop list doesn't match the current route. Reload and try again.");
        }

        current.forEach((stop, i) => {
            if (FINISHED_STOP_STATUSES.includes(stop.status ?? '') && stopIds[i] !== stop.id) {
                throw new RouteGuardError(`A stop the driver already worked can't be moved (position ${i + 1}).`);
            }
        });

        const violation = findPrecedenceViolation(
            stopIds.map(id => {
                const s = byId.get(id)!;
                return { key: s.id, orderId: s.orderId, type: s.type, waybillNumber: s.waybillNumber };
            }),
        );
        if (violation) {
            throw new RouteGuardError(`The delivery of ${violation.delivery.waybillNumber} can't come before its pickup.`);
        }

        await writeStopSequence(tx, routeId, stopIds);
        return { success: true };
    });
}

// Route status changes and driver reassignment live in server/routeLifecycle.ts
// (setRouteStatus / reassignRoute): they must release legs, revert
// out-for-delivery orders and refuse unsafe transitions.

export async function deleteRoute(routeId: string, actor = 'admin') {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    return withRouteLock(db, routeId, async (tx, route) => {
        const stops = await tx
            .select({
                id: routeOrders.id,
                orderId: routeOrders.orderId,
                type: routeOrders.type,
                status: routeOrders.status,
                collectedAmount: routeOrders.collectedAmount,
                proofPhotoUrl: routeOrders.proofPhotoUrl,
                proofPhotoUrl2: routeOrders.proofPhotoUrl2,
                deliveredAt: routeOrders.deliveredAt,
                pickedUpAt: routeOrders.pickedUpAt,
                attemptedAt: routeOrders.attemptedAt,
            })
            .from(routeOrders)
            .where(eq(routeOrders.routeId, routeId));

        assertRouteDeletable(route, stops);

        // A scanned route already told the customer "Out for Delivery".
        const current: number[] = [];
        for (const s of stops.filter(s => s.type === 'delivery')) {
            if (await findCurrentStopId(tx, s.orderId, 'delivery') === s.id) current.push(s.orderId);
        }

        await tx.delete(routeOrders).where(eq(routeOrders.routeId, routeId));
        await tx.delete(driverRoutes).where(eq(driverRoutes.id, routeId));
        await revertOutForDelivery(tx, current, `Route ${routeId} deleted`, actor);
        await audit(tx, { routeId, action: 'route_deleted', fromValue: route.status, actor });
        return { success: true };
    });
}

export interface AddOrdersSkip { orderId: number; reason: string; }

export async function addOrdersToRoute(
    routeId: string,
    ordersList: { id: number; mode: 'pickup_only' | 'delivery_only' | 'both' }[]
) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // One entry per order — the same order twice used to insert two leg pairs.
    const requested = Array.from(new Map(ordersList.map(o => [o.id, o])).values());

    return withRouteLock(db, routeId, async (tx, route) => {
        if (route.status === 'completed' || route.status === 'cancelled') {
            throw new RouteGuardError(`This route is ${route.status} — reopen it or use another route.`);
        }

        // Server-side guard, under the order row locks: only create legs that are
        // actually assignable (don't re-pickup a picked-up package, don't put a
        // leg that's live on another route on this one too).
        const flags = await getAssignmentFlags(requested.map(o => o.id), tx, { lock: true });

        const existing = await tx
            .select({ id: routeOrders.id, orderId: routeOrders.orderId, type: routeOrders.type, status: routeOrders.status })
            .from(routeOrders)
            .where(eq(routeOrders.routeId, routeId))
            .orderBy(STOP_ORDER_SQL, routeOrders.sequence, routeOrders.id);
        const legsHere = new Set(existing.map(r => `${r.orderId}:${r.type}`));
        const openPickupHere = new Set(existing
            .filter(r => r.type === 'pickup' && (r.status === 'pending' || r.status === 'in_progress'))
            .map(r => r.orderId));

        const stopsToInsert: { routeId: string; orderId: number; type: 'pickup' | 'delivery'; status: 'pending' }[] = [];
        const skipped: AddOrdersSkip[] = [];
        for (const { id: orderId, mode } of requested) {
            const f = flags.get(orderId);
            if (!f) { skipped.push({ orderId, reason: 'Order not found or no longer assignable' }); continue; }

            const wanted: ('pickup' | 'delivery')[] = mode === 'both' ? ['pickup', 'delivery']
                : mode === 'pickup_only' ? ['pickup'] : ['delivery'];
            const missing = wanted.filter(t => !legsHere.has(`${orderId}:${t}`));
            if (missing.length === 0) { skipped.push({ orderId, reason: 'Already on this route' }); continue; }

            let legs: ('pickup' | 'delivery')[] = [];
            if (missing.length === 2) {
                if (f.canBoth) legs = missing;
            } else if (missing[0] === 'pickup') {
                if (f.canPickup) legs = ['pickup'];
            } else if (f.canDeliver || (openPickupHere.has(orderId) && f.deliveryLegOpen)) {
                // The delivery may follow a pickup that's already on THIS route —
                // completing a pickup-only stop into a pickup + delivery pair.
                legs = ['delivery'];
            }
            if (legs.length === 0) {
                skipped.push({ orderId, reason: 'That leg is already done or on another active route' });
                continue;
            }
            for (const type of legs) stopsToInsert.push({ routeId, orderId, type, status: 'pending' });
        }

        if (stopsToInsert.length === 0) {
            return { success: true, added: 0, stopsCreated: 0, skipped };
        }

        const inserted = await tx.insert(routeOrders).values(stopsToInsert).$returningId();

        // Renumber the WHOLE route 1..N. The old code derived the next sequence
        // from the row count, so after a removal left gaps (1,2,5,6) the new
        // stops were handed 5 and 6 again — two stops sharing a number.
        await writeStopSequence(tx, routeId, [...existing.map(r => r.id), ...inserted.map(r => r.id)]);

        const addedCount = new Set(stopsToInsert.map(s => s.orderId)).size;
        return { success: true, added: addedCount, stopsCreated: stopsToInsert.length, skipped };
    });
}

export async function removeOrderFromRoute(
    routeId: string,
    orderId: number,
    /** Omit to remove every leg of the order (legacy behaviour). */
    type?: 'pickup' | 'delivery',
    actor = 'admin',
) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    return withRouteLock(db, routeId, async (tx, route) => {
        const legs = await tx
            .select({
                id: routeOrders.id,
                type: routeOrders.type,
                status: routeOrders.status,
                collectedAmount: routeOrders.collectedAmount,
                proofPhotoUrl: routeOrders.proofPhotoUrl,
                proofPhotoUrl2: routeOrders.proofPhotoUrl2,
                deliveredAt: routeOrders.deliveredAt,
                pickedUpAt: routeOrders.pickedUpAt,
                attemptedAt: routeOrders.attemptedAt,
                waybillNumber: orders.waybillNumber,
                orderStatus: orders.status,
            })
            .from(routeOrders)
            .innerJoin(orders, eq(routeOrders.orderId, orders.id))
            .where(and(eq(routeOrders.routeId, routeId), eq(routeOrders.orderId, orderId)));

        let targets = type ? legs.filter(l => l.type === type) : legs;
        // Pulling the pickup of a package nobody collected yet leaves a delivery
        // for something that isn't on the van — the app would show it as active
        // and the route scan would even mark it out for delivery. Take it too.
        if (type === 'pickup' && orderStatusGroup(legs[0]?.orderStatus) === 'needsPickup') {
            targets = legs.filter(l => l.type === 'pickup' || !stopHasEvidence(l));
        }

        assertStopsRemovable(targets);
        if (targets.length === 0) return { success: true, removed: 0 };

        // Read before deleting: is this the stop the customer sees as "Out for Delivery"?
        const removedDelivery = targets.find(t => t.type === 'delivery');
        const wasCurrent = removedDelivery
            ? await findCurrentStopId(tx, orderId, 'delivery') === removedDelivery.id
            : false;

        await tx.delete(routeOrders).where(inArray(routeOrders.id, targets.map(t => t.id)));

        // Close the gaps so the next insert can't collide with a stale number.
        const remaining = await tx
            .select({ id: routeOrders.id })
            .from(routeOrders)
            .where(eq(routeOrders.routeId, routeId))
            .orderBy(STOP_ORDER_SQL, routeOrders.sequence, routeOrders.id);
        await writeStopSequence(tx, routeId, remaining.map(r => r.id));

        const backToWarehouse = wasCurrent
            ? await revertOutForDelivery(tx, [orderId], `Removed from route ${routeId}`, actor, routeId)
            : 0;
        await audit(tx, {
            routeId, orderId, action: 'stop_removed', fromValue: route.status, actor,
            payload: JSON.stringify({ legs: targets.map(t => t.type), backToWarehouse }),
        });

        return { success: true, removed: targets.length };
    });
}

/**
 * Take an order off every route before it's deleted (admin delete, customer
 * cancel). Its stops used to stay behind as orphans: counted in the route
 * totals but invisible in route details, reorder and optimize (inner joins),
 * holding a sequence number that clashed with the renumbered stops.
 */
export async function detachOrderFromRoutes(orderId: number, actor: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const routeIds = Array.from(new Set(
        (await db.select({ routeId: routeOrders.routeId }).from(routeOrders).where(eq(routeOrders.orderId, orderId))).map(r => r.routeId),
    ));
    for (const routeId of routeIds) {
        await withRouteLock(db, routeId, async (tx) => {
            const removed = await tx.select().from(routeOrders)
                .where(and(eq(routeOrders.routeId, routeId), eq(routeOrders.orderId, orderId)));
            if (removed.length === 0) return;
            await tx.delete(routeOrders).where(and(eq(routeOrders.routeId, routeId), eq(routeOrders.orderId, orderId)));
            const remaining = await tx.select({ id: routeOrders.id }).from(routeOrders)
                .where(eq(routeOrders.routeId, routeId))
                .orderBy(STOP_ORDER_SQL, routeOrders.sequence, routeOrders.id);
            await writeStopSequence(tx, routeId, remaining.map(r => r.id));
            await audit(tx, {
                routeId, orderId, action: 'order_deleted_from_route', actor,
                reason: 'The order was deleted or cancelled', payload: JSON.stringify(removed),
            });
        });
    }
    return { routes: routeIds.length };
}

// ============ DELIVERIES ============

export async function getAllDeliveries(filters?: {
    status?: string;
    routeId?: string;
    date?: string;
}) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const results = await db
        .select({
            id: routeOrders.id,
            routeId: routeOrders.routeId,
            orderId: routeOrders.orderId,
            sequence: routeOrders.sequence,
            status: routeOrders.status,
            proofPhotoUrl: routeOrders.proofPhotoUrl,
            proofPhotoUrl2: routeOrders.proofPhotoUrl2,
            notes: routeOrders.notes,
            deliveredAt: routeOrders.deliveredAt,
            waybillNumber: orders.waybillNumber,
            customerName: orders.customerName,
            customerPhone: orders.customerPhone,
            address: orders.address,
            city: orders.city,
            driverId: driverRoutes.driverId,
            driverFullName: drivers.fullName,
        })
        .from(routeOrders)
        .innerJoin(orders, eq(routeOrders.orderId, orders.id))
        .innerJoin(driverRoutes, eq(routeOrders.routeId, driverRoutes.id))
        .leftJoin(drivers, eq(driverRoutes.driverId, drivers.id));

    const deliveries = results.map(r => ({
        id: r.id,
        routeId: r.routeId,
        orderId: r.orderId,
        sequence: r.sequence,
        status: r.status,
        proofPhotoUrl: r.proofPhotoUrl,
        proofPhotoUrl2: r.proofPhotoUrl2,
        notes: r.notes,
        deliveredAt: r.deliveredAt,
        waybillNumber: r.waybillNumber,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        address: r.address,
        city: r.city,
        driver: r.driverId && r.driverFullName ? { id: r.driverId, fullName: r.driverFullName } : null,
    }));

    let filtered = deliveries;
    if (filters?.status) filtered = filtered.filter(d => d.status === filters.status);
    if (filters?.routeId) filtered = filtered.filter(d => d.routeId === filters.routeId);

    return filtered;
}

// ============ REPORTS ============

export async function getAllDriverReports(filters?: {
    status?: string;
    driverId?: number;
}) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const rows = await db
        .select({
            report: driverReports,
            driverFullName: drivers.fullName,
        })
        .from(driverReports)
        .leftJoin(drivers, eq(driverReports.driverId, drivers.id))
        .orderBy(desc(driverReports.createdAt));

    const reportsWithDriver = rows.map(r => ({
        ...r.report,
        driver: r.driverFullName ? { id: r.report.driverId, fullName: r.driverFullName } : null,
    }));

    let filtered = reportsWithDriver;
    if (filters?.status) filtered = filtered.filter(r => r.status === filters.status);
    if (filters?.driverId) filtered = filtered.filter(r => r.driverId === filters.driverId);

    return filtered;
}

export async function updateReportStatus(id: number, status: 'pending' | 'in_review' | 'resolved' | 'rejected') {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const updateData: { status: typeof status; resolvedAt?: Date } = { status };
    if (status === 'resolved') {
        updateData.resolvedAt = new Date();
    }

    await db.update(driverReports).set(updateData).where(eq(driverReports.id, id));
    return { success: true };
}

export async function deleteReport(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    await db.delete(driverReports).where(eq(driverReports.id, id));
    return { success: true };
}

// ============ DRIVER PERFORMANCE ============

export async function getDriverPerformance(driverId: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    if (!driver) return null;

    // Get all routes for this driver
    const driverRoutesData = await db
        .select()
        .from(driverRoutes)
        .where(eq(driverRoutes.driverId, driverId))
        .orderBy(desc(driverRoutes.date));

    const routeIds = driverRoutesData.map(r => r.id);

    // Aggregate delivery stats
    let totalDeliveries = 0;
    let settledDeliveries = 0;
    let delivered = 0;
    let attempted = 0;
    let returned = 0;
    let codTotal = 0;
    let totalPieces = 0;

    if (routeIds.length > 0) {
        // Delivery stops only, on both sides of the ratio — see getAllDrivers().
        const allStops = await db.select().from(routeOrders).where(inArray(routeOrders.routeId, routeIds));
        const deliveryStops = allStops.filter(s => s.type === 'delivery');
        totalDeliveries = deliveryStops.length;
        settledDeliveries = deliveryStops.filter(s => !['pending', 'in_progress'].includes(s.status)).length;
        delivered = deliveryStops.filter(s => s.status === 'delivered').length;
        attempted = deliveryStops.filter(s => s.status === 'attempted').length;
        returned = deliveryStops.filter(s => s.status === 'returned').length;

        const orderIds = Array.from(new Set(allStops.map(s => s.orderId)));
        if (orderIds.length > 0) {
            const orderData = await db.select().from(orders).where(inArray(orders.id, orderIds));
            for (const o of orderData) {
                if (o.codRequired === 1 && o.codAmount) codTotal += parseFloat(o.codAmount) || 0;
                totalPieces += o.pieces || 0;
            }
        }
    }

    // Last 30 days stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentRoutes = driverRoutesData.filter(r => new Date(r.date) >= thirtyDaysAgo);

    // Reports for this driver
    const driverReportsData = await db.select().from(driverReports).where(eq(driverReports.driverId, driverId));

    const successRate = settledDeliveries > 0 ? Math.round((delivered / settledDeliveries) * 100) : 0;

    return {
        driver: { id: driver.id, fullName: driver.fullName, username: driver.username, status: driver.status, vehicleNumber: driver.vehicleNumber, phone: driver.phone, email: driver.email, emiratesId: driver.emiratesId, licenseNo: driver.licenseNo, createdAt: driver.createdAt },
        stats: {
            totalRoutes: driverRoutesData.length,
            recentRoutes: recentRoutes.length,
            totalDeliveries,
            delivered,
            attempted,
            returned,
            successRate,
            codTotal: Math.round(codTotal * 100) / 100,
            totalPieces,
            totalReports: driverReportsData.length,
            pendingReports: driverReportsData.filter(r => r.status === 'pending').length,
        },
        recentRoutes: driverRoutesData.slice(0, 10).map(r => ({
            id: r.id,
            date: r.date,
            zone: r.zone,
            status: r.status,
        })),
    };
}

// ============ AVAILABLE ORDERS ============

export type OrderMode = 'pickup_only' | 'delivery_only' | 'both';
export interface AssignmentFlags {
    canPickup: boolean;
    canDeliver: boolean;
    canBoth: boolean;
    /** The delivery leg itself is free (not done, not on another live route) — even if a pickup must come first. */
    deliveryLegOpen: boolean;
}

// A route stop still "occupies" the order (blocks re-assigning that leg) while in these states.
const ACTIVE_STOP_STATUSES = ['pending', 'in_progress', 'on_hold', 'attempted'];
// Orders in these states are done/dead — never offered for assignment (shared/orderStatus.ts).
export const TERMINAL_ORDER_STATUSES: string[] = [...CLOSED_ORDER_STATUSES];

// International shipments aren't handled by local driver routes. Tolerant of
// casing, spaces, spelling variants and empty values (local orders sometimes
// omit the country). Keep in sync with isUAEDomestic() in shared/uae.ts.
export const DOMESTIC_COUNTRY_SQL = sql`(
    ${orders.destinationCountry} = ''
    OR UPPER(TRIM(${orders.destinationCountry})) IN ('UAE', 'UNITED ARAB EMIRATES', 'U.A.E', 'U.A.E.', 'AE', 'EMIRATES')
)`;
interface StopInfo { activePickup: boolean; activeDelivery: boolean; pickedUpViaStop: boolean; deliveredViaStop: boolean; }

/** Aggregate route stops (ignoring cancelled routes) into per-order occupancy info. */
function buildStopInfo(
    stopRows: { orderId: number; type: string; stopStatus: string; routeStatus: string }[],
): Map<number, StopInfo> {
    const map = new Map<number, StopInfo>();
    for (const s of stopRows) {
        if (s.routeStatus === 'cancelled') continue;
        const e = map.get(s.orderId) ?? { activePickup: false, activeDelivery: false, pickedUpViaStop: false, deliveredViaStop: false };
        // Once its route is completed, a leg that never resolved to picked_up/delivered
        // (still pending, in_progress, on_hold or attempted) is released back to the pool
        // instead of blocking reassignment forever — only an in-flight route legitimately occupies it.
        const stillActive = s.routeStatus !== 'completed' && ACTIVE_STOP_STATUSES.includes(s.stopStatus);
        if (s.type === 'pickup') {
            if (s.stopStatus === 'picked_up') e.pickedUpViaStop = true;
            if (stillActive) e.activePickup = true;
        } else {
            if (s.stopStatus === 'delivered') e.deliveredViaStop = true;
            if (stillActive) e.activeDelivery = true;
        }
        map.set(s.orderId, e);
    }
    return map;
}

/** Pure rule: which legs can still be assigned for an order given its status + current occupancy. */
export function computeAssignmentFlags(orderStatus: string, info?: StopInfo): AssignmentFlags {
    const group = orderStatusGroup(orderStatus);
    // Closed orders are done; an unknown status (free-text tracking code) is
    // never guessed at — it used to read as "picked up" and offer delivery-only.
    if (group === 'closed' || group === 'unknown') {
        return { canPickup: false, canDeliver: false, canBoth: false, deliveryLegOpen: false };
    }
    const i = info ?? { activePickup: false, activeDelivery: false, pickedUpViaStop: false, deliveredViaStop: false };
    const pickedUp = group === 'inCustody' || i.pickedUpViaStop;
    const delivered = i.deliveredViaStop;
    // failed_pickup included: the package is still at the shipper and needs a new pickup.
    const needsPickup = group === 'needsPickup';
    // Whether each leg is still "open" (not already done / not already occupied by another stop),
    // independent of whether the other leg has happened yet.
    const pickupOpen = needsPickup && !pickedUp && !i.activePickup;
    const deliveryLegOpen = !delivered && !i.activeDelivery;

    const canPickup = pickupOpen; // "Solo Pickup"
    // A package that still needs a pickup leg (and hasn't had one) can't be assigned delivery-only —
    // there's nothing to hand over yet.
    const canDeliver = deliveryLegOpen && (pickedUp || !needsPickup); // "Solo Entrega"
    // "Pickup + Entrega" bundles both legs into the same route, so it only needs both legs to still
    // be open — it does NOT require the package to already be picked up (that's the whole point of
    // doing both in one go).
    const canBoth = pickupOpen && deliveryLegOpen; // "Pickup + Entrega"
    return { canPickup, canDeliver, canBoth, deliveryLegOpen };
}

function defaultModeFor(flags: AssignmentFlags): OrderMode {
    if (flags.canBoth) return 'both';
    if (flags.canPickup) return 'pickup_only';
    return 'delivery_only';
}

/**
 * Per-order assignment flags for a specific set of orders — used as a server-side guard when assigning.
 *
 * Pass the write transaction as `handle` with `lock: true` to take the order
 * rows FOR UPDATE (in id order, so concurrent assigners can't deadlock) and
 * read occupancy inside it. Checking outside the transaction let two admins —
 * or one retried request — put the same leg on two live routes.
 */
export async function getAssignmentFlags(
    orderIds: number[],
    handle?: DbHandle,
    opts: { lock?: boolean } = {},
): Promise<Map<number, AssignmentFlags>> {
    const db = handle ?? await getDb();
    const result = new Map<number, AssignmentFlags>();
    if (!db || orderIds.length === 0) return result;

    const orderQuery = db.select({ id: orders.id, status: orders.status })
        .from(orders).where(inArray(orders.id, orderIds)).orderBy(orders.id);
    const orderRows = opts.lock ? await orderQuery.for('update') : await orderQuery;
    const stopRows = await db
        .select({ orderId: routeOrders.orderId, type: routeOrders.type, stopStatus: routeOrders.status, routeStatus: driverRoutes.status })
        .from(routeOrders)
        .innerJoin(driverRoutes, eq(routeOrders.routeId, driverRoutes.id))
        .where(inArray(routeOrders.orderId, orderIds));

    const stopInfo = buildStopInfo(stopRows);
    for (const o of orderRows) {
        result.set(o.id, computeAssignmentFlags(o.status, stopInfo.get(o.id)));
    }
    return result;
}

/** Tracking codes that count as an attempt (driver or admin, pickup or delivery). */
const ATTEMPT_STATUS_CODES = ['delivery_attempted', 'failed_delivery', 'failed_pickup'];

export interface OrderAttempts {
    count: number;
    lastAt: Date | null;
    lastReason: string | null;
    lastLeg: 'pickup' | 'delivery' | null;
    /** At least one attempt happened today (Dubai). */
    today: boolean;
}

/** Attempt history per order, from the customer-facing tracking timeline. */
export async function getOrderAttempts(db: DbHandle, orderIds: number[], now = new Date()): Promise<Map<number, OrderAttempts>> {
    const result = new Map<number, OrderAttempts>();
    if (orderIds.length === 0) return result;
    const rows = await db.select({
        shipmentId: trackingEvents.shipmentId,
        statusCode: trackingEvents.statusCode,
        eventDatetime: trackingEvents.eventDatetime,
        description: trackingEvents.description,
    })
        .from(trackingEvents)
        .where(and(inArray(trackingEvents.shipmentId, orderIds), inArray(trackingEvents.statusCode, ATTEMPT_STATUS_CODES)))
        .orderBy(trackingEvents.eventDatetime);
    for (const r of rows) {
        const a = result.get(r.shipmentId) ?? { count: 0, lastAt: null, lastReason: null, lastLeg: null, today: false };
        a.count++;
        a.lastAt = r.eventDatetime;
        a.lastReason = r.description ? r.description.trim().slice(0, 200) : null;
        a.lastLeg = r.statusCode === 'failed_pickup' ? 'pickup' : 'delivery';
        if (isSameDubaiDay(r.eventDatetime, now)) a.today = true;
        result.set(r.shipmentId, a);
    }
    return result;
}

export async function getAvailableOrders() {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();

    // Candidate orders = anything not in a terminal state. The per-order flags below decide
    // whether a pickup and/or delivery leg is still assignable.
    const candidateOrders = await db
        .select({
            id: orders.id,
            waybillNumber: orders.waybillNumber,
            customerName: orders.customerName,
            customerPhone: orders.customerPhone,
            address: orders.address,
            city: orders.city,
            emirate: orders.emirate,
            latitude: orders.latitude,
            longitude: orders.longitude,
            locationAccuracy: orders.locationAccuracy,
            locationSource: orders.locationSource,
            locationVerifiedAt: orders.locationVerifiedAt,
            shipperCity: orders.shipperCity,
            shipperAddress: orders.shipperAddress,
            shipperLat: orders.shipperLat,
            shipperLng: orders.shipperLng,
            shipperLocationSource: orders.shipperLocationSource,
            status: orders.status,
            codRequired: orders.codRequired,
            codAmount: orders.codAmount,
            serviceType: orders.serviceType,
            preferredDeliveryDate: orders.preferredDeliveryDate,
            preferredDeliveryTime: orders.preferredDeliveryTime,
            deliveryDateEstimated: orders.deliveryDateEstimated,
            priorityOverride: orders.priorityOverride,
            pieces: orders.pieces,
            weight: orders.weight,
            isReturn: orders.isReturn,
            orderType: orders.orderType,
            shipperName: orders.shipperName,
            clientId: orders.clientId,
            specialInstructions: orders.specialInstructions,
            createdAt: orders.createdAt,
        })
        .from(orders)
        .where(and(
            notInArray(orders.status, TERMINAL_ORDER_STATUSES),
            DOMESTIC_COUNTRY_SQL,
        ));
    if (candidateOrders.length === 0) return [];
    const candidateIds = candidateOrders.map(o => o.id);

    // Route stops of the candidates only (it used to read every stop ever
    // written), with their route status so cancelled routes don't lock orders.
    const stopRows = await db
        .select({ orderId: routeOrders.orderId, type: routeOrders.type, stopStatus: routeOrders.status, routeStatus: driverRoutes.status })
        .from(routeOrders)
        .innerJoin(driverRoutes, eq(routeOrders.routeId, driverRoutes.id))
        .where(inArray(routeOrders.orderId, candidateIds));
    const stopInfo = buildStopInfo(stopRows);

    // Keep only orders that still have an assignable leg, attaching the flags + default mode.
    const available = candidateOrders
        .map(o => {
            const flags = computeAssignmentFlags(o.status, stopInfo.get(o.id));
            return { ...o, ...flags, defaultMode: defaultModeFor(flags) };
        })
        .filter(o => o.canPickup || o.canDeliver);
    if (available.length === 0) return [];
    const availableIds = available.map(o => o.id);

    const [attempts, botRows, clients] = await Promise.all([
        getOrderAttempts(db, availableIds, now),
        db.select({ waybillNumber: botOrders.waybillNumber, botStatus: botStatusExpr })
            .from(botOrders)
            .where(inArray(botOrders.waybillNumber, available.map(o => o.waybillNumber))),
        db.select({ id: clientAccounts.id, companyName: clientAccounts.companyName })
            .from(clientAccounts)
            .where(inArray(clientAccounts.id, Array.from(new Set(available.map(o => o.clientId))))),
    ]);
    const botByWaybill = new Map(botRows.map(b => [b.waybillNumber, b.botStatus]));
    const clientMap = new Map(clients.map(c => [c.id, c.companyName]));
    const noAttempts: OrderAttempts = { count: 0, lastAt: null, lastReason: null, lastLeg: null, today: false };

    return available
        .map(o => {
            const a = attempts.get(o.id) ?? noAttempts;
            return {
                ...o,
                companyName: clientMap.get(o.clientId) || 'Unknown',
                attempts: a,
                botStatus: botByWaybill.get(o.waybillNumber) ?? 'not_tracked',
                priority: computeDispatchPriority({
                    serviceType: o.serviceType,
                    createdAt: o.createdAt,
                    preferredDeliveryDate: o.preferredDeliveryDate,
                    deliveryDateEstimated: o.deliveryDateEstimated,
                    priorityOverride: o.priorityOverride,
                    attemptCount: a.count,
                }, now),
            };
        })
        // Most urgent first, oldest first within a level.
        .sort(comparePriority);
}

/** Dispatch override of an order's priority; null hands it back to the rules. */
export async function setOrderPriority(orderId: number, priority: DispatchPriority | null, actor: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const [order] = await db.select({ id: orders.id, priorityOverride: orders.priorityOverride })
        .from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new RouteGuardError('Order not found');
    await db.update(orders).set({ priorityOverride: priority }).where(eq(orders.id, orderId));
    await audit(db, {
        orderId, action: 'priority_set', fromValue: order.priorityOverride ?? 'auto', toValue: priority ?? 'auto', actor,
    });
    return { success: true };
}

// ============ SHIFT / ROUTE TIME & COD REPORT ============

export interface DriverShiftReportRoute {
    routeId: string;
    zone: string | null;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    activeSeconds: number | null;
    completedStops: number;
    codCollected: number;
}

/**
 * The driver's end-of-shift reconciliation, as /shifts/end snapshotted it. The
 * money figures were computed server-side at submission; only declaredCash and
 * the note came from the driver.
 */
export interface DriverShiftReconciliation {
    reconciledAt: Date;
    expectedCash: number;
    collectedCash: number;
    cardCollected: number;
    declaredCash: number;
    /** collectedCash − expectedCash */
    cashDiscrepancy: number;
    /** declaredCash − collectedCash */
    declaredVariance: number;
    note: string | null;
}

export interface DriverShiftReportGroup {
    driverId: number;
    driverName: string;
    shiftId: number | null; // null = these routes aren't linked to a reported shift yet (still in progress)
    shiftStartTime: Date | null;
    shiftEndTime: Date | null;
    /**
     * Null while the shift is open, for the unlinked bucket, and for a shift that
     * was closed without one (admin close, stale close, older app build). A shift
     * with both shiftEndTime and reconciliation is "completed".
     */
    reconciliation: DriverShiftReconciliation | null;
    /** Paid time for this shift, clipped to the requested range. Null when there's no shift. */
    onDutySeconds: number | null;
    routes: DriverShiftReportRoute[];
    totalActiveSeconds: number;
    totalCodCollected: number;
    totalCompletedStops: number;
}

/** One payroll line per driver for the requested range. */
export interface DriverPayrollRow {
    driverId: number;
    driverName: string;
    initials: string;
    shiftCount: number;
    openShiftCount: number;
    /**
     * Of openShiftCount, how many are stale (open longer than MAX_SHIFT_HOURS).
     * Lets the UI distinguish "still open, still counting" from "open so long we
     * capped it" instead of the two looking identical at a glance.
     */
    staleShiftCount?: number;
    /** Clocked-in time inside the range. Open shifts are counted up to now, capped
     *  at MAX_SHIFT_HOURS once stale — see staleShiftCount. */
    onDutySeconds: number;
    /** Time the app reported as actively working a route (excludes pauses). */
    activeSeconds: number;
    routeCount: number;
    completedStops: number;
    codCollected: number;
}

export interface DriverShiftReport {
    from: string;
    to: string;
    groups: DriverShiftReportGroup[];
    payroll: DriverPayrollRow[];
    totals: {
        shiftCount: number;
        openShiftCount: number;
        /** Sum of payroll[].staleShiftCount — see that field for what it means. */
        staleShiftCount?: number;
        onDutySeconds: number;
        activeSeconds: number;
        routeCount: number;
        completedStops: number;
        codCollected: number;
    };
}

export interface ShiftReportFilters {
    /** Inclusive start day, YYYY-MM-DD. Defaults to today. */
    from?: string;
    /** Inclusive end day, YYYY-MM-DD. Defaults to `from`. */
    to?: string;
    driverId?: number;
}

/**
 * Per-driver, per-shift breakdown of routes worked over a date range, plus a
 * payroll roll-up per driver.
 *
 * Active time per route is what the app reported via /driver/shifts/route-report;
 * COD is recomputed server-side from routeOrders.collectedAmount for delivered
 * stops only — never the app-reported codCollectedReported snapshot, same
 * reasoning as the wallet/summary and stops/:id/status guards.
 *
 * On-duty time is clipped to the requested range, so a shift spanning midnight is
 * split across the days that actually contain it instead of being double-counted
 * or attributed entirely to its start day. Still-open shifts count up to now.
 *
 * Routes whose driver hasn't reported a shift land in a shiftId: null bucket per
 * driver so they stay visible instead of disappearing from the view.
 */
export async function getDriverShiftReport(filters?: ShiftReportFilters | string): Promise<DriverShiftReport> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Tolerate the old single-date string signature.
    const input: ShiftReportFilters = typeof filters === 'string' ? { from: filters } : (filters ?? {});

    const dayStart = input.from ? new Date(`${input.from}T00:00:00`) : new Date();
    dayStart.setHours(0, 0, 0, 0);
    const lastDay = input.to ? new Date(`${input.to}T00:00:00`) : new Date(dayStart);
    lastDay.setHours(0, 0, 0, 0);
    // `to` is inclusive, so the exclusive upper bound is the day after it.
    const dayEnd = new Date(lastDay);
    dayEnd.setDate(dayEnd.getDate() + 1);
    if (dayEnd <= dayStart) throw new Error('The end date cannot be before the start date');

    const isoDay = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const emptyReport: DriverShiftReport = {
        from: isoDay(dayStart),
        to: isoDay(lastDay),
        groups: [],
        payroll: [],
        totals: { shiftCount: 0, openShiftCount: 0, staleShiftCount: 0, onDutySeconds: 0, activeSeconds: 0, routeCount: 0, completedStops: 0, codCollected: 0 },
    };

    const [allDayRoutes, allDayShifts] = await Promise.all([
        // Selected by when the route was actually WORKED, not when dispatch planned
        // it: driverRoutes.date is the nominal/planned day, but drivers routinely
        // run a route days late, while shifts below are selected by startTime (the
        // real clock-in moment). Filtering routes on `date` alone can put a route
        // and the shift it was worked under in different day buckets even though
        // they share the same real-world timestamp (a route dated 2026-08-03 whose
        // driver actually drove it, and clocked in for it, on 2026-08-05). Fall
        // back to `date` only for routes that never started at all.
        db.select().from(driverRoutes).where(or(
            and(isNotNull(driverRoutes.startedAt), gte(driverRoutes.startedAt, dayStart), lt(driverRoutes.startedAt, dayEnd)),
            and(isNull(driverRoutes.startedAt), gte(driverRoutes.date, dayStart), lt(driverRoutes.date, dayEnd)),
        )),
        // Overlapping the range: started before its end, and either still open or closed after its start.
        //
        // Both halves must go through drizzle's typed operators. A raw sql`` fragment
        // binds the Date straight to mysql2, which serialises it in local time, while
        // the typed comparison above serialises in UTC — so the two bounds silently
        // disagreed by the UTC offset and shifts ending early in the local day were
        // dropped from the report.
        db.select().from(driverShifts).where(and(
            lt(driverShifts.startTime, dayEnd),
            or(
                isNull(driverShifts.endTime),
                gte(driverShifts.endTime, dayStart),
            ),
        )),
    ]);

    const dayRoutes = input.driverId ? allDayRoutes.filter(r => r.driverId === input.driverId) : allDayRoutes;
    const dayShifts = input.driverId ? allDayShifts.filter(s => s.driverId === input.driverId) : allDayShifts;

    if (dayRoutes.length === 0 && dayShifts.length === 0) return emptyReport;

    // A route's shiftId can point at a shift that doesn't overlap the requested
    // range at all — the range is narrower than the shift, or (now that routes are
    // selected by startedAt above) an admin correction moved the shift's startTime
    // outside the window while the route's startedAt stayed put. `dayShifts` won't
    // contain that row, so `.find` on it would silently return undefined and the
    // route would render with a null shiftStartTime/onDutySeconds instead of its
    // real shift. Resolve those separately with one batched fetch (not per-route).
    const dayShiftIds = new Set(dayShifts.map(s => s.id));
    const missingShiftIds = Array.from(new Set(
        dayRoutes.map(r => r.shiftId).filter((id): id is number => id !== null && !dayShiftIds.has(id))
    ));
    const extraShifts = missingShiftIds.length > 0
        ? await db.select().from(driverShifts).where(inArray(driverShifts.id, missingShiftIds))
        : [];
    const shiftsById = new Map<number, (typeof dayShifts)[number]>();
    for (const s of dayShifts) shiftsById.set(s.id, s);
    for (const s of extraShifts) shiftsById.set(s.id, s);

    const driverIds = Array.from(new Set([
        ...dayRoutes.map(r => r.driverId).filter((id): id is number => id !== null),
        ...dayShifts.map(s => s.driverId),
        ...extraShifts.map(s => s.driverId),
    ]));
    const driversMap = new Map<number, string>();
    if (driverIds.length > 0) {
        const driverRows = await db.select({ id: drivers.id, fullName: drivers.fullName })
            .from(drivers).where(inArray(drivers.id, driverIds));
        for (const d of driverRows) driversMap.set(d.id, d.fullName);
    }

    const routeIds = dayRoutes.map(r => r.id);
    const routeStops = routeIds.length > 0
        ? await db.select({
            routeId: routeOrders.routeId,
            type: routeOrders.type,
            status: routeOrders.status,
            collectedAmount: routeOrders.collectedAmount,
            orderId: routeOrders.orderId,
        }).from(routeOrders).where(inArray(routeOrders.routeId, routeIds))
        : [];

    const stopOrderIds = Array.from(new Set(routeStops.map(s => s.orderId)));
    const codRequiredByOrder = new Map<number, boolean>();
    if (stopOrderIds.length > 0) {
        const orderRows = await db.select({ id: orders.id, codRequired: orders.codRequired })
            .from(orders).where(inArray(orders.id, stopOrderIds));
        for (const o of orderRows) codRequiredByOrder.set(o.id, o.codRequired === 1);
    }

    const stopsByRoute = new Map<string, typeof routeStops>();
    for (const s of routeStops) {
        if (!stopsByRoute.has(s.routeId)) stopsByRoute.set(s.routeId, []);
        stopsByRoute.get(s.routeId)!.push(s);
    }

    const routeReportById = new Map<string, DriverShiftReportRoute>();
    for (const route of dayRoutes) {
        const stops = stopsByRoute.get(route.id) || [];
        const completedStops = stops.filter(s => FINISHED_STOP_STATUSES.includes(s.status)).length;
        const codCollected = stops
            .filter(s => s.type === 'delivery' && s.status === 'delivered' && codRequiredByOrder.get(s.orderId))
            .reduce((sum, s) => sum + (s.collectedAmount ? parseFloat(s.collectedAmount) : 0), 0);

        routeReportById.set(route.id, {
            routeId: route.id,
            zone: route.zone,
            status: route.status,
            startedAt: route.startedAt,
            finishedAt: route.finishedAt,
            activeSeconds: route.activeSeconds,
            completedStops,
            codCollected: Math.round(codCollected * 100) / 100,
        });
    }

    // Group: key = `${driverId}:${shiftId ?? 'unlinked'}`
    const groups = new Map<string, DriverShiftReportGroup>();

    // Paid time = the part of the shift that falls inside the requested range.
    // A shift crossing midnight therefore contributes to each day it touches
    // rather than landing entirely on its start day, and an open shift is
    // counted up to now (never into the future) — UNLESS it has gone stale
    // (isStaleOpenShift, same predicate getDispatchOverview() uses to drop it from
    // "on duty"), in which case it's a missed clock-out rather than hours worked
    // and gets capped at startTime + MAX_SHIFT_HOURS instead. Before this, an open
    // shift older than MAX_SHIFT_HOURS (e.g. shift #265, open 31+h) billed every
    // one of those hours to payroll while getDispatchOverview() had already
    // stopped treating the driver as on duty — two views of the same module
    // disagreeing about the same row. A CLOSED shift's endTime is never capped
    // here: an admin may have deliberately recorded a long one, and
    // updateDriverShift() already enforces MAX_SHIFT_HOURS on write.
    const now = new Date();
    const clippedSeconds = (start: Date, end: Date | null) => {
        const from = Math.max(start.getTime(), dayStart.getTime());
        // Only an open shift is "counted up to now" — a closed shift's clock-out is
        // the authoritative end and must not be pulled back to the current time.
        const openCap = start.getTime() + MAX_SHIFT_HOURS * 60 * 60 * 1000;
        const rawEnd = end ? end.getTime() : Math.min(now.getTime(), openCap);
        const to = Math.min(rawEnd, dayEnd.getTime());
        return Math.max(0, Math.round((to - from) / 1000));
    };

    const num = (v: string | null) => (v === null ? 0 : Number(v));
    const reconciliationOf = (shift: (typeof dayShifts)[number] | undefined): DriverShiftReconciliation | null =>
        shift?.reconciledAt ? {
            reconciledAt: shift.reconciledAt,
            expectedCash: num(shift.expectedCash),
            collectedCash: num(shift.collectedCash),
            cardCollected: num(shift.cardCollected),
            declaredCash: num(shift.declaredCash),
            cashDiscrepancy: num(shift.cashDiscrepancy),
            declaredVariance: num(shift.declaredVariance),
            note: shift.reconciliationNote,
        } : null;

    const getGroup = (driverId: number, shiftId: number | null, shift?: (typeof dayShifts)[number]) => {
        const shiftStartTime = shift?.startTime ?? null;
        const shiftEndTime = shift?.endTime ?? null;
        const key = `${driverId}:${shiftId ?? 'unlinked'}`;
        let group = groups.get(key);
        if (!group) {
            group = {
                driverId,
                driverName: driversMap.get(driverId) || 'Unknown',
                shiftId,
                shiftStartTime,
                shiftEndTime,
                reconciliation: reconciliationOf(shift),
                onDutySeconds: shiftStartTime ? clippedSeconds(shiftStartTime, shiftEndTime) : null,
                routes: [],
                totalActiveSeconds: 0,
                totalCodCollected: 0,
                totalCompletedStops: 0,
            };
            groups.set(key, group);
        }
        return group;
    };

    // Seed a group per shift so shifts with no routes yet still show up.
    for (const shift of dayShifts) {
        getGroup(shift.driverId, shift.id, shift);
    }

    for (const route of dayRoutes) {
        if (route.driverId === null) continue; // unassigned route — nothing to attribute it to
        // Resolved from the merged dayShifts + extraShifts set (see above), so a
        // shift outside the range still attaches its real startTime/endTime here.
        // clippedSeconds() (in getGroup) still bounds onDutySeconds to the
        // requested range, so an out-of-range shift correctly clips to 0 rather
        // than leaking time from outside the window.
        const shift = route.shiftId !== null ? shiftsById.get(route.shiftId) : undefined;
        const group = getGroup(route.driverId, route.shiftId ?? null, shift);
        const report = routeReportById.get(route.id)!;
        group.routes.push(report);
        group.totalActiveSeconds += report.activeSeconds || 0;
        group.totalCodCollected += report.codCollected;
        group.totalCompletedStops += report.completedStops;
    }

    const allGroups = Array.from(groups.values());
    for (const group of allGroups) {
        group.totalCodCollected = Math.round(group.totalCodCollected * 100) / 100;
    }

    allGroups.sort((a, b) => {
        if (a.driverName !== b.driverName) return a.driverName.localeCompare(b.driverName);
        const aTime = a.shiftStartTime?.getTime() ?? 0;
        const bTime = b.shiftStartTime?.getTime() ?? 0;
        return bTime - aTime;
    });

    // ── Payroll roll-up ──
    const payroll = new Map<number, DriverPayrollRow>();
    const payrollRow = (driverId: number) => {
        let row = payroll.get(driverId);
        if (!row) {
            const name = driversMap.get(driverId) || 'Unknown';
            row = {
                driverId,
                driverName: name,
                initials: initialsOf(name),
                shiftCount: 0,
                openShiftCount: 0,
                staleShiftCount: 0,
                onDutySeconds: 0,
                activeSeconds: 0,
                routeCount: 0,
                completedStops: 0,
                codCollected: 0,
            };
            payroll.set(driverId, row);
        }
        return row;
    };

    // Deliberately iterates dayShifts, NOT dayShifts + extraShifts: a shift's
    // "home" range is the one it overlaps, and extraShifts are shifts that do
    // NOT overlap this range (they were only pulled in to label a route's
    // group correctly, see above). Counting them here would double-count that
    // shift in both this report and whichever range it actually overlaps.
    for (const shift of dayShifts) {
        const row = payrollRow(shift.driverId);
        row.shiftCount++;
        if (!shift.endTime) {
            row.openShiftCount++;
            if (isStaleOpenShift(shift, now)) row.staleShiftCount = (row.staleShiftCount || 0) + 1;
        }
        row.onDutySeconds += clippedSeconds(shift.startTime, shift.endTime);
    }
    for (const route of dayRoutes) {
        if (route.driverId === null) continue;
        const report = routeReportById.get(route.id)!;
        const row = payrollRow(route.driverId);
        row.routeCount++;
        row.activeSeconds += report.activeSeconds || 0;
        row.completedStops += report.completedStops;
        row.codCollected += report.codCollected;
    }

    const payrollRows = Array.from(payroll.values())
        .map(r => ({ ...r, codCollected: round2(r.codCollected) }))
        .sort((a, b) => a.driverName.localeCompare(b.driverName));

    return {
        from: isoDay(dayStart),
        to: isoDay(lastDay),
        groups: allGroups,
        payroll: payrollRows,
        totals: {
            shiftCount: payrollRows.reduce((s, r) => s + r.shiftCount, 0),
            openShiftCount: payrollRows.reduce((s, r) => s + r.openShiftCount, 0),
            staleShiftCount: payrollRows.reduce((s, r) => s + (r.staleShiftCount || 0), 0),
            onDutySeconds: payrollRows.reduce((s, r) => s + r.onDutySeconds, 0),
            activeSeconds: payrollRows.reduce((s, r) => s + r.activeSeconds, 0),
            routeCount: payrollRows.reduce((s, r) => s + r.routeCount, 0),
            completedStops: payrollRows.reduce((s, r) => s + r.completedStops, 0),
            codCollected: round2(payrollRows.reduce((s, r) => s + r.codCollected, 0)),
        },
    };
}

// ============ SHIFT CORRECTIONS (payroll control) ============

// MAX_SHIFT_HOURS + isStaleOpenShift now live in driverShiftRules.ts, shared with
// driverApi.ts, so dispatch/payroll/clock-in can't drift on what "stale" means —
// re-exported here so any existing `import { MAX_SHIFT_HOURS } from './driverAdmin'`
// keeps working.
export { MAX_SHIFT_HOURS };

/**
 * Corrects a driver's clock-in/clock-out. Payroll needs this because a driver who
 * forgets to clock out (or clocks in twice) would otherwise be paid from a record
 * nobody can fix. Passing endTime: null deliberately re-opens a shift.
 */
export async function updateDriverShift(input: { id: number; startTime?: Date; endTime?: Date | null }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const [shift] = await db.select().from(driverShifts).where(eq(driverShifts.id, input.id)).limit(1);
    if (!shift) throw new Error('Shift not found');

    const startTime = input.startTime ?? shift.startTime;
    const endTime = input.endTime === undefined ? shift.endTime : input.endTime;

    if (startTime.getTime() > Date.now() + 60_000) {
        throw new Error('A shift cannot start in the future');
    }
    if (endTime) {
        if (endTime <= startTime) throw new Error('The clock-out must be after the clock-in');
        if (endTime.getTime() > Date.now() + 60_000) throw new Error('A shift cannot end in the future');
        const hours = (endTime.getTime() - startTime.getTime()) / 3_600_000;
        if (hours > MAX_SHIFT_HOURS) {
            throw new Error(`That shift would be ${hours.toFixed(1)}h long — longer than the ${MAX_SHIFT_HOURS}h limit. Split it into two shifts instead.`);
        }
    }

    await db.update(driverShifts).set({ startTime, endTime }).where(eq(driverShifts.id, input.id));
    return { id: input.id, startTime, endTime };
}

/** Closes a shift the driver left open. Defaults to now. */
export async function closeDriverShift(input: { id: number; endTime?: Date }) {
    return updateDriverShift({ id: input.id, endTime: input.endTime ?? new Date() });
}

/**
 * Removes a shift record entirely — for duplicates and bogus clock-ins. Refuses
 * when a route points at it, because that would orphan the route's payroll link.
 */
export async function deleteDriverShift(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const [linked] = await db.select({ id: driverRoutes.id })
        .from(driverRoutes).where(eq(driverRoutes.shiftId, id)).limit(1);
    if (linked) {
        throw new Error(`Route ${linked.id} is linked to this shift — reassign or clear that route first`);
    }

    await db.delete(driverShifts).where(eq(driverShifts.id, id));
    return { success: true };
}

// ============ DRIVER COD RECONCILIATION ============

/** A driver holding more cash than this is flagged on the dispatch board. */
export const CASH_IN_HAND_ALERT_AED = 4000;

/** Stops that are still waiting on the driver — used for "stops remaining". */
const OPEN_STOP_STATUSES = ['pending', 'in_progress', 'on_hold'];

function dayBounds(dateStr?: string) {
    const start = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
}

/**
 * A route counts toward a given calendar day if it was actually WORKED that
 * day, not merely planned for it — the same rule getDriverShiftReport() uses
 * (see its comment for the full reasoning). driverRoutes.date is the
 * dispatch-planned day; drivers routinely run a route days late in
 * production (verified drift: DXB-2026-MC7UZD dated 2026-08-03 was actually
 * started 2026-08-06). Falls back to `date` only for routes that never
 * started at all, so an unstarted route doesn't vanish from every day's view.
 *
 * getDriverCodReconciliation() (what the admin SEES) and
 * markDriverCashRemitted() (what "mark cash received" FREEZES) must select
 * the identical route set — they used to each duplicate the same date-only
 * filter, and agreed only because the duplicate was exact. If that duplicate
 * ever drifted, the button would freeze a different amount than the screen
 * displayed: real money silently disagreeing with itself. Both now call this
 * one predicate so that divergence is impossible rather than just unlikely.
 *
 * Both bounds must be passed through drizzle's typed operators (gte/lt), never
 * a raw sql`` fragment — see the dayShifts comment in getDriverShiftReport()
 * for why: a raw fragment binds the Date and serialises it in local time,
 * while the typed comparison serialises in UTC, and the two silently disagree
 * by the UTC offset.
 */
function driverRoutesWorkedOn(start: Date, end: Date) {
    return or(
        and(isNotNull(driverRoutes.startedAt), gte(driverRoutes.startedAt, start), lt(driverRoutes.startedAt, end)),
        and(isNull(driverRoutes.startedAt), gte(driverRoutes.date, start), lt(driverRoutes.date, end)),
    );
}

function initialsOf(fullName: string) {
    return fullName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]!.toUpperCase())
        .join('');
}

export interface DriverCodRow {
    driverId: number;
    driverName: string;
    initials: string;
    vehicleNumber: string | null;
    zones: string[];
    routeIds: string[];
    /** COD due on the delivered stops (cash legs at their expected amount + card legs). */
    expected: number;
    /** Cash actually reported as collected on delivered stops. */
    cash: number;
    /** Charged by card (Tap to Pay) — billed on the driver's phone, never in their hands. */
    card: number;
    /** Cash − what was due on those same cash stops. Negative = short. */
    discrepancy: number;
    /** Cash already handed over to the office (frozen at hand-over time). */
    remitted: number;
    /** Cash still in the driver's hands. */
    toRemit: number;
    fullyRemitted: boolean;
    remittedAt: Date | null;
}

export interface DriverCodReconciliation {
    date: string;
    totals: { expected: number; cash: number; card: number; remitted: number; toRemit: number };
    drivers: DriverCodRow[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Per-driver COD reconciliation for one calendar day.
 *
 * Recomputed server-side from routeOrders (delivered stops only) + the
 * collection method on codRecords — never from the app-reported
 * codCollectedReported snapshot, same rule as getDriverShiftReport().
 * Card payments are excluded from the remittable balance because Tap to Pay
 * charges settle directly and never pass through the driver.
 *
 * Routes are selected by driverRoutesWorkedOn() (startedAt, falling back to
 * date) — see that function's comment. markDriverCashRemitted() below shares
 * the exact same predicate on purpose.
 */
export async function getDriverCodReconciliation(dateStr?: string): Promise<DriverCodReconciliation> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const { start, end } = dayBounds(dateStr);
    const dateKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const empty: DriverCodReconciliation = {
        date: dateKey,
        totals: { expected: 0, cash: 0, card: 0, remitted: 0, toRemit: 0 },
        drivers: [],
    };

    const dayRoutes = (await db.select().from(driverRoutes).where(driverRoutesWorkedOn(start, end)))
        .filter(r => r.driverId !== null);

    if (dayRoutes.length === 0) return empty;

    const routeIds = dayRoutes.map(r => r.id);
    const stops = await db
        .select({
            routeId: routeOrders.routeId,
            type: routeOrders.type,
            status: routeOrders.status,
            collectedAmount: routeOrders.collectedAmount,
            orderId: routeOrders.orderId,
            codRequired: orders.codRequired,
            codAmount: orders.codAmount,
        })
        .from(routeOrders)
        .innerJoin(orders, eq(routeOrders.orderId, orders.id))
        .where(inArray(routeOrders.routeId, routeIds));

    const codStops = stops.filter(s => s.type === 'delivery' && s.status === 'delivered' && s.codRequired === 1);

    const methodByOrder = new Map<number, string | null>();
    const codOrderIds = Array.from(new Set(codStops.map(s => s.orderId)));
    if (codOrderIds.length > 0) {
        const records = await db.select({ shipmentId: codRecords.shipmentId, collectedMethod: codRecords.collectedMethod })
            .from(codRecords).where(inArray(codRecords.shipmentId, codOrderIds));
        for (const r of records) methodByOrder.set(r.shipmentId, r.collectedMethod);
    }

    const driverIds = Array.from(new Set(dayRoutes.map(r => r.driverId!)));
    const driverRows = await db.select({ id: drivers.id, fullName: drivers.fullName, vehicleNumber: drivers.vehicleNumber })
        .from(drivers).where(inArray(drivers.id, driverIds));
    const driverById = new Map(driverRows.map(d => [d.id, d]));

    // Accumulate per driver.
    const rows = new Map<number, DriverCodRow & { expectedCash: number }>();
    for (const route of dayRoutes) {
        const driverId = route.driverId!;
        let row = rows.get(driverId);
        if (!row) {
            const d = driverById.get(driverId);
            row = {
                driverId,
                driverName: d?.fullName || 'Unknown',
                initials: initialsOf(d?.fullName || '??'),
                vehicleNumber: d?.vehicleNumber ?? null,
                zones: [],
                routeIds: [],
                expected: 0,
                expectedCash: 0,
                cash: 0,
                card: 0,
                discrepancy: 0,
                remitted: 0,
                toRemit: 0,
                fullyRemitted: false,
                remittedAt: null,
            };
            rows.set(driverId, row);
        }

        row.routeIds.push(route.id);
        if (route.zone && !row.zones.includes(route.zone)) row.zones.push(route.zone);
        if (route.cashRemittedAt) {
            row.remitted += route.cashRemittedAmount ? parseFloat(route.cashRemittedAmount) : 0;
            if (!row.remittedAt || route.cashRemittedAt > row.remittedAt) row.remittedAt = route.cashRemittedAt;
        }

        for (const stop of codStops.filter(s => s.routeId === route.id)) {
            const due = parseFloat(stop.codAmount || '0') || 0;
            const collected = stop.collectedAmount ? parseFloat(stop.collectedAmount) || 0 : 0;
            if (methodByOrder.get(stop.orderId) === 'card') {
                row.card += collected || due;
            } else {
                row.expectedCash += due;
                row.cash += collected;
            }
        }
    }

    const totals = { expected: 0, cash: 0, card: 0, remitted: 0, toRemit: 0 };
    const result: DriverCodRow[] = [];
    for (const row of Array.from(rows.values())) {
        const { expectedCash, ...rest } = row;
        const cash = round2(row.cash);
        const card = round2(row.card);
        const remitted = round2(row.remitted);
        // A later edit to a delivered stop can shrink `cash` below what was already
        // handed over, so clamp — a negative "still owed" is never meaningful.
        const toRemit = round2(Math.max(0, cash - remitted));
        const finalRow: DriverCodRow = {
            ...rest,
            cash,
            card,
            expected: round2(expectedCash + card),
            discrepancy: round2(cash - expectedCash),
            remitted,
            toRemit,
            fullyRemitted: toRemit === 0 && (cash > 0 || remitted > 0),
        };
        totals.expected += finalRow.expected;
        totals.cash += cash;
        totals.card += card;
        totals.remitted += remitted;
        totals.toRemit += toRemit;
        result.push(finalRow);
    }

    return {
        date: dateKey,
        totals: {
            expected: round2(totals.expected),
            cash: round2(totals.cash),
            card: round2(totals.card),
            remitted: round2(totals.remitted),
            toRemit: round2(totals.toRemit),
        },
        // Drivers still holding cash first — that's the queue the admin works through.
        drivers: result.sort((a, b) => b.toRemit - a.toRemit || a.driverName.localeCompare(b.driverName)),
    };
}

/**
 * Records that a driver handed cash over to the office for one day's routes.
 *
 * A driver can hand over several times a day (midday drop, end of shift), so
 * each call takes only what was collected SINCE the previous hand-over: per
 * route, delta = cash on its delivered stops − cashRemittedAmount, added to
 * that cumulative column and logged as one driverCashHandovers row (with the
 * per-route allocations, so it can be voided exactly). Routes that already had
 * a hand-over used to be skipped outright, leaving every later delivery's cash
 * "to remit" forever. A double-click is still a no-op: the second call finds
 * no delta. The driver row is locked so two clicks can't both see the delta.
 *
 * Selects routes via driverRoutesWorkedOn() — the same predicate
 * getDriverCodReconciliation() uses — so this always records exactly the
 * amount the admin saw on screen for that day. Do not special-case this query.
 */
export async function markDriverCashRemitted(
    driverId: number,
    dateStr?: string,
    opts: { actor?: string; note?: string | null } = {},
): Promise<{ routes: number; amount: number; handoverId?: number }> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const { start, end } = dayBounds(dateStr);

    return db.transaction(async (txRaw) => {
        const tx = txRaw as unknown as DbHandle;
        await tx.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, driverId)).for('update');

        const dayRoutes = await tx.select().from(driverRoutes).where(and(
            eq(driverRoutes.driverId, driverId),
            driverRoutesWorkedOn(start, end),
        ));
        if (dayRoutes.length === 0) return { routes: 0, amount: 0 };

        const routeIds = dayRoutes.map(r => r.id);
        const stops = await tx
            .select({
                routeId: routeOrders.routeId,
                type: routeOrders.type,
                status: routeOrders.status,
                collectedAmount: routeOrders.collectedAmount,
                orderId: routeOrders.orderId,
                codRequired: orders.codRequired,
            })
            .from(routeOrders)
            .innerJoin(orders, eq(routeOrders.orderId, orders.id))
            .where(inArray(routeOrders.routeId, routeIds));

        const codStops = stops.filter(s => s.type === 'delivery' && s.status === 'delivered' && s.codRequired === 1);
        const cardOrders = new Set<number>();
        const codOrderIds = Array.from(new Set(codStops.map(s => s.orderId)));
        if (codOrderIds.length > 0) {
            const records = await tx.select({ shipmentId: codRecords.shipmentId, collectedMethod: codRecords.collectedMethod })
                .from(codRecords).where(inArray(codRecords.shipmentId, codOrderIds));
            for (const r of records) if (r.collectedMethod === 'card') cardOrders.add(r.shipmentId);
        }

        const now = new Date();
        const allocations: { routeId: string; amount: number }[] = [];
        for (const route of dayRoutes) {
            const cash = round2(codStops
                .filter(s => s.routeId === route.id && !cardOrders.has(s.orderId))
                .reduce((sum, s) => sum + (s.collectedAmount ? parseFloat(s.collectedAmount) || 0 : 0), 0));
            const already = route.cashRemittedAmount ? parseFloat(route.cashRemittedAmount) || 0 : 0;
            const delta = round2(cash - already);
            if (delta <= 0) continue;
            allocations.push({ routeId: route.id, amount: delta });
            await tx.update(driverRoutes)
                .set({ cashRemittedAt: now, cashRemittedAmount: round2(already + delta).toFixed(2) })
                .where(eq(driverRoutes.id, route.id));
        }

        if (allocations.length === 0) return { routes: 0, amount: 0 };

        const amount = round2(allocations.reduce((sum, a) => sum + a.amount, 0));
        const [handover] = await tx.insert(driverCashHandovers).values({
            driverId,
            amount: amount.toFixed(2),
            allocations: JSON.stringify(allocations),
            receivedAt: now,
            receivedBy: opts.actor || 'admin',
            note: opts.note?.trim() || null,
        }).$returningId();

        return { routes: allocations.length, amount, handoverId: handover.id };
    });
}

/**
 * Undo a cash hand-over recorded by mistake: subtracts its allocations from
 * each route's cumulative cashRemittedAmount and marks the row voided (kept,
 * never deleted — it is the money trail).
 */
export async function voidCashHandover(handoverId: number, actor: string, reason: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    return db.transaction(async (txRaw) => {
        const tx = txRaw as unknown as DbHandle;
        const [handover] = await tx.select().from(driverCashHandovers)
            .where(eq(driverCashHandovers.id, handoverId)).limit(1).for('update');
        if (!handover) throw new RouteGuardError('Cash hand-over not found');
        if (handover.voidedAt) throw new RouteGuardError('This cash hand-over was already undone');

        const allocations = JSON.parse(handover.allocations) as { routeId: string; amount: number }[];
        for (const a of allocations) {
            const [route] = await tx.select().from(driverRoutes).where(eq(driverRoutes.id, a.routeId)).limit(1).for('update');
            if (!route) continue;
            const held = route.cashRemittedAmount ? parseFloat(route.cashRemittedAmount) || 0 : 0;
            const remaining = round2(Math.max(0, held - a.amount));
            await tx.update(driverRoutes).set({
                cashRemittedAmount: remaining > 0 ? remaining.toFixed(2) : null,
                cashRemittedAt: remaining > 0 ? route.cashRemittedAt : null,
            }).where(eq(driverRoutes.id, a.routeId));
        }
        await tx.update(driverCashHandovers)
            .set({ voidedAt: new Date(), voidedBy: actor, voidReason: reason.trim() || null })
            .where(eq(driverCashHandovers.id, handoverId));
        return { success: true };
    });
}

/** Cash hand-overs received on one day (voided ones included, flagged). */
export async function getCashHandovers(dateStr?: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const { start, end } = dayBounds(dateStr);
    return db.select({
        id: driverCashHandovers.id,
        driverId: driverCashHandovers.driverId,
        driverName: drivers.fullName,
        amount: driverCashHandovers.amount,
        receivedAt: driverCashHandovers.receivedAt,
        receivedBy: driverCashHandovers.receivedBy,
        note: driverCashHandovers.note,
        voidedAt: driverCashHandovers.voidedAt,
        voidedBy: driverCashHandovers.voidedBy,
        voidReason: driverCashHandovers.voidReason,
    })
        .from(driverCashHandovers)
        .leftJoin(drivers, eq(drivers.id, driverCashHandovers.driverId))
        .where(and(gte(driverCashHandovers.receivedAt, start), lt(driverCashHandovers.receivedAt, end)))
        .orderBy(desc(driverCashHandovers.receivedAt));
}

// ============ DISPATCH OVERVIEW ============

export interface DispatchRosterEntry {
    driverId: number;
    driverName: string;
    initials: string;
    vehicleNumber: string | null;
    zones: string[];
    routeIds: string[];
    delivered: number;
    totalStops: number;
    codCollected: number;
    /**
     * 'active' = the driver has an open shift (clocked in and not out). Route status
     * is deliberately NOT the signal: a route left in_progress because the driver
     * went home without finishing it would otherwise report them on duty forever.
     */
    dutyState: 'active' | 'idle';
    /** When the open shift started, for "on duty since". */
    onDutySince: Date | null;
}

/** A stop on a route that is on the road right now — what the live map plots. */
export interface DispatchLiveStop {
    stopId: number;
    orderId: number;
    routeId: string;
    driverName: string;
    waybillNumber: string;
    customerName: string;
    address: string | null;
    city: string | null;
    lat: number;
    lng: number;
    /** 'approximate' when the pin came from geocoding rather than a real fix. */
    accuracy: string | null;
    type: 'pickup' | 'delivery';
    status: string;
    sequence: number | null;
    codRequired: number | null;
    codAmount: string | null;
    /** Filter by id — two drivers can share a name. */
    driverId: number | null;
    /** Admin-only estimated arrival (ISO), null when the route has no start time. */
    eta: string | null;
    etaActual: boolean;
    lateRisk: 'window' | 'bullet' | null;
}

export interface DispatchOverview {
    date: string;
    activeDrivers: number;
    totalDrivers: number;
    activeRoutes: number;
    stopsRemaining: number;
    /** COD still to be collected on today's open delivery stops. */
    codToCollect: number;
    codDriversPending: number;
    roster: DispatchRosterEntry[];
    unassignedRoutes: number;
    failedStops: { waybillNumber: string; customerName: string; driverName: string; routeId: string; sequence: number | null; status: string }[];
    cashAlerts: { driverId: number; driverName: string; cashInHand: number }[];
    cashAlertThreshold: number;
    /**
     * Shifts left open far longer than anyone works — a missed clock-out, not a driver
     * on the road. Deliberately excluded from activeDrivers/roster so the board stops
     * claiming someone is working two days after they went home, and surfaced here so
     * the miss gets corrected instead of quietly inflating payroll.
     */
    staleShifts: { shiftId: number; driverId: number; driverName: string; startTime: Date; hoursOpen: number }[];
    /** Hours after which an open shift is treated as a missed clock-out. */
    staleShiftHours: number;
    /** Stops of in-progress routes whose driver is actually clocked in. Empty when nobody is out. */
    liveStops: DispatchLiveStop[];
    /** How many routes those live stops came from. */
    liveRouteCount: number;
    /**
     * Routes sitting in 'in_progress' with nobody on duty behind them — a driver
     * finished their shift (or never started one) without closing the route. Shown
     * as an alert rather than silently counted as live work.
     *
     * openStops distinguishes the two real cases: 0 means every stop was handled and
     * only the route status was left behind (safe to close), while >0 means there is
     * genuinely unfinished delivery work nobody is carrying.
     */
    stalledRoutes: {
        routeId: string;
        driverName: string;
        date: Date;
        startedAt: Date | null;
        openStops: number;
        totalStops: number;
    }[];
}

/**
 * Everything the dispatch board needs in a single round trip — KPIs, the on-duty
 * roster, the alert strip and the stops currently on the road.
 *
 * "On duty" means an open shift — the driver clocked in and hasn't clocked out.
 * Route status is not a duty signal: a route abandoned in 'in_progress' would
 * otherwise keep reporting a driver as working days later. Those orphaned routes
 * are still surfaced, as `stalledRoutes`, so they get closed rather than ignored.
 *
 * The "today" figures come from routes dated today; the roster and the live map
 * follow who is clocked in right now. Either way this stays scoped to a handful of
 * routes, unlike getAllDeliveries() which walks every stop ever made.
 */
export async function getDispatchOverview(dateStr?: string): Promise<DispatchOverview> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const { start, end } = dayBounds(dateStr);
    const dateKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;

    const [dayRoutes, inProgressRoutes, openShifts, [driverCounts]] = await Promise.all([
        db.select().from(driverRoutes).where(and(
            gte(driverRoutes.date, start),
            lt(driverRoutes.date, end),
        )),
        db.select().from(driverRoutes).where(eq(driverRoutes.status, 'in_progress')),
        db.select().from(driverShifts).where(isNull(driverShifts.endTime)),
        db.select({
            total: sql<number>`cast(count(*) as unsigned)`,
            active: sql<number>`cast(SUM(CASE WHEN ${drivers.status} = 'active' THEN 1 ELSE 0 END) as unsigned)`,
        }).from(drivers),
    ]);

    // An open shift only means "on duty" while it is plausibly still running. Past
    // MAX_SHIFT_HOURS it is a clock-out somebody missed, and treating it as live work
    // is how the board ended up showing drivers who went home two days earlier.
    // isStaleOpenShift() is the exact same predicate getDriverShiftReport() uses to
    // cap payroll hours — that's the point, so the two views agree on shift #265
    // instead of dispatch saying 0 active while payroll bills 31.6h.
    const now = new Date();
    const nowMs = now.getTime();
    const hoursOpen = (start: Date) => (nowMs - start.getTime()) / 3_600_000;

    const onDutySince = new Map<number, Date>();
    const staleOpenShifts: typeof openShifts = [];
    for (const s of openShifts) {
        if (isStaleOpenShift(s, now)) {
            staleOpenShifts.push(s);
            continue;
        }
        // Newest open shift wins if a driver somehow has more than one.
        const current = onDutySince.get(s.driverId);
        if (!current || s.startTime > current) onDutySince.set(s.driverId, s.startTime);
    }
    const isOnDuty = (driverId: number | null) => driverId !== null && onDutySince.has(driverId);

    const base: DispatchOverview = {
        date: dateKey,
        activeDrivers: 0,
        totalDrivers: Number(driverCounts?.total || 0),
        activeRoutes: dayRoutes.filter(r => r.status !== 'cancelled').length,
        stopsRemaining: 0,
        codToCollect: 0,
        codDriversPending: 0,
        roster: [],
        unassignedRoutes: dayRoutes.filter(r => r.driverId === null && r.status !== 'cancelled').length,
        failedStops: [],
        cashAlerts: [],
        cashAlertThreshold: CASH_IN_HAND_ALERT_AED,
        staleShifts: [],
        staleShiftHours: MAX_SHIFT_HOURS,
        liveStops: [],
        liveRouteCount: 0,
        stalledRoutes: [],
    };

    // An in-progress route only counts as live work when its driver is clocked in.
    const trulyLiveRoutes = inProgressRoutes.filter(r => isOnDuty(r.driverId));
    base.liveRouteCount = trulyLiveRoutes.length;
    const inProgressIds = new Set(trulyLiveRoutes.map(r => r.id));

    // Board scope = today's routes plus the genuinely live ones from earlier days.
    const byId = new Map<string, typeof dayRoutes[number]>();
    for (const r of [...dayRoutes, ...trulyLiveRoutes]) {
        if (r.status !== 'cancelled') byId.set(r.id, r);
    }
    const liveRoutes = Array.from(byId.values());
    const routeIds = liveRoutes.map(r => r.id);

    // Names for every driver the board mentions: route owners plus anyone clocked in
    // with nothing assigned (they still belong on the roster).
    const driverIds = Array.from(new Set([
        ...liveRoutes.map(r => r.driverId),
        ...inProgressRoutes.map(r => r.driverId),
        ...Array.from(onDutySince.keys()),
        ...staleOpenShifts.map(s => s.driverId),
    ].filter((id): id is number => id !== null)));
    const driverById = new Map<number, { id: number; fullName: string; vehicleNumber: string | null }>();
    if (driverIds.length > 0) {
        const rows = await db.select({ id: drivers.id, fullName: drivers.fullName, vehicleNumber: drivers.vehicleNumber })
            .from(drivers).where(inArray(drivers.id, driverIds));
        for (const d of rows) driverById.set(d.id, d);
    }

    base.staleShifts = staleOpenShifts
        .map(s => ({
            shiftId: s.id,
            driverId: s.driverId,
            driverName: driverById.get(s.driverId)?.fullName || 'Unknown',
            startTime: s.startTime,
            hoursOpen: Math.round(hoursOpen(s.startTime) * 10) / 10,
        }))
        .sort((a, b) => b.hoursOpen - a.hoursOpen);

    const stalled = inProgressRoutes.filter(r => !isOnDuty(r.driverId));
    const stalledStopCounts = new Map<string, { open: number; total: number }>();
    if (stalled.length > 0) {
        const counts = await db
            .select({
                routeId: routeOrders.routeId,
                total: sql<number>`cast(count(*) as signed)`,
                open: sql<number>`cast(SUM(CASE WHEN ${routeOrders.status} IN ('pending','in_progress','on_hold') THEN 1 ELSE 0 END) as signed)`,
            })
            .from(routeOrders)
            .where(inArray(routeOrders.routeId, stalled.map(r => r.id)))
            .groupBy(routeOrders.routeId);
        for (const c of counts) {
            stalledStopCounts.set(c.routeId, { open: Number(c.open || 0), total: Number(c.total || 0) });
        }
    }

    base.stalledRoutes = stalled
        .map(r => {
            const counts = stalledStopCounts.get(r.id) ?? { open: 0, total: 0 };
            return {
                routeId: r.id,
                driverName: r.driverId ? driverById.get(r.driverId)?.fullName || 'Unknown' : 'Unassigned',
                date: r.date,
                startedAt: r.startedAt,
                openStops: counts.open,
                totalStops: counts.total,
            };
        })
        // Routes with work still outstanding first — those need a decision, not just a click.
        .sort((a, b) => b.openStops - a.openStops || new Date(a.date).getTime() - new Date(b.date).getTime());

    // Drivers clocked in with no route at all still show on the roster as available.
    const roster = new Map<number, DispatchRosterEntry & { cashInHand: number; hasUnremittedCash: boolean }>();
    const rosterEntry = (driverId: number) => {
        let entry = roster.get(driverId);
        if (!entry) {
            const d = driverById.get(driverId);
            entry = {
                driverId,
                driverName: d?.fullName || 'Unknown',
                initials: initialsOf(d?.fullName || '??'),
                vehicleNumber: d?.vehicleNumber ?? null,
                zones: [],
                routeIds: [],
                delivered: 0,
                totalStops: 0,
                codCollected: 0,
                dutyState: onDutySince.has(driverId) ? 'active' : 'idle',
                onDutySince: onDutySince.get(driverId) ?? null,
                cashInHand: 0,
                hasUnremittedCash: false,
            };
            roster.set(driverId, entry);
        }
        return entry;
    };
    for (const driverId of Array.from(onDutySince.keys())) {
        if (driverById.has(driverId)) rosterEntry(driverId);
    }

    if (routeIds.length === 0) {
        base.activeDrivers = onDutySince.size;
        base.roster = Array.from(roster.values())
            .map(({ cashInHand, hasUnremittedCash, ...rest }) => rest)
            .sort((a, b) => a.driverName.localeCompare(b.driverName));
        return base;
    }

    const stops = await db
        .select({
            stopId: routeOrders.id,
            routeId: routeOrders.routeId,
            type: routeOrders.type,
            status: routeOrders.status,
            sequence: routeOrders.sequence,
            collectedAmount: routeOrders.collectedAmount,
            orderId: routeOrders.orderId,
            waybillNumber: orders.waybillNumber,
            customerName: orders.customerName,
            address: orders.address,
            city: orders.city,
            shipperName: orders.shipperName,
            shipperAddress: orders.shipperAddress,
            shipperCity: orders.shipperCity,
            codRequired: orders.codRequired,
            codAmount: orders.codAmount,
            latitude: orders.latitude,
            longitude: orders.longitude,
            locationAccuracy: orders.locationAccuracy,
            shipperLat: orders.shipperLat,
            shipperLng: orders.shipperLng,
            deliveredAt: routeOrders.deliveredAt,
            pickedUpAt: routeOrders.pickedUpAt,
            attemptedAt: routeOrders.attemptedAt,
            serviceType: orders.serviceType,
            preferredDeliveryDate: orders.preferredDeliveryDate,
            preferredDeliveryTime: orders.preferredDeliveryTime,
            createdAt: orders.createdAt,
        })
        .from(routeOrders)
        .innerJoin(orders, eq(routeOrders.orderId, orders.id))
        .where(inArray(routeOrders.routeId, routeIds))
        .orderBy(STOP_ORDER_SQL, routeOrders.sequence, routeOrders.id);

    const cardOrders = new Set<number>();
    const codOrderIds = Array.from(new Set(stops.filter(s => s.codRequired === 1).map(s => s.orderId)));
    if (codOrderIds.length > 0) {
        const records = await db.select({ shipmentId: codRecords.shipmentId, collectedMethod: codRecords.collectedMethod })
            .from(codRecords).where(inArray(codRecords.shipmentId, codOrderIds));
        for (const r of records) if (r.collectedMethod === 'card') cardOrders.add(r.shipmentId);
    }

    const stopsByRoute = new Map<string, typeof stops>();
    for (const s of stops) {
        if (!stopsByRoute.has(s.routeId)) stopsByRoute.set(s.routeId, []);
        stopsByRoute.get(s.routeId)!.push(s);
    }

    for (const route of liveRoutes) {
        const routeStops = stopsByRoute.get(route.id) || [];
        base.stopsRemaining += routeStops.filter(s => OPEN_STOP_STATUSES.includes(s.status)).length;
        base.codToCollect += routeStops
            .filter(s => s.type === 'delivery' && s.codRequired === 1 && OPEN_STOP_STATUSES.includes(s.status))
            .reduce((sum, s) => sum + (parseFloat(s.codAmount || '0') || 0), 0);

        const driverName = route.driverId ? driverById.get(route.driverId)?.fullName || 'Unknown' : null;
        const etaPlan = inProgressIds.has(route.id)
            ? await planRouteEtas(db, route, routeStops.map(s => ({ ...s, order: s })))
            : null;
        for (const s of routeStops) {
            if (s.status === 'attempted' || s.status === 'failed') {
                base.failedStops.push({
                    waybillNumber: s.waybillNumber,
                    customerName: s.customerName,
                    driverName: driverName || 'Unassigned',
                    routeId: route.id,
                    sequence: s.sequence,
                    status: s.status,
                });
            }

            // Live map: use the same physical leg as route planning. Return
            // orders already store the original consignee as their shipper.
            if (!inProgressIds.has(route.id)) continue;
            const coords = stopCoordinates(s.type, s);
            if (!coords) continue;
            const isPickup = s.type === 'pickup';

            base.liveStops.push({
                stopId: s.stopId,
                orderId: s.orderId,
                routeId: route.id,
                driverName: driverName || 'Unassigned',
                waybillNumber: s.waybillNumber,
                customerName: isPickup ? s.shipperName : s.customerName,
                address: isPickup ? s.shipperAddress : s.address,
                city: isPickup ? s.shipperCity : s.city,
                lat: coords.lat,
                lng: coords.lng,
                accuracy: isPickup ? null : s.locationAccuracy,
                type: s.type as 'pickup' | 'delivery',
                status: s.status,
                sequence: s.sequence,
                codRequired: s.codRequired,
                codAmount: s.codAmount,
                driverId: route.driverId,
                eta: etaPlan?.byStop.get(s.stopId)?.arriveAt ?? null,
                etaActual: etaPlan?.byStop.get(s.stopId)?.actual ?? false,
                lateRisk: etaPlan?.byStop.get(s.stopId)?.lateRisk ?? null,
            });
        }

        if (route.driverId === null) continue;
        const entry = rosterEntry(route.driverId);
        entry.routeIds.push(route.id);
        if (route.zone && !entry.zones.includes(route.zone)) entry.zones.push(route.zone);
        entry.totalStops += routeStops.length;
        entry.delivered += routeStops.filter(s => s.status === 'delivered' || s.status === 'picked_up').length;

        const routeCash = routeStops
            .filter(s => s.type === 'delivery' && s.status === 'delivered' && s.codRequired === 1 && !cardOrders.has(s.orderId))
            .reduce((sum, s) => sum + (s.collectedAmount ? parseFloat(s.collectedAmount) || 0 : 0), 0);
        entry.codCollected += routeCash;
        // Cash handed over is cumulative per route; whatever was collected after
        // the last hand-over is still in the driver's hands. Skipping any route
        // with a hand-over hid every later delivery from the cash alert.
        const stillHeld = Math.max(0, routeCash - (route.cashRemittedAmount ? parseFloat(route.cashRemittedAmount) || 0 : 0));
        entry.cashInHand += stillHeld;
        if (stillHeld > 0.004) entry.hasUnremittedCash = true;
    }

    const entries = Array.from(roster.values());
    // Clocked-in drivers, not "drivers with a route someone forgot to close".
    base.activeDrivers = onDutySince.size;
    base.codDriversPending = entries.filter(e => e.hasUnremittedCash).length;
    base.cashAlerts = entries
        .filter(e => e.cashInHand > CASH_IN_HAND_ALERT_AED)
        .map(e => ({ driverId: e.driverId, driverName: e.driverName, cashInHand: round2(e.cashInHand) }))
        .sort((a, b) => b.cashInHand - a.cashInHand);

    base.roster = entries
        .map(({ cashInHand, hasUnremittedCash, ...rest }) => ({ ...rest, codCollected: round2(rest.codCollected) }))
        // On-duty drivers first, then whoever has the most stops left to work through.
        .sort((a, b) =>
            (a.dutyState === b.dutyState ? 0 : a.dutyState === 'active' ? -1 : 1)
            || (b.totalStops - b.delivered) - (a.totalStops - a.delivered)
            || a.driverName.localeCompare(b.driverName));

    base.codToCollect = round2(base.codToCollect);
    base.failedStops.sort((a, b) => a.driverName.localeCompare(b.driverName) || (a.sequence ?? 0) - (b.sequence ?? 0));
    base.liveStops.sort((a, b) =>
        a.driverName.localeCompare(b.driverName)
        || a.routeId.localeCompare(b.routeId)
        || (a.sequence ?? 0) - (b.sequence ?? 0));

    return base;
}

// ============ LIVE DRIVER LOCATIONS ============

/** One on-duty driver's last GPS fix, for the dispatch live map. */
export interface LiveDriverLocation {
    driverId: number;
    driverName: string;
    initials: string;
    vehicleNumber: string | null;
    /** The driver's in-progress routes (the ping's routeId is only the one the app had open). */
    routeIds: string[];
    lat: number;
    lng: number;
    accuracy: number | null;
    heading: number | null;
    /** Metres per second. */
    speed: number | null;
    /** When the phone took the fix — the map greys the pin out as this ages. */
    recordedAt: Date;
    onDutySince: Date;
}

/**
 * Last known position of every driver on duty right now. Polled by the dispatch
 * map far more often than getDispatchOverview, so it stays a few indexed reads.
 *
 * "On duty" is the same open, non-stale shift rule as the dispatch roster, so a
 * driver who clocked out (or whose shift went stale) drops off the map even if
 * their last fix is only seconds old. A driver on duty who hasn't sent a fix yet
 * simply has no pin.
 */
export async function getLiveDriverLocations(): Promise<LiveDriverLocation[]> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const now = new Date();
    const openShifts = await db.select({ driverId: driverShifts.driverId, startTime: driverShifts.startTime })
        .from(driverShifts).where(isNull(driverShifts.endTime));
    const onDutySince = new Map<number, Date>();
    for (const s of openShifts) {
        if (isStaleOpenShift(s, now)) continue;
        const current = onDutySince.get(s.driverId);
        if (!current || s.startTime > current) onDutySince.set(s.driverId, s.startTime);
    }
    const driverIds = Array.from(onDutySince.keys());
    if (driverIds.length === 0) return [];

    const [locations, driverRows, routes] = await Promise.all([
        db.select().from(driverLocations).where(inArray(driverLocations.driverId, driverIds)),
        db.select({ id: drivers.id, fullName: drivers.fullName, vehicleNumber: drivers.vehicleNumber })
            .from(drivers).where(inArray(drivers.id, driverIds)),
        db.select({ id: driverRoutes.id, driverId: driverRoutes.driverId })
            .from(driverRoutes)
            .where(and(eq(driverRoutes.status, 'in_progress'), inArray(driverRoutes.driverId, driverIds))),
    ]);
    const driverById = new Map(driverRows.map(d => [d.id, d]));
    const routesByDriver = new Map<number, string[]>();
    for (const r of routes) {
        if (r.driverId === null) continue;
        routesByDriver.set(r.driverId, [...(routesByDriver.get(r.driverId) ?? []), r.id]);
    }

    return locations
        .map((loc) => {
            const d = driverById.get(loc.driverId);
            const name = d?.fullName || `Driver #${loc.driverId}`;
            const routeIds = routesByDriver.get(loc.driverId) ?? (loc.routeId ? [loc.routeId] : []);
            return {
                driverId: loc.driverId,
                driverName: name,
                initials: initialsOf(name),
                vehicleNumber: d?.vehicleNumber ?? null,
                routeIds,
                lat: loc.lat,
                lng: loc.lng,
                accuracy: loc.accuracy,
                heading: loc.heading,
                speed: loc.speed,
                recordedAt: loc.recordedAt,
                onDutySince: onDutySince.get(loc.driverId)!,
            };
        })
        .sort((a, b) => a.driverName.localeCompare(b.driverName));
}
