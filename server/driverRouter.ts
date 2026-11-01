/**
 * Driver Management tRPC Router
 * Exposes driver admin functions to the portal frontend
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { portalAdminProcedure, publicProcedure, router } from './_core/trpc';
import * as driverAdmin from './driverAdmin';
import { RouteGuardError } from './driverAdmin';
import * as routeLifecycle from './routeLifecycle';
import { StopStatusError } from './stopStatus';
import { uploadImageToCloudinary } from './cloudinary';

const driverNameSchema = z.string().trim().min(2).max(100).refine(
    value => !/^[A-Z]{1,4}[\s-]*\d{1,7}$/i.test(value),
    'Driver name looks like a vehicle plate',
);

const optionalVehicleNumberSchema = z.string().trim().max(50).refine(
    value => value.length === 0 || /\d/.test(value),
    'Vehicle number must include at least one digit',
).optional();

/** A single stop leg, in the position the admin placed it. */
const stopSpecSchema = z.object({
    orderId: z.number().int().positive(),
    type: z.enum(['pickup', 'delivery']),
});

/**
 * Surface route-guard failures as BAD_REQUEST so the admin sees *why* the write
 * was refused ("la entrega de PX… no puede ir antes de su recogida") instead of
 * a generic 500. Real faults still bubble up untouched.
 */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        if (err instanceof RouteGuardError) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
        }
        if (err instanceof StopStatusError) {
            const code = err.httpStatus === 404 ? 'NOT_FOUND' : err.httpStatus === 403 ? 'FORBIDDEN' : err.httpStatus === 409 ? 'CONFLICT' : 'BAD_REQUEST';
            throw new TRPCError({ code, message: err.message });
        }
        throw err;
    }
}

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
            fullName: driverNameSchema,
            email: z.union([z.string().email(), z.literal('')]).optional(),
            phone: z.string().optional(),
            vehicleNumber: optionalVehicleNumberSchema,
            photoUrl: z.string().url(),
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
            fullName: driverNameSchema.optional(),
            email: z.union([z.string().email(), z.literal('')]).optional(),
            phone: z.string().optional(),
            vehicleNumber: optionalVehicleNumberSchema,
            photoUrl: z.string().url().optional(),
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

    uploadDriverPhoto: publicProcedure
        .input(z.object({
            imageBase64: z.string().min(100).max(8_000_000).refine(
                value => /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value),
                'Only JPEG, PNG or WebP images are supported',
            ),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            const photoUrl = await uploadImageToCloudinary(input.imageBase64, 'pathxpress/drivers');
            if (!photoUrl) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Driver photo upload failed' });
            }
            return { photoUrl };
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
            // Explicit, already-ordered stop list from the wizard's order step.
            // Takes precedence over orderIds/stopMode, which stay for dispatch.
            stops: z.array(stopSpecSchema).max(200).optional(),
            orderIds: z.array(z.number()).optional(),
            stopMode: z.enum(['pickup_only', 'delivery_only', 'both']).default('both'),
            startAddress: z.string().optional(),
            startLat: z.string().optional(),
            startLng: z.string().optional(),
            // When the driver is planned to leave (ISO) — feeds the admin-only ETAs.
            plannedStartAt: z.string().datetime({ offset: true }).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            const { date, stopMode, plannedStartAt, ...rest } = input;
            return guarded(() => driverAdmin.createDriverRoute({
                ...rest,
                date: new Date(date),
                stopMode,
                plannedStartAt: plannedStartAt ? new Date(plannedStartAt) : null,
            }));
        }),

    /**
     * Suggested stop order for a set of legs that isn't a route yet — the
     * wizard needs a sensible starting sequence before anything is persisted,
     * so optimizeRoute(routeId) has nothing to work with. Reads coordinates,
     * writes nothing, takes no lock.
     */
    previewOptimizedOrder: publicProcedure
        .input(z.object({
            stops: z.array(stopSpecSchema).min(1).max(200),
            origin: z.object({ lat: z.number(), lng: z.number() }).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return guarded(() => driverAdmin.previewOptimizedOrder(input.stops, input.origin));
        }),

    updateRouteStatus: publicProcedure
        .input(z.object({
            routeId: z.string(),
            status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
            reason: z.string().trim().max(500).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return guarded(() => routeLifecycle.setRouteStatus(input.routeId, input.status, ctx.portalUser!.email || 'admin', input.reason));
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
            return guarded(() => routeLifecycle.reassignRoute(input.routeId, input.driverId, ctx.portalUser!.email || 'admin'));
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
            return guarded(() => driverAdmin.addOrdersToRoute(input.routeId, input.orders));
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
            // Omit to drop every leg of the order (legacy behaviour).
            type: z.enum(['pickup', 'delivery']).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return guarded(() => driverAdmin.removeOrderFromRoute(input.routeId, input.orderId, input.type, ctx.portalUser!.email || 'admin'));
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
            return guarded(() => driverAdmin.deleteRoute(input.routeId, ctx.portalUser!.email || 'admin'));
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
            return guarded(() => driverAdmin.optimizeRoute(input.routeId, input.origin));
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
            return guarded(() => driverAdmin.reorderRouteStops(input.routeId, input.stopIds));
        }),

    // ============ ORDER LOCATION ============

    // Manual pin from the dispatch map / edit dialogs — always 'exact'.
    // `target: 'shipper'` corrects the pickup-side pin (shipperLat/shipperLng)
    // instead of the consignee's latitude/longitude — used for pickup stops
    // and return-delivery stops, which render off the shipper columns.
    setOrderLocation: publicProcedure
        .input(z.object({
            orderId: z.number(),
            latitude: z.string().min(1),
            longitude: z.string().min(1),
            address: z.string().optional(),
            target: z.enum(['delivery', 'shipper']).optional().default('delivery'),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            if (input.target === 'shipper') {
                const { updateOrderShipperLocation } = await import('./db');
                const order = await updateOrderShipperLocation(input.orderId, input.latitude, input.longitude);
                if (!order) {
                    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to save location' });
                }
                return { success: true, latitude: order.shipperLat, longitude: order.shipperLng };
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
                    message: 'GOOGLE_MAPS_API_KEY is not configured on the server',
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
                force: true,
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

    // Per-driver, per-shift breakdown of routes worked on a given day: active
    // time per route (app-reported) and COD collected per route (recomputed
    // server-side from delivered stops only). date defaults to today.
    getShiftReport: publicProcedure
        .input(z.object({
            from: z.string().optional(),
            to: z.string().optional(),
            driverId: z.number().optional(),
        }))
        .query(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.getDriverShiftReport(input);
        }),

    // ── Payroll corrections on driver shifts ──
    updateShift: publicProcedure
        .input(z.object({
            id: z.number(),
            startTime: z.string().optional(),
            // null re-opens the shift; undefined leaves it as-is.
            endTime: z.string().nullable().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            const parse = (value: string, label: string) => {
                const d = new Date(value);
                if (Number.isNaN(d.getTime())) throw new TRPCError({ code: 'BAD_REQUEST', message: `Invalid ${label}` });
                return d;
            };
            try {
                return await driverAdmin.updateDriverShift({
                    id: input.id,
                    startTime: input.startTime ? parse(input.startTime, 'clock-in') : undefined,
                    endTime: input.endTime === undefined ? undefined : (input.endTime === null ? null : parse(input.endTime, 'clock-out')),
                });
            } catch (e) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: (e as Error).message });
            }
        }),

    closeShift: publicProcedure
        .input(z.object({ id: z.number(), endTime: z.string().optional() }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            try {
                return await driverAdmin.closeDriverShift({
                    id: input.id,
                    endTime: input.endTime ? new Date(input.endTime) : undefined,
                });
            } catch (e) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: (e as Error).message });
            }
        }),

    deleteShift: publicProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            try {
                return await driverAdmin.deleteDriverShift(input.id);
            } catch (e) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: (e as Error).message });
            }
        }),

    // Dispatch board for one day — KPIs, on-duty roster and alert strip in a
    // single round trip. date defaults to today.
    getDispatchOverview: publicProcedure
        .input(z.object({ date: z.string().optional() }).optional())
        .query(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.getDispatchOverview(input?.date);
        }),

    // Last GPS fix of every on-duty driver, for the dispatch live map. Kept apart
    // from getDispatchOverview so the map can poll it every few seconds cheaply.
    getLiveDriverLocations: publicProcedure
        .query(async ({ ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.getLiveDriverLocations();
        }),

    // Per-driver COD reconciliation for one day: cash vs card (Tap to Pay) and
    // how much cash is still in the driver's hands. date defaults to today.
    getCodReconciliation: publicProcedure
        .input(z.object({ date: z.string().optional() }).optional())
        .query(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.getDriverCodReconciliation(input?.date);
        }),

    markCashRemitted: publicProcedure
        .input(z.object({ driverId: z.number(), date: z.string().optional(), note: z.string().trim().max(500).optional() }))
        .mutation(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.markDriverCashRemitted(input.driverId, input.date, {
                actor: ctx.portalUser.email || 'admin',
                note: input.note,
            });
        }),

    // ============ DISPATCH TOOLS (admin-only, all go through routeLifecycle) ============

    getCashHandovers: portalAdminProcedure
        .input(z.object({ date: z.string().optional() }).optional())
        .query(async ({ input }) => driverAdmin.getCashHandovers(input?.date)),

    voidCashHandover: portalAdminProcedure
        .input(z.object({ id: z.number().int().positive(), reason: z.string().trim().min(3).max(500) }))
        .mutation(async ({ input, ctx }) => guarded(() =>
            driverAdmin.voidCashHandover(input.id, ctx.portalUser.email || 'admin', input.reason))),

    correctStop: portalAdminProcedure
        .input(z.object({
            stopId: z.number().int().positive(),
            status: z.enum(['pending', 'in_progress', 'picked_up', 'delivered', 'attempted', 'returned', 'failed', 'on_hold']),
            reason: z.string().trim().min(3).max(500),
            notes: z.string().trim().max(1000).optional(),
            codMethod: z.enum(['cash', 'card']).optional(),
        }))
        .mutation(async ({ input, ctx }) => guarded(() =>
            routeLifecycle.correctStop(input, ctx.portalUser.email || 'admin'))),

    moveStops: portalAdminProcedure
        .input(z.object({
            fromRouteId: z.string().min(1).max(50),
            toRouteId: z.string().min(1).max(50).optional(),
            newRoute: z.object({
                driverId: z.number().int().positive(),
                date: z.string().datetime({ offset: true }),
                plannedStartAt: z.string().datetime({ offset: true }).nullable().optional(),
            }).optional(),
            stopIds: z.array(z.number().int().positive()).min(1).max(200),
        }))
        .mutation(async ({ input, ctx }) => guarded(() => routeLifecycle.moveStops({
            fromRouteId: input.fromRouteId,
            toRouteId: input.toRouteId,
            newRoute: input.newRoute ? {
                driverId: input.newRoute.driverId,
                date: new Date(input.newRoute.date),
                plannedStartAt: input.newRoute.plannedStartAt ? new Date(input.newRoute.plannedStartAt) : null,
            } : undefined,
            stopIds: input.stopIds,
        }, ctx.portalUser.email || 'admin'))),

    updateRouteMeta: portalAdminProcedure
        .input(z.object({
            routeId: z.string().min(1).max(50),
            date: z.string().datetime({ offset: true }).optional(),
            zone: z.string().trim().max(100).nullable().optional(),
            vehicleInfo: z.string().trim().max(100).nullable().optional(),
            startAddress: z.string().trim().max(255).nullable().optional(),
            startLat: z.string().trim().max(50).nullable().optional(),
            startLng: z.string().trim().max(50).nullable().optional(),
            plannedStartAt: z.string().datetime({ offset: true }).nullable().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const { routeId, date, plannedStartAt, ...rest } = input;
            return guarded(() => routeLifecycle.updateRouteMeta(routeId, {
                ...rest,
                date: date ? new Date(date) : undefined,
                plannedStartAt: plannedStartAt === undefined ? undefined : plannedStartAt ? new Date(plannedStartAt) : null,
            }, ctx.portalUser.email || 'admin'));
        }),

    getRouteAuditLog: portalAdminProcedure
        .input(z.object({ routeId: z.string().min(1).max(50) }))
        .query(async ({ input }) => routeLifecycle.getRouteAuditLog(input.routeId)),

    getIgnoredDriverUpdates: portalAdminProcedure
        .query(async () => routeLifecycle.getIgnoredDriverUpdates()),

    // Dispatch priority override (null = back to the automatic rule).
    setOrderPriority: portalAdminProcedure
        .input(z.object({ orderId: z.number().int().positive(), priority: z.enum(['urgent', 'high', 'normal']).nullable() }))
        .mutation(async ({ input, ctx }) => guarded(() =>
            driverAdmin.setOrderPriority(input.orderId, input.priority, ctx.portalUser.email || 'admin'))),
});
