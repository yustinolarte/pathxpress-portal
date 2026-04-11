import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { publicProcedure, portalAdminProcedure, portalCustomerProcedure, portalProtectedProcedure, router } from './_core/trpc';
import { cachedQuery, cacheInvalidate } from './_core/queryCache';
import {
  hashPassword,
  comparePassword,
  generatePortalToken,
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
  createNotification,
  invalidateClientAccountsCache,
} from './db';
import { driverRouter } from './driverRouter';
import { notifyAdminNewOrder } from './_core/mailer';

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
    .mutation(async ({ input, ctx }) => {
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

      ctx.res.cookie('pathxpress_portal_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          clientId: user.clientId,
        },
      };
    }),

  // Verify token and get current user
  me: portalProtectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.portalUser) return { user: null };
      return { user: ctx.portalUser };
    }),

  // Logout
  logout: portalProtectedProcedure
    .mutation(async ({ ctx }) => {
      ctx.res.clearCookie('pathxpress_portal_token', { path: '/' });
      return { success: true };
    }),

  // Change password (user can change their own password)
  changePassword: portalProtectedProcedure
    .input(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    }))
    .mutation(async ({ input, ctx }) => {
      // Get user
      const user = await getPortalUserByEmail(ctx.portalUser.email);
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
  getClients: portalAdminProcedure
    .query(async ({ ctx }) => {
      return await getAllClientAccounts();
    }),

  // Create client account
  createClient: portalAdminProcedure
    .input(z.object({
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
    .mutation(async ({ input, ctx }) => {
      const client = await createClientAccount(input.client);
      if (!client) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create client' });
      }

      invalidateClientAccountsCache();
      return client;
    }),

  // Delete client account
  deleteClient: portalAdminProcedure
    .input(z.object({
      clientId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
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
  createCustomerUser: portalAdminProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(8),
      clientId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
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
  updateUserPassword: portalAdminProcedure
    .input(z.object({
      clientId: z.number(),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
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
  updateClientNotes: portalAdminProcedure
    .input(z.object({
      clientId: z.number(),
      notes: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const updated = await updateClientAccount(input.clientId, { notes: input.notes });
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });
      }

      invalidateClientAccountsCache();
      return { success: true };
    }),

  // Get all orders (global view)
  // NOTE: Admin sees ALL information without privacy filters
  // Privacy rules (hideShipperAddress/hideConsigneeAddress) only apply when customers generate waybills from their portal
  getAllOrders: portalAdminProcedure
    .query(async ({ ctx }) => {
      // Admin sees all DOMESTIC orders (standard, exchange, returns) with full information
      const allOrders = await cachedQuery('admin:allOrders', 60, getAllOrders);
      return allOrders.filter(order =>
        (order.destinationCountry === 'United Arab Emirates' || order.destinationCountry === 'UAE' || order.destinationCountry === 'AE' || !order.destinationCountry)
      );
    }),

  // Get international orders (admin view)
  getIntlOrders: portalAdminProcedure
    .query(async ({ ctx }) => {
      const allOrders = await cachedQuery('admin:allOrders', 60, getAllOrders);
      return allOrders.filter(order =>
        (order.orderType === 'standard' || !order.orderType) &&
        order.destinationCountry.toUpperCase() !== 'UAE' &&
        order.destinationCountry.toUpperCase() !== 'UNITED ARAB EMIRATES'
      );
    }),

  // Delete order (admin only)
  deleteOrder: portalAdminProcedure
    .input(z.object({
      orderId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
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

        cacheInvalidate('admin:allOrders');
        return { success: true };
      } catch (error) {
        console.error('[Database] Failed to delete order:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete order' });
      }
    }),

  // Update order (admin only) - Edit order details
  updateOrder: portalAdminProcedure
    .input(z.object({
      orderId: z.number(),
      updates: z.object({
        serviceType: z.enum(['DOM', 'SDD', 'BULLET']).optional(),
        weight: z.string().optional(),
        pieces: z.number().optional(),
        codRequired: z.number().min(0).max(1).optional(),
        codAmount: z.string().optional(),
        codCurrency: z.string().optional(),
        customerName: z.string().optional(),
        customerPhone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        specialInstructions: z.string().optional(),
        fitOnDelivery: z.number().min(0).max(1).optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const { updateOrder } = await import('./db');
      const result = await updateOrder(input.orderId, input.updates);

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error || 'Failed to update order'
        });
      }

      // Notify client for business-impacting changes: service type, COD, or FOD edits
      try {
        const changed: string[] = [];
        if (input.updates.serviceType) changed.push(`Service: ${input.updates.serviceType}`);
        if (input.updates.codRequired !== undefined || input.updates.codAmount)
          changed.push(`COD: ${input.updates.codRequired === 0 ? 'Removed' : `${input.updates.codAmount || ''} ${input.updates.codCurrency || 'AED'}`}`);
        if (input.updates.fitOnDelivery !== undefined)
          changed.push(`FOD: ${input.updates.fitOnDelivery === 1 ? 'Enabled' : 'Disabled'}`);

        if (changed.length > 0 && result.order?.clientId) {
          await createNotification(
            result.order.clientId,
            'ORDER_UPDATE',
            'Order Updated',
            `Your order ${result.order.waybillNumber} was updated by operations: ${changed.join(', ')}.`,
            'orders'
          );
        }
      } catch (_) { /* never block the order update */ }

      cacheInvalidate('admin:allOrders');
      return { success: true, order: result.order };
    }),

  // Create return shipment (admin only)
  createReturn: portalAdminProcedure
    .input(z.object({
      orderId: z.number(),
      chargeReturn: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
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
      const allowedStatuses = ['failed_delivery', 'returned', 'returned_to_sender', 'exchange'];
      if (!allowedStatuses.includes(originalOrder.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot create return for order with status "${originalOrder.status}". Only failed_delivery, returned, returned_to_sender, or exchange orders can have returns.`
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
        createdBy: ctx.portalUser.email || 'admin',
      });

      return {
        success: true,
        returnOrder,
        message: `Return shipment ${returnWaybill} created successfully`
      };
    }),

  // Get dashboard analytics
  getAnalytics: portalAdminProcedure
    .query(async ({ ctx }) => {
      return cachedQuery('analytics:admin', 60, async () => {
      const db = await import('./db').then(m => m.getDb());
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const { orders, invoices, codRecords, trackingEvents } = await import('../drizzle/schema');
      const { sql, gte, lte, and, eq, inArray } = await import('drizzle-orm');

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

      // 10. First Attempt Delivery Rate (FADR)
      // Total delivered orders
      const deliveredOrders = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.status, 'delivered'));

      const totalDelivered = deliveredOrders.length;

      // Delivered orders that had at least one 'attempted_delivery' or 'failed_delivery' tracking event
      let failedFirstAttempt = 0;
      if (totalDelivered > 0) {
        const deliveredIds = deliveredOrders.map(o => o.id);
        const withAttempts = await db
          .select({ shipmentId: trackingEvents.shipmentId })
          .from(trackingEvents)
          .where(and(
            inArray(trackingEvents.shipmentId, deliveredIds),
            inArray(trackingEvents.statusCode, ['attempted_delivery', 'failed_delivery', 'attempted'])
          ))
          .groupBy(trackingEvents.shipmentId);
        failedFirstAttempt = withAttempts.length;
      }
      const firstAttemptDeliveryRate = totalDelivered > 0
        ? Math.round(((totalDelivered - failedFirstAttempt) / totalDelivered) * 100)
        : null;

      // 11. Return Rate (includes both returned and returned_to_sender)
      const { inArray: inArrayRet } = await import('drizzle-orm');
      const returnedCount = await db
        .select({ count: sql<number>`cast(count(*) as unsigned)` })
        .from(orders)
        .where(inArrayRet(orders.status, ['returned', 'returned_to_sender']));
      const totalReturnOrDeliv = totalDelivered + Number(returnedCount[0]?.count || 0);
      const returnRate = totalReturnOrDeliv > 0
        ? Math.round((Number(returnedCount[0]?.count || 0) / totalReturnOrDeliv) * 100)
        : null;

      // 12. Total Accounts Receivable (unpaid invoices balance)
      const arResult = await db
        .select({ total: sql<string>`COALESCE(SUM(CAST(balance AS DECIMAL(12,2))), 0)` })
        .from(invoices)
        .where(inArray(invoices.status, ['pending', 'overdue']));
      const totalAccountsReceivable = parseFloat(arResult[0]?.total || '0');

      const overdueResult = await db
        .select({ total: sql<string>`COALESCE(SUM(CAST(balance AS DECIMAL(12,2))), 0)` })
        .from(invoices)
        .where(eq(invoices.status, 'overdue'));
      const overdueAmount = parseFloat(overdueResult[0]?.total || '0');

      // 13. Revenue this month and last month (from paid + pending invoices)
      const revenueThisMonthResult = await db
        .select({ total: sql<string>`COALESCE(SUM(CAST(total AS DECIMAL(12,2))), 0)` })
        .from(invoices)
        .where(gte(invoices.issueDate, startOfMonth));
      const revenueThisMonth = parseFloat(revenueThisMonthResult[0]?.total || '0');

      const revenueLastMonthResult = await db
        .select({ total: sql<string>`COALESCE(SUM(CAST(total AS DECIMAL(12,2))), 0)` })
        .from(invoices)
        .where(and(
          gte(invoices.issueDate, startOfLastMonth),
          lte(invoices.issueDate, endOfLastMonth)
        ));
      const revenueLastMonth = parseFloat(revenueLastMonthResult[0]?.total || '0');

      // 14. Shipments per day with orders for drill-down (date → waybill list)
      const shipmentsPerDayDetailed = await db
        .select({
          date: sql<string>`DATE(${orders.createdAt})`,
          waybillNumber: orders.waybillNumber,
        })
        .from(orders)
        .where(gte(orders.createdAt, last30Days))
        .orderBy(sql`DATE(${orders.createdAt})`);

      // Build a map of date -> waybillNumbers for drill-down
      const drillDownMap: Record<string, string[]> = {};
      for (const row of shipmentsPerDayDetailed) {
        if (!drillDownMap[row.date]) drillDownMap[row.date] = [];
        drillDownMap[row.date].push(row.waybillNumber);
      }

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
        // New KPIs
        firstAttemptDeliveryRate,
        returnRate,
        totalAccountsReceivable,
        overdueAmount,
        revenueThisMonth,
        revenueLastMonth,
        shipmentsPerDay: shipmentsPerDay.map(d => ({
          date: d.date,
          count: Number(d.count),
          waybills: drillDownMap[d.date] || [],
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
      }); // end cachedQuery
    }),

  // Revenue Analytics (for Revenue Dashboard)
  getRevenueAnalytics: portalAdminProcedure
    .query(async ({ ctx }) => {
      return cachedQuery('analytics:revenue', 60, async () => {
      const db = await import('./db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { invoices, invoiceItems, orders, clientAccounts } = await import('../drizzle/schema');
      const { sql, gte, eq, inArray } = await import('drizzle-orm');

      const now = new Date();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

      // 1. Monthly revenue (last 6 months)
      const monthlyRevenue = await db
        .select({
          month: sql<string>`DATE_FORMAT(${invoices.issueDate}, '%Y-%m')`,
          revenue: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS DECIMAL(12,2))), 0)`,
          invoiceCount: sql<number>`cast(count(*) as unsigned)`,
        })
        .from(invoices)
        .where(gte(invoices.issueDate, sixMonthsAgo))
        .groupBy(sql`DATE_FORMAT(${invoices.issueDate}, '%Y-%m')`)
        .orderBy(sql`DATE_FORMAT(${invoices.issueDate}, '%Y-%m')`);

      // 2. Revenue by service type (from invoice items → orders)
      const revenueByService = await db
        .select({
          service: orders.serviceType,
          amount: sql<string>`COALESCE(SUM(CAST(${invoiceItems.total} AS DECIMAL(12,2))), 0)`,
          count: sql<number>`cast(count(*) as unsigned)`,
        })
        .from(invoiceItems)
        .innerJoin(orders, eq(invoiceItems.shipmentId, orders.id))
        .groupBy(orders.serviceType)
        .orderBy(sql`SUM(CAST(${invoiceItems.total} AS DECIMAL(12,2))) DESC`);

      // 3. Top 10 clients by invoice total
      const topClients = await db
        .select({
          companyName: clientAccounts.companyName,
          clientId: invoices.clientId,
          totalRevenue: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS DECIMAL(12,2))), 0)`,
          invoiceCount: sql<number>`cast(count(*) as unsigned)`,
        })
        .from(invoices)
        .innerJoin(clientAccounts, eq(invoices.clientId, clientAccounts.id))
        .groupBy(invoices.clientId, clientAccounts.companyName)
        .orderBy(sql`SUM(CAST(${invoices.total} AS DECIMAL(12,2))) DESC`)
        .limit(10);

      // 4. AR totals
      const arResult = await db
        .select({ total: sql<string>`COALESCE(SUM(CAST(${invoices.balance} AS DECIMAL(12,2))), 0)` })
        .from(invoices)
        .where(inArray(invoices.status, ['pending', 'overdue']));

      const overdueResult = await db
        .select({ total: sql<string>`COALESCE(SUM(CAST(${invoices.balance} AS DECIMAL(12,2))), 0)` })
        .from(invoices)
        .where(eq(invoices.status, 'overdue'));

      return {
        monthlyRevenue: monthlyRevenue.map(r => ({
          month: r.month,
          revenue: parseFloat(r.revenue),
          invoiceCount: Number(r.invoiceCount),
        })),
        revenueByService: revenueByService.map(r => ({
          service: r.service || 'standard',
          amount: parseFloat(r.amount),
          count: Number(r.count),
        })),
        topClients: topClients.map(c => ({
          companyName: c.companyName,
          clientId: c.clientId,
          totalRevenue: parseFloat(c.totalRevenue),
          invoiceCount: Number(c.invoiceCount),
        })),
        totalAR: parseFloat(arResult[0]?.total || '0'),
        overdueAmount: parseFloat(overdueResult[0]?.total || '0'),
      };
      }); // end cachedQuery
    }),

  // Client 360 View
  getClient360: portalAdminProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input, ctx }) => {
      return cachedQuery(`analytics:client360:${input.clientId}`, 60, async () => {
      const db = await import('./db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { orders, invoices, codRecords, clientAccounts, rateTiers } = await import('../drizzle/schema');
      const { sql, gte, lte, eq, and, inArray, desc } = await import('drizzle-orm');

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

      // 1. Shipments this month
      const thisMonthResult = await db
        .select({ count: sql<number>`cast(count(*) as unsigned)` })
        .from(orders)
        .where(and(eq(orders.clientId, input.clientId), gte(orders.createdAt, startOfMonth)));

      // 2. Shipments last month
      const lastMonthResult = await db
        .select({ count: sql<number>`cast(count(*) as unsigned)` })
        .from(orders)
        .where(and(
          eq(orders.clientId, input.clientId),
          gte(orders.createdAt, startOfLastMonth),
          lte(orders.createdAt, endOfLastMonth)
        ));

      // 3. Pending invoices balance
      const pendingInvResult = await db
        .select({ total: sql<string>`COALESCE(SUM(CAST(${invoices.balance} AS DECIMAL(12,2))), 0)` })
        .from(invoices)
        .where(and(eq(invoices.clientId, input.clientId), eq(invoices.status, 'pending')));

      // 4. Overdue invoices balance
      const overdueInvResult = await db
        .select({ total: sql<string>`COALESCE(SUM(CAST(${invoices.balance} AS DECIMAL(12,2))), 0)` })
        .from(invoices)
        .where(and(eq(invoices.clientId, input.clientId), eq(invoices.status, 'overdue')));

      // 5. Pending COD amount — join codRecords to orders filtered by clientId
      const pendingCODResult = await db
        .select({ total: sql<string>`COALESCE(SUM(CAST(${codRecords.codAmount} AS DECIMAL(12,2))), 0)` })
        .from(codRecords)
        .innerJoin(orders, eq(codRecords.shipmentId, orders.id))
        .where(and(
          eq(orders.clientId, input.clientId),
          inArray(codRecords.status, ['pending_collection', 'collected'])
        ));

      // 6. Days since last order
      const lastOrderResult = await db
        .select({ createdAt: orders.createdAt })
        .from(orders)
        .where(eq(orders.clientId, input.clientId))
        .orderBy(desc(orders.createdAt))
        .limit(1);

      let daysSinceLastOrder: number | null = null;
      if (lastOrderResult[0]) {
        const diffMs = now.getTime() - new Date(lastOrderResult[0].createdAt).getTime();
        daysSinceLastOrder = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }

      // 7. Client segment based on this month's volume
      const shipmentsThisMonth = Number(thisMonthResult[0]?.count || 0);
      let clientSegment: 'gold' | 'silver' | 'bronze' | 'new';
      if (shipmentsThisMonth >= 200) clientSegment = 'gold';
      else if (shipmentsThisMonth >= 50) clientSegment = 'silver';
      else if (shipmentsThisMonth >= 10) clientSegment = 'bronze';
      else clientSegment = 'new';

      // 8. Recent 5 orders
      const recentOrders = await db
        .select({
          waybillNumber: orders.waybillNumber,
          status: orders.status,
          city: orders.city,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(eq(orders.clientId, input.clientId))
        .orderBy(desc(orders.createdAt))
        .limit(5);

      // 9. Monthly shipment trend (last 6 months)
      const monthlyTrend = await db
        .select({
          month: sql<string>`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`,
          count: sql<number>`cast(count(*) as unsigned)`,
        })
        .from(orders)
        .where(and(eq(orders.clientId, input.clientId), gte(orders.createdAt, sixMonthsAgo)))
        .groupBy(sql`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`)
        .orderBy(sql`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`);

      // 10. Get client rate tier name
      const clientData = await db
        .select({ manualRateTierId: clientAccounts.manualRateTierId, customDomBaseRate: clientAccounts.customDomBaseRate })
        .from(clientAccounts)
        .where(eq(clientAccounts.id, input.clientId))
        .limit(1);

      let currentRateTier = 'Auto (Volume)';
      if (clientData[0]?.customDomBaseRate) {
        currentRateTier = 'Custom Rates';
      } else if (clientData[0]?.manualRateTierId) {
        const tierData = await db
          .select({ serviceType: rateTiers.serviceType, minVolume: rateTiers.minVolume })
          .from(rateTiers)
          .where(eq(rateTiers.id, clientData[0].manualRateTierId))
          .limit(1);
        if (tierData[0]) {
          currentRateTier = `${tierData[0].serviceType} - ${tierData[0].minVolume}+ /mo`;
        }
      }

      return {
        shipmentsThisMonth,
        shipmentsLastMonth: Number(lastMonthResult[0]?.count || 0),
        pendingInvoicesBalance: parseFloat(pendingInvResult[0]?.total || '0'),
        overdueInvoicesBalance: parseFloat(overdueInvResult[0]?.total || '0'),
        pendingCODAmount: parseFloat(pendingCODResult[0]?.total || '0'),
        currentRateTier,
        daysSinceLastOrder,
        clientSegment,
        recentOrders: recentOrders.map(o => ({
          waybillNumber: o.waybillNumber,
          status: o.status,
          city: o.city,
          createdAt: o.createdAt,
        })),
        monthlyShipmentTrend: monthlyTrend.map(m => ({
          month: m.month,
          count: Number(m.count),
        })),
      };
      }); // end cachedQuery
    }),

  // Client alerts — for alert panel in admin dashboard
  getClientAlerts: portalAdminProcedure
    .query(async ({ ctx }) => {
      return cachedQuery('alerts:admin', 60, async () => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { invoices, orders, clientAccounts } = await import('../drizzle/schema');
        const { sql, eq, inArray, gte } = await import('drizzle-orm');

        // 1. Clients with overdue invoices
        const overdueClients = await db
          .select({
            clientId: invoices.clientId,
            companyName: clientAccounts.companyName,
            overdueBalance: sql<string>`COALESCE(SUM(CAST(${invoices.balance} AS DECIMAL(12,2))), 0)`,
            invoiceCount: sql<number>`cast(count(*) as unsigned)`,
          })
          .from(invoices)
          .innerJoin(clientAccounts, eq(invoices.clientId, clientAccounts.id))
          .where(eq(invoices.status, 'overdue'))
          .groupBy(invoices.clientId, clientAccounts.companyName)
          .orderBy(sql`SUM(CAST(${invoices.balance} AS DECIMAL(12,2))) DESC`);

        // 2. Clients inactive for 30+ days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [activeClients, recentlyActiveClientIds] = await Promise.all([
          db.select({ id: clientAccounts.id, companyName: clientAccounts.companyName })
            .from(clientAccounts)
            .where(eq(clientAccounts.status, 'active')),
          db.select({ clientId: orders.clientId })
            .from(orders)
            .where(gte(orders.createdAt, thirtyDaysAgo))
            .groupBy(orders.clientId),
        ]);

        const recentIds = new Set(recentlyActiveClientIds.map(r => r.clientId));
        const inactiveClientIds = activeClients
          .filter(c => !recentIds.has(c.id))
          .map(c => c.id);

        const inactiveClients: Array<{ clientId: number; companyName: string; daysSinceLastOrder: number }> = [];

        if (inactiveClientIds.length > 0) {
          // Single query: get the last order date for ALL inactive clients at once
          const lastOrders = await db
            .select({
              clientId: orders.clientId,
              lastOrderDate: sql<string>`MAX(${orders.createdAt})`,
            })
            .from(orders)
            .where(inArray(orders.clientId, inactiveClientIds))
            .groupBy(orders.clientId);

          const lastOrderMap = new Map(lastOrders.map(r => [r.clientId, r.lastOrderDate]));
          const clientMap = new Map(activeClients.map(c => [c.id, c.companyName]));
          const now = Date.now();

          for (const clientId of inactiveClientIds) {
            const lastOrderDate = lastOrderMap.get(clientId);
            if (lastOrderDate) {
              const days = Math.floor((now - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24));
              inactiveClients.push({ clientId, companyName: clientMap.get(clientId) || 'Unknown', daysSinceLastOrder: days });
            }
          }
        }

        return {
          overdueClients: overdueClients.map(c => ({
            clientId: c.clientId,
            companyName: c.companyName,
            overdueBalance: parseFloat(c.overdueBalance),
            invoiceCount: Number(c.invoiceCount),
          })),
          inactiveClients: inactiveClients.sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder).slice(0, 10),
        };
      });
    }),

  // Update order status
  updateOrderStatus: portalAdminProcedure
    .input(z.object({
      orderId: z.number(),
      status: z.enum(['pending', 'in_progress', 'picked_up', 'delivered', 'attempted', 'returned', 'returned_to_sender', 'failed', 'on_hold']),
    }))
    .mutation(async ({ input, ctx }) => {
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

      cacheInvalidate('admin:allOrders');
      return order;
    }),

  // Get monthly report data for all clients (admin)
  getMonthlyReport: portalAdminProcedure
    .input(z.object({
      month: z.string(), // Format: YYYY-MM
      clientId: z.number().optional(), // Optional filter by client
    }))
    .query(async ({ input, ctx }) => {
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
  getCODReport: portalAdminProcedure
    .input(z.object({
      clientId: z.number().optional(), // Optional filter by client
    }))
    .query(async ({ input, ctx }) => {
      const db = await import('./db').then(m => m.getDb());
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const { codRecords, orders, clientAccounts } = await import('../drizzle/schema');
      const { eq, and, ne } = await import('drizzle-orm');

      let whereConditions = [ne(codRecords.status, 'cancelled')];
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
        .where(and(...whereConditions));

      return codData;
    }),

  // Get all clients for report filtering
  getClientsForReports: portalAdminProcedure
    .query(async ({ ctx }) => {
      return await getAllClientAccounts();
    }),

  // Get all quote requests
  getQuoteRequests: portalAdminProcedure
    .query(async ({ ctx }) => {
      const { getAllQuoteRequests } = await import('./db');
      return await getAllQuoteRequests();
    }),

  // Delete quote request
  deleteQuoteRequest: portalAdminProcedure
    .input(z.object({
      requestId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { deleteQuoteRequest } = await import('./db');
      const success = await deleteQuoteRequest(input.requestId);

      if (!success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete request' });
      }

      return { success: true };
    }),

  // Get all contact messages
  getContactMessages: portalAdminProcedure
    .query(async ({ ctx }) => {
      const { getAllContactMessages } = await import('./db');
      return await getAllContactMessages();
    }),

  // Delete contact message
  deleteContactMessage: portalAdminProcedure
    .input(z.object({
      messageId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { deleteContactMessage } = await import('./db');
      const success = await deleteContactMessage(input.messageId);

      if (!success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete message' });
      }

      return { success: true };
    }),

  // Admin creates order on behalf of a client
  adminCreateOrder: portalAdminProcedure
    .input(z.object({
      clientId: z.number(),
      shipment: z.object({
        orderNumber: z.string().optional(),
        customerName: z.string().min(1),
        customerPhone: z.string().min(1),
        address: z.string().min(1),
        city: z.string().min(1),
        emirate: z.string().optional(),
        postalCode: z.string().optional(),
        destinationCountry: z.string().min(1).default('UAE'),
        pieces: z.number().min(1).default(1),
        weight: z.number().min(0.1),
        serviceType: z.string().min(1).default('DOM'),
        specialInstructions: z.string().optional(),
        codRequired: z.number().default(0),
        codAmount: z.string().optional(),
        codCurrency: z.string().default('AED'),
        fitOnDelivery: z.number().default(0),
        // Shipper override fields (for walk-in customers)
        shipperOverride: z.boolean().optional(),
        shipperName: z.string().optional(),
        shipperAddress: z.string().optional(),
        shipperCity: z.string().optional(),
        shipperCountry: z.string().optional(),
        shipperPhone: z.string().optional(),
        // Dimensions & customs (for international orders)
        length: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        customsValue: z.string().optional(),
        customsCurrency: z.string().optional(),
        customsDescription: z.string().optional(),
        hsCode: z.string().optional(),
        // Coordinates for driver navigation
        latitude: z.string().optional(),
        longitude: z.string().optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      // Get client account for shipper info
      const clientAccount = await getClientAccountById(input.clientId);
      if (!clientAccount) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });
      }

      // Check if client allows FOD
      if (input.shipment.fitOnDelivery === 1 && clientAccount.fodAllowed !== 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'FOD not allowed for this client' });
      }

      // Check if client allows COD
      if (input.shipment.codRequired === 1 && clientAccount.codAllowed !== 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'COD not allowed for this client' });
      }

      // Generate waybill number
      const waybillNumber = await generateWaybillNumber();

      // Determine shipper info - use override if provided, else use client account
      const shipperName = input.shipment.shipperOverride && input.shipment.shipperName
        ? input.shipment.shipperName
        : clientAccount.companyName;
      const shipperAddress = input.shipment.shipperOverride && input.shipment.shipperAddress
        ? input.shipment.shipperAddress
        : clientAccount.billingAddress;
      const shipperCity = input.shipment.shipperOverride && input.shipment.shipperCity
        ? input.shipment.shipperCity
        : clientAccount.city;
      const shipperCountry = input.shipment.shipperOverride && input.shipment.shipperCountry
        ? input.shipment.shipperCountry
        : clientAccount.country;
      const shipperPhone = input.shipment.shipperOverride && input.shipment.shipperPhone
        ? input.shipment.shipperPhone
        : clientAccount.phone;

      // Create order with shipper info (override or client)
      const order = await createOrder({
        clientId: input.clientId,
        waybillNumber,
        orderNumber: input.shipment.orderNumber || null,

        // Shipper info (override or from client account)
        shipperName,
        shipperAddress,
        shipperCity,
        shipperCountry,
        shipperPhone,

        // Consignee info from input
        customerName: input.shipment.customerName,
        customerPhone: input.shipment.customerPhone,
        address: input.shipment.address,
        city: input.shipment.city,
        emirate: input.shipment.emirate || null,
        postalCode: input.shipment.postalCode || null,
        destinationCountry: input.shipment.destinationCountry,

        // Shipment details
        pieces: input.shipment.pieces,
        weight: input.shipment.weight.toString(),
        length: input.shipment.length?.toString() || null,
        width: input.shipment.width?.toString() || null,
        height: input.shipment.height?.toString() || null,
        serviceType: input.shipment.serviceType,
        specialInstructions: input.shipment.specialInstructions || null,

        // Customs (for international orders)
        customsValue: input.shipment.customsValue || null,
        customsCurrency: input.shipment.customsCurrency || null,
        customsDescription: input.shipment.customsDescription || null,
        hsCode: input.shipment.hsCode || null,

        // COD
        codRequired: input.shipment.codRequired,
        codAmount: input.shipment.codAmount || null,
        codCurrency: input.shipment.codCurrency || 'AED',

        // FOD
        fitOnDelivery: input.shipment.fitOnDelivery,

        // Coordinates for driver navigation
        latitude: input.shipment.latitude || null,
        longitude: input.shipment.longitude || null,

        status: 'pending_pickup',
        lastStatusUpdate: new Date(),
      });

      if (!order) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create order' });
      }

      // Create initial tracking event
      await createTrackingEvent({
        shipmentId: order.id,
        eventDatetime: new Date(),
        statusCode: 'pending_pickup',
        statusLabel: 'PENDING PICKUP',
        description: 'Order created by admin',
        createdBy: 'admin',
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
});

/**
 * Customer portal router
 */
export const customerPortalRouter = router({
  // Get customer's client account
  getMyAccount: portalCustomerProcedure
    .query(async ({ ctx }) => {
      return await getClientAccountById(ctx.portalUser.clientId);
    }),

  // Get customer's orders (excluding returns and exchanges - those appear in separate section)
  getMyOrders: portalCustomerProcedure
    .query(async ({ ctx }) => {
      const allOrders = await cachedQuery(`customer:orders:${ctx.portalUser.clientId}`, 30, () => getOrdersByClientId(ctx.portalUser.clientId));

      // Filter out returns and exchanges (they appear in separate Returns & Exchanges section)
      // Limit to domestic orders
      const orders = allOrders.filter(order =>
        (order.orderType === 'standard' || !order.orderType) &&
        (order.destinationCountry.toUpperCase() === 'UAE' || order.destinationCountry.toUpperCase() === 'UNITED ARAB EMIRATES')
      );

      // Get client's hideShipperAddress setting
      const client = await getClientAccountById(ctx.portalUser.clientId);
      const hideShipperAddress = client?.hideShipperAddress === 1;

      // Add hideShipperAddress to each order for waybill generation, and hide address if setting enabled
      return orders.map(order => ({
        ...order,
        shipperAddress: hideShipperAddress ? '' : order.shipperAddress,
        hideShipperAddress: hideShipperAddress ? 1 : 0,
      }));
    }),

  // Get customer's international orders
  getMyIntlOrders: portalCustomerProcedure
    .query(async ({ ctx }) => {
      const allOrders = await cachedQuery(`customer:orders:${ctx.portalUser.clientId}`, 30, () => getOrdersByClientId(ctx.portalUser.clientId));

      // Filter for international orders
      const orders = allOrders.filter(order =>
        (order.orderType === 'standard' || !order.orderType) &&
        order.destinationCountry.toUpperCase() !== 'UAE' &&
        order.destinationCountry.toUpperCase() !== 'UNITED ARAB EMIRATES'
      );

      // Get client's hideShipperAddress setting
      const client = await getClientAccountById(ctx.portalUser.clientId);
      const hideShipperAddress = client?.hideShipperAddress === 1;

      return orders.map(order => ({
        ...order,
        shipperAddress: hideShipperAddress ? '' : order.shipperAddress,
        hideShipperAddress: hideShipperAddress ? 1 : 0,
      }));
    }),

  // Create new shipment/order
  createShipment: portalCustomerProcedure
    .input(z.object({
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
        fitOnDelivery: z.number().default(0),

        // Customs fields (optional for domestic, required for international in UI but optional here to preserve compat)
        customsValue: z.string().optional(),
        customsCurrency: z.string().optional(),
        customsDescription: z.string().optional(),
        hsCode: z.string().optional(),

        // Coordinates for driver navigation
        latitude: z.string().optional(),
        longitude: z.string().optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      // Determine if international order
      const isInternational = input.shipment.destinationCountry.toUpperCase() !== 'UAE'
        && input.shipment.destinationCountry.toUpperCase() !== 'UNITED ARAB EMIRATES';

      // Generate waybill number
      const waybillNumber = await generateWaybillNumber(isInternational);

      // Create order
      const order = await createOrder({
        clientId: ctx.portalUser.clientId,
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

      // 🤖 LOGISTICS BOT INTEGRATION
      try {
        const BOT_URL = process.env.BOT_API_URL || 'http://localhost:3000';

        // Dynamic import of axios to avoid breaking if dependency is missing
        const axios = (await import('axios')).default;

        console.log(`🤖 Notifying Bot about order ${waybillNumber}...`);

        await axios.post(`${BOT_URL}/new-order`, {
          customer_name: input.shipment.customerName,
          phone_number: input.shipment.customerPhone, // Assuming customer phone is the contact
          order_id: waybillNumber // Usamos el Waybill como ID visible
        }, { timeout: 5000 }); // Short timeout to avoid hanging portal if bot is down

        console.log('✅ Bot notified successfully.');
      } catch (error: any) {
        // Do not block order creation if bot fails
        console.warn('⚠️ Failed to notify Bot:', error.message);
      }

      // Email notification to admin (fire-and-forget, never blocks order creation)
      notifyAdminNewOrder(waybillNumber, input.shipment.customerName, input.shipment.customerPhone || '').catch((e: any) => {
        console.warn('⚠️ Email notification unhandled error:', e.message);
      });

      return order;
    }),

  // Get shipment details with tracking
  getShipmentDetails: portalCustomerProcedure
    .input(z.object({
      waybillNumber: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const order = await getOrderByWaybill(input.waybillNumber);
      if (!order || order.clientId !== ctx.portalUser.clientId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Shipment not found' });
      }

      const trackingEvents = await getTrackingEventsByShipmentId(order.id);

      return {
        order,
        trackingEvents,
      };
    }),

  // Cancel order (customer can only cancel pending_pickup orders)
  cancelOrder: portalCustomerProcedure
    .input(z.object({
      orderId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Get the order
      const order = await getOrderById(input.orderId);
      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      // Check if order belongs to this customer
      if (order.clientId !== ctx.portalUser.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You cannot cancel this order' });
      }

      // Only allow cancellation if status is pending_pickup
      if (order.status !== 'pending_pickup') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Orders can only be canceled when status is "Pending Pickup". Once picked up, cancellation is not possible.'
        });
      }

      // Delete order completely (cascade delete related records)
      const db = await import('./db').then(m => m.getDb());
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const { orders, trackingEvents, codRecords, invoiceItems } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      try {
        // Delete related records in parallel, then delete the order
        await Promise.all([
          db.delete(trackingEvents).where(eq(trackingEvents.shipmentId, input.orderId)),
          db.delete(codRecords).where(eq(codRecords.shipmentId, input.orderId)),
          db.delete(invoiceItems).where(eq(invoiceItems.shipmentId, input.orderId)),
        ]);
        await db.delete(orders).where(eq(orders.id, input.orderId));

        return { success: true, message: 'Order deleted successfully' };
      } catch (error) {
        console.error('[Database] Failed to delete order:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete order' });
      }
    }),

  // Get customer's returns and exchanges
  getMyReturnsExchanges: portalCustomerProcedure
    .query(async ({ ctx }) => {
      const db = await import('./db').then(m => m.getDb());
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const { orders } = await import('../drizzle/schema');
      const { eq, and, or, desc, inArray } = await import('drizzle-orm');

      // Get all returns and exchanges for this client
      const returnsExchanges = await db
        .select()
        .from(orders)
        .where(and(
          eq(orders.clientId, ctx.portalUser.clientId),
          or(
            eq(orders.orderType, 'return'),
            eq(orders.orderType, 'exchange')
          )
        ))
        .orderBy(desc(orders.createdAt));

      // Check if client has hideShipperAddress enabled
      const client = await getClientAccountById(ctx.portalUser.clientId);
      const hideAddress = client?.hideShipperAddress === 1;

      // Batch load all related orders in one query instead of N+1
      const relatedIds = [
        ...returnsExchanges.map(o => o.originalOrderId).filter((id): id is number => id != null),
        ...returnsExchanges.map(o => o.exchangeOrderId).filter((id): id is number => id != null),
      ];
      const relatedOrdersMap = new Map<number, { waybillNumber: string }>();
      if (relatedIds.length > 0) {
        const relatedOrders = await db
          .select({ id: orders.id, waybillNumber: orders.waybillNumber })
          .from(orders)
          .where(inArray(orders.id, relatedIds));
        relatedOrders.forEach(o => relatedOrdersMap.set(o.id, { waybillNumber: o.waybillNumber }));
      }

      const result = returnsExchanges.map((order) => ({
        ...order,
        hideConsigneeAddress: hideAddress ? 1 : 0,
        originalWaybill: order.originalOrderId ? (relatedOrdersMap.get(order.originalOrderId)?.waybillNumber ?? null) : null,
        exchangeWaybill: order.exchangeOrderId ? (relatedOrdersMap.get(order.exchangeOrderId)?.waybillNumber ?? null) : null,
      }));

      return result;
    }),

  // Search order for return/exchange
  searchOrderForReturn: portalCustomerProcedure
    .input(z.object({
      waybillNumber: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const order = await getOrderByWaybill(input.waybillNumber);
      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found with this waybill number' });
      }

      if (order.clientId !== ctx.portalUser.clientId) {
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

      // Check if client has hideShipperAddress enabled
      const client = await getClientAccountById(ctx.portalUser.clientId);
      const hideShipperAddress = client?.hideShipperAddress === 1;

      // Return order with shipper address hidden if setting is enabled
      return {
        ...order,
        shipperAddress: hideShipperAddress ? '' : order.shipperAddress,
      };
    }),

  // Create return request
  createReturnRequest: portalCustomerProcedure
    .input(z.object({
      orderId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const originalOrder = await getOrderById(input.orderId);
      if (!originalOrder || originalOrder.clientId !== ctx.portalUser.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Order not found or access denied' });
      }

      // Check if client has hideShipperAddress enabled (for privacy on waybill)
      const client = await getClientAccountById(ctx.portalUser.clientId);
      const hideConsigneeOnReturn = client?.hideShipperAddress === 1 ? 1 : 0;

      // Generate waybill for return
      const returnWaybill = await generateWaybillNumber();

      // Create return order (swap shipper/consignee)
      // Note: On returns, the original client becomes the consignee, so we hide their address if they have privacy enabled
      const returnOrder = await createOrder({
        clientId: ctx.portalUser.clientId,
        orderNumber: `RTN-${originalOrder.waybillNumber}`,
        waybillNumber: returnWaybill,

        // Swap: consignee becomes shipper (show full address - this is the customer returning the package)
        shipperName: originalOrder.customerName,
        shipperAddress: originalOrder.address,
        shipperCity: originalOrder.city,
        shipperCountry: originalOrder.destinationCountry,
        shipperPhone: originalOrder.customerPhone,

        // Swap: shipper becomes consignee (hide address if client has privacy enabled)
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
        hideConsigneeAddress: hideConsigneeOnReturn, // Hide consignee (client) address on waybill if privacy enabled

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
        createdBy: ctx.portalUser.email || 'customer',
      });

      return { success: true, message: `Return ${returnWaybill} created successfully`, returnOrder };
    }),

  // Create exchange request (return + new shipment)
  createExchangeRequest: portalCustomerProcedure
    .input(z.object({
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
        codRequired: z.number().default(0),
        codAmount: z.string().optional(),
        codCurrency: z.string().default('AED'),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const originalOrder = await getOrderById(input.orderId);
      if (!originalOrder || originalOrder.clientId !== ctx.portalUser.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Order not found or access denied' });
      }

      // Get client account for shipper info
      const clientAccount = await getClientAccountById(ctx.portalUser.clientId);
      if (!clientAccount) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Client account not found' });
      }

      // Check if client has privacy enabled (for hiding address on return waybills)
      const hideConsigneeOnReturn = clientAccount.hideShipperAddress === 1 ? 1 : 0;

      // 1. Create return waybill (client becomes consignee, hide their address if privacy enabled)
      const returnWaybill = await generateWaybillNumber();
      const returnOrder = await createOrder({
        clientId: ctx.portalUser.clientId,
        orderNumber: `EXC-RTN-${originalOrder.waybillNumber}`,
        waybillNumber: returnWaybill,

        // Swap: original consignee becomes shipper (show full address)
        shipperName: originalOrder.customerName,
        shipperAddress: originalOrder.address,
        shipperCity: originalOrder.city,
        shipperCountry: originalOrder.destinationCountry,
        shipperPhone: originalOrder.customerPhone,

        // Swap: original shipper (client) becomes consignee (hide if privacy enabled)
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
        hideConsigneeAddress: hideConsigneeOnReturn, // Hide consignee (client) address on waybill if privacy enabled

        status: 'pending_pickup',
        lastStatusUpdate: new Date(),
      });

      if (!returnOrder) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create return for exchange' });
      }

      // 2. Create new shipment waybill
      const newWaybill = await generateWaybillNumber();
      const newOrder = await createOrder({
        clientId: ctx.portalUser.clientId,
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

        codRequired: clientAccount.codAllowed ? input.newShipment.codRequired : 0,
        codAmount: clientAccount.codAllowed && input.newShipment.codRequired ? (input.newShipment.codAmount || null) : null,
        codCurrency: clientAccount.codAllowed && input.newShipment.codRequired ? (input.newShipment.codCurrency || 'AED') : 'AED',
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
        createdBy: ctx.portalUser.email || 'customer',
      });

      await createTrackingEvent({
        shipmentId: newOrder.id,
        eventDatetime: new Date(),
        statusCode: 'pending_pickup',
        statusLabel: 'EXCHANGE NEW SHIPMENT PENDING',
        description: `Exchange new shipment for ${originalOrder.waybillNumber}`,
        createdBy: ctx.portalUser.email || 'customer',
      });

      return {
        success: true,
        message: `Exchange created! Return: ${returnWaybill}, New: ${newWaybill}`,
        returnOrder,
        newOrder,
      };
    }),

  // Create manual return/exchange (without existing waybill)
  createManualReturnExchange: portalCustomerProcedure
    .input(z.object({
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
      // COD for exchange new shipment
      exchangeCodRequired: z.number().default(0),
      exchangeCodAmount: z.string().optional(),
      exchangeCodCurrency: z.string().default('AED'),
    }))
    .mutation(async ({ input, ctx }) => {
      const clientAccount = await getClientAccountById(ctx.portalUser.clientId);
      if (!clientAccount) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Client account not found' });
      }

      // Create return/pickup waybill
      const returnWaybill = await generateWaybillNumber();
      const returnOrder = await createOrder({
        clientId: ctx.portalUser.clientId,
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
        createdBy: ctx.portalUser.email || 'customer',
      });

      let newOrder = null;

      // If exchange, create new shipment
      if (input.type === 'exchange' && input.exchangeCustomerName && input.exchangeAddress && input.exchangeCity) {
        const newWaybill = await generateWaybillNumber();
        newOrder = await createOrder({
          clientId: ctx.portalUser.clientId,
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

          codRequired: clientAccount.codAllowed ? input.exchangeCodRequired : 0,
          codAmount: clientAccount.codAllowed && input.exchangeCodRequired ? (input.exchangeCodAmount || null) : null,
          codCurrency: clientAccount.codAllowed && input.exchangeCodRequired ? (input.exchangeCodCurrency || 'AED') : 'AED',
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
            createdBy: ctx.portalUser.email || 'customer',
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

  // Update COD on exchange order (only if pending_pickup)
  updateExchangeCod: portalCustomerProcedure
    .input(z.object({
      orderId: z.number(),
      codRequired: z.number(), // 0 or 1
      codAmount: z.string().optional(),
      codCurrency: z.string().default('AED'),
    }))
    .mutation(async ({ input, ctx }) => {
      const order = await getOrderById(input.orderId);
      if (!order || order.clientId !== ctx.portalUser.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Order not found or access denied' });
      }

      if (order.orderType !== 'exchange') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'COD can only be modified on exchange orders' });
      }

      if (order.status !== 'pending_pickup') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'COD can only be modified while the order is pending pickup' });
      }

      // Check if client has COD enabled
      const clientAccount = await getClientAccountById(ctx.portalUser.clientId);
      if (!clientAccount || !clientAccount.codAllowed) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'COD is not enabled for your account' });
      }

      const db = await import('./db').then(m => m.getDb());
      const { orders } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      await db!.update(orders).set({
        codRequired: input.codRequired,
        codAmount: input.codRequired ? (input.codAmount || null) : null,
        codCurrency: input.codRequired ? input.codCurrency : 'AED',
      }).where(eq(orders.id, input.orderId));

      return { success: true, message: input.codRequired ? 'COD updated successfully' : 'COD removed successfully' };
    }),

  // Get customer analytics
  getMyAnalytics: portalCustomerProcedure
    .query(async ({ ctx }) => {
      const db = await import('./db').then(m => m.getDb());
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const { orders, codRecords } = await import('../drizzle/schema');
      const { sql, gte, and, eq } = await import('drizzle-orm');

      const clientId = ctx.portalUser.clientId;
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
  getDashboardMetrics: portalCustomerProcedure
    .query(async ({ ctx }) => {
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
            eq(orders.clientId, ctx.portalUser.clientId),
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
            eq(orders.clientId, ctx.portalUser.clientId),
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
            eq(orders.clientId, ctx.portalUser.clientId),
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
        .where(eq(orders.clientId, ctx.portalUser.clientId))
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
            eq(orders.clientId, ctx.portalUser.clientId),
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
  getMonthlyReport: portalCustomerProcedure
    .input(z.object({
      month: z.string(), // Format: YYYY-MM
    }))
    .query(async ({ input, ctx }) => {
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
            eq(orders.clientId, ctx.portalUser.clientId),
            gte(orders.createdAt, startDate),
            lt(orders.createdAt, endDate)
          )
        );

      return monthlyOrders;
    }),

  // Get COD report data
  getCODReport: portalCustomerProcedure
    .query(async ({ ctx }) => {
      const db = await import('./db').then(m => m.getDb());
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const { codRecords, orders } = await import('../drizzle/schema');
      const { eq, and, ne } = await import('drizzle-orm');

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
        .where(and(eq(orders.clientId, ctx.portalUser.clientId), ne(codRecords.status, 'cancelled')));

      return codData;
    }),

  // Get saved shippers
  getSavedShippers: portalCustomerProcedure
    .query(async ({ ctx }) => {
      const { getSavedShippersByClient } = await import('./db');
      return await getSavedShippersByClient(ctx.portalUser.clientId);
    }),

  // Create saved shipper
  createSavedShipper: portalCustomerProcedure
    .input(z.object({
      nickname: z.string().min(1, 'Nickname is required'),
      shipperName: z.string().min(1, 'Shipper name is required'),
      shipperAddress: z.string().min(1, 'Shipper address is required'),
      shipperCity: z.string().min(1, 'Shipper city is required'),
      shipperCountry: z.string().min(1, 'Shipper country is required'),
      shipperPhone: z.string().min(1, 'Shipper phone is required'),
    }))
    .mutation(async ({ input, ctx }) => {
      const { createSavedShipper } = await import('./db');
      const id = await createSavedShipper({
        clientId: ctx.portalUser.clientId,
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
  deleteSavedShipper: portalCustomerProcedure
    .input(z.object({
      shipperId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { deleteSavedShipper } = await import('./db');
      await deleteSavedShipper(input.shipperId, ctx.portalUser.clientId);

      return { success: true };
    }),

  // Customer: Update account settings (hideShipperAddress)
  updateAccountSettings: portalCustomerProcedure
    .input(z.object({
      hideShipperAddress: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const updateData: Record<string, number> = {};
      if (input.hideShipperAddress !== undefined) {
        updateData.hideShipperAddress = input.hideShipperAddress;
      }

      if (Object.keys(updateData).length === 0) {
        return { success: true };
      }

      const result = await updateClientAccount(ctx.portalUser.clientId, updateData);
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
  getBillableShipments: portalAdminProcedure
    .input(z.object({
      clientId: z.number(),
      periodStart: z.string(),
      periodEnd: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const { getBillableShipments } = await import('./db');
      return await getBillableShipments(
        input.clientId,
        new Date(input.periodStart),
        new Date(input.periodEnd)
      );
    }),

  // Admin: Generate invoice for a client
  generateInvoice: portalAdminProcedure
    .input(z.object({
      clientId: z.number(),
      periodStart: z.string(), // ISO date
      periodEnd: z.string(), // ISO date
      shipmentIds: z.array(z.number()).optional(), // Optional list of specific shipments to invoice
    }))
    .mutation(async ({ input, ctx }) => {
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

      // Notify the client that their invoice is ready
      try {
        const from = new Date(input.periodStart).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        const to = new Date(input.periodEnd).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        await createNotification(
          input.clientId,
          'INVOICE_GENERATED',
          'New Invoice Available',
          `Your invoice for the period ${from} – ${to} has been generated and is ready for review.`,
          'invoices'
        );
      } catch (_) { /* notification errors must never break invoicing */ }

      return { invoiceId };
    }),

  // Admin: Get billable international shipments for a client in a period
  getBillableIntlShipments: portalAdminProcedure
    .input(z.object({
      clientId: z.number(),
      periodStart: z.string(),
      periodEnd: z.string(),
    }))
    .query(async ({ input }) => {
      const { getBillableIntlShipments } = await import('./db');
      return await getBillableIntlShipments(
        input.clientId,
        new Date(input.periodStart),
        new Date(input.periodEnd)
      );
    }),

  // Admin: Generate international invoice for a client
  generateIntlInvoice: portalAdminProcedure
    .input(z.object({
      clientId: z.number(),
      periodStart: z.string(),
      periodEnd: z.string(),
      shipmentIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const { generateIntlInvoiceForClient } = await import('./db');
      const invoiceId = await generateIntlInvoiceForClient(
        input.clientId,
        new Date(input.periodStart),
        new Date(input.periodEnd),
        input.shipmentIds
      );

      if (!invoiceId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No international shipments found for this period' });
      }

      try {
        const from = new Date(input.periodStart).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        const to = new Date(input.periodEnd).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        await createNotification(
          input.clientId,
          'INVOICE_GENERATED',
          'New International Invoice Available',
          `Your international invoice for the period ${from} – ${to} has been generated and is ready for review.`,
          'invoices'
        );
      } catch (_) { /* notification errors must never break invoicing */ }

      return { invoiceId };
    }),

  // Admin: Get all invoices
  getAllInvoices: portalAdminProcedure
    .query(async ({ ctx }) => {
      return await getAllInvoices();
    }),

  // Customer: Get my invoices
  getMyInvoices: portalCustomerProcedure
    .query(async ({ ctx }) => {
      return await getInvoicesByClient(ctx.portalUser.clientId);
    }),

  // Get invoice details with items
  getInvoiceDetails: portalProtectedProcedure
    .input(z.object({
      invoiceId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const invoice = await getInvoiceById(input.invoiceId);
      if (!invoice) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
      }

      // Check access: admin can see all, customer can only see their own
      if (ctx.portalUser.role === 'customer' && invoice.clientId !== ctx.portalUser.clientId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const items = await getInvoiceItems(input.invoiceId);

      return {
        invoice,
        items,
      };
    }),

  // Admin: Update invoice status
  updateInvoiceStatus: portalAdminProcedure
    .input(z.object({
      invoiceId: z.number(),
      status: z.enum(['pending', 'paid', 'overdue']),
    }))
    .mutation(async ({ input, ctx }) => {
      await updateInvoiceStatus(input.invoiceId, input.status);

      return { success: true };
    }),

  // Admin: Update invoice details
  updateInvoice: portalAdminProcedure
    .input(z.object({
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
    .mutation(async ({ input, ctx }) => {
      // Mark as adjusted if there are adjustment notes
      const updateData: any = { ...input.data };
      if (input.data.adjustmentNotes) {
        updateData.isAdjusted = 1;
        updateData.lastAdjustedBy = ctx.portalUser.userId;
        updateData.lastAdjustedAt = new Date();
      }

      await updateInvoice(input.invoiceId, updateData);

      return { success: true };
    }),

  // Customer: Update account settings (hideShipperAddress)
  updateAccountSettings: portalCustomerProcedure
    .input(z.object({
      hideShipperAddress: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { updateClientAccount } = await import('./db');

      const updateData: any = {};
      if (input.hideShipperAddress !== undefined) {
        updateData.hideShipperAddress = input.hideShipperAddress;
      }

      if (Object.keys(updateData).length === 0) {
        return { success: true };
      }

      const result = await updateClientAccount(ctx.portalUser.clientId, updateData);
      if (!result) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update settings' });
      }

      return { success: true };
    }),

  // Admin: Delete invoice (only if pending)
  deleteInvoice: portalAdminProcedure
    .input(z.object({
      invoiceId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { deleteInvoice } = await import('./db');
      const result = await deleteInvoice(input.invoiceId);

      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
      }

      return { success: true };
    }),

  // Admin: Add invoice item (manual charge like bags, discounts, etc.)
  addInvoiceItem: portalAdminProcedure
    .input(z.object({
      invoiceId: z.number(),
      description: z.string().min(1, 'Description is required'),
      quantity: z.number().min(1).default(1),
      unitPrice: z.string(), // Can be negative for discounts
    }))
    .mutation(async ({ input, ctx }) => {
      const { addInvoiceItem, recalculateInvoiceTotals, updateInvoice } = await import('./db');

      const itemId = await addInvoiceItem({
        invoiceId: input.invoiceId,
        description: input.description,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
      });

      if (!itemId) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to add invoice item' });
      }

      // Recalculate totals and mark as adjusted
      await recalculateInvoiceTotals(input.invoiceId);
      await updateInvoice(input.invoiceId, {
        isAdjusted: 1,
        lastAdjustedBy: ctx.portalUser.userId,
        lastAdjustedAt: new Date(),
      });

      return { success: true, itemId };
    }),

  // Admin: Delete invoice item (only manual items without shipmentId)
  deleteInvoiceItem: portalAdminProcedure
    .input(z.object({
      invoiceId: z.number(),
      itemId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { deleteInvoiceItem, recalculateInvoiceTotals, updateInvoice } = await import('./db');

      const result = await deleteInvoiceItem(input.itemId);

      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
      }

      // Recalculate totals
      await recalculateInvoiceTotals(input.invoiceId);
      await updateInvoice(input.invoiceId, {
        isAdjusted: 1,
        lastAdjustedBy: ctx.portalUser.userId,
        lastAdjustedAt: new Date(),
      });

      return { success: true };
    }),
});

/**
 * COD (Cash on Delivery) router
 */
const codRouter = router({
  // Admin: Get all COD records
  getAllCODRecords: portalAdminProcedure
    .query(async ({ ctx }) => {
      return await getAllCODRecords();
    }),

  // Admin: Get COD summary
  getCODSummary: portalAdminProcedure
    .query(async ({ ctx }) => {
      return await getCODSummaryGlobal();
    }),

  // Admin: Get pending COD for a client
  getPendingCODByClient: portalAdminProcedure
    .input(z.object({
      clientId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      return await getPendingCODByClient(input.clientId);
    }),

  // Admin: Update COD record status
  updateCODStatus: portalAdminProcedure
    .input(z.object({
      codRecordId: z.number(),
      status: z.enum(['pending_collection', 'collected', 'remitted', 'disputed', 'cancelled']),
    }))
    .mutation(async ({ input, ctx }) => {
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
  createRemittance: portalAdminProcedure
    .input(z.object({
      clientId: z.number(),
      codRecordIds: z.array(z.number()),
      paymentMethod: z.string().optional(),
      paymentReference: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
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
        createdBy: ctx.portalUser.userId,
      });

      return { remittanceId, remittanceNumber, grossAmount: grossAmount.toFixed(2), feeAmount: totalFee.toFixed(2), netAmount: netAmount.toFixed(2) };
    }),

  // Admin: Get all remittances
  getAllRemittances: portalAdminProcedure
    .query(async ({ ctx }) => {
      return await getAllRemittances();
    }),

  // Admin: Get remittance details
  getRemittanceDetails: portalAdminProcedure
    .input(z.object({
      remittanceId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const remittance = await getRemittanceById(input.remittanceId);
      if (!remittance) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Remittance not found' });
      }

      // Authorization check
      if (ctx.portalUser.role !== 'admin') {
        if (ctx.portalUser.role !== 'customer' || !ctx.portalUser.clientId || remittance.clientId !== ctx.portalUser.clientId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
      }

      const items = await getRemittanceItems(input.remittanceId);

      return { remittance, items };
    }),

  // Admin: Update remittance status
  updateRemittanceStatus: portalAdminProcedure
    .input(z.object({
      remittanceId: z.number(),
      status: z.enum(['pending', 'processed', 'completed']),
    }))
    .mutation(async ({ input, ctx }) => {
      const processedDate = input.status === 'processed' || input.status === 'completed' ? new Date() : undefined;
      await updateRemittanceStatus(input.remittanceId, input.status, processedDate);

      // Notify client when a remittance has been completed (money paid)
      if (input.status === 'completed') {
        try {
          const rem = await getRemittanceById(input.remittanceId);
          if (rem) {
            await createNotification(
              rem.clientId,
              'COD_UPDATE',
              'COD Remittance Paid',
              `Remittance ${rem.remittanceNumber} for ${rem.totalAmount} ${rem.currency} has been marked as completed and transferred to your account.`,
              'cod'
            );
          }
        } catch (_) { /* never break the main flow */ }
      }

      return { success: true };
    }),

  // Customer: Get my COD records
  getMyCODRecords: portalCustomerProcedure
    .query(async ({ ctx }) => {
      return await getCODRecordsByClient(ctx.portalUser.clientId);
    }),

  // Customer: Get my COD summary
  getMyCODSummary: portalCustomerProcedure
    .query(async ({ ctx }) => {
      return await getCODSummaryByClient(ctx.portalUser.clientId);
    }),

  // Customer: Get my remittances
  getMyRemittances: portalCustomerProcedure
    .query(async ({ ctx }) => {
      return await getRemittancesByClient(ctx.portalUser.clientId);
    }),
});

// Export combined portal router
/**
 * Rate Engine Router
 */
export const rateRouter = router({
  listTiers: portalProtectedProcedure
    .query(async ({ ctx }) => {
      return await getAllRateTiers();
    }),

  calculate: portalProtectedProcedure
    .input(z.object({
      clientId: z.number(),
      serviceType: z.enum(["DOM", "SDD", "BULLET"]),
      weight: z.number(),
      length: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      emirate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.portalUser) throw new TRPCError({ code: 'UNAUTHORIZED' });

      const result = await calculateShipmentRate({
        clientId: input.clientId,
        serviceType: input.serviceType,
        weight: input.weight,
        length: input.length,
        width: input.width,
        height: input.height,
        emirate: input.emirate,
      });

      return result;
    }),

  calculateCOD: portalProtectedProcedure
    .input(z.object({
      codAmount: z.number(),
      clientId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.portalUser) throw new TRPCError({ code: 'UNAUTHORIZED' });

      let targetClientId = 0;
      if (ctx.portalUser.role === 'customer') {
        targetClientId = ctx.portalUser.clientId || 0;
      } else if (input.clientId) {
        targetClientId = input.clientId;
      }

      const fee = await calculateCODFee(input.codAmount, targetClientId);
      return { fee };
    }),

  getTiers: portalAdminProcedure
    .query(async ({ ctx }) => {
      const tiers = await getAllRateTiers();
      return tiers;
    }),
});

export const clientsRouter = router({
  list: portalAdminProcedure
    .query(async ({ ctx }) => {
      return await getAllClientAccounts();
    }),

  updateTier: portalAdminProcedure
    .input(z.object({
      clientId: z.number(),
      tierId: z.number().nullable(),
      // Custom rates (used when tierId is null and these are provided)
      customDomBaseRate: z.string().optional(),
      customDomPerKg: z.string().optional(),
      customSddBaseRate: z.string().optional(),
      customSddPerKg: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
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

      invalidateClientAccountsCache();
      return { success: true };
    }),

  updateSettings: portalAdminProcedure
    .input(z.object({
      clientId: z.number(),
      codAllowed: z.boolean(),
      codFeePercent: z.string().optional(),
      codMinFee: z.string().optional(),
      codMaxFee: z.string().optional(),
      fodAllowed: z.boolean().optional(),
      fodFee: z.string().optional(),
      bulletAllowed: z.boolean().optional(),
      customBulletBaseRate: z.string().optional(),
      customBulletPerKg: z.string().optional(),
      intlAllowed: z.boolean().optional(),
      intlDiscountPercent: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
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
          fodAllowed: input.fodAllowed ? 1 : 0,
          fodFee: input.fodFee || null,
          bulletAllowed: input.bulletAllowed ? 1 : 0,
          customBulletBaseRate: input.customBulletBaseRate || null,
          customBulletPerKg: input.customBulletPerKg || null,
          intlAllowed: input.intlAllowed ? 1 : 0,
          intlDiscountPercent: input.intlDiscountPercent || null,
        })
        .where(eq(clientAccounts.id, input.clientId));

      invalidateClientAccountsCache();
      return { success: true };
    }),

  getWithTiers: portalAdminProcedure
    .query(async ({ ctx }) => {
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

  updateZoneRates: portalAdminProcedure
    .input(z.object({
      clientId: z.number(),
      zone1BaseRate: z.string().optional(),
      zone1PerKg:    z.string().optional(),
      zone2BaseRate: z.string().optional(),
      zone2PerKg:    z.string().optional(),
      zone3BaseRate: z.string().optional(),
      zone3PerKg:    z.string().optional(),
      sddBaseRate:   z.string().optional(),
      sddPerKg:      z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await import('./db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const { clientAccounts } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      await db.update(clientAccounts)
        .set({
          zone1BaseRate:      input.zone1BaseRate      ?? null,
          zone1PerKg:         input.zone1PerKg         ?? null,
          zone2BaseRate:      input.zone2BaseRate      ?? null,
          zone2PerKg:         input.zone2PerKg         ?? null,
          zone3BaseRate:      input.zone3BaseRate      ?? null,
          zone3PerKg:         input.zone3PerKg         ?? null,
          customSddBaseRate:  input.sddBaseRate        ?? null,
          customSddPerKg:     input.sddPerKg           ?? null,
        })
        .where(eq(clientAccounts.id, input.clientId));

      invalidateClientAccountsCache();
      return { success: true };
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
          codRequired: order.codRequired,
          codAmount: order.codAmount,
          codCurrency: order.codCurrency,
          shipperCity: order.shipperCity,
          shipperCountry: order.shipperCountry,
        },
        trackingEvents,
      };
    }),
});

const trackingRouter = router({
  addEvent: portalAdminProcedure
    .input(z.object({
      shipmentId: z.number(),
      eventDatetime: z.string(),
      location: z.string().optional(),
      statusCode: z.string(),
      statusLabel: z.string(),
      description: z.string().optional(),
      podFileUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await createTrackingEvent({
        shipmentId: input.shipmentId,
        eventDatetime: new Date(input.eventDatetime),
        location: input.location,
        statusCode: input.statusCode,
        statusLabel: input.statusLabel,
        description: input.description,
        podFileUrl: input.podFileUrl,
        createdBy: ctx.portalUser.email || 'admin',
      });

      // Update order status
      await updateOrderStatus(input.shipmentId, input.statusCode);

      cacheInvalidate('admin:allOrders');
      return { success: true };
    }),

  getEvents: portalProtectedProcedure
    .input(z.object({ shipmentId: z.number() }))
    .query(async ({ input }) => {
      return getTrackingEventsByShipmentId(input.shipmentId);
    }),
});

/**
 * International Rates Router
 */
const internationalRatesRouter = router({
  // Get list of all available destination countries
  countries: publicProcedure
    .query(async ({ ctx }) => {
      const { getCountryList, loadRatesFromDB } = await import('./internationalRateEngine');
      const { getDb } = await import('./db');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      return await getCountryList(db);
    }),

  // Calculate international shipping rates
  quote: portalProtectedProcedure
    .input(z.object({
      originCountry: z.string().min(1),
      destinationCountry: z.string().min(1),
      realWeightKg: z.number().positive(),
      dimensionsCm: z.object({
        length: z.number().positive(),
        width: z.number().positive(),
        height: z.number().positive(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const { quote, loadRatesFromDB, validateInput } = await import('./internationalRateEngine');
      const { getDb } = await import('./db');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const quoteInput = {
        originCountry: input.originCountry,
        destinationCountry: input.destinationCountry,
        realWeightKg: input.realWeightKg,
        dimensionsCm: input.dimensionsCm,
      };

      const errors = validateInput(quoteInput);
      if (errors.length > 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: errors.join(' ') });
      }

      // Load rates from DB
      const rateData = await loadRatesFromDB(db);

      // Get client discount if applicable
      let discountPercent: number | undefined;
      if (ctx.portalUser.clientId) {
        const client = await getClientAccountById(ctx.portalUser.clientId);
        if (client?.intlDiscountPercent) {
          discountPercent = parseFloat(client.intlDiscountPercent);
        }
      }

      return quote(rateData, quoteInput, discountPercent);
    }),

  // Admin: Get all international rates from DB
  getAll: portalAdminProcedure
    .input(z.object({
      rateType: z.enum(['prime', 'gcc', 'premium']).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { getDb } = await import('./db');
      const { internationalRates: intlRatesTable } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      if (input.rateType) {
        return await db.select().from(intlRatesTable).where(eq(intlRatesTable.rateType, input.rateType));
      }
      return await db.select().from(intlRatesTable);
    }),

  // Admin: Update a specific rate
  updateRate: portalAdminProcedure
    .input(z.object({
      rateId: z.number(),
      price: z.string(),
      isActive: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getDb } = await import('./db');
      const { internationalRates: intlRatesTable } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const updateData: any = { price: input.price };
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      await db.update(intlRatesTable).set(updateData).where(eq(intlRatesTable.id, input.rateId));
      return { success: true };
    }),

  // Admin: Get all country maps
  getCountryMaps: portalAdminProcedure
    .query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { internationalCountryMaps } = await import('../drizzle/schema');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      return await db.select().from(internationalCountryMaps);
    }),

});


// ==================== NOTIFICATIONS ROUTER ====================

const notificationsRouter = router({
  // Get unread notification count (for the bell badge)
  getUnreadCount: portalCustomerProcedure
    .query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { notifications } = await import('../drizzle/schema');
      const { eq, and, sql } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return { count: 0 };

      const result = await db
        .select({ count: sql<number>`cast(count(*) as unsigned)` })
        .from(notifications)
        .where(and(
          eq(notifications.clientId, ctx.portalUser.clientId),
          eq(notifications.isRead, 0)
        ));

      return { count: Number(result[0]?.count || 0) };
    }),

  // List notifications (most recent first)
  list: portalCustomerProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const { getDb } = await import('./db');
      const { notifications } = await import('../drizzle/schema');
      const { eq, desc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];

      return await db
        .select()
        .from(notifications)
        .where(eq(notifications.clientId, ctx.portalUser.clientId))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit);
    }),

  // Mark notification(s) as read
  markAsRead: portalCustomerProcedure
    .input(z.object({
      notificationId: z.number().optional(), // If omitted, marks ALL as read
    }))
    .mutation(async ({ input, ctx }) => {
      const { getDb } = await import('./db');
      const { notifications } = await import('../drizzle/schema');
      const { eq, and } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      if (input.notificationId) {
        // Mark single as read (only if it belongs to this client)
        await db.update(notifications)
          .set({ isRead: 1 })
          .where(and(
            eq(notifications.id, input.notificationId),
            eq(notifications.clientId, ctx.portalUser.clientId)
          ));
      } else {
        // Mark all as read for this client
        await db.update(notifications)
          .set({ isRead: 1 })
          .where(eq(notifications.clientId, ctx.portalUser.clientId));
      }

      return { success: true };
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
  drivers: driverRouter,
  internationalRates: internationalRatesRouter,
  notifications: notificationsRouter,
});
