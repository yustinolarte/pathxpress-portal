/**
 * Driver Management tRPC Router
 * Exposes driver admin functions to the portal frontend
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { publicProcedure, router } from './_core/trpc';
import { verifyPortalToken } from './portalAuth';
import * as driverAdmin from './driverAdmin';

// Helper to verify admin access
function requireAdmin(token: string) {
    const payload = verifyPortalToken(token);
    if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
    }
    return payload;
}

export const driverRouter = router({
    // Dashboard stats
    getDashboardStats: publicProcedure
        .input(z.object({ token: z.string() }))
        .query(async ({ input }) => {
            requireAdmin(input.token);
            return driverAdmin.getDriverDashboardStats();
        }),

    // ============ DRIVERS CRUD ============

    getAllDrivers: publicProcedure
        .input(z.object({ token: z.string() }))
        .query(async ({ input }) => {
            requireAdmin(input.token);
            return driverAdmin.getAllDrivers();
        }),

    getDriverById: publicProcedure
        .input(z.object({ token: z.string(), id: z.number() }))
        .query(async ({ input }) => {
            requireAdmin(input.token);
            return driverAdmin.getDriverById(input.id);
        }),

    createDriver: publicProcedure
        .input(z.object({
            token: z.string(),
            username: z.string().min(1),
            password: z.string().min(6),
            fullName: z.string().min(1),
            email: z.string().email().optional(),
            phone: z.string().optional(),
            vehicleNumber: z.string().optional(),
            emiratesId: z.string().optional(),
            licenseNo: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            requireAdmin(input.token);
            const { token, ...data } = input;
            return driverAdmin.createDriver(data);
        }),

    updateDriver: publicProcedure
        .input(z.object({
            token: z.string(),
            id: z.number(),
            fullName: z.string().optional(),
            email: z.string().email().optional(),
            phone: z.string().optional(),
            vehicleNumber: z.string().optional(),
            emiratesId: z.string().optional(),
            licenseNo: z.string().optional(),
            status: z.enum(['active', 'inactive', 'suspended']).optional(),
        }))
        .mutation(async ({ input }) => {
            requireAdmin(input.token);
            const { token, id, ...data } = input;
            return driverAdmin.updateDriver(id, data);
        }),

    deleteDriver: publicProcedure
        .input(z.object({ token: z.string(), id: z.number() }))
        .mutation(async ({ input }) => {
            requireAdmin(input.token);
            return driverAdmin.deleteDriver(input.id);
        }),

    // ============ ROUTES ============

    getAllRoutes: publicProcedure
        .input(z.object({ token: z.string() }))
        .query(async ({ input }) => {
            requireAdmin(input.token);
            return driverAdmin.getAllDriverRoutes();
        }),

    getRouteDetails: publicProcedure
        .input(z.object({ token: z.string(), routeId: z.string() }))
        .query(async ({ input }) => {
            requireAdmin(input.token);
            return driverAdmin.getRouteDetails(input.routeId);
        }),

    createRoute: publicProcedure
        .input(z.object({
            token: z.string(),
            id: z.string().min(1),
            date: z.string(), // ISO date string
            driverId: z.number().optional(),
            zone: z.string().optional(),
            vehicleInfo: z.string().optional(),
            orderIds: z.array(z.number()).optional(),
            stopMode: z.enum(['pickup_only', 'delivery_only', 'both']).default('both'),
        }))
        .mutation(async ({ input }) => {
            requireAdmin(input.token);
            const { token, date, stopMode, ...rest } = input;
            return driverAdmin.createDriverRoute({
                ...rest,
                date: new Date(date),
                stopMode,
            });
        }),

    updateRouteStatus: publicProcedure
        .input(z.object({
            token: z.string(),
            routeId: z.string(),
            status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
        }))
        .mutation(async ({ input }) => {
            requireAdmin(input.token);
            return driverAdmin.updateRouteStatus(input.routeId, input.status);
        }),

    assignDriverToRoute: publicProcedure
        .input(z.object({
            token: z.string(),
            routeId: z.string(),
            driverId: z.number().nullable(),
        }))
        .mutation(async ({ input }) => {
            requireAdmin(input.token);
            return driverAdmin.assignDriverToRoute(input.routeId, input.driverId);
        }),

    addOrdersToRoute: publicProcedure
        .input(z.object({
            token: z.string(),
            routeId: z.string(),
            // New structure: array of objects with id and mode
            orders: z.array(z.object({
                id: z.number(),
                mode: z.enum(['pickup_only', 'delivery_only', 'both'])
            }))
        }))
        .mutation(async ({ input }) => {
            requireAdmin(input.token);
            // Pass the array of {id, mode} directly to the admin function
            return driverAdmin.addOrdersToRoute(input.routeId, input.orders);
        }),

    getAvailableOrders: publicProcedure
        .input(z.object({ token: z.string() }))
        .query(async ({ input }) => {
            requireAdmin(input.token);
            return driverAdmin.getAvailableOrders();
        }),

    // ============ DELIVERIES ============

    getAllDeliveries: publicProcedure
        .input(z.object({
            token: z.string(),
            status: z.string().optional(),
            routeId: z.string().optional(),
            date: z.string().optional(),
        }))
        .query(async ({ input }) => {
            requireAdmin(input.token);
            const { token, ...filters } = input;
            return driverAdmin.getAllDeliveries(filters);
        }),

    // ============ REPORTS ============

    getAllReports: publicProcedure
        .input(z.object({
            token: z.string(),
            status: z.string().optional(),
            driverId: z.number().optional(),
        }))
        .query(async ({ input }) => {
            requireAdmin(input.token);
            const { token, ...filters } = input;
            return driverAdmin.getAllDriverReports(filters);
        }),

    updateReportStatus: publicProcedure
        .input(z.object({
            token: z.string(),
            id: z.number(),
            status: z.enum(['pending', 'in_review', 'resolved', 'rejected']),
        }))
        .mutation(async ({ input }) => {
            requireAdmin(input.token);
            return driverAdmin.updateReportStatus(input.id, input.status);
        }),

    deleteReport: publicProcedure
        .input(z.object({ token: z.string(), id: z.number() }))
        .mutation(async ({ input }) => {
            requireAdmin(input.token);
            return driverAdmin.deleteReport(input.id);
        }),

    deleteRoute: publicProcedure
        .input(z.object({ token: z.string(), routeId: z.string() }))
        .mutation(async ({ input }) => {
            requireAdmin(input.token);
            return driverAdmin.deleteRoute(input.routeId);
        }),
});
