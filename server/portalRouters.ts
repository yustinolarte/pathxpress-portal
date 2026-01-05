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

  // Change password (user can change their own password)
  changePassword: publicProcedure
    .input(z.object({
      token: z.string(),
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        });
      }

      // Get user
      const user = await getPortalUserByEmail(payload.email);
      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Verify current password
      const isValid = await comparePassword(input.currentPassword, user.passwordHash);
      if (!isValid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Current password is incorrect',
        });
      }

      // Validate new password
      if (!validatePassword(input.newPassword)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'New password does not meet requirements',
        });
      }

      // Hash and update password
      const newHash = await hashPassword(input.newPassword);
      const { updatePortalUserPassword } = await import('./db');
      await updatePortalUserPassword(user.id, newHash);

      return { success: true, message: 'Password changed successfully' };
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
      const result = await deleteClientAccount(input.clientId);

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error || 'Failed to delete client',
        });
      }

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

  // Update user password (for existing customer users)
  updateUserPassword: publicProcedure
    .input(z.object({
      token: z.string(),
      clientId: z.number(),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      // Validate password
      const passwordValidation = validatePassword(input.newPassword);
      if (!passwordValidation.valid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: passwordValidation.error || 'Invalid password' });
      }

      // Find user by clientId
      const db = await import('./db').then(m => m.getDb());
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const { portalUsers } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      const users = await db.select().from(portalUsers).where(eq(portalUsers.clientId, input.clientId));
      if (users.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No user found for this client' });
      }

      // Hash new password and update
      const passwordHash = await hashPassword(input.newPassword);
      await db.update(portalUsers)
        .set({ passwordHash })
        .where(eq(portalUsers.clientId, input.clientId));

      return { success: true };
    }),

  // Update client notes
  updateClientNotes: publicProcedure
    .input(z.object({
      token: z.string(),
      clientId: z.number(),
      notes: z.string(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const updated = await updateClientAccount(input.clientId, { notes: input.notes });
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });
      }

      return { success: true };
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

  // Delete order (admin only)
  deleteOrder: publicProcedure
    .input(z.object({
      token: z.string(),
      orderId: z.number(),
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

      const { orders, trackingEvents, codRecords, invoiceItems } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      try {
        // Delete related tracking events first
        await db.delete(trackingEvents).where(eq(trackingEvents.shipmentId, input.orderId));

        // Delete related COD records
        await db.delete(codRecords).where(eq(codRecords.shipmentId, input.orderId));

        // Delete related invoice items
        await db.delete(invoiceItems).where(eq(invoiceItems.shipmentId, input.orderId));

        // Finally delete the order
        await db.delete(orders).where(eq(orders.id, input.orderId));

        return { success: true };
      } catch (error) {
        console.error('[Database] Failed to delete order:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete order' });
      }
    }),

  // Create return shipment (admin only)
  createReturn: publicProcedure
    .input(z.object({
      token: z.string(),
      orderId: z.number(),
      chargeReturn: z.boolean().default(true),
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

      // Get original order
      const originalOrder = await getOrderById(input.orderId);
      if (!originalOrder) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Original order not found' });
      }

      // Check if order status allows return
      const allowedStatuses = ['failed_delivery', 'returned', 'exchange'];
      if (!allowedStatuses.includes(originalOrder.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot create return for order with status "${originalOrder.status}". Only failed_delivery, returned, or exchange orders can have returns.`
        });
      }

      // Check if return already exists for this order
      const { orders: ordersTable } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const existingReturns = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.originalOrderId, input.orderId));

      if (existingReturns.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `A return shipment already exists for this order (${existingReturns[0].waybillNumber})`
        });
      }

      // Generate new waybill number for return
      const returnWaybill = await generateWaybillNumber();

      // Create return order with swapped shipper/consignee
      const returnOrder = await createOrder({
        clientId: originalOrder.clientId,
        orderNumber: `RTN-${originalOrder.orderNumber || originalOrder.waybillNumber}`,
        waybillNumber: returnWaybill,

        // Swap shipper and consignee for return
        shipperName: originalOrder.customerName, // Original consignee becomes shipper
        shipperAddress: originalOrder.address,
        shipperCity: originalOrder.city,
        shipperCountry: originalOrder.destinationCountry,
        shipperPhone: originalOrder.customerPhone,

        customerName: originalOrder.shipperName, // Original shipper becomes consignee
        customerPhone: originalOrder.shipperPhone,
        address: originalOrder.shipperAddress,
        city: originalOrder.shipperCity,
        destinationCountry: originalOrder.shipperCountry,

        // Same package details
        pieces: originalOrder.pieces,
        weight: originalOrder.weight,
        length: originalOrder.length || null,
        width: originalOrder.width || null,
        height: originalOrder.height || null,
        serviceType: originalOrder.serviceType,
        specialInstructions: `RETURN SHIPMENT - Original: ${originalOrder.waybillNumber}`,

        // No COD on returns
        codRequired: 0,
        codAmount: null,
        codCurrency: null,

        // Return fields
        isReturn: 1,
        originalOrderId: input.orderId,
        returnCharged: input.chargeReturn ? 1 : 0,

        status: 'pending_pickup',
        lastStatusUpdate: new Date(),
      });

      if (!returnOrder) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create return shipment' });
      }

      // Create initial tracking event for return
      await createTrackingEvent({
        shipmentId: returnOrder.id,
        eventDatetime: new Date(),
        statusCode: 'pending_pickup',
        statusLabel: 'RETURN PENDING PICKUP',
        description: `Return shipment created for order ${originalOrder.waybillNumber}`,
        createdBy: payload.email || 'admin',
      });

      return {
        success: true,
        returnOrder,
        message: `Return shipment ${returnWaybill} created successfully`
      };
    }),

  // Get dashboard analytics
  getAnalytics: publicProcedure
    .input(z.object({
      token: z.string(),
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

      const { orders } = await import('../drizzle/schema');
      const { sql, gte, and, eq } = await import('drizzle-orm');

      // Get today and date ranges
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

      // 1. Shipments per day (last 30 days)
      const last30Days = new Date(now);
      last30Days.setDate(now.getDate() - 30);

      const shipmentsPerDay = await db
        .select({
          date: sql<string>`DATE(${orders.createdAt})`,
          count: sql<number>`cast(count(*) as unsigned)`,
        })
        .from(orders)
        .where(gte(orders.createdAt, last30Days))
        .groupBy(sql`DATE(${orders.createdAt})`)
        .orderBy(sql`DATE(${orders.createdAt})`);

      // 2. Shipments this week
      const shipmentsThisWeek = await db
        .select({ count: sql<number>`cast(count(*) as unsigned)` })
        .from(orders)
        .where(gte(orders.createdAt, startOfWeek));

      // 3. Shipments this month
      const shipmentsThisMonth = await db
        .select({ count: sql<number>`cast(count(*) as unsigned)` })
        .from(orders)
        .where(gte(orders.createdAt, startOfMonth));

      // 4. Shipments last month (for comparison)
      const shipmentsLastMonth = await db
        .select({ count: sql<number>`cast(count(*) as unsigned)` })
        .from(orders)
        .where(and(
          gte(orders.createdAt, startOfLastMonth),
          sql`${orders.createdAt} <= ${endOfLastMonth}`
        ));

      // 5. Monthly comparison (last 6 months)
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const monthlyComparison = await db
        .select({
          month: sql<string>`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`,
          count: sql<number>`cast(count(*) as unsigned)`,
        })
        .from(orders)
        .where(gte(orders.createdAt, sixMonthsAgo))
        .groupBy(sql`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`)
        .orderBy(sql`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`);

      // 6. Distribution by city (pie chart data)
      const distributionByCity = await db
        .select({
          city: orders.city,
          count: sql<number>`cast(count(*) as unsigned)`,
        })
        .from(orders)
        .groupBy(orders.city)
        .orderBy(sql`count(*) desc`)
        .limit(10);

      // 7. Average delivery time by route (top 10 routes)
      const deliveryTimeByRoute = await db
        .select({
          route: sql<string>`concat(${orders.shipperCity}, ' → ', ${orders.city})`,
          avgHours: sql<number>`AVG(TIMESTAMPDIFF(HOUR, ${orders.createdAt}, ${orders.deliveryDateReal}))`,
          count: sql<number>`cast(count(*) as unsigned)`,
        })
        .from(orders)
        .where(and(
          eq(orders.status, 'delivered'),
          sql`${orders.deliveryDateReal} IS NOT NULL`
        ))
        .groupBy(sql`concat(${orders.shipperCity}, ' → ', ${orders.city})`)
        .orderBy(sql`count(*) desc`)
        .limit(10);

      // 8. Status distribution
      const statusDistribution = await db
        .select({
          status: orders.status,
          count: sql<number>`cast(count(*) as unsigned)`,
        })
        .from(orders)
        .groupBy(orders.status);

      // 9. Today's shipments
      const shipmentsToday = await db
        .select({ count: sql<number>`cast(count(*) as unsigned)` })
        .from(orders)
        .where(gte(orders.createdAt, startOfToday));

      // Calculate month-over-month growth
      const currentMonthCount = Number(shipmentsThisMonth[0]?.count || 0);
      const lastMonthCount = Number(shipmentsLastMonth[0]?.count || 0);
      const growthPercentage = lastMonthCount > 0
        ? Math.round(((currentMonthCount - lastMonthCount) / lastMonthCount) * 100)
        : 0;

      return {
        shipmentsToday: Number(shipmentsToday[0]?.count || 0),
        shipmentsThisWeek: Number(shipmentsThisWeek[0]?.count || 0),
        shipmentsThisMonth: currentMonthCount,
        shipmentsLastMonth: lastMonthCount,
        growthPercentage,
        shipmentsPerDay: shipmentsPerDay.map(d => ({
          date: d.date,
          count: Number(d.count),
        })),
        monthlyComparison: monthlyComparison.map(m => ({
          month: m.month,
          count: Number(m.count),
        })),
        distributionByCity: distributionByCity.map(c => ({
          city: c.city,
          count: Number(c.count),
        })),
        deliveryTimeByRoute: deliveryTimeByRoute.map(r => ({
          route: r.route,
          avgHours: Math.round(Number(r.avgHours) || 0),
          count: Number(r.count),
        })),
        statusDistribution: statusDistribution.map(s => ({
          status: s.status,
          count: Number(s.count),
        })),
      };
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

      const orders = await getOrdersByClientId(payload.clientId);

      // Get client's hideShipperAddress setting
      const client = await getClientAccountById(payload.clientId);
      const hideShipperAddress = client?.hideShipperAddress || 0;

      // Add hideShipperAddress to each order for waybill generation
      return orders.map(order => ({
        ...order,
        hideShipperAddress,
      }));
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

  // Cancel order (customer can only cancel pending_pickup orders)
  cancelOrder: publicProcedure
    .input(z.object({
      token: z.string(),
      orderId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      // Get the order
      const order = await getOrderById(input.orderId);
      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      // Check if order belongs to this customer
      if (order.clientId !== payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You cannot cancel this order' });
      }

      // Only allow cancellation if status is pending_pickup
      if (order.status !== 'pending_pickup') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Orders can only be canceled when status is "Pending Pickup". Once picked up, cancellation is not possible.'
        });
      }

      // Update order status to canceled
      const db = await import('./db').then(m => m.getDb());
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const { orders } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      await db.update(orders)
        .set({
          status: 'canceled',
          lastStatusUpdate: new Date(),
        })
        .where(eq(orders.id, input.orderId));

      // Create tracking event for cancellation
      await createTrackingEvent({
        shipmentId: input.orderId,
        eventDatetime: new Date(),
        statusCode: 'canceled',
        statusLabel: 'CANCELED',
        description: 'Order canceled by customer',
        createdBy: payload.email || 'customer',
      });

      return { success: true, message: 'Order canceled successfully' };
    }),

  // Get customer's returns and exchanges
  getMyReturnsExchanges: publicProcedure
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

      const { orders } = await import('../drizzle/schema');
      const { eq, and, or, desc } = await import('drizzle-orm');

      // Get all returns and exchanges for this client
      const returnsExchanges = await db
        .select()
        .from(orders)
        .where(and(
          eq(orders.clientId, payload.clientId),
          or(
            eq(orders.orderType, 'return'),
            eq(orders.orderType, 'exchange')
          )
        ))
        .orderBy(desc(orders.createdAt));

      // Get original waybill numbers
      const result = await Promise.all(returnsExchanges.map(async (order) => {
        let originalWaybill = null;
        if (order.originalOrderId) {
          const original = await getOrderById(order.originalOrderId);
          originalWaybill = original?.waybillNumber;
        }
        return { ...order, originalWaybill };
      }));

      return result;
    }),

  // Search order for return/exchange
  searchOrderForReturn: publicProcedure
    .input(z.object({
      token: z.string(),
      waybillNumber: z.string(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      const order = await getOrderByWaybill(input.waybillNumber);
      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found with this waybill number' });
      }

      if (order.clientId !== payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'This order does not belong to your account' });
      }

      // Only allow returns from delivered or failed_delivery orders
      const allowedStatuses = ['delivered', 'failed_delivery'];
      if (!allowedStatuses.includes(order.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Returns/exchanges can only be created from orders with status "Delivered" or "Failed Delivery". Current status: ${order.status.replace(/_/g, ' ')}`
        });
      }

      return order;
    }),

  // Create return request
  createReturnRequest: publicProcedure
    .input(z.object({
      token: z.string(),
      orderId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      const originalOrder = await getOrderById(input.orderId);
      if (!originalOrder || originalOrder.clientId !== payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Order not found or access denied' });
      }

      // Generate waybill for return
      const returnWaybill = await generateWaybillNumber();

      // Create return order (swap shipper/consignee)
      const returnOrder = await createOrder({
        clientId: payload.clientId,
        orderNumber: `RTN-${originalOrder.waybillNumber}`,
        waybillNumber: returnWaybill,

        // Swap: consignee becomes shipper
        shipperName: originalOrder.customerName,
        shipperAddress: originalOrder.address,
        shipperCity: originalOrder.city,
        shipperCountry: originalOrder.destinationCountry,
        shipperPhone: originalOrder.customerPhone,

        // Swap: shipper becomes consignee
        customerName: originalOrder.shipperName,
        customerPhone: originalOrder.shipperPhone,
        address: originalOrder.shipperAddress,
        city: originalOrder.shipperCity,
        destinationCountry: originalOrder.shipperCountry,

        pieces: originalOrder.pieces,
        weight: originalOrder.weight,
        serviceType: originalOrder.serviceType,
        specialInstructions: `RETURN - Original order: ${originalOrder.waybillNumber}`,

        codRequired: 0,

        isReturn: 1,
        originalOrderId: input.orderId,
        returnCharged: 1,
        orderType: 'return',

        status: 'pending_pickup',
        lastStatusUpdate: new Date(),
      });

      if (!returnOrder) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create return' });
      }

      // Create tracking event
      await createTrackingEvent({
        shipmentId: returnOrder.id,
        eventDatetime: new Date(),
        statusCode: 'pending_pickup',
        statusLabel: 'RETURN PENDING PICKUP',
        description: `Return shipment created for ${originalOrder.waybillNumber}`,
        createdBy: payload.email || 'customer',
      });

      return { success: true, message: `Return ${returnWaybill} created successfully`, returnOrder };
    }),

  // Create exchange request (return + new shipment)
  createExchangeRequest: publicProcedure
    .input(z.object({
      token: z.string(),
      orderId: z.number(),
      newShipment: z.object({
        customerName: z.string(),
        customerPhone: z.string(),
        address: z.string(),
        city: z.string(),
        destinationCountry: z.string().default('UAE'),
        pieces: z.number().default(1),
        weight: z.number().default(0.5),
        serviceType: z.string().default('DOM'),
        specialInstructions: z.string().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      const originalOrder = await getOrderById(input.orderId);
      if (!originalOrder || originalOrder.clientId !== payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Order not found or access denied' });
      }

      // Get client account for shipper info
      const clientAccount = await getClientAccountById(payload.clientId);
      if (!clientAccount) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Client account not found' });
      }

      // 1. Create return waybill
      const returnWaybill = await generateWaybillNumber();
      const returnOrder = await createOrder({
        clientId: payload.clientId,
        orderNumber: `EXC-RTN-${originalOrder.waybillNumber}`,
        waybillNumber: returnWaybill,

        shipperName: originalOrder.customerName,
        shipperAddress: originalOrder.address,
        shipperCity: originalOrder.city,
        shipperCountry: originalOrder.destinationCountry,
        shipperPhone: originalOrder.customerPhone,

        customerName: originalOrder.shipperName,
        customerPhone: originalOrder.shipperPhone,
        address: originalOrder.shipperAddress,
        city: originalOrder.shipperCity,
        destinationCountry: originalOrder.shipperCountry,

        pieces: originalOrder.pieces,
        weight: originalOrder.weight,
        serviceType: originalOrder.serviceType,
        specialInstructions: `EXCHANGE RETURN - Original: ${originalOrder.waybillNumber}`,

        codRequired: 0,
        isReturn: 1,
        originalOrderId: input.orderId,
        returnCharged: 1,
        orderType: 'exchange',

        status: 'pending_pickup',
        lastStatusUpdate: new Date(),
      });

      if (!returnOrder) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create return for exchange' });
      }

      // 2. Create new shipment waybill
      const newWaybill = await generateWaybillNumber();
      const newOrder = await createOrder({
        clientId: payload.clientId,
        orderNumber: `EXC-NEW-${originalOrder.waybillNumber}`,
        waybillNumber: newWaybill,

        // Shipper is the client
        shipperName: clientAccount.companyName,
        shipperAddress: clientAccount.billingAddress || '',
        shipperCity: clientAccount.city || 'Dubai',
        shipperCountry: clientAccount.country || 'UAE',
        shipperPhone: clientAccount.phone || '',

        // Consignee from input
        customerName: input.newShipment.customerName,
        customerPhone: input.newShipment.customerPhone,
        address: input.newShipment.address,
        city: input.newShipment.city,
        destinationCountry: input.newShipment.destinationCountry,

        pieces: input.newShipment.pieces,
        weight: input.newShipment.weight.toString(),
        serviceType: input.newShipment.serviceType,
        specialInstructions: input.newShipment.specialInstructions || `EXCHANGE NEW - Original: ${originalOrder.waybillNumber}`,

        codRequired: 0,
        isReturn: 0,
        originalOrderId: input.orderId,
        orderType: 'exchange',
        exchangeOrderId: returnOrder.id,

        status: 'pending_pickup',
        lastStatusUpdate: new Date(),
      });

      if (!newOrder) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create new shipment for exchange' });
      }

      // Update return order with exchange link
      const db = await import('./db').then(m => m.getDb());
      const { orders } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      await db!.update(orders).set({ exchangeOrderId: newOrder.id }).where(eq(orders.id, returnOrder.id));

      // Create tracking events
      await createTrackingEvent({
        shipmentId: returnOrder.id,
        eventDatetime: new Date(),
        statusCode: 'pending_pickup',
        statusLabel: 'EXCHANGE RETURN PENDING',
        description: `Exchange return created for ${originalOrder.waybillNumber}`,
        createdBy: payload.email || 'customer',
      });

      await createTrackingEvent({
        shipmentId: newOrder.id,
        eventDatetime: new Date(),
        statusCode: 'pending_pickup',
        statusLabel: 'EXCHANGE NEW SHIPMENT PENDING',
        description: `Exchange new shipment for ${originalOrder.waybillNumber}`,
        createdBy: payload.email || 'customer',
      });

      return {
        success: true,
        message: `Exchange created! Return: ${returnWaybill}, New: ${newWaybill}`,
        returnOrder,
        newOrder,
      };
    }),

  // Create manual return/exchange (without existing waybill)
  createManualReturnExchange: publicProcedure
    .input(z.object({
      token: z.string(),
      type: z.enum(['return', 'exchange']),
      pickupName: z.string(),
      pickupPhone: z.string(),
      pickupAddress: z.string(),
      pickupCity: z.string(),
      pickupCountry: z.string().default('UAE'),
      deliveryName: z.string(),
      deliveryPhone: z.string(),
      deliveryAddress: z.string(),
      deliveryCity: z.string(),
      deliveryCountry: z.string().default('UAE'),
      pieces: z.number().default(1),
      weight: z.number().default(0.5),
      serviceType: z.string().default('DOM'),
      specialInstructions: z.string().optional(),
      // For exchange
      exchangeCustomerName: z.string().optional(),
      exchangeCustomerPhone: z.string().optional(),
      exchangeAddress: z.string().optional(),
      exchangeCity: z.string().optional(),
      exchangePieces: z.number().default(1),
      exchangeWeight: z.number().default(0.5),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      const clientAccount = await getClientAccountById(payload.clientId);
      if (!clientAccount) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Client account not found' });
      }

      // Create return/pickup waybill
      const returnWaybill = await generateWaybillNumber();
      const returnOrder = await createOrder({
        clientId: payload.clientId,
        orderNumber: input.type === 'return' ? `RTN-MANUAL` : `EXC-RTN-MANUAL`,
        waybillNumber: returnWaybill,

        shipperName: input.pickupName,
        shipperAddress: input.pickupAddress,
        shipperCity: input.pickupCity,
        shipperCountry: input.pickupCountry,
        shipperPhone: input.pickupPhone,

        customerName: input.deliveryName,
        customerPhone: input.deliveryPhone,
        address: input.deliveryAddress,
        city: input.deliveryCity,
        destinationCountry: input.deliveryCountry,

        pieces: input.pieces,
        weight: input.weight.toString(),
        serviceType: input.serviceType,
        specialInstructions: input.specialInstructions || `${input.type.toUpperCase()} - Manual creation`,

        codRequired: 0,
        isReturn: 1,
        returnCharged: 1,
        orderType: input.type,

        status: 'pending_pickup',
        lastStatusUpdate: new Date(),
      });

      if (!returnOrder) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create order' });
      }

      // Create tracking event
      await createTrackingEvent({
        shipmentId: returnOrder.id,
        eventDatetime: new Date(),
        statusCode: 'pending_pickup',
        statusLabel: `${input.type.toUpperCase()} PENDING PICKUP`,
        description: 'Manual return/exchange created',
        createdBy: payload.email || 'customer',
      });

      let newOrder = null;

      // If exchange, create new shipment
      if (input.type === 'exchange' && input.exchangeCustomerName && input.exchangeAddress && input.exchangeCity) {
        const newWaybill = await generateWaybillNumber();
        newOrder = await createOrder({
          clientId: payload.clientId,
          orderNumber: `EXC-NEW-MANUAL`,
          waybillNumber: newWaybill,

          shipperName: clientAccount.companyName,
          shipperAddress: clientAccount.billingAddress || '',
          shipperCity: clientAccount.city || 'Dubai',
          shipperCountry: clientAccount.country || 'UAE',
          shipperPhone: clientAccount.phone || '',

          customerName: input.exchangeCustomerName,
          customerPhone: input.exchangeCustomerPhone || '',
          address: input.exchangeAddress,
          city: input.exchangeCity,
          destinationCountry: input.deliveryCountry,

          pieces: input.exchangePieces,
          weight: input.exchangeWeight.toString(),
          serviceType: input.serviceType,
          specialInstructions: 'EXCHANGE NEW - Manual creation',

          codRequired: 0,
          isReturn: 0,
          orderType: 'exchange',
          exchangeOrderId: returnOrder.id,

          status: 'pending_pickup',
          lastStatusUpdate: new Date(),
        });

        if (newOrder) {
          // Link return to new order
          const db = await import('./db').then(m => m.getDb());
          const { orders } = await import('../drizzle/schema');
          const { eq } = await import('drizzle-orm');
          await db!.update(orders).set({ exchangeOrderId: newOrder.id }).where(eq(orders.id, returnOrder.id));

          await createTrackingEvent({
            shipmentId: newOrder.id,
            eventDatetime: new Date(),
            statusCode: 'pending_pickup',
            statusLabel: 'EXCHANGE NEW SHIPMENT PENDING',
            description: 'Manual exchange new shipment created',
            createdBy: payload.email || 'customer',
          });
        }
      }

      return {
        success: true,
        message: input.type === 'exchange' && newOrder
          ? `Exchange created! Return: ${returnWaybill}, New: ${newOrder.waybillNumber}`
          : `Return ${returnWaybill} created successfully`,
        returnOrder,
        newOrder,
      };
    }),

  // Get customer analytics
  getMyAnalytics: publicProcedure
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
      const { sql, gte, and, eq } = await import('drizzle-orm');

      const clientId = payload.clientId;
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

      // 1. Shipments per day (last 30 days)
      const last30Days = new Date(now);
      last30Days.setDate(now.getDate() - 30);

      const shipmentsPerDay = await db
        .select({
          date: sql<string>`DATE(${orders.createdAt})`,
          count: sql<number>`cast(count(*) as unsigned)`,
        })
        .from(orders)
        .where(and(
          eq(orders.clientId, clientId),
          gte(orders.createdAt, last30Days)
        ))
        .groupBy(sql`DATE(${orders.createdAt})`)
        .orderBy(sql`DATE(${orders.createdAt})`);

      // 2. Shipments today
      const shipmentsToday = await db
        .select({ count: sql<number>`cast(count(*) as unsigned)` })
        .from(orders)
        .where(and(
          eq(orders.clientId, clientId),
          gte(orders.createdAt, startOfToday)
        ));

      // 3. Shipments this week
      const shipmentsThisWeek = await db
        .select({ count: sql<number>`cast(count(*) as unsigned)` })
        .from(orders)
        .where(and(
          eq(orders.clientId, clientId),
          gte(orders.createdAt, startOfWeek)
        ));

      // 4. Shipments this month
      const shipmentsThisMonth = await db
        .select({ count: sql<number>`cast(count(*) as unsigned)` })
        .from(orders)
        .where(and(
          eq(orders.clientId, clientId),
          gte(orders.createdAt, startOfMonth)
        ));

      // 5. Shipments last month
      const shipmentsLastMonth = await db
        .select({ count: sql<number>`cast(count(*) as unsigned)` })
        .from(orders)
        .where(and(
          eq(orders.clientId, clientId),
          gte(orders.createdAt, startOfLastMonth),
          sql`${orders.createdAt} <= ${endOfLastMonth}`
        ));

      // 6. Monthly comparison (last 6 months)
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const monthlyComparison = await db
        .select({
          month: sql<string>`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`,
          count: sql<number>`cast(count(*) as unsigned)`,
        })
        .from(orders)
        .where(and(
          eq(orders.clientId, clientId),
          gte(orders.createdAt, sixMonthsAgo)
        ))
        .groupBy(sql`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`)
        .orderBy(sql`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`);

      // 7. Distribution by city
      const distributionByCity = await db
        .select({
          city: orders.city,
          count: sql<number>`cast(count(*) as unsigned)`,
        })
        .from(orders)
        .where(eq(orders.clientId, clientId))
        .groupBy(orders.city)
        .orderBy(sql`count(*) desc`)
        .limit(10);

      // 8. Status distribution
      const statusDistribution = await db
        .select({
          status: orders.status,
          count: sql<number>`cast(count(*) as unsigned)`,
        })
        .from(orders)
        .where(eq(orders.clientId, clientId))
        .groupBy(orders.status);

      // 9. Average delivery time by route
      const deliveryTimeByRoute = await db
        .select({
          route: sql<string>`concat(${orders.shipperCity}, ' → ', ${orders.city})`,
          avgHours: sql<number>`AVG(TIMESTAMPDIFF(HOUR, ${orders.createdAt}, ${orders.deliveryDateReal}))`,
          count: sql<number>`cast(count(*) as unsigned)`,
        })
        .from(orders)
        .where(and(
          eq(orders.clientId, clientId),
          eq(orders.status, 'delivered'),
          sql`${orders.deliveryDateReal} IS NOT NULL`
        ))
        .groupBy(sql`concat(${orders.shipperCity}, ' → ', ${orders.city})`)
        .orderBy(sql`count(*) desc`)
        .limit(10);

      // 10. Total COD collected
      const totalCOD = await db
        .select({
          pending: sql<number>`cast(sum(case when ${codRecords.status} = 'pending_collection' then cast(${codRecords.codAmount} as decimal(10,2)) else 0 end) as decimal(10,2))`,
          collected: sql<number>`cast(sum(case when ${codRecords.status} = 'collected' then cast(${codRecords.codAmount} as decimal(10,2)) else 0 end) as decimal(10,2))`,
          remitted: sql<number>`cast(sum(case when ${codRecords.status} = 'remitted' then cast(${codRecords.codAmount} as decimal(10,2)) else 0 end) as decimal(10,2))`,
        })
        .from(codRecords)
        .innerJoin(orders, eq(orders.id, codRecords.shipmentId))
        .where(eq(orders.clientId, clientId));

      // Calculate growth
      const currentMonthCount = Number(shipmentsThisMonth[0]?.count || 0);
      const lastMonthCount = Number(shipmentsLastMonth[0]?.count || 0);
      const growthPercentage = lastMonthCount > 0
        ? Math.round(((currentMonthCount - lastMonthCount) / lastMonthCount) * 100)
        : 0;

      // Delivery success rate
      const deliveredCount = statusDistribution.find(s => s.status === 'delivered')?.count || 0;
      const totalCount = statusDistribution.reduce((sum, s) => sum + Number(s.count), 0);
      const deliverySuccessRate = totalCount > 0 ? Math.round((Number(deliveredCount) / totalCount) * 100) : 0;

      return {
        shipmentsToday: Number(shipmentsToday[0]?.count || 0),
        shipmentsThisWeek: Number(shipmentsThisWeek[0]?.count || 0),
        shipmentsThisMonth: currentMonthCount,
        shipmentsLastMonth: lastMonthCount,
        growthPercentage,
        deliverySuccessRate,
        shipmentsPerDay: shipmentsPerDay.map(d => ({
          date: d.date,
          count: Number(d.count),
        })),
        monthlyComparison: monthlyComparison.map(m => ({
          month: m.month,
          count: Number(m.count),
        })),
        distributionByCity: distributionByCity.map(c => ({
          city: c.city,
          count: Number(c.count),
        })),
        statusDistribution: statusDistribution.map(s => ({
          status: s.status,
          count: Number(s.count),
        })),
        deliveryTimeByRoute: deliveryTimeByRoute.map(r => ({
          route: r.route,
          avgHours: Math.round(Number(r.avgHours) || 0),
          count: Number(r.count),
        })),
        codSummary: {
          pending: Number(totalCOD[0]?.pending || 0).toFixed(2),
          collected: Number(totalCOD[0]?.collected || 0).toFixed(2),
          remitted: Number(totalCOD[0]?.remitted || 0).toFixed(2),
        },
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

  // Customer: Update account settings (hideShipperAddress)
  updateAccountSettings: publicProcedure
    .input(z.object({
      token: z.string(),
      hideShipperAddress: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      const updateData: Record<string, number> = {};
      if (input.hideShipperAddress !== undefined) {
        updateData.hideShipperAddress = input.hideShipperAddress;
      }

      if (Object.keys(updateData).length === 0) {
        return { success: true };
      }

      const result = await updateClientAccount(payload.clientId, updateData);
      if (!result) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update settings' });
      }

      return { success: true };
    }),
});

/**
 * Billing router for invoicing
 */
export const billingRouter = router({
  // Admin: Get billable shipments for a client in a period
  getBillableShipments: publicProcedure
    .input(z.object({
      token: z.string(),
      clientId: z.number(),
      periodStart: z.string(),
      periodEnd: z.string(),
    }))
    .query(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const { getBillableShipments } = await import('./db');
      return await getBillableShipments(
        input.clientId,
        new Date(input.periodStart),
        new Date(input.periodEnd)
      );
    }),

  // Admin: Generate invoice for a client
  generateInvoice: publicProcedure
    .input(z.object({
      token: z.string(),
      clientId: z.number(),
      periodStart: z.string(), // ISO date
      periodEnd: z.string(), // ISO date
      shipmentIds: z.array(z.number()).optional(), // Optional list of specific shipments to invoice
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const { generateInvoiceForClient } = await import('./db');
      const invoiceId = await generateInvoiceForClient(
        input.clientId,
        new Date(input.periodStart),
        new Date(input.periodEnd),
        input.shipmentIds
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

  // Customer: Update account settings (hideShipperAddress)
  updateAccountSettings: publicProcedure
    .input(z.object({
      token: z.string(),
      hideShipperAddress: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ input }) => {
      const payload = verifyPortalToken(input.token);
      if (!payload || payload.role !== 'customer' || !payload.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
      }

      const { updateClientAccount } = await import('./db');

      const updateData: any = {};
      if (input.hideShipperAddress !== undefined) {
        updateData.hideShipperAddress = input.hideShipperAddress;
      }

      if (Object.keys(updateData).length === 0) {
        return { success: true };
      }

      const result = await updateClientAccount(payload.clientId, updateData);
      if (!result) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update settings' });
      }

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

      const grossAmount = selectedRecords.reduce((sum, r) => sum + parseFloat(r.codAmount), 0);
      const currency = selectedRecords[0]?.codCurrency || 'AED';

      // Calculate COD fee for each record and sum up
      let totalFee = 0;
      for (const record of selectedRecords) {
        const recordAmount = parseFloat(record.codAmount);
        const fee = await calculateCODFee(recordAmount, input.clientId);
        totalFee += fee;
      }

      // Get fee percentage from client settings
      const client = await getClientAccountById(input.clientId);
      const feePercentage = client?.codFeePercent || '3.3';

      // Net amount after fee deduction
      const netAmount = grossAmount - totalFee;

      // Generate remittance number
      const remittanceNumber = await generateRemittanceNumber();

      const remittanceId = await createCODRemittance({
        clientId: input.clientId,
        remittanceNumber,
        grossAmount: grossAmount.toFixed(2),
        feeAmount: totalFee.toFixed(2),
        feePercentage: feePercentage,
        totalAmount: netAmount.toFixed(2),
        currency,
        shipmentCount: selectedRecords.length,
        codRecordIds: input.codRecordIds,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
        notes: input.notes,
        createdBy: payload.userId,
      });

      return { remittanceId, remittanceNumber, grossAmount: grossAmount.toFixed(2), feeAmount: totalFee.toFixed(2), netAmount: netAmount.toFixed(2) };
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
      if (!payload) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
      }

      const remittance = await getRemittanceById(input.remittanceId);
      if (!remittance) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Remittance not found' });
      }

      // Authorization check
      if (payload.role !== 'admin') {
        if (payload.role !== 'customer' || !payload.clientId || remittance.clientId !== payload.clientId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
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
      // Custom rates (used when tierId is null and these are provided)
      customDomBaseRate: z.string().optional(),
      customDomPerKg: z.string().optional(),
      customSddBaseRate: z.string().optional(),
      customSddPerKg: z.string().optional(),
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

      // If custom rates are provided, clear the tierId and set custom rates
      const isCustom = input.customDomBaseRate || input.customSddBaseRate;

      await db.update(clientAccounts)
        .set({
          manualRateTierId: isCustom ? null : input.tierId,
          customDomBaseRate: input.customDomBaseRate || null,
          customDomPerKg: input.customDomPerKg || null,
          customSddBaseRate: input.customSddBaseRate || null,
          customSddPerKg: input.customSddPerKg || null,
        })
        .where(eq(clientAccounts.id, input.clientId));

      return { success: true };
    }),

  updateSettings: publicProcedure
    .input(z.object({
      token: z.string(),
      clientId: z.number(),
      codAllowed: z.boolean(),
      codFeePercent: z.string().optional(),
      codMinFee: z.string().optional(),
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
          codMinFee: input.codMinFee || null,
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
