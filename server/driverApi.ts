/**
 * REST API endpoints for the Driver mobile app
 * These endpoints are accessed via /api/driver/*
 */
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, and } from 'drizzle-orm';
import { getDb } from './db';
import { drivers, driverRoutes, routeOrders, orders, driverReports, driverShifts, trackingEvents, codRecords } from '../drizzle/schema';
import { uploadImageToCloudinary } from './cloudinary';

const router = Router();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';

// Extend Request to include driver info
interface DriverRequest extends Request {
    driverId?: number;
    driverUsername?: string;
}

// Auth middleware for driver routes
const driverAuthMiddleware = async (req: DriverRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string };

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

        // Get the deliveries for this route
        const routeOrdersList = await db
            .select({
                routeOrder: routeOrders,
                order: orders,
            })
            .from(routeOrders)
            .innerJoin(orders, eq(routeOrders.orderId, orders.id))
            .where(eq(routeOrders.routeId, routeId))
            .orderBy(routeOrders.sequence);

        // Format deliveries for the app
        const deliveries = routeOrdersList.map((item) => ({
            id: item.routeOrder.id,
            orderId: item.order.id,
            customerName: item.order.customerName,
            phone: item.order.customerPhone,
            customerPhone: item.order.customerPhone,
            address: item.order.address,
            city: item.order.city,
            latitude: item.order.latitude ? parseFloat(item.order.latitude) : null,
            longitude: item.order.longitude ? parseFloat(item.order.longitude) : null,
            packageRef: item.order.waybillNumber,
            weight: item.order.weight,
            type: item.order.codRequired ? 'COD' : 'PREPAID',
            codAmount: item.order.codAmount ? parseFloat(item.order.codAmount) : 0,
            status: item.routeOrder.status?.toUpperCase() || 'PENDING',
            proofPhotoUrl: item.routeOrder.proofPhotoUrl,
            notes: item.routeOrder.notes,
        }));

        res.json({
            ...route,
            status: route.status?.toUpperCase() || 'PENDING',
            deliveries,
        });
    } catch (error) {
        console.error('Get route error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/routes/:routeId/claim', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const { routeId } = req.params;
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const [route] = await db
            .select()
            .from(driverRoutes)
            .where(eq(driverRoutes.id, routeId))
            .limit(1);

        if (!route) {
            return res.status(404).json({ error: 'Route not found' });
        }

        if (route.status === 'completed') {
            return res.status(400).json({ error: 'This route is already completed' });
        }

        if (route.driverId !== null && route.driverId !== req.driverId) {
            return res.status(403).json({ error: 'This route is already assigned to another driver' });
        }

        // Claim the route if not already claimed by this driver
        if (route.driverId !== req.driverId) {
            await db
                .update(driverRoutes)
                .set({ driverId: req.driverId, status: 'in_progress' })
                .where(eq(driverRoutes.id, routeId));
        }

        // Get updated route
        const [updatedRoute] = await db
            .select()
            .from(driverRoutes)
            .where(eq(driverRoutes.id, routeId))
            .limit(1);

        // Get the deliveries for this route
        const routeOrdersList = await db
            .select({
                routeOrder: routeOrders,
                order: orders,
            })
            .from(routeOrders)
            .innerJoin(orders, eq(routeOrders.orderId, orders.id))
            .where(eq(routeOrders.routeId, routeId))
            .orderBy(routeOrders.sequence);

        // Format deliveries for the app
        const deliveries = routeOrdersList.map((item) => ({
            id: item.routeOrder.id,
            orderId: item.order.id,
            customerName: item.order.customerName,
            phone: item.order.customerPhone,
            customerPhone: item.order.customerPhone,
            address: item.order.address,
            city: item.order.city,
            latitude: item.order.latitude ? parseFloat(item.order.latitude) : null,
            longitude: item.order.longitude ? parseFloat(item.order.longitude) : null,
            packageRef: item.order.waybillNumber,
            weight: item.order.weight,
            type: item.order.codRequired ? 'COD' : 'PREPAID',
            codAmount: item.order.codAmount ? parseFloat(item.order.codAmount) : 0,
            status: item.routeOrder.status?.toUpperCase() || 'PENDING',
            proofPhotoUrl: item.routeOrder.proofPhotoUrl,
            notes: item.routeOrder.notes,
        }));

        res.json({
            ...updatedRoute,
            status: updatedRoute?.status?.toUpperCase() || 'PENDING',
            deliveries,
        });
    } catch (error) {
        console.error('Claim route error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.put('/routes/:routeId/status', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const { routeId } = req.params;
        const { status } = req.body;
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const [route] = await db
            .select()
            .from(driverRoutes)
            .where(eq(driverRoutes.id, routeId))
            .limit(1);

        if (!route) {
            return res.status(404).json({ error: 'Route not found' });
        }

        if (route.driverId !== null && route.driverId !== req.driverId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const statusLower = status.toLowerCase();
        await db
            .update(driverRoutes)
            .set({ status: statusLower as typeof route.status })
            .where(eq(driverRoutes.id, routeId));

        res.json({ message: 'Route status updated' });
    } catch (error) {
        console.error('Update route status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============ DELIVERIES ============

router.put('/deliveries/:id/status', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { status, photoBase64, notes } = req.body;
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        // Get the route order
        const [routeOrder] = await db
            .select({
                routeOrder: routeOrders,
                route: driverRoutes,
                order: orders,
            })
            .from(routeOrders)
            .innerJoin(driverRoutes, eq(routeOrders.routeId, driverRoutes.id))
            .innerJoin(orders, eq(routeOrders.orderId, orders.id))
            .where(eq(routeOrders.id, parseInt(id)))
            .limit(1);

        if (!routeOrder) {
            return res.status(404).json({ error: 'Delivery not found' });
        }

        // Check driver access
        if (routeOrder.route.driverId !== null && routeOrder.route.driverId !== req.driverId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        let photoUrl: string | null = routeOrder.routeOrder.proofPhotoUrl;

        // Upload photo if provided
        if (photoBase64) {
            console.log('Received photo upload request for delivery:', id);
            console.log('Photo base64 length:', photoBase64.length);
            try {
                photoUrl = await uploadImageToCloudinary(photoBase64, 'pathxpress/deliveries');
                console.log('Cloudinary upload result:', photoUrl);
            } catch (err) {
                console.error('Error uploading to Cloudinary:', err);
            }
        } else {
            console.log('No photo provided for delivery:', id);
        }

        const statusLower = status.toLowerCase();
        const updateData: Record<string, unknown> = {
            status: statusLower,
            notes: notes || routeOrder.routeOrder.notes,
            proofPhotoUrl: photoUrl,
        };

        if (statusLower === 'delivered') {
            updateData.deliveredAt = new Date();
        } else if (statusLower === 'attempted') {
            updateData.attemptedAt = new Date();
        }

        await db
            .update(routeOrders)
            .set(updateData)
            .where(eq(routeOrders.id, parseInt(id)));

        // Also update the main order status
        let orderStatus = routeOrder.order.status;
        if (statusLower === 'delivered') {
            orderStatus = 'delivered';
        } else if (statusLower === 'attempted') {
            orderStatus = 'delivery_attempted';
        } else if (statusLower === 'returned') {
            orderStatus = 'returned';
        }

        await db
            .update(orders)
            .set({
                status: orderStatus,
                lastStatusUpdate: new Date(),
                deliveryDateReal: statusLower === 'delivered' ? new Date() : undefined,
            })
            .where(eq(orders.id, routeOrder.order.id));

        // Create tracking event
        await db.insert(trackingEvents).values({
            shipmentId: routeOrder.order.id,
            eventDatetime: new Date(),
            location: routeOrder.order.city || 'Unknown',
            statusCode: orderStatus,
            statusLabel: statusLower === 'delivered' ? 'Delivered' :
                statusLower === 'attempted' ? 'Delivery Attempted' :
                    statusLower === 'returned' ? 'Returned' : 'Updated',
            description: notes || `Status updated by driver`,
            podFileUrl: photoUrl || undefined,
            createdBy: 'driver',
        });

        // If this is a COD order and it's delivered, mark COD as collected
        if (statusLower === 'delivered' && routeOrder.order.codRequired) {
            // Check if COD record exists
            const [existingCod] = await db
                .select()
                .from(codRecords)
                .where(eq(codRecords.shipmentId, routeOrder.order.id))
                .limit(1);

            if (existingCod) {
                // Update existing COD record to collected
                await db
                    .update(codRecords)
                    .set({
                        status: 'collected',
                        collectedDate: new Date(),
                    })
                    .where(eq(codRecords.id, existingCod.id));
            } else {
                // Create new COD record as collected
                await db.insert(codRecords).values({
                    shipmentId: routeOrder.order.id,
                    codAmount: routeOrder.order.codAmount || '0',
                    codCurrency: routeOrder.order.codCurrency || 'AED',
                    status: 'collected',
                    collectedDate: new Date(),
                });
            }
        }

        res.json({ message: 'Delivery updated successfully' });
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

        // Check for active shift
        const activeShifts = await db
            .select()
            .from(driverShifts)
            .where(and(
                eq(driverShifts.driverId, req.driverId!),
                eq(driverShifts.endTime, null as unknown as Date)
            ))
            .limit(1);

        if (activeShifts.length > 0) {
            return res.json(activeShifts[0]);
        }

        const [newShift] = await db
            .insert(driverShifts)
            .values({
                driverId: req.driverId!,
                startTime: new Date(),
            })
            .$returningId();

        res.json({ id: newShift.id, startTime: new Date() });
    } catch (error) {
        console.error('Start shift error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/shifts/end', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const activeShifts = await db
            .select()
            .from(driverShifts)
            .where(and(
                eq(driverShifts.driverId, req.driverId!),
                eq(driverShifts.endTime, null as unknown as Date)
            ))
            .limit(1);

        if (activeShifts.length === 0) {
            return res.status(404).json({ error: 'No active shift found' });
        }

        await db
            .update(driverShifts)
            .set({ endTime: new Date() })
            .where(eq(driverShifts.id, activeShifts[0].id));

        res.json({ message: 'Shift ended successfully' });
    } catch (error) {
        console.error('End shift error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/shifts/status', driverAuthMiddleware, async (req: DriverRequest, res: Response) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const activeShifts = await db
            .select()
            .from(driverShifts)
            .where(and(
                eq(driverShifts.driverId, req.driverId!),
                eq(driverShifts.endTime, null as unknown as Date)
            ))
            .limit(1);

        res.json({
            isOnDuty: activeShifts.length > 0,
            shift: activeShifts[0] || null,
        });
    } catch (error) {
        console.error('Get shift status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
