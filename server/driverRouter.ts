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
            id: z.string().min(1),
            date: z.string(), // ISO date string
            driverId: z.number().optional(),
            zone: z.string().optional(),
            vehicleInfo: z.string().optional(),
            orderIds: z.array(z.number()).optional(),
            stopMode: z.enum(['pickup_only', 'delivery_only', 'both']).default('both'),
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

    getDriverPerformance: publicProcedure
        .input(z.object({ driverId: z.number() }))
        .query(async ({ input, ctx }) => {
            if (!ctx.portalUser || ctx.portalUser.role !== 'admin') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
            }
            return driverAdmin.getDriverPerformance(input.driverId);
        }),
});
