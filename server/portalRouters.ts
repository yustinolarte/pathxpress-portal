import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { publicProcedure, router } from './_core/trpc';
import {
  hashPassword,
  comparePassword,
  generatePortalToken,
  verifyPortalToken,
  validatePassword,
  validateEmail,
  type PortalTokenPayload
} from './portalAuth';
import {
  createPortalUser,
  getPortalUserByEmail,
  updatePortalUserLastSignIn,
  createClientAccount,
  getAllClientAccounts,
  getClientAccountById,
  updateClientAccount,
  createOrder,
  getAllOrders,
  getOrdersByClientId,
  getOrderById,
  getOrderByWaybill,
  updateOrderStatus,
  createTrackingEvent,
  getTrackingEventsByShipmentId,
  generateWaybillNumber,
  generateInvoiceForClient,
  getInvoicesByClient,
  getAllInvoices,
  getInvoiceById,
  getInvoiceItems,
  updateInvoiceStatus,
  updateInvoice,
  getCODRecordsByClient,
  getAllCODRecords,
  getPendingCODByClient,
  createCODRemittance,
  getRemittancesByClient,
  getAllRemittances,
  getRemittanceById,
  getRemittanceItems,
  updateRemittanceStatus,
  generateRemittanceNumber,
  getCODSummaryByClient,
  getCODSummaryGlobal,
  calculateShipmentRate,
  calculateCODFee,
  getAllRateTiers,
} from './db';

/**
 * Portal authentication router
 */
export const portalAuthRouter = router({
  // Login with email/password
  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const { email, password } = input;

      // Get user by email
      const user = await getPortalUserByEmail(email.toLowerCase());
      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      // Check if user is active
      if (user.status !== 'active') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Account is inactive. Please contact support.',
        });
      }

      // Verify password
      const isValid = await comparePassword(password, user.passwordHash);
      if (!isValid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      // Update last sign in
      await updatePortalUserLastSignIn(user.id);

      // Generate token
      const token = generatePortalToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        clientId: user.clientId || undefined,
      });

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          clientId: user.clientId,
        },
      };
    }),

  // Verify token and get current user
  me: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        });
      }

      return payload;
    }),
});

/**
 * Admin portal router
 */
export const adminPortalRouter = router({
  // Get all clients
  getClients: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      return await getAllClientAccounts();
    }),

  // Create client account
  createClient: publicProcedure
    .input(z.object({
      token: z.string(),
      client: z.object({
        companyName: z.string().min(1),
        contactName: z.string().min(1),
        phone: z.string().min(1),
        billingEmail: z.string().email(),
        billingAddress: z.string().min(1),
        country: z.string().min(1),
        city: z.string().min(1),
        creditTerms: z.string().optional(),
        defaultCurrency: z.string().default('AED'),
        codAllowed: z.boolean().default(false).transform((v) => (v ? 1 : 0)),
        codFeePercent: z.string().optional(),
        codMaxFee: z.string().optional(),
        notes: z.string().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const client = await createClientAccount(input.client);
      if (!client) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create client' });
      }

      return client;
    }),

  // Delete client account
  deleteClient: publicProcedure
    .input(z.object({
      token: z.string(),
      clientId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const { deleteClientAccount } = await import('./db');
      await deleteClientAccount(input.clientId);

      return { success: true };
    }),



  // Create customer user for a client
  createCustomerUser: publicProcedure
    .input(z.object({
      token: z.string(),
      email: z.string().email(),
      password: z.string().min(8),
      clientId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      // Validate password
      const passwordValidation = validatePassword(input.password);
      if (!passwordValidation.valid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: passwordValidation.error || 'Invalid password' });
      }

      // Check if email already exists
      const existing = await getPortalUserByEmail(input.email.toLowerCase());
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Email already exists' });
      }

      // Hash password
      const passwordHash = await hashPassword(input.password);

      // Create user
      const user = await createPortalUser({
        email: input.email.toLowerCase(),
        passwordHash,
        role: 'customer',
        clientId: input.clientId,
        status: 'active',
      });

      if (!user) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create user' });
      }

      return { success: true, userId: user.id };
    }),

  // Get all orders (global view)
  getAllOrders: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      return await getAllOrders();
    }),

  // Update order status
  updateOrderStatus: publicProcedure
    .input(z.object({
      token: z.string(),
      orderId: z.number(),
      status: z.string(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const order = await updateOrderStatus(input.orderId, input.status);
      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      // Create tracking event
      await createTrackingEvent({
        shipmentId: input.orderId,
        eventDatetime: new Date(),
        statusCode: input.status,
        statusLabel: input.status.replace(/_/g, ' ').toUpperCase(),
        description: `Status updated to ${input.status}`,
        createdBy: 'admin',
      });

      return order;
    }),

  // Get monthly report data for all clients (admin)
  getMonthlyReport: publicProcedure
    .input(z.object({
      token: z.string(),
      month: z.string(), // Format: YYYY-MM
      clientId: z.number().optional(), // Optional filter by client
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const db = await import('./db').then(m => m.getDb());
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const { orders, clientAccounts } = await import('../drizzle/schema');
      const { eq, and, gte, lt } = await import('drizzle-orm');

      // Parse month
      const [year, month] = input.month.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      let whereConditions = [
        gte(orders.createdAt, startDate),
        lt(orders.createdAt, endDate)
      ];

      if (input.clientId) {
        whereConditions.push(eq(orders.clientId, input.clientId));
      }

      const monthlyOrders = await db
        .select({
          order: orders,
          companyName: clientAccounts.companyName,
        })
        .from(orders)
        .leftJoin(clientAccounts, eq(orders.clientId, clientAccounts.id))
        .where(and(...whereConditions));

      return monthlyOrders.map(({ order, companyName }) => ({
        ...order,
        companyName: companyName || 'Unknown',
      }));
    }),

  // Get COD report data for all clients (admin)
  getCODReport: publicProcedure
    .input(z.object({
      token: z.string(),
      clientId: z.number().optional(), // Optional filter by client
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const db = await import('./db').then(m => m.getDb());
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const { codRecords, orders, clientAccounts } = await import('../drizzle/schema');
      const { eq, and } = await import('drizzle-orm');

      let whereConditions = [];
      if (input.clientId) {
        whereConditions.push(eq(orders.clientId, input.clientId));
      }

      const codData = await db
        .select({
          id: codRecords.id,
          waybillNumber: orders.waybillNumber,
          codAmount: codRecords.codAmount,
          codCurrency: codRecords.codCurrency,
          status: codRecords.status,
          collectedDate: codRecords.collectedDate,
          remittedToClientDate: codRecords.remittedToClientDate,
          customerName: orders.customerName,
          city: orders.city,
          companyName: clientAccounts.companyName,
          clientId: orders.clientId,
        })
        .from(codRecords)
        .innerJoin(orders, eq(orders.id, codRecords.shipmentId))
        .leftJoin(clientAccounts, eq(orders.clientId, clientAccounts.id))
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

      return codData;
    }),

  // Get all clients for report filtering
  getClientsForReports: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      return await getAllClientAccounts();
    }),

  // Get all quote requests
  getQuoteRequests: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const { getAllQuoteRequests } = await import('./db');
      return await getAllQuoteRequests();
    }),

  // Delete quote request
  deleteQuoteRequest: publicProcedure
    .input(z.object({
      token: z.string(),
      requestId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const { deleteQuoteRequest } = await import('./db');
      const success = await deleteQuoteRequest(input.requestId);

      if (!success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete request' });
      }

      return { success: true };
    }),

  // Get all contact messages
  getContactMessages: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const { getAllContactMessages } = await import('./db');
      return await getAllContactMessages();
    }),

  // Delete contact message
  deleteContactMessage: publicProcedure
    .input(z.object({
      token: z.string(),
      messageId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const { deleteContactMessage } = await import('./db');
      const success = await deleteContactMessage(input.messageId);

      if (!success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete message' });
      }

      return { success: true };
    }),
});

/**
 * Customer portal router
 */
export const customerPortalRouter = router({
  // Get customer's client account
  getMyAccount: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      return await getClientAccountById(payload.clientId);
    }),

  // Get customer's orders
  getMyOrders: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      return await getOrdersByClientId(payload.clientId);
    }),

  // Create new shipment/order
  createShipment: publicProcedure
    .input(z.object({
      token: z.string(),
      shipment: z.object({
        orderNumber: z.string().optional(),
        shipperName: z.string().min(1),
        shipperAddress: z.string().min(1),
        shipperCity: z.string().min(1),
        shipperCountry: z.string().min(1),
        shipperPhone: z.string().min(1),
        customerName: z.string().min(1),
        customerPhone: z.string().min(1),
        address: z.string().min(1),
        city: z.string().min(1),
        emirate: z.string().optional(),
        postalCode: z.string().optional(),
        destinationCountry: z.string().min(1),
        pieces: z.number().min(1),
        weight: z.number().min(0.1),
        length: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        serviceType: z.string().min(1),
        specialInstructions: z.string().optional(),
        codRequired: z.number().default(0),
        codAmount: z.string().optional(),
        codCurrency: z.string().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      // Generate waybill number
      const waybillNumber = await generateWaybillNumber();

      // Create order
      const order = await createOrder({
        clientId: payload.clientId,
        waybillNumber,
        ...input.shipment,
        weight: input.shipment.weight.toString(),
        length: input.shipment.length?.toString() || null,
        width: input.shipment.width?.toString() || null,
        height: input.shipment.height?.toString() || null,
        status: 'pending_pickup',
        lastStatusUpdate: new Date(),
      });

      if (!order) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create shipment' });
      }

      // Create initial tracking event
      await createTrackingEvent({
        shipmentId: order.id,
        eventDatetime: new Date(),
        statusCode: 'pending_pickup',
        statusLabel: 'PENDING PICKUP',
        description: 'Shipment created and awaiting pickup',
        createdBy: 'system',
      });

      // Create COD record if COD is required
      if (input.shipment.codRequired === 1 && input.shipment.codAmount) {
        const db = await import('./db').then(m => m.getDb());
        if (db) {
          const { codRecords } = await import('../drizzle/schema');
          await db.insert(codRecords).values({
            shipmentId: order.id,
            codAmount: input.shipment.codAmount,
            codCurrency: input.shipment.codCurrency || 'AED',
            status: 'pending_collection',
            collectedDate: null,
            remittedToClientDate: null,
            notes: null,
          });
        }
      }

      return order;
    }),

  // Get shipment details with tracking
  getShipmentDetails: publicProcedure
    .input(z.object({
      token: z.string(),
      waybillNumber: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      const order = await getOrderByWaybill(input.waybillNumber);
      if (!order || order.clientId !== payload.clientId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Shipment not found' });
      }

      const trackingEvents = await getTrackingEventsByShipmentId(order.id);

      return {
        order,
        trackingEvents,
      };
    }),

  // Get dashboard metrics for customer
  getDashboardMetrics: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      const db = await import('./db').then(m => m.getDb());
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const { orders, codRecords } = await import('../drizzle/schema');
      const { eq, and, gte, sql } = await import('drizzle-orm');

      // Current month boundaries
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      // Total shipments this month
      const monthlyShipments = await db
        .select({ count: sql<number>`cast(count(*) as unsigned)` })
        .from(orders)
        .where(
          and(
            eq(orders.clientId, payload.clientId),
            gte(orders.createdAt, startOfMonth)
          )
        );

      const totalShipmentsThisMonth = Number(monthlyShipments[0]?.count || 0);

      // Delivered on time percentage (comparing deliveryDateReal with deliveryDateEstimated)
      const deliveredOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.clientId, payload.clientId),
            eq(orders.status, 'delivered'),
            gte(orders.createdAt, startOfMonth)
          )
        );

      let onTimeDeliveries = 0;
      deliveredOrders.forEach(order => {
        if (order.deliveryDateReal && order.deliveryDateEstimated) {
          if (new Date(order.deliveryDateReal) <= new Date(order.deliveryDateEstimated)) {
            onTimeDeliveries++;
          }
        }
      });

      const onTimePercentage = deliveredOrders.length > 0
        ? Math.round((onTimeDeliveries / deliveredOrders.length) * 100)
        : 0;

      // Total pending COD
      const pendingCOD = await db
        .select({
          total: sql<number>`cast(sum(cast(${codRecords.codAmount} as decimal(10,2))) as decimal(10,2))`
        })
        .from(codRecords)
        .innerJoin(orders, eq(orders.id, codRecords.shipmentId))
        .where(
          and(
            eq(orders.clientId, payload.clientId),
            eq(codRecords.status, 'pending_collection')
          )
        );

      const totalPendingCOD = Number(pendingCOD[0]?.total || 0);

      // Most frequent routes (top 5)
      const frequentRoutes = await db
        .select({
          route: sql<string>`concat(${orders.shipperCity}, ' → ', ${orders.city})`,
          count: sql<number>`cast(count(*) as unsigned)`,
        })
        .from(orders)
        .where(eq(orders.clientId, payload.clientId))
        .groupBy(sql`concat(${orders.shipperCity}, ' → ', ${orders.city})`)
        .orderBy(sql`count(*) desc`)
        .limit(5);

      // Average delivery time (in hours)
      const completedWithTimes = await db
        .select({
          createdAt: orders.createdAt,
          deliveryDateReal: orders.deliveryDateReal,
        })
        .from(orders)
        .where(
          and(
            eq(orders.clientId, payload.clientId),
            eq(orders.status, 'delivered'),
            sql`${orders.deliveryDateReal} is not null`
          )
        )
        .limit(100); // Last 100 delivered shipments

      let totalHours = 0;
      let validCount = 0;
      completedWithTimes.forEach(order => {
        if (order.createdAt && order.deliveryDateReal) {
          const created = new Date(order.createdAt).getTime();
          const delivered = new Date(order.deliveryDateReal).getTime();
          const hours = (delivered - created) / (1000 * 60 * 60);
          if (hours > 0 && hours < 720) { // Max 30 days
            totalHours += hours;
            validCount++;
          }
        }
      });

      const averageDeliveryHours = validCount > 0 ? Math.round(totalHours / validCount) : 0;

      return {
        totalShipmentsThisMonth,
        onTimePercentage,
        totalPendingCOD: totalPendingCOD.toFixed(2),
        frequentRoutes: frequentRoutes.map(r => ({
          route: r.route,
          count: Number(r.count),
        })),
        averageDeliveryHours,
      };
    }),

  // Get monthly report data (for PDF/Excel generation)
  getMonthlyReport: publicProcedure
    .input(z.object({
      token: z.string(),
      month: z.string(), // Format: YYYY-MM
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      const db = await import('./db').then(m => m.getDb());
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const { orders } = await import('../drizzle/schema');
      const { eq, and, gte, lt } = await import('drizzle-orm');

      // Parse month
      const [year, month] = input.month.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      const monthlyOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.clientId, payload.clientId),
            gte(orders.createdAt, startDate),
            lt(orders.createdAt, endDate)
          )
        );

      return monthlyOrders;
    }),

  // Get COD report data
  getCODReport: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      const db = await import('./db').then(m => m.getDb());
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const { codRecords, orders } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      const codData = await db
        .select({
          id: codRecords.id,
          waybillNumber: orders.waybillNumber,
          codAmount: codRecords.codAmount,
          codCurrency: codRecords.codCurrency,
          status: codRecords.status,
          collectedDate: codRecords.collectedDate,
          remittedToClientDate: codRecords.remittedToClientDate,
          customerName: orders.customerName,
          city: orders.city,
        })
        .from(codRecords)
        .innerJoin(orders, eq(orders.id, codRecords.shipmentId))
        .where(eq(orders.clientId, payload.clientId));

      return codData;
    }),

  // Get saved shippers
  getSavedShippers: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      const { getSavedShippersByClient } = await import('./db');
      return await getSavedShippersByClient(payload.clientId);
    }),

  // Create saved shipper
  createSavedShipper: publicProcedure
    .input(z.object({
      token: z.string(),
      nickname: z.string().min(1, 'Nickname is required'),
      shipperName: z.string().min(1, 'Shipper name is required'),
      shipperAddress: z.string().min(1, 'Shipper address is required'),
      shipperCity: z.string().min(1, 'Shipper city is required'),
      shipperCountry: z.string().min(1, 'Shipper country is required'),
      shipperPhone: z.string().min(1, 'Shipper phone is required'),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      const { createSavedShipper } = await import('./db');
      const id = await createSavedShipper({
        clientId: payload.clientId,
        nickname: input.nickname,
        shipperName: input.shipperName,
        shipperAddress: input.shipperAddress,
        shipperCity: input.shipperCity,
        shipperCountry: input.shipperCountry,
        shipperPhone: input.shipperPhone,
      });

      return { id, success: true };
    }),

  // Delete saved shipper
  deleteSavedShipper: publicProcedure
    .input(z.object({
      token: z.string(),
      shipperId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      const { deleteSavedShipper } = await import('./db');
      await deleteSavedShipper(input.shipperId, payload.clientId);

      return { success: true };
    }),
});

/**
 * Billing router for invoicing
 */
export const billingRouter = router({
  // Admin: Generate invoice for a client
  generateInvoice: publicProcedure
    .input(z.object({
      token: z.string(),
      clientId: z.number(),
      periodStart: z.string(), // ISO date
      periodEnd: z.string(), // ISO date
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const invoiceId = await generateInvoiceForClient(
        input.clientId,
        new Date(input.periodStart),
        new Date(input.periodEnd)
      );

      if (!invoiceId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No shipments found for this period' });
      }

      return { invoiceId };
    }),

  // Admin: Get all invoices
  getAllInvoices: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      return await getAllInvoices();
    }),

  // Customer: Get my invoices
  getMyInvoices: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      return await getInvoicesByClient(payload.clientId);
    }),

  // Get invoice details with items
  getInvoiceDetails: publicProcedure
    .input(z.object({
      token: z.string(),
      invoiceId: z.number(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
      }

      const invoice = await getInvoiceById(input.invoiceId);
      if (!invoice) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
      }

      // Check access: admin can see all, customer can only see their own
      if (payload.role === 'customer' && invoice.clientId !== payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const items = await getInvoiceItems(input.invoiceId);

      return {
        invoice,
        items,
      };
    }),

  // Admin: Update invoice status
  updateInvoiceStatus: publicProcedure
    .input(z.object({
      token: z.string(),
      invoiceId: z.number(),
      status: z.enum(['pending', 'paid', 'overdue']),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      await updateInvoiceStatus(input.invoiceId, input.status);

      return { success: true };
    }),

  // Admin: Update invoice details
  updateInvoice: publicProcedure
    .input(z.object({
      token: z.string(),
      invoiceId: z.number(),
      data: z.object({
        subtotal: z.string().optional(),
        taxes: z.string().optional(),
        total: z.string().optional(),
        amountPaid: z.string().optional(),
        balance: z.string().optional(),
        status: z.enum(['pending', 'paid', 'overdue']).optional(),
        notes: z.string().optional(),
        adjustmentNotes: z.string().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      // Mark as adjusted if there are adjustment notes
      const updateData: any = { ...input.data };
      if (input.data.adjustmentNotes) {
        updateData.isAdjusted = 1;
        updateData.lastAdjustedBy = payload.userId;
        updateData.lastAdjustedAt = new Date();
      }

      await updateInvoice(input.invoiceId, updateData);

      return { success: true };
    }),
});

/**
 * COD (Cash on Delivery) router
 */
const codRouter = router({
  // Admin: Get all COD records
  getAllCODRecords: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      return await getAllCODRecords();
    }),

  // Admin: Get COD summary
  getCODSummary: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      return await getCODSummaryGlobal();
    }),

  // Admin: Get pending COD for a client
  getPendingCODByClient: publicProcedure
    .input(z.object({
      token: z.string(),
      clientId: z.number(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      return await getPendingCODByClient(input.clientId);
    }),

  // Admin: Update COD record status
  updateCODStatus: publicProcedure
    .input(z.object({
      token: z.string(),
      codRecordId: z.number(),
      status: z.enum(['pending_collection', 'collected', 'remitted', 'disputed']),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const db = await import('./db').then(m => m.getDb());
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const { codRecords } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      // Update status and collectedDate if status is 'collected'
      const updateData: any = {
        status: input.status,
      };

      if (input.status === 'collected') {
        updateData.collectedDate = new Date();
      }

      await db.update(codRecords)
        .set(updateData)
        .where(eq(codRecords.id, input.codRecordId));

      return { success: true };
    }),

  // Admin: Create COD remittance
  createRemittance: publicProcedure
    .input(z.object({
      token: z.string(),
      clientId: z.number(),
      codRecordIds: z.array(z.number()),
      paymentMethod: z.string().optional(),
      paymentReference: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin' || !payload.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      // Calculate total amount
      const codRecords = await getPendingCODByClient(input.clientId);
      const selectedRecords = codRecords.filter(r => input.codRecordIds.includes(r.id));

      if (selectedRecords.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No valid COD records selected' });
      }

      const totalAmount = selectedRecords.reduce((sum, r) => sum + parseFloat(r.codAmount), 0);
      const currency = selectedRecords[0]?.codCurrency || 'AED';

      // Generate remittance number
      const remittanceNumber = await generateRemittanceNumber();

      const remittanceId = await createCODRemittance({
        clientId: input.clientId,
        remittanceNumber,
        totalAmount: totalAmount.toFixed(2),
        currency,
        shipmentCount: selectedRecords.length,
        codRecordIds: input.codRecordIds,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
        notes: input.notes,
        createdBy: payload.userId,
      });

      return { remittanceId, remittanceNumber };
    }),

  // Admin: Get all remittances
  getAllRemittances: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      return await getAllRemittances();
    }),

  // Admin: Get remittance details
  getRemittanceDetails: publicProcedure
    .input(z.object({
      token: z.string(),
      remittanceId: z.number(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const remittance = await getRemittanceById(input.remittanceId);
      if (!remittance) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Remittance not found' });
      }

      const items = await getRemittanceItems(input.remittanceId);

      return { remittance, items };
    }),

  // Admin: Update remittance status
  updateRemittanceStatus: publicProcedure
    .input(z.object({
      token: z.string(),
      remittanceId: z.number(),
      status: z.enum(['pending', 'processed', 'completed']),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const processedDate = input.status === 'processed' || input.status === 'completed' ? new Date() : undefined;
      await updateRemittanceStatus(input.remittanceId, input.status, processedDate);

      return { success: true };
    }),

  // Customer: Get my COD records
  getMyCODRecords: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      return await getCODRecordsByClient(payload.clientId);
    }),

  // Customer: Get my COD summary
  getMyCODSummary: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      return await getCODSummaryByClient(payload.clientId);
    }),

  // Customer: Get my remittances
  getMyRemittances: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      return await getRemittancesByClient(payload.clientId);
    }),
});

// Export combined portal router
/**
 * Rate Engine Router
 */
export const rateRouter = router({
  listTiers: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
      }
      return await getAllRateTiers();
    }),

  calculate: publicProcedure
    .input(z.object({
      token: z.string(),
      clientId: z.number(),
      serviceType: z.enum(["DOM", "SDD"]),
      weight: z.number(),
      length: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const user = await verifyPortalToken(input.token);
      if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });

      const result = await calculateShipmentRate({
        clientId: input.clientId,
        serviceType: input.serviceType,
        weight: input.weight,
        length: input.length,
        width: input.width,
        height: input.height,
      });

      return result;
    }),

  calculateCOD: publicProcedure
    .input(z.object({
      token: z.string(),
      codAmount: z.number(),
      clientId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const user = await verifyPortalToken(input.token);
      if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });

      let targetClientId = 0;
      if (user.role === 'customer') {
        targetClientId = user.clientId || 0;
      } else if (input.clientId) {
        targetClientId = input.clientId;
      }

      const fee = await calculateCODFee(input.codAmount, targetClientId);
      return { fee };
    }),

  getTiers: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const user = await verifyPortalToken(input.token);
      if (!user || user.role !== 'admin') {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const tiers = await getAllRateTiers();
      return tiers;
    }),
});

export const clientsRouter = router({
  list: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      return await getAllClientAccounts();
    }),

  updateTier: publicProcedure
    .input(z.object({
      token: z.string(),
      clientId: z.number(),
      tierId: z.number().nullable(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const { getDb } = await import('./db');
      const { clientAccounts } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      await db.update(clientAccounts)
        .set({ manualRateTierId: input.tierId })
        .where(eq(clientAccounts.id, input.clientId));

      return { success: true };
    }),

  updateSettings: publicProcedure
    .input(z.object({
      token: z.string(),
      clientId: z.number(),
      codAllowed: z.boolean(),
      codFeePercent: z.string().optional(),
      codMaxFee: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const { getDb } = await import('./db');
      const { clientAccounts } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      await db.update(clientAccounts)
        .set({
          codAllowed: input.codAllowed ? 1 : 0,
          codFeePercent: input.codFeePercent || null,
          codMaxFee: input.codMaxFee || null,
        })
        .where(eq(clientAccounts.id, input.clientId));

      return { success: true };
    }),

  getWithTiers: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const user = await verifyPortalToken(input.token);
      if (!user || user.role !== 'admin') {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const db = await import('./db').then(m => m.getDb());
      if (!db) return [];

      const { clientAccounts, rateTiers } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      // Since we don't have explicit relations set up in drizzle schema for joining easily in one query
      // or we want to be safe, we'll fetch all clients and map manually or use a left join if possible.
      // Let's do a simple join assuming clientId on clientAccounts relates to rateTier via manualRateTierId

      // actually, manualRateTierId is on clientAccounts. 
      // We want to return clients grouped by their rate tier? Or just clients with their tier info.
      // The user wants to see clients UNDER the rate they are assigned to.
      // So we need clients, and we need to know their tier.

      /* 
         We need to join clientAccounts with rateTiers.
         However, clients might be on 'automatic' tier assignment (manualRateTierId is null).
         For now, let's just return all clients, and on the frontend we can map them to the tiers.
      */

      return await getAllClientAccounts();
    }),
});

/**
 * Public Tracking Router (no auth required)
 */
export const publicTrackingRouter = router({
  track: publicProcedure
    .input(z.object({
      waybillNumber: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const order = await getOrderByWaybill(input.waybillNumber);
      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Shipment not found' });
      }

      const trackingEvents = await getTrackingEventsByShipmentId(order.id);

      return {
        order: {
          waybillNumber: order.waybillNumber,
          status: order.status,
          serviceType: order.serviceType,
          weight: order.weight,
          pieces: order.pieces,
          customerName: order.customerName,
          city: order.city,
          destinationCountry: order.destinationCountry,
          createdAt: order.createdAt,
          lastStatusUpdate: order.lastStatusUpdate,
        },
        trackingEvents,
      };
    }),
});

const trackingRouter = router({
  addEvent: publicProcedure
    .input(z.object({
      token: z.string(),
      shipmentId: z.number(),
      eventDatetime: z.string(),
      location: z.string().optional(),
      statusCode: z.string(),
      statusLabel: z.string(),
      description: z.string().optional(),
      podFileUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      await createTrackingEvent({
        shipmentId: input.shipmentId,
        eventDatetime: new Date(input.eventDatetime),
        location: input.location,
        statusCode: input.statusCode,
        statusLabel: input.statusLabel,
        description: input.description,
        podFileUrl: input.podFileUrl,
        createdBy: payload.email || 'admin',
      });

      // Update order status
      await updateOrderStatus(input.shipmentId, input.statusCode);

      return { success: true };
    }),

  getEvents: publicProcedure
    .input(z.object({ shipmentId: z.number() }))
    .query(async ({ input }) => {
      return getTrackingEventsByShipmentId(input.shipmentId);
    }),
});

export const portalRouter = router({
  auth: portalAuthRouter,
  admin: adminPortalRouter,
  customer: customerPortalRouter,
  billing: billingRouter,
  cod: codRouter,
  rates: rateRouter,
  clients: clientsRouter,
  publicTracking: publicTrackingRouter,
  tracking: trackingRouter,
});
