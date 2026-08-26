/**
 * Driver Admin Functions
 * Used by tRPC router for admin panel driver management
 */
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';
import { eq, and, or, desc, sql, gte, lt, notInArray, inArray, isNull, isNotNull } from 'drizzle-orm';
import { getDb } from './db';
import { drivers, driverRoutes, driverShifts, routeOrders, orders, driverReports, clientAccounts, codRecords } from '../drizzle/schema';
import { optimizeStops } from './routeOptimizer';
import type { OptimizableStop, LatLng } from './routeOptimizer';
import { findPrecedenceViolation } from '@shared/routeSequence';
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
            ...driver,
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
    return driver || null;
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
    const driversMap = new Map<number, typeof drivers.$inferSelect>();
    if (driverIds.length > 0) {
        const allDrivers = await db.select().from(drivers).where(inArray(drivers.id, driverIds));
        for (const d of allDrivers) driversMap.set(d.id, d);
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

export async function getRouteDetails(routeId: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
    if (!route) return null;

    let driver = null;
    if (route.driverId) {
        const [d] = await db.select().from(drivers).where(eq(drivers.id, route.driverId)).limit(1);
        driver = d || null;
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
    }));

    return {
        ...route,
        driver,
        deliveries,
    };
}

// Random, non-sequential route IDs so routes can't be enumerated/claimed by guessing.
// Reuses the same unambiguous alphabet as the waybill generator (no I/O/0/1).
const routeIdSuffix = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

async function generateUniqueRouteId(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<string> {
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
        throw new RouteGuardError(`Órdenes inexistentes o no asignables: ${unknown.join(', ')}`);
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
            `Estas órdenes ya no se pueden asignar (otra ruta las tomó o ya se completaron): ${rejected.join(', ')}. Recarga e intenta de nuevo.`,
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
function stopHasEvidence(s: GuardableStop): boolean {
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
            'Esta ruta ya tiene entregas registradas — no se puede borrar sin destruir el POD y la conciliación de caja. Cámbiala a "cancelada" en su lugar.',
        );
    }
}

export function assertStopsRemovable(stops: GuardableStop[]): void {
    const worked = stops.filter(stopHasEvidence);
    if (worked.length > 0) {
        const labels = worked.map(s => s.waybillNumber).filter(Boolean).join(', ');
        throw new RouteGuardError(
            `No se puede quitar de la ruta un paquete ya trabajado${labels ? ` (${labels})` : ''}: se perdería su POD y su registro de COD.`,
        );
    }
}

type DbHandle = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Serialize every write that touches a route's stop set. create/add/remove/
 * reorder/optimize all read-then-write the sequence, so without a lock two
 * admins working the same route interleave into duplicate or gapped numbering.
 * Same row-lock pattern as findOrCreateOpenShift. Keep the body short — no
 * network calls inside.
 */
async function withRouteLock<T>(
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
}) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Resolve the stop legs and validate them BEFORE opening the transaction.
    let specs: RouteStopSpec[] = [];
    if (data.stops && data.stops.length > 0) {
        specs = data.stops;
        const flags = await getAssignmentFlags(Array.from(new Set(specs.map(s => s.orderId))));
        assertStopSpecsAssignable(specs, flags);
    } else if (data.orderIds && data.orderIds.length > 0) {
        const flags = await getAssignmentFlags(data.orderIds);
        specs = expandStopSpecs(data.orderIds, data.stopMode || 'both', flags);
    }

    const violation = findPrecedenceViolation(
        specs.map((s, i) => ({ key: i, orderId: s.orderId, type: s.type })),
    );
    if (violation) {
        throw new RouteGuardError('Una entrega quedó antes de su recogida. Reordena las paradas e intenta de nuevo.');
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
    await db.transaction(async (tx) => {
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
            (lastFinished ? resolveStopCoords(lastFinished.ro.type, lastFinished.o) : null) ??
            origin ??
            (route.startLat && route.startLng
                ? { lat: parseFloat(route.startLat), lng: parseFloat(route.startLng) }
                : null);

        const stops: OptimizableStop[] = open.map(({ ro, o }) => ({
            id: ro.id,
            orderId: ro.orderId,
            type: ro.type,
            coords: resolveStopCoords(ro.type, o),
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
            coords: o ? resolveStopCoords(spec.type, o) : null,
        };
    });

    return optimizeStops(stops, origin ?? null).map(i => specs[i]);
}

/**
 * Coordinate of a stop leg. shipperLat/shipperLng is always where the
 * package is physically picked up and orders.latitude/longitude is always
 * where it's physically delivered — this holds for returns/exchanges too,
 * because the return-order creation code (doCreateReturn /
 * doCreateManualReturnExchange in portalRouters.ts) already writes those
 * columns as the physical pickup/delivery entity, not the original
 * shipper/consignee. Do NOT re-invert on isReturn here, that double-swaps
 * it back to wrong.
 *
 * A shipper-side leg falls back to the consignee pin, matching what the portal
 * map already draws (DriversSection route map). Without the fallback the server
 * treated those pickups as coordinate-less and parked them at the end of the
 * tour, so the sequence number the admin saw wasn't the one the optimizer used.
 */
function resolveStopCoords(
    type: string,
    o: { latitude: string | null; longitude: string | null; shipperLat: string | null; shipperLng: string | null },
): LatLng | null {
    const parse = (latStr: string | null, lngStr: string | null): LatLng | null => {
        if (!latStr || !lngStr) return null;
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
        return { lat, lng };
    };

    const isPickup = type === 'pickup';
    const consigneeSide = !isPickup;
    return consigneeSide
        ? parse(o.latitude, o.longitude)
        : parse(o.shipperLat, o.shipperLng) ?? parse(o.latitude, o.longitude);
}

/**
 * Persist a stop ordering as sequence 1..N in a single UPDATE. Scoped to the
 * route so a caller can never renumber another route's stops by passing foreign ids.
 */
async function writeStopSequence(db: DbHandle, routeId: string, stopIds: number[]) {
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
        if (stopIds.length !== byId.size || stopIds.some(id => !byId.has(id))) {
            throw new RouteGuardError('La lista de paradas no coincide con la ruta actual. Recarga e intenta de nuevo.');
        }

        current.forEach((stop, i) => {
            if (FINISHED_STOP_STATUSES.includes(stop.status ?? '') && stopIds[i] !== stop.id) {
                throw new RouteGuardError(`No se puede mover una parada ya completada (posición ${i + 1}).`);
            }
        });

        const violation = findPrecedenceViolation(
            stopIds.map(id => {
                const s = byId.get(id)!;
                return { key: s.id, orderId: s.orderId, type: s.type, waybillNumber: s.waybillNumber };
            }),
        );
        if (violation) {
            throw new RouteGuardError(`La entrega de ${violation.delivery.waybillNumber} no puede ir antes de su recogida.`);
        }

        await writeStopSequence(tx, routeId, stopIds);
        return { success: true };
    });
}

export async function updateRouteStatus(routeId: string, status: 'pending' | 'in_progress' | 'completed' | 'cancelled') {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    await db.update(driverRoutes).set({ status }).where(eq(driverRoutes.id, routeId));
    return { success: true };
}

export async function deleteRoute(routeId: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    return withRouteLock(db, routeId, async (tx, route) => {
        const stops = await tx
            .select({
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

        await tx.delete(routeOrders).where(eq(routeOrders.routeId, routeId));
        await tx.delete(driverRoutes).where(eq(driverRoutes.id, routeId));
        return { success: true };
    });
}

export async function assignDriverToRoute(routeId: string, driverId: number | null) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    await db.update(driverRoutes).set({ driverId }).where(eq(driverRoutes.id, routeId));
    return { success: true };
}

export async function addOrdersToRoute(
    routeId: string,
    ordersList: { id: number; mode: 'pickup_only' | 'delivery_only' | 'both' }[]
) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Server-side guard: only create legs that are actually assignable for each order
    // (don't re-pickup an already-picked-up package, don't double-assign an active leg).
    const flags = await getAssignmentFlags(ordersList.map(o => o.id));

    return withRouteLock(db, routeId, async (tx) => {
        const existing = await tx
            .select({ id: routeOrders.id, orderId: routeOrders.orderId })
            .from(routeOrders)
            .where(eq(routeOrders.routeId, routeId))
            .orderBy(STOP_ORDER_SQL, routeOrders.sequence, routeOrders.id);
        const existingOrderIds = new Set(existing.map(r => r.orderId));

        const stopsToInsert: { routeId: string; orderId: number; type: 'pickup' | 'delivery'; status: 'pending' }[] = [];
        for (const { id: orderId, mode } of ordersList) {
            if (existingOrderIds.has(orderId)) continue;
            for (const spec of expandStopSpecs([orderId], mode, flags)) {
                stopsToInsert.push({ routeId, orderId: spec.orderId, type: spec.type, status: 'pending' });
            }
        }

        if (stopsToInsert.length === 0) {
            return { success: true, added: 0, stopsCreated: 0 };
        }

        const inserted = await tx.insert(routeOrders).values(stopsToInsert).$returningId();

        // Renumber the WHOLE route 1..N. The old code derived the next sequence
        // from the row count, so after a removal left gaps (1,2,5,6) the new
        // stops were handed 5 and 6 again — two stops sharing a number.
        await writeStopSequence(tx, routeId, [...existing.map(r => r.id), ...inserted.map(r => r.id)]);

        const addedCount = new Set(stopsToInsert.map(s => s.orderId)).size;
        return { success: true, added: addedCount, stopsCreated: stopsToInsert.length };
    });
}

export async function removeOrderFromRoute(
    routeId: string,
    orderId: number,
    /** Omit to remove every leg of the order (legacy behaviour). */
    type?: 'pickup' | 'delivery',
) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    return withRouteLock(db, routeId, async (tx) => {
        const legFilter = and(
            eq(routeOrders.routeId, routeId),
            eq(routeOrders.orderId, orderId),
            ...(type ? [eq(routeOrders.type, type)] : []),
        );

        const targets = await tx
            .select({
                id: routeOrders.id,
                status: routeOrders.status,
                collectedAmount: routeOrders.collectedAmount,
                proofPhotoUrl: routeOrders.proofPhotoUrl,
                proofPhotoUrl2: routeOrders.proofPhotoUrl2,
                deliveredAt: routeOrders.deliveredAt,
                pickedUpAt: routeOrders.pickedUpAt,
                attemptedAt: routeOrders.attemptedAt,
                waybillNumber: orders.waybillNumber,
            })
            .from(routeOrders)
            .innerJoin(orders, eq(routeOrders.orderId, orders.id))
            .where(legFilter);

        assertStopsRemovable(targets);
        if (targets.length === 0) return { success: true };

        await tx.delete(routeOrders).where(legFilter);

        // Close the gaps so the next insert can't collide with a stale number.
        const remaining = await tx
            .select({ id: routeOrders.id })
            .from(routeOrders)
            .where(eq(routeOrders.routeId, routeId))
            .orderBy(STOP_ORDER_SQL, routeOrders.sequence, routeOrders.id);
        await writeStopSequence(tx, routeId, remaining.map(r => r.id));

        return { success: true };
    });
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
export interface AssignmentFlags { canPickup: boolean; canDeliver: boolean; canBoth: boolean; }

// A route stop still "occupies" the order (blocks re-assigning that leg) while in these states.
const ACTIVE_STOP_STATUSES = ['pending', 'in_progress', 'on_hold', 'attempted'];
// Orders in these states are done/dead — never offered for assignment.
export const TERMINAL_ORDER_STATUSES = ['delivered', 'returned', 'returned_to_sender', 'canceled'];

// International shipments aren't handled by local driver routes. Tolerant of
// casing, spaces, spelling variants and empty values (local orders sometimes
// omit the country). Keep in sync with isUAEDomestic() in geocoding.ts.
export const DOMESTIC_COUNTRY_SQL = sql`(
    ${orders.destinationCountry} = ''
    OR UPPER(TRIM(${orders.destinationCountry})) IN ('UAE', 'UNITED ARAB EMIRATES', 'U.A.E', 'U.A.E.', 'AE', 'EMIRATES')
)`;
// Order-level statuses that mean the package was already physically picked up.
const PICKED_UP_ORDER_STATUSES = ['picked_up', 'in_transit', 'out_for_delivery', 'delivery_attempted', 'failed_delivery'];
// Order-level statuses that still require a pickup leg.
const NEEDS_PICKUP_STATUSES = ['pending', 'pending_pickup'];

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
function computeAssignmentFlags(orderStatus: string, info?: StopInfo): AssignmentFlags {
    const i = info ?? { activePickup: false, activeDelivery: false, pickedUpViaStop: false, deliveredViaStop: false };
    const pickedUp = PICKED_UP_ORDER_STATUSES.includes(orderStatus) || i.pickedUpViaStop;
    const delivered = orderStatus === 'delivered' || i.deliveredViaStop;
    const needsPickup = NEEDS_PICKUP_STATUSES.includes(orderStatus);
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
    return { canPickup, canDeliver, canBoth };
}

function defaultModeFor(flags: AssignmentFlags): OrderMode {
    if (flags.canBoth) return 'both';
    if (flags.canPickup) return 'pickup_only';
    return 'delivery_only';
}

/** Per-order assignment flags for a specific set of orders — used as a server-side guard when assigning. */
export async function getAssignmentFlags(orderIds: number[]): Promise<Map<number, AssignmentFlags>> {
    const db = await getDb();
    const result = new Map<number, AssignmentFlags>();
    if (!db || orderIds.length === 0) return result;

    const orderRows = await db.select({ id: orders.id, status: orders.status })
        .from(orders).where(inArray(orders.id, orderIds));
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

export async function getAvailableOrders() {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // All route stops + their route status, so cancelled routes don't lock orders.
    const stopRows = await db
        .select({ orderId: routeOrders.orderId, type: routeOrders.type, stopStatus: routeOrders.status, routeStatus: driverRoutes.status })
        .from(routeOrders)
        .innerJoin(driverRoutes, eq(routeOrders.routeId, driverRoutes.id));
    const stopInfo = buildStopInfo(stopRows);

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
            shipperCity: orders.shipperCity,
            shipperLat: orders.shipperLat,
            shipperLng: orders.shipperLng,
            status: orders.status,
            codRequired: orders.codRequired,
            codAmount: orders.codAmount,
            serviceType: orders.serviceType,
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
        ))
        .orderBy(desc(orders.createdAt));

    // Keep only orders that still have an assignable leg, attaching the flags + default mode.
    const available = candidateOrders
        .map(o => {
            const flags = computeAssignmentFlags(o.status, stopInfo.get(o.id));
            return { ...o, ...flags, defaultMode: defaultModeFor(flags) };
        })
        .filter(o => o.canPickup || o.canDeliver);

    // Resolve company names for the surviving orders.
    const clientIds = Array.from(new Set(available.map(o => o.clientId)));
    let clientMap: Record<number, string> = {};
    if (clientIds.length > 0) {
        const clients = await db.select({ id: clientAccounts.id, companyName: clientAccounts.companyName })
            .from(clientAccounts).where(inArray(clientAccounts.id, clientIds));
        for (const c of clients) {
            clientMap[c.id] = c.companyName;
        }
    }

    return available.map(o => ({
        ...o,
        companyName: clientMap[o.clientId] || 'Unknown',
    }));
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

export interface DriverShiftReportGroup {
    driverId: number;
    driverName: string;
    shiftId: number | null; // null = these routes aren't linked to a reported shift yet (still in progress)
    shiftStartTime: Date | null;
    shiftEndTime: Date | null;
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

    const getGroup = (driverId: number, shiftId: number | null, shiftStartTime: Date | null, shiftEndTime: Date | null) => {
        const key = `${driverId}:${shiftId ?? 'unlinked'}`;
        let group = groups.get(key);
        if (!group) {
            group = {
                driverId,
                driverName: driversMap.get(driverId) || 'Unknown',
                shiftId,
                shiftStartTime,
                shiftEndTime,
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
        getGroup(shift.driverId, shift.id, shift.startTime, shift.endTime);
    }

    for (const route of dayRoutes) {
        if (route.driverId === null) continue; // unassigned route — nothing to attribute it to
        // Resolved from the merged dayShifts + extraShifts set (see above), so a
        // shift outside the range still attaches its real startTime/endTime here.
        // clippedSeconds() (in getGroup) still bounds onDutySeconds to the
        // requested range, so an out-of-range shift correctly clips to 0 rather
        // than leaking time from outside the window.
        const shift = route.shiftId !== null ? shiftsById.get(route.shiftId) : undefined;
        const group = getGroup(
            route.driverId,
            route.shiftId ?? null,
            shift?.startTime ?? null,
            shift?.endTime ?? null,
        );
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
 * Records that a driver handed over the cash collected on a given day. Freezes
 * the per-route cash figure at hand-over time so a later stop edit can't
 * rewrite what the office actually received. Routes already marked are skipped,
 * which makes a double-click a no-op rather than a double count.
 *
 * Selects routes via driverRoutesWorkedOn() — the same predicate
 * getDriverCodReconciliation() uses — so this always freezes exactly the
 * amount the admin saw on screen for that day. Do not special-case this query.
 */
export async function markDriverCashRemitted(driverId: number, dateStr?: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const { start, end } = dayBounds(dateStr);

    const pendingRoutes = (await db.select().from(driverRoutes).where(and(
        eq(driverRoutes.driverId, driverId),
        driverRoutesWorkedOn(start, end),
    ))).filter(r => r.cashRemittedAt === null);

    if (pendingRoutes.length === 0) return { routes: 0, amount: 0 };

    const routeIds = pendingRoutes.map(r => r.id);
    const stops = await db
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
        const records = await db.select({ shipmentId: codRecords.shipmentId, collectedMethod: codRecords.collectedMethod })
            .from(codRecords).where(inArray(codRecords.shipmentId, codOrderIds));
        for (const r of records) if (r.collectedMethod === 'card') cardOrders.add(r.shipmentId);
    }

    const now = new Date();
    let total = 0;
    for (const route of pendingRoutes) {
        const cash = codStops
            .filter(s => s.routeId === route.id && !cardOrders.has(s.orderId))
            .reduce((sum, s) => sum + (s.collectedAmount ? parseFloat(s.collectedAmount) || 0 : 0), 0);
        const amount = round2(cash);
        total += amount;
        await db.update(driverRoutes)
            .set({ cashRemittedAt: now, cashRemittedAmount: amount.toFixed(2) })
            .where(eq(driverRoutes.id, route.id));
    }

    return { routes: pendingRoutes.length, amount: round2(total) };
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
            city: orders.city,
            codRequired: orders.codRequired,
            codAmount: orders.codAmount,
            latitude: orders.latitude,
            longitude: orders.longitude,
            locationAccuracy: orders.locationAccuracy,
            shipperLat: orders.shipperLat,
            shipperLng: orders.shipperLng,
            isReturn: orders.isReturn,
        })
        .from(routeOrders)
        .innerJoin(orders, eq(routeOrders.orderId, orders.id))
        .where(inArray(routeOrders.routeId, routeIds));

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

            // Live map: only routes actually on the road, and only stops we can pin.
            // A pickup happens at the shipper (inverted on returns, where the package
            // sits at the consignee) — same rule the route-detail map uses.
            if (!inProgressIds.has(route.id)) continue;
            const consigneeSide = s.isReturn === 1 ? s.type === 'pickup' : s.type !== 'pickup';
            const lat = consigneeSide ? s.latitude : (s.shipperLat ?? s.latitude);
            const lng = consigneeSide ? s.longitude : (s.shipperLng ?? s.longitude);
            if (!lat || !lng) continue;
            const parsedLat = parseFloat(String(lat));
            const parsedLng = parseFloat(String(lng));
            if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) continue;

            base.liveStops.push({
                stopId: s.stopId,
                orderId: s.orderId,
                routeId: route.id,
                driverName: driverName || 'Unassigned',
                waybillNumber: s.waybillNumber,
                customerName: s.customerName,
                city: s.city,
                lat: parsedLat,
                lng: parsedLng,
                accuracy: consigneeSide ? s.locationAccuracy : null,
                type: s.type as 'pickup' | 'delivery',
                status: s.status,
                sequence: s.sequence,
                codRequired: s.codRequired,
                codAmount: s.codAmount,
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
        if (!route.cashRemittedAt) {
            entry.cashInHand += routeCash;
            if (routeCash > 0) entry.hasUnremittedCash = true;
        }
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
