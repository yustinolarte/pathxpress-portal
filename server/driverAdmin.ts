/**
 * Driver Admin Functions
 * Used by tRPC router for admin panel driver management
 */
import bcrypt from 'bcryptjs';
import { eq, and, desc, sql, gte, isNull, notInArray, or, inArray } from 'drizzle-orm';
import { getDb } from './db';
import { drivers, driverRoutes, routeOrders, orders, driverReports, driverShifts, clientAccounts } from '../drizzle/schema';
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
        waybillNumber: item.order.waybillNumber,
        customerName: item.order.customerName,
        customerPhone: item.order.customerPhone,
        address: item.order.address,
        city: item.order.city,
        status: item.routeOrder.status,
        proofPhotoUrl: item.routeOrder.proofPhotoUrl,
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

export async function createDriverRoute(data: {
    id: string;
    date: Date;
    driverId?: number;
    zone?: string;
    vehicleInfo?: string;
    orderIds?: number[];
    stopMode?: 'pickup_only' | 'delivery_only' | 'both';
}) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const stopMode = data.stopMode || 'both';

    await db.insert(driverRoutes).values({
        id: data.id,
        date: data.date,
        driverId: data.driverId || null,
        zone: data.zone || null,
        vehicleInfo: data.vehicleInfo || null,
        status: 'pending',
    });

    // Add orders to route if provided
    if (data.orderIds && data.orderIds.length > 0) {
        let sequence = 1;

        for (const orderId of data.orderIds) {
            // Get the order
            const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);

            if (stopMode === 'pickup_only' || stopMode === 'both') {
                // Create PICKUP stop
                await db.insert(routeOrders).values({
                    routeId: data.id,
                    orderId: orderId,
                    sequence: sequence,
                    type: 'pickup',
                    status: 'pending',
                });
                sequence++;
            }

            if (stopMode === 'delivery_only' || stopMode === 'both') {
                // Create DELIVERY stop
                await db.insert(routeOrders).values({
                    routeId: data.id,
                    orderId: orderId,
                    sequence: sequence,
                    type: 'delivery',
                    status: 'pending',
                });
                sequence++;
            }

            console.log(`Order ${orderId}: stopMode="${stopMode}" -> created ${stopMode === 'both' ? 'pickup + delivery' : stopMode} stops`);
        }
    }

    return { id: data.id };
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

    // Get current max sequence
    const existing = await db.select().from(routeOrders).where(eq(routeOrders.routeId, routeId));
    let maxSeq = existing.length;
    let addedCount = 0;
    let totalStopsCreated = 0;

    for (const orderData of ordersList) {
        const orderId = orderData.id;
        const stopMode = orderData.mode;

        // Check if already in route (check if this order already has any stops in this route)
        const [existingStop] = await db
            .select()
            .from(routeOrders)
            .where(and(eq(routeOrders.routeId, routeId), eq(routeOrders.orderId, orderId)))
            .limit(1);

        if (!existingStop) {
            // Get the order
            const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);

            if (stopMode === 'pickup_only' || stopMode === 'both') {
                // Create PICKUP stop
                maxSeq++;
                await db.insert(routeOrders).values({
                    routeId,
                    orderId,
                    sequence: maxSeq,
                    type: 'pickup',
                    status: 'pending',
                });
                totalStopsCreated++;
            }

            if (stopMode === 'delivery_only' || stopMode === 'both') {
                // Create DELIVERY stop
                maxSeq++;
                await db.insert(routeOrders).values({
                    routeId,
                    orderId,
                    sequence: maxSeq,
                    type: 'delivery',
                    status: 'pending',
                });
                totalStopsCreated++;
            }

            addedCount++;
            console.log(`Order ${orderId}: stopMode="${stopMode}" -> created stops`);
        }
    }

    return { success: true, added: addedCount, stopsCreated: totalStopsCreated };
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

export async function getAvailableOrders() {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Get order IDs already assigned to routes
    const assignedOrders = await db.select({ orderId: routeOrders.orderId }).from(routeOrders);
    const assignedIds = assignedOrders.map(o => o.orderId);

    // Get orders that are out_for_delivery or pending_pickup but not yet assigned
    const availableOrdersRaw = await db
        .select({
            id: orders.id,
            waybillNumber: orders.waybillNumber,
            customerName: orders.customerName,
            customerPhone: orders.customerPhone,
            address: orders.address,
            city: orders.city,
            emirate: orders.emirate,
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
        })
        .from(orders)
        .where(
            and(
                or(
                    eq(orders.status, 'pending'),
                    eq(orders.status, 'pending_pickup'),
                    eq(orders.status, 'picked_up'),
                    eq(orders.status, 'in_transit'),
                    eq(orders.status, 'failed_delivery')
                ),
                assignedIds.length > 0
                    ? notInArray(orders.id, assignedIds)
                    : sql`1=1`
            )
        )
        .orderBy(desc(orders.createdAt));

    // Get company names for all client IDs
    const clientIds = Array.from(new Set(availableOrdersRaw.map(o => o.clientId)));
    let clientMap: Record<number, string> = {};
    if (clientIds.length > 0) {
        const clients = await db.select({ id: clientAccounts.id, companyName: clientAccounts.companyName })
            .from(clientAccounts).where(inArray(clientAccounts.id, clientIds));
        for (const c of clients) {
            clientMap[c.id] = c.companyName;
        }
    }

    return availableOrdersRaw.map(o => ({
        ...o,
        companyName: clientMap[o.clientId] || 'Unknown',
    }));
}
