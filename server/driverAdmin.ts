/**
 * Driver Admin Functions
 * Used by tRPC router for admin panel driver management
 */
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';
import { eq, and, desc, sql, gte, notInArray, inArray } from 'drizzle-orm';
import { getDb } from './db';
import { drivers, driverRoutes, routeOrders, orders, driverReports, clientAccounts } from '../drizzle/schema';
import { optimizeStops } from './routeOptimizer';
import type { OptimizableStop, LatLng } from './routeOptimizer';
import { cachedQuery } from './_core/queryCache';

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

    return db.select().from(drivers).orderBy(desc(drivers.createdAt));
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
        .orderBy(routeOrders.sequence);

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

export async function createDriverRoute(data: {
    id?: string;
    date: Date;
    driverId?: number;
    zone?: string;
    vehicleInfo?: string;
    orderIds?: number[];
    stopMode?: 'pickup_only' | 'delivery_only' | 'both';
    startAddress?: string;
    startLat?: string;
    startLng?: string;
}) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const stopMode = data.stopMode || 'both';

    // Resolve the route ID: use the (random) client-provided one if free, otherwise generate a fresh unique one.
    let routeId = data.id?.trim() || '';
    if (routeId) {
        const [clash] = await db.select({ id: driverRoutes.id }).from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
        if (clash) routeId = await generateUniqueRouteId(db);
    } else {
        routeId = await generateUniqueRouteId(db);
    }

    await db.insert(driverRoutes).values({
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

    // Add orders to route if provided — batch insert instead of loop
    if (data.orderIds && data.orderIds.length > 0) {
        // Guard: only create legs that are actually assignable for each order.
        const flags = await getAssignmentFlags(data.orderIds);
        const stopsToInsert: { routeId: string; orderId: number; sequence: number; type: 'pickup' | 'delivery'; status: 'pending' }[] = [];
        let sequence = 1;

        for (const orderId of data.orderIds) {
            const f = flags.get(orderId) ?? { canPickup: true, canDeliver: true, canBoth: true };
            // "both" is atomic: only insert the pair when both legs are actually open, so we never
            // silently drop one leg (e.g. dropping delivery because the package isn't picked up yet —
            // that's expected, since this same call is the one doing the pickup).
            if (stopMode === 'both') {
                if (f.canBoth) {
                    stopsToInsert.push({ routeId, orderId, sequence, type: 'pickup', status: 'pending' });
                    sequence++;
                    stopsToInsert.push({ routeId, orderId, sequence, type: 'delivery', status: 'pending' });
                    sequence++;
                }
            } else if (stopMode === 'pickup_only' && f.canPickup) {
                stopsToInsert.push({ routeId, orderId, sequence, type: 'pickup', status: 'pending' });
                sequence++;
            } else if (stopMode === 'delivery_only' && f.canDeliver) {
                stopsToInsert.push({ routeId, orderId, sequence, type: 'delivery', status: 'pending' });
                sequence++;
            }
        }

        if (stopsToInsert.length > 0) {
            await db.insert(routeOrders).values(stopsToInsert);
        }
    }

    return { id: routeId };
}

export async function optimizeRoute(routeId: string, origin?: { lat: number; lng: number }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
    if (!route) throw new Error('Route not found');

    const stopsRaw = await db
        .select({ ro: routeOrders, o: orders })
        .from(routeOrders)
        .innerJoin(orders, eq(routeOrders.orderId, orders.id))
        .where(eq(routeOrders.routeId, routeId));

    const startOrigin: LatLng | null =
        origin ??
        (route.startLat && route.startLng
            ? { lat: parseFloat(route.startLat), lng: parseFloat(route.startLng) }
            : null);

    const stops: OptimizableStop[] = stopsRaw.map(({ ro, o }) => {
        const coords = resolveStopCoords(ro.type, o);
        return {
            id: ro.id,
            type: ro.type,
            coords,
        };
    });

    const optimizedIds = optimizeStops(stops, startOrigin);
    await writeStopSequence(db, optimizedIds);

    return { optimized: optimizedIds.length };
}

/**
 * Coordinate of a stop leg. orders.latitude/longitude es la ubicación de la
 * persona a la que Bot Ubicación le pidió el pin: en una orden normal es el
 * destinatario (delivery), pero en un return es quien tiene el paquete para
 * devolver (pickup) — shipper/customer quedan intercambiados en returns.
 * shipperLat/shipperLng es el otro extremo (donde se recoge en órdenes
 * normales, donde se entrega en returns).
 */
function resolveStopCoords(
    type: string,
    o: { latitude: string | null; longitude: string | null; shipperLat: string | null; shipperLng: string | null; isReturn: number },
): LatLng | null {
    const isPickup = type === 'pickup';
    const consigneeSide = o.isReturn === 1 ? isPickup : !isPickup;
    const latStr = consigneeSide ? o.latitude : o.shipperLat;
    const lngStr = consigneeSide ? o.longitude : o.shipperLng;
    if (!latStr || !lngStr) return null;
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
}

/** Persist a stop ordering as sequence 1..N in a single UPDATE. */
async function writeStopSequence(
    db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
    stopIds: number[],
) {
    if (stopIds.length === 0) return;
    const cases = sql.join(stopIds.map((id, i) => sql`WHEN ${id} THEN ${i + 1}`), sql` `);
    await db.execute(sql`
        UPDATE ${routeOrders}
        SET ${routeOrders.sequence} = CASE ${routeOrders.id} ${cases} END
        WHERE ${routeOrders.id} IN (${sql.join(stopIds, sql`, `)})
    `);
}

/**
 * Manual stop reordering: stopIds must be EXACTLY the route's current stop set
 * (rejects stale UIs that don't know about added/removed stops).
 */
export async function reorderRouteStops(routeId: string, stopIds: number[]) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const current = await db.select({ id: routeOrders.id })
        .from(routeOrders).where(eq(routeOrders.routeId, routeId));
    const currentIds = new Set(current.map(r => r.id));

    if (stopIds.length !== currentIds.size || stopIds.some(id => !currentIds.has(id))) {
        throw new Error('La lista de paradas no coincide con la ruta actual. Recarga e intenta de nuevo.');
    }

    await writeStopSequence(db, stopIds);
    return { success: true };
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

    // First delete associated route orders
    await db.delete(routeOrders).where(eq(routeOrders.routeId, routeId));

    // Then delete the route
    await db.delete(driverRoutes).where(eq(driverRoutes.id, routeId));

    return { success: true };
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

    // Get current max sequence and existing order IDs in one query
    const existing = await db.select({ orderId: routeOrders.orderId }).from(routeOrders).where(eq(routeOrders.routeId, routeId));
    let maxSeq = existing.length;
    const existingOrderIds = new Set(existing.map(r => r.orderId));

    // Server-side guard: only create legs that are actually assignable for each order
    // (don't re-pickup an already-picked-up package, don't double-assign an active leg).
    const flags = await getAssignmentFlags(ordersList.map(o => o.id));

    const stopsToInsert: { routeId: string; orderId: number; sequence: number; type: 'pickup' | 'delivery'; status: 'pending' }[] = [];

    for (const orderData of ordersList) {
        const orderId = orderData.id;
        const stopMode = orderData.mode;
        const f = flags.get(orderId) ?? { canPickup: true, canDeliver: true, canBoth: true };

        if (!existingOrderIds.has(orderId)) {
            // "both" is atomic: only insert the pair when both legs are actually open, so we never
            // silently drop one leg (e.g. dropping delivery because the package isn't picked up yet —
            // that's expected, since this same call is the one doing the pickup).
            if (stopMode === 'both') {
                if (f.canBoth) {
                    maxSeq++;
                    stopsToInsert.push({ routeId, orderId, sequence: maxSeq, type: 'pickup', status: 'pending' });
                    maxSeq++;
                    stopsToInsert.push({ routeId, orderId, sequence: maxSeq, type: 'delivery', status: 'pending' });
                }
            } else if (stopMode === 'pickup_only' && f.canPickup) {
                maxSeq++;
                stopsToInsert.push({ routeId, orderId, sequence: maxSeq, type: 'pickup', status: 'pending' });
            } else if (stopMode === 'delivery_only' && f.canDeliver) {
                maxSeq++;
                stopsToInsert.push({ routeId, orderId, sequence: maxSeq, type: 'delivery', status: 'pending' });
            }
        }
    }

    if (stopsToInsert.length > 0) {
        await db.insert(routeOrders).values(stopsToInsert);
    }

    const addedCount = new Set(stopsToInsert.map(s => s.orderId)).size;
    return { success: true, added: addedCount, stopsCreated: stopsToInsert.length };
}

export async function removeOrderFromRoute(routeId: string, orderId: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    await db.delete(routeOrders).where(
        and(eq(routeOrders.routeId, routeId), eq(routeOrders.orderId, orderId))
    );

    return { success: true };
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
    let delivered = 0;
    let attempted = 0;
    let returned = 0;
    let codTotal = 0;
    let totalPieces = 0;

    if (routeIds.length > 0) {
        const allStops = await db.select().from(routeOrders).where(inArray(routeOrders.routeId, routeIds));
        totalDeliveries = allStops.filter(s => s.type === 'delivery').length;
        delivered = allStops.filter(s => s.status === 'delivered').length;
        attempted = allStops.filter(s => s.status === 'attempted').length;
        returned = allStops.filter(s => s.status === 'returned').length;

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

    const successRate = totalDeliveries > 0 ? Math.round((delivered / totalDeliveries) * 100) : 0;

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
