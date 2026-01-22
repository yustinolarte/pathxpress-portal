import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { portalRouter } from "./portalRouters";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  tracking: router({
    getByTrackingId: publicProcedure
      .input(z.object({ trackingId: z.string().min(1, 'Tracking ID is required') }))
      .query(async ({ input }) => {
        const { getOrderByWaybill, getTrackingEventsByShipmentId } = await import('./db');

        // Try to find order by waybill number (new system)
        const order = await getOrderByWaybill(input.trackingId);
        if (!order) {
          // Fallback: try old shipments table
          const { getShipmentByTrackingId } = await import('./db');
          const shipment = await getShipmentByTrackingId(input.trackingId);
          if (!shipment) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Shipment not found' });
          }
          return {
            trackingId: shipment.trackingId,
            status: shipment.status,
            pickupAddress: shipment.pickupAddress || '',
            deliveryAddress: shipment.deliveryAddress || '',
            serviceType: shipment.serviceType || '',
            weight: shipment.weight || '',
            pieces: 1,
            codAmount: null,
            codCurrency: null,
            updatedAt: shipment.updatedAt,
            trackingEvents: [],
          };
        }

        // Get tracking events for this order
        const trackingEvents = await getTrackingEventsByShipmentId(order.id);

        // Check if client has hideShipperAddress enabled
        const { getClientAccountById } = await import('./db');
        const client = await getClientAccountById(order.clientId);
        const hideShipperAddress = client?.hideShipperAddress === 1;

        // Build pickup address - hide full address if setting enabled
        const pickupAddress = hideShipperAddress
          ? `${order.shipperCity}, ${order.shipperCountry}`
          : `${order.shipperAddress}, ${order.shipperCity}, ${order.shipperCountry}`;

        return {
          trackingId: order.waybillNumber,
          status: order.status,
          pickupAddress,
          deliveryAddress: `${order.address}, ${order.city}, ${order.destinationCountry}`,
          serviceType: order.serviceType,
          weight: `${order.weight} kg`,
          pieces: order.pieces,
          codAmount: order.codAmount,
          codCurrency: order.codCurrency,

          updatedAt: order.updatedAt,
          trackingEvents,
        };
      }),
  }),

  internationalRate: router({
    submit: publicProcedure
      .input(z.object({
        originCountry: z.string().min(1, 'Origin country is required'),
        destinationCountry: z.string().min(1, 'Destination country is required'),
        deliveryDate: z.string().min(1, 'Delivery date is required'),
        weight: z.string().min(1, 'Weight is required'),
        length: z.string().min(1, 'Length is required'),
        width: z.string().min(1, 'Width is required'),
        height: z.string().min(1, 'Height is required'),
        phone: z.string().min(1, 'Phone is required'),
        email: z.string().email('Invalid email'),
      }))
      .mutation(async ({ input }) => {
        const { createInternationalRateRequest } = await import('./db');
        await createInternationalRateRequest(input);

        return { success: true };
      }),
  }),

  // Portal routes (admin and customer portals)
  portal: portalRouter,

  quoteRequest: router({
    create: publicProcedure
      .input(z.object({
        name: z.string().min(1, 'Name is required'),
        phone: z.string().min(1, 'Phone is required'),
        email: z.string().email('Invalid email'),
        pickupAddress: z.string().min(1, 'Pickup address is required'),
        deliveryAddress: z.string().optional(),
        serviceType: z.string().min(1, 'Service type is required'),
        weight: z.string().min(1, 'Weight is required'),
        comments: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { createQuoteRequest } = await import('./db');
        await createQuoteRequest(input);

        // TODO: Send email to pathxpress@outlook.com
        // This would require email service integration

        return { success: true };
      }),
  }),

  contact: router({
    submit: publicProcedure
      .input(z.object({
        name: z.string().min(1, 'Name is required'),
        email: z.string().email('Invalid email'),
        message: z.string().min(1, 'Message is required'),
      }))
      .mutation(async ({ input }) => {
        const { createContactMessage } = await import('./db');
        await createContactMessage(input);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
