/**
 * Driver Management tRPC Router
 * Exposes driver admin functions to the portal frontend
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { publicProcedure, router } from './_core/trpc';
import * as driverAdmin from './driverAdmin';

export const driverRouter = router({
    // Dashboard stats
    getDashboardStats: publicProcedure
        .query(async ({ ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.getDriverDashboardStats();
        }),

    // ============ DRIVERS CRUD ============

    getAllDrivers: publicProcedure
        .query(async ({ ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.getAllDrivers();
        }),

    getDriverById: publicProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.getDriverById(input.id);
        }),

    createDriver: publicProcedure
        .input(z.object({
            username: z.string().min(1),
            password: z.string().min(6),
            fullName: z.string().min(1),
            email: z.string().email().optional(),
            phone: z.string().optional(),
            vehicleNumber: z.string().optional(),
            emiratesId: z.string().optional(),
            licenseNo: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.createDriver(input);
        }),

    updateDriver: publicProcedure
        .input(z.object({
            id: z.number(),
            fullName: z.string().optional(),
            email: z.string().email().optional(),
            phone: z.string().optional(),
            vehicleNumber: z.string().optional(),
            emiratesId: z.string().optional(),
            licenseNo: z.string().optional(),
            status: z.enum(['active', 'inactive', 'suspended']).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            const { id, ...data } = input;
            return driverAdmin.updateDriver(id, data);
        }),

    deleteDriver: publicProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.deleteDriver(input.id);
        }),

    // ============ ROUTES ============

    getAllRoutes: publicProcedure
        .query(async ({ ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.getAllDriverRoutes();
        }),

    getRouteDetails: publicProcedure
        .input(z.object({ routeId: z.string() }))
        .query(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.getRouteDetails(input.routeId);
        }),

    createRoute: publicProcedure
        .input(z.object({
            id: z.string().optional(), // optional — server generates a random unique ID when omitted
            date: z.string(), // ISO date string
            driverId: z.number().optional(),
            zone: z.string().optional(),
            vehicleInfo: z.string().optional(),
            orderIds: z.array(z.number()).optional(),
            stopMode: z.enum(['pickup_only', 'delivery_only', 'both']).default('both'),
            startAddress: z.string().optional(),
            startLat: z.string().optional(),
            startLng: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            const { date, stopMode, ...rest } = input;
            return driverAdmin.createDriverRoute({
                ...rest,
                date: new Date(date),
                stopMode,
            });
        }),

    updateRouteStatus: publicProcedure
        .input(z.object({
            routeId: z.string(),
            status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.updateRouteStatus(input.routeId, input.status);
        }),

    assignDriverToRoute: publicProcedure
        .input(z.object({
            routeId: z.string(),
            driverId: z.number().nullable(),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.assignDriverToRoute(input.routeId, input.driverId);
        }),

    addOrdersToRoute: publicProcedure
        .input(z.object({
            routeId: z.string(),
            // New structure: array of objects with id and mode
            orders: z.array(z.object({
                id: z.number(),
                mode: z.enum(['pickup_only', 'delivery_only', 'both'])
            }))
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            // Pass the array of {id, mode} directly to the admin function
            return driverAdmin.addOrdersToRoute(input.routeId, input.orders);
        }),

    getAvailableOrders: publicProcedure
        .query(async ({ ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.getAvailableOrders();
        }),

    removeOrderFromRoute: publicProcedure
        .input(z.object({
            routeId: z.string(),
            orderId: z.number(),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.removeOrderFromRoute(input.routeId, input.orderId);
        }),

    // ============ DELIVERIES ============

    getAllDeliveries: publicProcedure
        .input(z.object({
            status: z.string().optional(),
            routeId: z.string().optional(),
            date: z.string().optional(),
        }))
        .query(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.getAllDeliveries(input);
        }),

    // ============ REPORTS ============

    getAllReports: publicProcedure
        .input(z.object({
            status: z.string().optional(),
            driverId: z.number().optional(),
        }))
        .query(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.getAllDriverReports(input);
        }),

    updateReportStatus: publicProcedure
        .input(z.object({
            id: z.number(),
            status: z.enum(['pending', 'in_review', 'resolved', 'rejected']),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.updateReportStatus(input.id, input.status);
        }),

    deleteReport: publicProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.deleteReport(input.id);
        }),

    deleteRoute: publicProcedure
        .input(z.object({ routeId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.deleteRoute(input.routeId);
        }),

    optimizeRoute: publicProcedure
        .input(z.object({
            routeId: z.string(),
            origin: z.object({ lat: z.number(), lng: z.number() }).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.optimizeRoute(input.routeId, input.origin);
        }),

    reorderRouteStops: publicProcedure
        .input(z.object({
            routeId: z.string(),
            stopIds: z.array(z.number()).min(1),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.reorderRouteStops(input.routeId, input.stopIds);
        }),

    // ============ ORDER LOCATION ============

    // Manual pin from the dispatch map / edit dialogs — always 'exact'.
    setOrderLocation: publicProcedure
        .input(z.object({
            orderId: z.number(),
            latitude: z.string().min(1),
            longitude: z.string().min(1),
            address: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            const { updateOrderLocation } = await import('./db');
            const order = await updateOrderLocation(
                input.orderId, input.latitude, input.longitude, 'exact', input.address,
            );
            if (!order) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to save location' });
            }
            return { success: true, latitude: order.latitude, longitude: order.longitude };
        }),

    // Whether server-side geocoding / the location bot are configured (UI hides buttons otherwise).
    getGeoCapabilities: publicProcedure
        .query(async ({ ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            const { isGeocodingConfigured } = await import('./geocoding');
            const { ENV } = await import('./_core/env');
            return {
                geocoding: isGeocodingConfigured(),
                locationBot: Boolean(ENV.botWebhookUrl),
            };
        }),

    // Batch-geocode active orders without coordinates. Click-batched on purpose
    // (no auto-loop) so Google billing stays under human control.
    geocodePendingOrders: publicProcedure
        .input(z.object({ limit: z.number().min(1).max(50).default(25) }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            const { geocodePendingOrders, isGeocodingConfigured } = await import('./geocoding');
            if (!isGeocodingConfigured()) {
                throw new TRPCError({
                    code: 'PRECONDITION_FAILED',
                    message: 'GOOGLE_MAPS_API_KEY no está configurada en el servidor',
                });
            }
            return geocodePendingOrders(input.limit);
        }),

    // Re-fire the WhatsApp location bot for one order so the consignee is
    // asked to share their pin again.
    requestLocationViaBot: publicProcedure
        .input(z.object({ orderId: z.number() }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            const { ENV } = await import('./_core/env');
            if (!ENV.botWebhookUrl) return { sent: false };

            const { getOrderById } = await import('./db');
            const order = await getOrderById(input.orderId);
            if (!order) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
            }
            const { notifyBotNewOrder } = await import('./_core/botWebhook');
            notifyBotNewOrder({
                waybillNumber: order.waybillNumber,
                customerName: order.customerName,
                customerPhone: order.customerPhone,
            });
            return { sent: true };
        }),

    getDriverPerformance: publicProcedure
        .input(z.object({ driverId: z.number() }))
        .query(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.getDriverPerformance(input.driverId);
        }),
});
