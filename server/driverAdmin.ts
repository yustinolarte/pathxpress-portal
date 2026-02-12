/**
 * Driver Admin Functions
 * Used by tRPC router for admin panel driver management
 */
import bcrypt from 'bcryptjs';
import { eq, and, desc, sql, gte, isNull, notInArray, or, inArray } from 'drizzle-orm';
import { getDb } from './db';
import { drivers, driverRoutes, routeOrders, orders, driverReports, driverShifts, clientAccounts } from '../drizzle/schema';

// ============ DASHBOARD STATS ============

export async function getDriverDashboardStats() {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Driver stats
    const allDrivers = await db.select().from(drivers);
    const activeDrivers = allDrivers.filter(d => d.status === 'active');

    // Route stats
    const allRoutes = await db.select().from(driverRoutes);
    const todayRoutes = allRoutes.filter(r => new Date(r.date) >= today);

    // Delivery stats
    const allDeliveries = await db.select().from(routeOrders);
    const deliveredCount = allDeliveries.filter(d => d.status === 'delivered').length;
    const pendingCount = allDeliveries.filter(d => d.status === 'pending' || d.status === 'in_progress').length;

    // Report stats
    const pendingReports = await db
        .select()
        .from(driverReports)
        .where(eq(driverReports.status, 'pending'));

    return {
        drivers: {
            total: allDrivers.length,
            active: activeDrivers.length,
        },
        routes: {
            total: allRoutes.length,
            today: todayRoutes.length,
        },
        deliveries: {
            delivered: deliveredCount,
            pending: pendingCount,
        },
        reports: {
            pending: pendingReports.length,
        },
    };
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

    // Get driver info and delivery stats for each route
    const routesWithDetails = await Promise.all(
        routes.map(async (route) => {
            let driver = null;
            if (route.driverId) {
                const [d] = await db.select().from(drivers).where(eq(drivers.id, route.driverId)).limit(1);
                driver = d || null;
            }

            const deliveries = await db.select().from(routeOrders).where(eq(routeOrders.routeId, route.id));
            const delivered = deliveries.filter(d => d.status === 'delivered').length;
            const pickupCount = deliveries.filter(d => d.type === 'pickup').length;
            const deliveryCount = deliveries.filter(d => d.type === 'delivery').length;

            // Get order details for enriched data (companies, COD, returns)
            const orderIds = Array.from(new Set(deliveries.map(d => d.orderId)));
            let companies: string[] = [];
            let codTotal = 0;
            let returnCount = 0;
            let totalPieces = 0;
            let totalWeight = 0;

            if (orderIds.length > 0) {
                const routeOrdersData = await db.select().from(orders).where(inArray(orders.id, orderIds));

                // Get unique client IDs
                const clientIds = Array.from(new Set(routeOrdersData.map(o => o.clientId)));
                if (clientIds.length > 0) {
                    const clients = await db.select({ id: clientAccounts.id, companyName: clientAccounts.companyName })
                        .from(clientAccounts).where(inArray(clientAccounts.id, clientIds));
                    companies = clients.map(c => c.companyName);
                }

                // Aggregate COD, returns, pieces, weight
                for (const o of routeOrdersData) {
                    if (o.codRequired === 1 && o.codAmount) codTotal += parseFloat(o.codAmount) || 0;
                    if (o.isReturn === 1 || o.orderType === 'return') returnCount++;
                    totalPieces += o.pieces || 0;
                    totalWeight += parseFloat(o.weight as string) || 0;
                }
            }

            return {
                ...route,
                driver,
                deliveryStats: {
                    total: deliveries.length,
                    delivered,
                    pickups: pickupCount,
                    deliveries: deliveryCount,
                },
                companies,
                codTotal,
                returnCount,
                totalPieces,
                totalWeight: Math.round(totalWeight * 100) / 100,
            };
        })
    );

    return routesWithDetails;
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

    let query = db
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
        })
        .from(routeOrders)
        .innerJoin(orders, eq(routeOrders.orderId, orders.id));

    const results = await query;

    // Get driver info for each
    const deliveriesWithDriver = await Promise.all(
        results.map(async (delivery) => {
            const [route] = await db
                .select()
                .from(driverRoutes)
                .where(eq(driverRoutes.id, delivery.routeId))
                .limit(1);

            let driver = null;
            if (route?.driverId) {
                const [d] = await db.select().from(drivers).where(eq(drivers.id, route.driverId)).limit(1);
                driver = d ? { id: d.id, fullName: d.fullName } : null;
            }

            return { ...delivery, driver };
        })
    );

    // Apply filters
    let filtered = deliveriesWithDriver;
    if (filters?.status) {
        filtered = filtered.filter(d => d.status === filters.status);
    }
    if (filters?.routeId) {
        filtered = filtered.filter(d => d.routeId === filters.routeId);
    }

    return filtered;
}

// ============ REPORTS ============

export async function getAllDriverReports(filters?: {
    status?: string;
    driverId?: number;
}) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const reports = await db.select().from(driverReports).orderBy(desc(driverReports.createdAt));

    // Get driver info for each
    const reportsWithDriver = await Promise.all(
        reports.map(async (report) => {
            const [driver] = await db.select().from(drivers).where(eq(drivers.id, report.driverId)).limit(1);
            return {
                ...report,
                driver: driver ? { id: driver.id, fullName: driver.fullName } : null,
            };
        })
    );

    // Apply filters
    let filtered = reportsWithDriver;
    if (filters?.status) {
        filtered = filtered.filter(r => r.status === filters.status);
    }
    if (filters?.driverId) {
        filtered = filtered.filter(r => r.driverId === filters.driverId);
    }

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
