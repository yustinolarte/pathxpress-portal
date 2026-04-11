import { eq, and, gte, lte, desc, sql, inArray, ne, or, notInArray } from "drizzle-orm";
import { cachedQuery, cacheInvalidate } from './_core/queryCache';
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { InsertUser, users, invoices, invoiceItems, codRecords, codRemittances, codRemittanceItems, orders, clientAccounts, rateTiers, serviceConfig, RateTier } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
// Uses a connection pool so Railway doesn't kill stale idle connections (ETIMEDOUT).
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 15,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000, // 10s keepalive
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Tracking queries
export async function getShipmentByTrackingId(trackingId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get shipment: database not available");
    return undefined;
  }

  const { shipments } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.select().from(shipments).where(eq(shipments.trackingId, trackingId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Quote request queries
export async function createQuoteRequest(data: {
  name: string;
  phone: string;
  email: string;
  pickupAddress: string;
  deliveryAddress?: string;
  serviceType: string;
  weight: string;
  comments?: string;
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create quote request: database not available");
    throw new Error("Database not available");
  }

  const { quoteRequests } = await import("../drizzle/schema");
  const result = await db.insert(quoteRequests).values({
    name: data.name,
    phone: data.phone,
    email: data.email,
    pickupAddress: data.pickupAddress,
    deliveryAddress: data.deliveryAddress || null,
    serviceType: data.serviceType,
    weight: data.weight,
    comments: data.comments || null,
  });

  return result;
}

export async function getAllQuoteRequests() {
  const db = await getDb();
  if (!db) return [];

  const { quoteRequests } = await import("../drizzle/schema");
  const { desc } = await import("drizzle-orm");

  try {
    return await db.select().from(quoteRequests).orderBy(desc(quoteRequests.createdAt));
  } catch (error) {
    console.error("[Database] Failed to get quote requests:", error);
    return [];
  }
}


export async function deleteQuoteRequest(id: number) {
  const db = await getDb();
  if (!db) return false;

  const { quoteRequests } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");

  try {
    await db.delete(quoteRequests).where(eq(quoteRequests.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete quote request:", error);
    return false;
  }
}

// Contact Message queries
export async function createContactMessage(data: {
  name: string;
  email: string;
  message: string;
}) {
  const db = await getDb();
  if (!db) return null;

  const { contactMessages } = await import("../drizzle/schema");

  try {
    const [result] = await db.insert(contactMessages).values(data);
    return result;
  } catch (error) {
    console.error("[Database] Failed to create contact message:", error);
    throw error;
  }
}

export async function getAllContactMessages() {
  const db = await getDb();
  if (!db) return [];

  const { contactMessages } = await import("../drizzle/schema");
  const { desc } = await import("drizzle-orm");

  try {
    return await db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt));
  } catch (error) {
    console.error("[Database] Failed to get contact messages:", error);
    return [];
  }
}

export async function deleteContactMessage(id: number) {
  const db = await getDb();
  if (!db) return false;

  const { contactMessages } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");

  try {
    await db.delete(contactMessages).where(eq(contactMessages.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete contact message:", error);
    return false;
  }
}

// International rate request queries
export async function createInternationalRateRequest(data: {
  originCountry: string;
  destinationCountry: string;
  deliveryDate: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  phone: string;
  email: string;
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create international rate request: database not available");
    throw new Error("Database not available");
  }

  const { internationalRateRequests } = await import("../drizzle/schema");
  const result = await db.insert(internationalRateRequests).values({
    originCountry: data.originCountry,
    destinationCountry: data.destinationCountry,
    deliveryDate: data.deliveryDate,
    weight: data.weight,
    length: data.length,
    width: data.width,
    height: data.height,
    phone: data.phone,
    email: data.email,
  });

  return result;
}


// ==================== PORTAL DATABASE FUNCTIONS ====================

import {
  portalUsers, InsertPortalUser, PortalUser,
  InsertClientAccount, ClientAccount,
  InsertOrder, Order,
  trackingEvents, InsertTrackingEvent
} from "../drizzle/schema";

/**
 * Portal Users
 */
export async function createPortalUser(user: InsertPortalUser): Promise<PortalUser | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(portalUsers).values(user);
    const insertedId = Number(result[0].insertId);
    return getPortalUserById(insertedId);
  } catch (error) {
    console.error("[Database] Failed to create portal user:", error);
    return null;
  }
}

export async function getPortalUserByEmail(email: string): Promise<PortalUser | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.select().from(portalUsers).where(eq(portalUsers.email, email)).limit(1);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[Database] Failed to get portal user by email:", error);
    return null;
  }
}

export async function getPortalUserById(id: number): Promise<PortalUser | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.select().from(portalUsers).where(eq(portalUsers.id, id)).limit(1);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[Database] Failed to get portal user by id:", error);
    return null;
  }
}

export async function updatePortalUserLastSignIn(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db.update(portalUsers).set({ lastSignedIn: new Date() }).where(eq(portalUsers.id, id));
  } catch (error) {
    console.error("[Database] Failed to update last sign in:", error);
  }
}

export async function updatePortalUserPassword(id: number, passwordHash: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db.update(portalUsers).set({ passwordHash }).where(eq(portalUsers.id, id));
  } catch (error) {
    console.error("[Database] Failed to update password:", error);
    throw error;
  }
}

/**
 * Client Accounts
 */
export async function createClientAccount(client: InsertClientAccount): Promise<ClientAccount | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(clientAccounts).values(client);
    const insertedId = Number(result[0].insertId);
    const inserted = await db.select().from(clientAccounts).where(eq(clientAccounts.id, insertedId)).limit(1);
    return inserted.length > 0 ? inserted[0] : null;
  } catch (error) {
    console.error("[Database] Failed to create client account:", error);
    return null;
  }
}

export async function getAllClientAccounts(): Promise<ClientAccount[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await cachedQuery('all_client_accounts', 5 * 60, () =>
      db!.select().from(clientAccounts).orderBy(clientAccounts.companyName)
    );
  } catch (error) {
    console.error("[Database] Failed to get client accounts:", error);
    return [];
  }
}

export function invalidateClientAccountsCache() {
  cacheInvalidate('all_client_accounts');
}

export async function getClientAccountById(id: number): Promise<ClientAccount | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.select().from(clientAccounts).where(eq(clientAccounts.id, id)).limit(1);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[Database] Failed to get client account:", error);
    return null;
  }
}

export async function updateClientAccount(id: number, data: Partial<InsertClientAccount>): Promise<ClientAccount | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    await db.update(clientAccounts).set(data).where(eq(clientAccounts.id, id));
    return getClientAccountById(id);
  } catch (error) {
    console.error("[Database] Failed to update client account:", error);
    return null;
  }
}


// Estados que se consideran "pendientes" y bloquean la eliminación del cliente
const PENDING_ORDER_STATUSES = ['pending_pickup', 'picked_up', 'in_transit', 'out_for_delivery'];

export async function deleteClientAccount(id: number): Promise<{ success: boolean; error?: string; pendingOrdersCount?: number }> {
  const db = await getDb();
  if (!db) return { success: false, error: 'Database not available' };

  const { clientAccounts } = await import("../drizzle/schema");
  const { eq, and, inArray } = await import("drizzle-orm");

  try {
    // Verificar si hay órdenes pendientes
    const pendingOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.clientId, id),
          inArray(orders.status, PENDING_ORDER_STATUSES)
        )
      );

    if (pendingOrders.length > 0) {
      return {
        success: false,
        error: `No se puede eliminar este cliente porque tiene ${pendingOrders.length} orden(es) pendiente(s) por entregar. Por favor, complete o cancele todas las órdenes antes de eliminar el cliente.`,
        pendingOrdersCount: pendingOrders.length
      };
    }

    await db.delete(clientAccounts).where(eq(clientAccounts.id, id));
    return { success: true };
  } catch (error) {
    console.error("[Database] Failed to delete client account:", error);
    return { success: false, error: 'Error al eliminar el cliente' };
  }
}

/**
 * Orders/Shipments
 */
export async function createOrder(order: InsertOrder): Promise<Order | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(orders).values(order);
    const insertedId = Number(result[0].insertId);
    const inserted = await db.select().from(orders).where(eq(orders.id, insertedId)).limit(1);
    return inserted.length > 0 ? inserted[0] : null;
  } catch (error) {
    console.error("[Database] Failed to create order:", error);
    return null;
  }
}

export async function getAllOrders(): Promise<Order[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db.select().from(orders).orderBy(orders.createdAt);
  } catch (error) {
    console.error("[Database] Failed to get orders:", error);
    return [];
  }
}

export async function getOrdersByClientId(clientId: number): Promise<Order[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db.select().from(orders).where(eq(orders.clientId, clientId)).orderBy(orders.createdAt);
  } catch (error) {
    console.error("[Database] Failed to get orders by client:", error);
    return [];
  }
}

export async function getOrderById(id: number): Promise<Order | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[Database] Failed to get order:", error);
    return null;
  }
}

export async function getOrderByWaybill(waybillNumber: string): Promise<Order | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.select().from(orders).where(eq(orders.waybillNumber, waybillNumber)).limit(1);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[Database] Failed to get order by waybill:", error);
    return null;
  }
}

/**
 * Update an existing order with validation
 * - Blocks editing if order is already invoiced
 * - Handles COD record creation/update/cancellation
 */
export interface OrderUpdate {
  serviceType?: string;
  weight?: string;
  pieces?: number;
  codRequired?: number; // 0 or 1
  codAmount?: string;
  codCurrency?: string;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  city?: string;
  specialInstructions?: string;
  fitOnDelivery?: number;
}

export async function updateOrder(
  orderId: number,
  updates: OrderUpdate
): Promise<{ success: boolean; order?: Order; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  try {
    const { invoiceItems, codRecords } = await import("../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");

    // 1. Fetch order, invoice check, and ALL COD records for this shipment
    const [existingOrder, invoicedItems, allShipmentCodRecords] = await Promise.all([
      getOrderById(orderId),
      db.select().from(invoiceItems).where(eq(invoiceItems.shipmentId, orderId)).limit(1),
      db.select().from(codRecords).where(eq(codRecords.shipmentId, orderId)),
    ]);

    if (!existingOrder) {
      return { success: false, error: "Order not found" };
    }

    if (invoicedItems.length > 0) {
      return {
        success: false,
        error: "This order is already included in an invoice and cannot be edited. Please contact support if changes are needed."
      };
    }

    // 2. Handle COD changes
    const oldCodRequired = existingOrder.codRequired === 1;
    const newCodRequired = updates.codRequired !== undefined ? updates.codRequired === 1 : oldCodRequired;

    // Active record = any non-cancelled, non-remitted record
    const activeRecord = allShipmentCodRecords.find(r => r.status !== 'cancelled');
    const remittedRecord = allShipmentCodRecords.find(r => r.status === 'remitted');

    // Case A: COD disabled -> cancel ALL active records for this shipment
    if (oldCodRequired && !newCodRequired) {
      if (remittedRecord) {
        return {
          success: false,
          error: "Cannot disable COD: the amount has already been remitted to the client"
        };
      }
      // Cancel all non-cancelled records (cleans up any duplicates too)
      const activeIds = allShipmentCodRecords
        .filter(r => r.status !== 'cancelled')
        .map(r => r.id);
      if (activeIds.length > 0) {
        const { inArray: inArr } = await import('drizzle-orm');
        await db.update(codRecords)
          .set({ status: 'cancelled' })
          .where(inArr(codRecords.id, activeIds));
      }
    }

    // Case B: COD enabled -> delete any stale cancelled records, then insert fresh
    if (!oldCodRequired && newCodRequired) {
      const codAmount = updates.codAmount || '0';
      const codCurrency = updates.codCurrency || 'AED';

      // Clean up old cancelled records to avoid duplicates accumulating
      const cancelledIds = allShipmentCodRecords
        .filter(r => r.status === 'cancelled')
        .map(r => r.id);
      if (cancelledIds.length > 0) {
        const { inArray: inArr } = await import('drizzle-orm');
        await db.delete(codRecords).where(inArr(codRecords.id, cancelledIds));
      }

      await db.insert(codRecords).values({
        shipmentId: orderId,
        codAmount,
        codCurrency,
        status: 'pending_collection',
      });
    }

    // Case C: COD stays enabled but amount changed -> update the active record
    if (oldCodRequired && newCodRequired && activeRecord && updates.codAmount) {
      if (remittedRecord) {
        return {
          success: false,
          error: "Cannot modify COD amount: the amount has already been remitted to the client"
        };
      }
      await db.update(codRecords)
        .set({
          codAmount: updates.codAmount,
          codCurrency: updates.codCurrency || activeRecord.codCurrency
        })
        .where(eq(codRecords.id, activeRecord.id));
    }

    // 4. Build update object for orders table
    const orderUpdates: Partial<InsertOrder> = {};

    if (updates.serviceType !== undefined) orderUpdates.serviceType = updates.serviceType;
    if (updates.weight !== undefined) orderUpdates.weight = updates.weight;
    if (updates.pieces !== undefined) orderUpdates.pieces = updates.pieces;
    if (updates.codRequired !== undefined) orderUpdates.codRequired = updates.codRequired;
    if (updates.codAmount !== undefined) orderUpdates.codAmount = updates.codAmount;
    if (updates.codCurrency !== undefined) orderUpdates.codCurrency = updates.codCurrency;
    if (updates.customerName !== undefined) orderUpdates.customerName = updates.customerName;
    if (updates.customerPhone !== undefined) orderUpdates.customerPhone = updates.customerPhone;
    if (updates.address !== undefined) orderUpdates.address = updates.address;
    if (updates.city !== undefined) orderUpdates.city = updates.city;
    if (updates.specialInstructions !== undefined) orderUpdates.specialInstructions = updates.specialInstructions;
    if (updates.fitOnDelivery !== undefined) orderUpdates.fitOnDelivery = updates.fitOnDelivery;

    // 5. Update the order
    if (Object.keys(orderUpdates).length > 0) {
      await db.update(orders).set(orderUpdates).where(eq(orders.id, orderId));
    }

    // 6. Return updated order
    const updatedOrder = await getOrderById(orderId);
    return { success: true, order: updatedOrder! };

  } catch (error) {
    console.error("[Database] Failed to update order:", error);
    return { success: false, error: "Failed to update order" };
  }
}

export async function updateOrderStatus(id: number, status: string): Promise<Order | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const { codRecords } = await import("../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");

    // Update order status
    await db.update(orders).set({ status, lastStatusUpdate: new Date() }).where(eq(orders.id, id));

    // Sync routeOrders.status so the driver app reflects the change.
    // Only update stops that are still in a non-terminal state (in_progress / pending).
    const { routeOrders } = await import("../drizzle/schema");
    const nonTerminalStatuses = ['pending', 'in_progress'];
    // Map order status → routeOrder status
    const routeOrderStatus =
      status === 'delivered' ? 'delivered' :
      status === 'picked_up' ? 'picked_up' :
      status === 'attempted' ? 'attempted' :
      status === 'returned' || status === 'returned_to_sender' ? 'returned' :
      status === 'failed' || status === 'failed_delivery' ? 'failed' :
      status === 'on_hold' ? 'on_hold' :
      null; // don't sync for pending/in_progress/out_for_delivery — driver app manages those
    if (routeOrderStatus) {
      await db.update(routeOrders)
        .set({ status: routeOrderStatus })
        .where(
          and(
            eq(routeOrders.orderId, id),
            inArray(routeOrders.status, nonTerminalStatuses)
          )
        );
    }

    // If status is a "failure" status, cancel pending COD
    const failureStatuses = ['returned', 'returned_to_sender', 'failed_delivery', 'cancelled'];
    if (failureStatuses.includes(status)) {
      // Find pending COD record for this shipment
      await db.update(codRecords)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(codRecords.shipmentId, id),
            eq(codRecords.status, 'pending_collection')
          )
        );
    }

    return getOrderById(id);
  } catch (error) {
    console.error("[Database] Failed to update order status:", error);
    return null;
  }
}

/**
 * Tracking Events
 */
export async function createTrackingEvent(event: InsertTrackingEvent): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(trackingEvents).values(event);
  } catch (error) {
    console.error("[Database] Failed to create tracking event:", error);
  }
}

export async function getTrackingEventsByShipmentId(shipmentId: number) {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db.select().from(trackingEvents).where(eq(trackingEvents.shipmentId, shipmentId)).orderBy(desc(trackingEvents.eventDatetime));
  } catch (error) {
    console.error("[Database] Failed to get tracking events:", error);
    return [];
  }
}

/**
 * Generate a random 3-character alphanumeric suffix for waybill numbers.
 * Excludes visually ambiguous characters: I, O, 0, 1.
 */
function generateWaybillSuffix(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 3; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Generate next waybill number
 * Format: PX + YEAR + 5-digit incremental + random suffix (e.g., PX202500001-K7X)
 * or PXI... for international
 */
export async function generateWaybillNumber(isInternational = false): Promise<string> {
  const db = await getDb();
  const year = new Date().getFullYear();
  const basePrefix = isInternational ? `PXI` : `PX`;
  const fullPrefix = `${basePrefix}${year}`;

  if (!db) return `${fullPrefix}00001-${generateWaybillSuffix()}`;

  try {
    // Get all waybill numbers for this year and find the highest
    const allOrders = await db
      .select({ waybillNumber: orders.waybillNumber })
      .from(orders)
      .where(sql`${orders.waybillNumber} LIKE ${fullPrefix + '%'}`)
      .orderBy(desc(orders.waybillNumber))
      .limit(1);

    if (allOrders.length === 0) {
      return `${fullPrefix}00001-${generateWaybillSuffix()}`;
    }

    // Extract the number and increment (parseInt stops at '-', handles both old and new format)
    const lastNumber = parseInt(allOrders[0].waybillNumber.slice(fullPrefix.length));
    const nextNumber = (lastNumber + 1).toString().padStart(5, '0');
    return `${fullPrefix}${nextNumber}-${generateWaybillSuffix()}`;
  } catch (error) {
    console.error("[Database] Failed to generate waybill number:", error);
    // Fallback: use timestamp to ensure uniqueness
    const timestamp = Date.now().toString().slice(-5);
    return `${fullPrefix}${timestamp}-${generateWaybillSuffix()}`;
  }
}


// ============================================
// INVOICE FUNCTIONS
// ============================================

// Helper to get billable shipments
// Helper to calculate rate for a shipment
export const calculateRate = (client: any, shipment: any, domTier: any, sddTier: any): number => {
  // Logic for Exchange: Charge only 1 leg for the two waybills via "Free Return" logic
  // We charge the forward leg (isReturn=0) and make the return leg (isReturn=1) free
  if (shipment.orderType === 'exchange' && shipment.isReturn === 1) {
    return 0;
  }

  // Logic for standard Returns: Use fixed return fee if set on client
  if (shipment.isReturn === 1 && shipment.orderType !== 'exchange' && client.returnFee) {
    return parseFloat(client.returnFee);
  }

  const weight = parseFloat(shipment.weight || '0');
  const isBasWeight = weight <= 5;
  const additionalKg = Math.max(0, weight - 5);
  const serviceType = shipment.serviceType?.toUpperCase() || 'DOM';

  let baseRate = 0;
  let perKgRate = 0;

  // Priority 1: Custom rates
  if (serviceType === 'BULLET') {
    if (client.customBulletBaseRate && client.customBulletPerKg &&
      client.customBulletBaseRate.trim() !== '' && client.customBulletPerKg.trim() !== '') {
      baseRate = parseFloat(client.customBulletBaseRate);
      perKgRate = parseFloat(client.customBulletPerKg);
    } else {
      // Default BULLET rates
      baseRate = 50;
      perKgRate = 5;
    }
  } else if (serviceType === 'SDD' || serviceType === 'SAME DAY') {
    if (client.customSddBaseRate && client.customSddPerKg &&
      client.customSddBaseRate.trim() !== '' && client.customSddPerKg.trim() !== '') {
      baseRate = parseFloat(client.customSddBaseRate);
      perKgRate = parseFloat(client.customSddPerKg);
    } else if (sddTier) {
      baseRate = parseFloat(sddTier.baseRate);
      perKgRate = parseFloat(sddTier.additionalKgRate);
    } else {
      // Default SDD rates
      baseRate = 25;
      perKgRate = 3;
    }
  } else {
    // DOM
    if (client.customDomBaseRate && client.customDomPerKg &&
      client.customDomBaseRate.trim() !== '' && client.customDomPerKg.trim() !== '') {
      baseRate = parseFloat(client.customDomBaseRate);
      perKgRate = parseFloat(client.customDomPerKg);
    } else if (domTier) {
      baseRate = parseFloat(domTier.baseRate);
      perKgRate = parseFloat(domTier.additionalKgRate);
    } else {
      // Default DOM rates
      baseRate = 15;
      perKgRate = 2;
    }
  }

  // Calculate total: base rate + additional kg rate
  let total = isBasWeight ? baseRate : baseRate + (additionalKg * perKgRate);

  // Add FOD fee if Fit on Delivery is enabled
  if (shipment.fitOnDelivery === 1) {
    const fodFee = client?.fodFee ? parseFloat(client.fodFee) : 5.00;
    total += fodFee;
  }

  return Math.round(total * 100) / 100; // Round to 2 decimals
};

// Helper to get billable shipments with calculated rates
export async function getBillableShipments(clientId: number, periodStart: Date, periodEnd: Date) {
  const db = await getDb();
  if (!db) return [];

  const { invoiceItems } = await import("../drizzle/schema");
  const { isNull, inArray } = await import("drizzle-orm");

  // Get client for FOD/return fee handling
  const [client] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, clientId)).limit(1);
  if (!client) return [];

  // Use lastStatusUpdate (delivery/return date) instead of createdAt
  // so shipments delivered after their creation period are still captured
  const periodEndFullDay = new Date(periodEnd);
  periodEndFullDay.setHours(23, 59, 59, 999);

  const UAE_VALUES = ['UAE', 'United Arab Emirates', 'UNITED ARAB EMIRATES'];

  const shipmentsData = await db
    .select({
      order: orders,
    })
    .from(orders)
    .leftJoin(invoiceItems, eq(orders.id, invoiceItems.shipmentId))
    .where(
      and(
        eq(orders.clientId, clientId),
        gte(orders.lastStatusUpdate, periodStart),
        lte(orders.lastStatusUpdate, periodEndFullDay),
        inArray(orders.status, ['delivered', 'returned', 'returned_to_sender', 'exchange']),
        isNull(invoiceItems.id),
        inArray(orders.destinationCountry, UAE_VALUES)
      )
    );

  // Calculate rates using the full rate engine (zone-based, custom, tiers)
  const shipmentsWithRates = await Promise.all(
    shipmentsData.map(async (d) => {
      const order = d.order;

      // Exchange free return — second leg is free
      if (order.orderType === 'exchange' && order.isReturn === 1) {
        return { ...order, calculatedRate: 0 };
      }

      // Standard return with fixed fee
      if (order.isReturn === 1 && order.orderType !== 'exchange' && client.returnFee) {
        return { ...order, calculatedRate: parseFloat(client.returnFee) };
      }

      const serviceType = (order.serviceType?.toUpperCase() || 'DOM') as 'DOM' | 'SDD' | 'BULLET';
      const rateResult = await calculateShipmentRate({
        clientId,
        serviceType,
        weight: parseFloat(order.weight || '0'),
        emirate: order.emirate || undefined,
      });

      let total = rateResult.totalRate;

      // Add FOD fee if applicable
      if (order.fitOnDelivery === 1) {
        const fodFee = client.fodFee ? parseFloat(client.fodFee) : 5.00;
        total += fodFee;
      }

      return { ...order, calculatedRate: Math.round(total * 100) / 100 };
    })
  );

  return shipmentsWithRates;
}

export async function generateInvoiceForClient(
  clientId: number,
  periodStart: Date,
  periodEnd: Date,
  shipmentIds?: number[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let shipments: typeof orders.$inferSelect[] = [];
  const { invoiceItems, rateTiers } = await import("../drizzle/schema");

  if (shipmentIds && shipmentIds.length > 0) {
    const { inArray, isNull } = await import("drizzle-orm");
    // Also verify shipments are not already invoiced (double-invoice protection)
    const results = await db
      .select({ order: orders })
      .from(orders)
      .leftJoin(invoiceItems, eq(orders.id, invoiceItems.shipmentId))
      .where(
        and(
          eq(orders.clientId, clientId),
          inArray(orders.id, shipmentIds),
          inArray(orders.status, ['delivered', 'returned', 'returned_to_sender', 'exchange']),
          isNull(invoiceItems.id)
        )
      );
    shipments = results.map(r => r.order);
  } else {
    // If getting all billable, we can reuse getBillableShipments logic but we need raw orders
    const result = await getBillableShipments(clientId, periodStart, periodEnd);
    // Remove calculatedRate property to match type
    shipments = result.map(({ calculatedRate, ...order }) => order as any);
  }

  if (shipments.length === 0) {
    return null;
  }

  // Get client info for FOD/return fee
  const [client] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, clientId)).limit(1);
  if (!client) throw new Error("Client not found");

  // Calculate totals using the zone-based rate engine
  let subtotal = 0;
  const shipmentRates: { shipment: typeof orders.$inferSelect; shippingRate: number; fodFee: number }[] = [];

  for (const shipment of shipments) {
    let totalRate = 0;

    // Exchange free return
    if (shipment.orderType === 'exchange' && shipment.isReturn === 1) {
      totalRate = 0;
    // Standard return with fixed fee
    } else if (shipment.isReturn === 1 && shipment.orderType !== 'exchange' && client.returnFee) {
      totalRate = parseFloat(client.returnFee);
    } else {
      const serviceType = (shipment.serviceType?.toUpperCase() || 'DOM') as 'DOM' | 'SDD' | 'BULLET';
      const rateResult = await calculateShipmentRate({
        clientId,
        serviceType,
        weight: parseFloat(shipment.weight || '0'),
        emirate: shipment.emirate || undefined,
      });
      totalRate = rateResult.totalRate;
    }

    let shippingRate = totalRate;
    let fodFee = 0;

    if (shipment.fitOnDelivery === 1) {
      fodFee = client?.fodFee ? parseFloat(client.fodFee) : 5.00;
      shippingRate = totalRate;
      totalRate += fodFee;
    }

    subtotal += totalRate;
    shipmentRates.push({ shipment, shippingRate, fodFee });
  }

  const tax = 0; // No tax for shipping in UAE 
  const total = subtotal + tax;

  // Create invoice
  const now = new Date();
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 30); // 30 days payment term

  // Generate consecutive invoice number: INV-YYYY-MM-001
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `INV-${year}-${month}-`;
  const { sql: sqlFn } = await import('drizzle-orm');
  const [lastInvoice] = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(sqlFn`invoiceNumber LIKE ${prefix + '%'}`)
    .orderBy(sqlFn`invoiceNumber DESC`)
    .limit(1);
  let nextSeq = 1;
  if (lastInvoice?.invoiceNumber) {
    const parts = lastInvoice.invoiceNumber.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }
  const invoiceNumber = `${prefix}${String(nextSeq).padStart(3, '0')}`;

  const [invoice] = await db.insert(invoices).values({
    clientId,
    invoiceNumber,
    periodFrom: periodStart,
    periodTo: periodEnd,
    issueDate: now,
    dueDate,
    subtotal: subtotal.toFixed(2),
    taxes: tax.toFixed(2),
    total: total.toFixed(2),
    amountPaid: '0',
    balance: total.toFixed(2),
    status: 'pending',
    currency: 'AED',
  });


  // Create invoice items with correct rates
  for (const { shipment, shippingRate, fodFee } of shipmentRates) {
    const weight = parseFloat(shipment.weight || '0');
    const svcUpper = shipment.serviceType?.toUpperCase() || 'DOM';
    let serviceLabel = 'DOM';
    if (svcUpper === 'SDD' || svcUpper === 'SAME DAY') {
      serviceLabel = 'SDD';
    } else if (svcUpper === 'BULLET') {
      serviceLabel = 'BULLET';
    }

    // Shipping Item
    await db.insert(invoiceItems).values({
      invoiceId: invoice.insertId,
      shipmentId: shipment.id,
      description: `${shipment.waybillNumber} - ${serviceLabel} - ${weight}kg - ${shipment.city}`,
      quantity: 1,
      unitPrice: shippingRate.toFixed(2),
      total: shippingRate.toFixed(2),
    });

    // FOD Fee Item
    if (fodFee > 0) {
      await db.insert(invoiceItems).values({
        invoiceId: invoice.insertId,
        shipmentId: shipment.id,
        description: `${shipment.waybillNumber} - FOD Service Fee`,
        quantity: 1,
        unitPrice: fodFee.toFixed(2),
        total: fodFee.toFixed(2),
      });
    }
  }

  return invoice.insertId;
}

// ─── International Billing ────────────────────────────────────────────────────

const UAE_COUNTRIES = ['UAE', 'United Arab Emirates', 'UNITED ARAB EMIRATES'];

export async function getBillableIntlShipments(clientId: number, periodStart: Date, periodEnd: Date) {
  const db = await getDb();
  if (!db) return [];

  const { invoiceItems } = await import("../drizzle/schema");
  const { isNull, inArray: drizzleInArray } = await import("drizzle-orm");
  const { loadRatesFromDB, quote, normalizeCountryName } = await import('./internationalRateEngine');

  const [client] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, clientId)).limit(1);
  if (!client) return [];

  const periodEndFullDay = new Date(periodEnd);
  periodEndFullDay.setHours(23, 59, 59, 999);

  const shipmentsData = await db
    .select({ order: orders })
    .from(orders)
    .leftJoin(invoiceItems, eq(orders.id, invoiceItems.shipmentId))
    .where(
      and(
        eq(orders.clientId, clientId),
        gte(orders.lastStatusUpdate, periodStart),
        lte(orders.lastStatusUpdate, periodEndFullDay),
        drizzleInArray(orders.status, ['delivered', 'returned', 'returned_to_sender', 'exchange']),
        isNull(invoiceItems.id),
        notInArray(orders.destinationCountry, UAE_COUNTRIES)
      )
    );

  if (shipmentsData.length === 0) return [];

  const rateData = await loadRatesFromDB(db);
  const discountPct = client.intlDiscountPercent ? parseFloat(client.intlDiscountPercent) : undefined;

  const shipmentsWithRates = await Promise.all(
    shipmentsData.map(async (d) => {
      const order = d.order;

      // Exchange free return — second leg is free
      if (order.orderType === 'exchange' && order.isReturn === 1) {
        return { ...order, calculatedRate: 0 };
      }

      // Standard return with fixed fee
      if (order.isReturn === 1 && order.orderType !== 'exchange' && client.returnFee) {
        return { ...order, calculatedRate: parseFloat(client.returnFee) };
      }

      try {
        const quoteResult = quote(rateData, {
          originCountry: 'United Arab Emirates',
          destinationCountry: order.destinationCountry,
          realWeightKg: parseFloat(order.weight || '0.5'),
          dimensionsCm: {
            length: parseFloat(order.length || '10'),
            width: parseFloat(order.width || '10'),
            height: parseFloat(order.height || '10'),
          },
        }, discountPct);

        const matchingOption = quoteResult.options.find(o => o.serviceKey === order.serviceType)
          ?? quoteResult.options[0];
        const rate = matchingOption ? (matchingOption.totalAfterDiscount ?? matchingOption.total) : 0;
        return { ...order, calculatedRate: Math.round(rate * 100) / 100 };
      } catch {
        return { ...order, calculatedRate: 0 };
      }
    })
  );

  return shipmentsWithRates;
}

export async function generateIntlInvoiceForClient(
  clientId: number,
  periodStart: Date,
  periodEnd: Date,
  shipmentIds?: number[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { invoiceItems, invoices: invoicesTable } = await import("../drizzle/schema");
  const { isNull, inArray: drizzleInArray } = await import("drizzle-orm");
  const { loadRatesFromDB, quote } = await import('./internationalRateEngine');

  let shipments: typeof orders.$inferSelect[] = [];

  if (shipmentIds && shipmentIds.length > 0) {
    const results = await db
      .select({ order: orders })
      .from(orders)
      .leftJoin(invoiceItems, eq(orders.id, invoiceItems.shipmentId))
      .where(
        and(
          eq(orders.clientId, clientId),
          drizzleInArray(orders.id, shipmentIds),
          drizzleInArray(orders.status, ['delivered', 'returned', 'returned_to_sender', 'exchange']),
          isNull(invoiceItems.id),
          notInArray(orders.destinationCountry, UAE_COUNTRIES)
        )
      );
    shipments = results.map(r => r.order);
  } else {
    const result = await getBillableIntlShipments(clientId, periodStart, periodEnd);
    shipments = result.map(({ calculatedRate, ...order }) => order as any);
  }

  if (shipments.length === 0) return null;

  const [client] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, clientId)).limit(1);
  if (!client) throw new Error("Client not found");

  const rateData = await loadRatesFromDB(db);
  const discountPct = client.intlDiscountPercent ? parseFloat(client.intlDiscountPercent) : undefined;

  let subtotal = 0;
  const shipmentRates: { shipment: typeof orders.$inferSelect; shippingRate: number }[] = [];

  for (const shipment of shipments) {
    let totalRate = 0;

    if (shipment.orderType === 'exchange' && shipment.isReturn === 1) {
      totalRate = 0;
    } else if (shipment.isReturn === 1 && shipment.orderType !== 'exchange' && client.returnFee) {
      totalRate = parseFloat(client.returnFee);
    } else {
      try {
        const quoteResult = quote(rateData, {
          originCountry: 'United Arab Emirates',
          destinationCountry: shipment.destinationCountry,
          realWeightKg: parseFloat(shipment.weight || '0.5'),
          dimensionsCm: {
            length: parseFloat(shipment.length || '10'),
            width: parseFloat(shipment.width || '10'),
            height: parseFloat(shipment.height || '10'),
          },
        }, discountPct);

        const matchingOption = quoteResult.options.find(o => o.serviceKey === shipment.serviceType)
          ?? quoteResult.options[0];
        totalRate = matchingOption ? (matchingOption.totalAfterDiscount ?? matchingOption.total) : 0;
      } catch {
        totalRate = 0;
      }
    }

    subtotal += totalRate;
    shipmentRates.push({ shipment, shippingRate: totalRate });
  }

  const now = new Date();
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 30);

  // Invoice number: INTLINV-YYYY-MM-NNN
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `INTLINV-${year}-${month}-`;
  const { sql: sqlFn } = await import('drizzle-orm');
  const [lastInvoice] = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(sqlFn`invoiceNumber LIKE ${prefix + '%'}`)
    .orderBy(sqlFn`invoiceNumber DESC`)
    .limit(1);
  let nextSeq = 1;
  if (lastInvoice?.invoiceNumber) {
    const parts = lastInvoice.invoiceNumber.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }
  const invoiceNumber = `${prefix}${String(nextSeq).padStart(3, '0')}`;

  const total = subtotal;
  const [invoice] = await db.insert(invoices).values({
    clientId,
    invoiceNumber,
    periodFrom: periodStart,
    periodTo: periodEnd,
    issueDate: now,
    dueDate,
    subtotal: subtotal.toFixed(2),
    taxes: '0.00',
    total: total.toFixed(2),
    amountPaid: '0',
    balance: total.toFixed(2),
    status: 'pending',
    currency: 'AED',
  });

  for (const { shipment, shippingRate } of shipmentRates) {
    const weight = parseFloat(shipment.weight || '0');
    const svcLabel = shipment.serviceType || 'INTL';
    await db.insert(invoiceItems).values({
      invoiceId: invoice.insertId,
      shipmentId: shipment.id,
      description: `${shipment.waybillNumber} - ${svcLabel} - ${weight}kg - ${shipment.destinationCountry}`,
      quantity: 1,
      unitPrice: shippingRate.toFixed(2),
      total: shippingRate.toFixed(2),
    });
  }

  return invoice.insertId;
}

export async function getInvoicesByClient(clientId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(invoices).where(eq(invoices.clientId, clientId)).orderBy(desc(invoices.createdAt));
}

export async function getAllInvoices() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(invoices).orderBy(desc(invoices.createdAt));
}

export async function getInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return invoice || null;
}

export async function getInvoiceItems(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
}

export async function updateInvoiceStatus(id: number, status: 'pending' | 'paid' | 'overdue') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(invoices).set({ status }).where(eq(invoices.id, id));
}

export async function updateInvoice(id: number, data: Partial<{
  subtotal: string;
  taxes: string;
  total: string;
  amountPaid: string;
  balance: string;
  status: 'pending' | 'paid' | 'overdue';
  notes: string;
  adjustmentNotes: string;
  isAdjusted: number;
  lastAdjustedBy: number;
  lastAdjustedAt: Date;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(invoices).set(data).where(eq(invoices.id, id));
}

// Delete invoice (only if pending)
export async function deleteInvoice(id: number): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Check if invoice exists and is pending
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!invoice) {
    return { success: false, error: "Invoice not found" };
  }

  if (invoice.status !== 'pending') {
    return { success: false, error: "Only pending invoices can be deleted" };
  }

  // Delete invoice items first
  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));

  // Delete invoice
  await db.delete(invoices).where(eq(invoices.id, id));

  return { success: true };
}

// Add invoice item (for manual charges like bags, discounts, etc.)
export async function addInvoiceItem(data: {
  invoiceId: number;
  description: string;
  quantity: number;
  unitPrice: string;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const total = (data.quantity * parseFloat(data.unitPrice)).toFixed(2);

  const [result] = await db.insert(invoiceItems).values({
    invoiceId: data.invoiceId,
    shipmentId: null, // null means it's a manual item
    description: data.description,
    quantity: data.quantity,
    unitPrice: data.unitPrice,
    total,
  });

  return result.insertId;
}

// Delete invoice item (only manual items without shipmentId)
export async function deleteInvoiceItem(itemId: number): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Check if item exists and is a manual item (no shipmentId)
  const [item] = await db.select().from(invoiceItems).where(eq(invoiceItems.id, itemId)).limit(1);
  if (!item) {
    return { success: false, error: "Invoice item not found" };
  }

  if (item.shipmentId !== null) {
    return { success: false, error: "Cannot delete shipment items, only manual charges can be deleted" };
  }

  await db.delete(invoiceItems).where(eq(invoiceItems.id, itemId));

  return { success: true };
}

// Recalculate invoice totals based on items
export async function recalculateInvoiceTotals(invoiceId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));

  const subtotal = items.reduce((sum, item) => sum + parseFloat(item.total), 0);
  const taxes = 0; // UAE has no VAT on shipping
  const total = subtotal + taxes;

  // Get current invoice to preserve amountPaid
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  const amountPaid = invoice ? parseFloat(invoice.amountPaid || '0') : 0;
  const balance = total - amountPaid;

  await db.update(invoices).set({
    subtotal: subtotal.toFixed(2),
    taxes: taxes.toFixed(2),
    total: total.toFixed(2),
    balance: balance.toFixed(2),
  }).where(eq(invoices.id, invoiceId));
}

// ==================== COD Functions ====================

export async function getCODRecordsByClient(clientId: number) {
  const db = await getDb();
  if (!db) return [];

  // Get COD records for shipments belonging to this client
  const result = await db
    .select({
      codRecord: codRecords,
      order: orders,
    })
    .from(codRecords)
    .innerJoin(orders, eq(codRecords.shipmentId, orders.id))
    .where(and(eq(orders.clientId, clientId), ne(codRecords.status, 'cancelled')))
    .orderBy(desc(codRecords.createdAt));

  return result.map(r => ({ ...r.codRecord, order: r.order }));
}

export async function getAllCODRecords() {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      codRecord: codRecords,
      order: orders,
      client: clientAccounts,
    })
    .from(codRecords)
    .innerJoin(orders, eq(codRecords.shipmentId, orders.id))
    .leftJoin(clientAccounts, eq(orders.clientId, clientAccounts.id))
    .where(ne(codRecords.status, 'cancelled'))
    .orderBy(desc(codRecords.createdAt));

  return result.map(r => ({ ...r.codRecord, order: r.order, client: r.client }));
}

export async function getPendingCODByClient(clientId: number) {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      codRecord: codRecords,
      order: orders,
    })
    .from(codRecords)
    .innerJoin(orders, eq(codRecords.shipmentId, orders.id))
    .where(
      and(
        eq(orders.clientId, clientId),
        eq(codRecords.status, 'collected')
      )
    )
    .orderBy(desc(codRecords.collectedDate));

  return result.map(r => ({ ...r.codRecord, order: r.order }));
}

export async function createCODRemittance(data: {
  clientId: number;
  remittanceNumber: string;
  grossAmount: string;
  feeAmount: string;
  feePercentage: string;
  totalAmount: string;
  currency: string;
  shipmentCount: number;
  codRecordIds: number[];
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Create remittance
  const [remittance] = await db.insert(codRemittances).values({
    clientId: data.clientId,
    remittanceNumber: data.remittanceNumber,
    grossAmount: data.grossAmount,
    feeAmount: data.feeAmount,
    feePercentage: data.feePercentage,
    totalAmount: data.totalAmount,
    currency: data.currency,
    shipmentCount: data.shipmentCount,
    status: 'pending',
    paymentMethod: data.paymentMethod || null,
    paymentReference: data.paymentReference || null,
    notes: data.notes || null,
    createdBy: data.createdBy,
  });

  const remittanceId = remittance.insertId;

  // Link COD records to remittance — batch instead of N+1 loop
  const allCodRecords = await db.select().from(codRecords).where(inArray(codRecords.id, data.codRecordIds));

  if (allCodRecords.length > 0) {
    await db.insert(codRemittanceItems).values(
      allCodRecords.map(codRecord => ({
        remittanceId,
        codRecordId: codRecord.id,
        shipmentId: codRecord.shipmentId,
        amount: codRecord.codAmount,
        currency: codRecord.codCurrency,
      }))
    );

    await db.update(codRecords)
      .set({ status: 'remitted', remittedToClientDate: new Date() })
      .where(inArray(codRecords.id, allCodRecords.map(r => r.id)));
  }

  return remittanceId;
}

export async function getRemittancesByClient(clientId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(codRemittances).where(eq(codRemittances.clientId, clientId)).orderBy(desc(codRemittances.createdAt));
}

export async function getAllRemittances() {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      remittance: codRemittances,
      client: clientAccounts,
    })
    .from(codRemittances)
    .leftJoin(clientAccounts, eq(codRemittances.clientId, clientAccounts.id))
    .orderBy(desc(codRemittances.createdAt));

  return result.map(r => ({ ...r.remittance, client: r.client }));
}

export async function getRemittanceById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const [remittance] = await db.select().from(codRemittances).where(eq(codRemittances.id, id)).limit(1);
  return remittance || null;
}

export async function getRemittanceItems(remittanceId: number) {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      item: codRemittanceItems,
      order: orders,
      codRecord: codRecords,
    })
    .from(codRemittanceItems)
    .innerJoin(orders, eq(codRemittanceItems.shipmentId, orders.id))
    .leftJoin(codRecords, eq(codRemittanceItems.codRecordId, codRecords.id))
    .where(eq(codRemittanceItems.remittanceId, remittanceId));

  return result.map(r => ({ ...r.item, order: r.order, codRecord: r.codRecord }));
}

export async function updateRemittanceStatus(id: number, status: 'pending' | 'processed' | 'completed', processedDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = { status };
  if (processedDate) {
    updateData.processedDate = processedDate;
  }

  await db.update(codRemittances).set(updateData).where(eq(codRemittances.id, id));
}

export async function generateRemittanceNumber(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const year = new Date().getFullYear();
  const prefix = `REM-${year}-`;

  // Get the latest remittance number for this year
  const [latest] = await db
    .select()
    .from(codRemittances)
    .where(sql`${codRemittances.remittanceNumber} LIKE ${prefix + '%'}`)
    .orderBy(desc(codRemittances.createdAt))
    .limit(1);

  let nextNumber = 1;
  if (latest) {
    const lastNumber = parseInt(latest.remittanceNumber.split('-').pop() || '0');
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${String(nextNumber).padStart(6, '0')}`;
}

export async function getCODSummaryByClient(clientId: number) {
  const db = await getDb();
  if (!db) return { pending: '0', collected: '0', remitted: '0', total: '0' };

  const records = await db
    .select()
    .from(codRecords)
    .innerJoin(orders, eq(codRecords.shipmentId, orders.id))
    .where(eq(orders.clientId, clientId));

  let pending = 0;
  let collected = 0;
  let remitted = 0;

  records.forEach(r => {
    const amount = parseFloat(r.codRecords.codAmount);
    if (r.codRecords.status === 'pending_collection') pending += amount;
    else if (r.codRecords.status === 'collected') collected += amount;
    else if (r.codRecords.status === 'remitted') remitted += amount;
  });

  return {
    pending: pending.toFixed(2),
    collected: collected.toFixed(2),
    remitted: remitted.toFixed(2),
    total: (pending + collected + remitted).toFixed(2),
  };
}

export async function getCODSummaryGlobal() {
  const db = await getDb();
  if (!db) return { pending: '0', collected: '0', remitted: '0', total: '0' };

  // Aggregate in SQL — avoids loading the entire table into memory
  const rows = await db
    .select({
      status: codRecords.status,
      total: sql<string>`COALESCE(SUM(CAST(${codRecords.codAmount} AS DECIMAL(15,2))), 0)`,
    })
    .from(codRecords)
    .groupBy(codRecords.status);

  let pending = 0, collected = 0, remitted = 0;
  for (const row of rows) {
    const amount = parseFloat(row.total);
    if (row.status === 'pending_collection') pending = amount;
    else if (row.status === 'collected') collected = amount;
    else if (row.status === 'remitted') remitted = amount;
  }

  return {
    pending: pending.toFixed(2),
    collected: collected.toFixed(2),
    remitted: remitted.toFixed(2),
    total: (pending + collected + remitted).toFixed(2),
  };
}


// ============================================
// RATE ENGINE FUNCTIONS
// ============================================

/**
 * Get monthly shipment count for a client
 */
export async function getMonthlyShipmentCount(clientId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const result = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.clientId, clientId),
        gte(orders.createdAt, firstDayOfMonth)
      )
    );

  return result.length;
}

/**
 * Calculate rate for a shipment based on service type, weight, and client volume
 */
/**
 * Map an emirate/city name to a delivery zone (1, 2, or 3).
 * Zone 1: Dubai, Sharjah, Ajman, Abu Dhabi
 * Zone 2: Umm Al Quwain, Ras Al Khaimah, Fujairah
 * Zone 3: everything else (remote areas)
 */
export function getZoneFromEmirate(emirate: string): 1 | 2 | 3 {
  const normalized = emirate.toLowerCase().trim();
  const zone1 = ['dubai', 'sharjah', 'ajman', 'abu dhabi', 'abudhabi'];
  const zone2 = ['umm al quwain', 'uaq', 'ras al khaimah', 'rak', 'fujairah'];
  if (zone1.some(z => normalized.includes(z))) return 1;
  if (zone2.some(z => normalized.includes(z))) return 2;
  return 3;
}

export async function calculateShipmentRate(params: {
  clientId: number;
  serviceType: "DOM" | "SDD" | "BULLET";
  weight: number; // in kg
  length?: number; // cm
  width?: number; // cm
  height?: number; // cm
  emirate?: string; // destination emirate for zone-based pricing
}): Promise<{
  baseRate: number;
  additionalKgCharge: number;
  totalRate: number;
  appliedTier: RateTier | null;
  usingManualTier: boolean;
  usingCustomRates?: boolean;
  chargeableWeight?: number;
}> {
  const db = await getDb();
  if (!db) {
    return { baseRate: 0, additionalKgCharge: 0, totalRate: 0, appliedTier: null, usingManualTier: false };
  }

  // Check if client exists and has custom rates
  const client = await getClientAccountById(params.clientId);

  // PRIORITY 0: Zone-based rates (DOM only)
  // If client has zone rates set, use them. Emirate determines the zone; defaults to Zone 1 if none provided.
  if (client && params.serviceType === "DOM" && (client.zone1BaseRate || client.zone2BaseRate || client.zone3BaseRate)) {
    const zone = params.emirate ? getZoneFromEmirate(params.emirate) : 1;
    const rawBase = zone === 1 ? client.zone1BaseRate : zone === 2 ? client.zone2BaseRate : client.zone3BaseRate;
    const rawPkg  = zone === 1 ? client.zone1PerKg   : zone === 2 ? client.zone2PerKg   : client.zone3PerKg;
    // If the resolved zone has no rate (e.g. zone 3 not configured), fallback to zone 1
    const effectiveBase = rawBase || client.zone1BaseRate;
    const effectivePkg  = rawBase ? rawPkg : client.zone1PerKg;

    if (effectiveBase) {
      const baseRate = parseFloat(effectiveBase);
      const additionalKgRate = effectivePkg ? parseFloat(effectivePkg) : 0;
      const maxWeight = 5;
      let chargeableWeight = params.weight;

      if (params.length && params.width && params.height) {
        const volumetricWeight = (params.length * params.width * params.height) / 5000;
        chargeableWeight = Math.max(params.weight, volumetricWeight);
      }

      let additionalKgCharge = 0;
      if (chargeableWeight > maxWeight) {
        const extraKg = Math.ceil(chargeableWeight - maxWeight);
        additionalKgCharge = extraKg * additionalKgRate;
      }

      return {
        baseRate,
        additionalKgCharge,
        totalRate: baseRate + additionalKgCharge,
        appliedTier: null,
        usingManualTier: false,
        usingCustomRates: true,
        chargeableWeight,
      };
    }
  }

  // DOM: use client-specific flat rate if set and no zone rates configured
  if (params.serviceType === "DOM" && client) {
    const domBase = client.customDomBaseRate;
    const domPerKg = client.customDomPerKg;
    if (domBase) {
      const baseRate = parseFloat(domBase);
      const additionalKgRate = domPerKg ? parseFloat(domPerKg) : 0;
      const maxWeight = 5;
      let chargeableWeight = params.weight;
      if (params.length && params.width && params.height) {
        const volumetricWeight = (params.length * params.width * params.height) / 5000;
        chargeableWeight = Math.max(params.weight, volumetricWeight);
      }
      const additionalKgCharge = chargeableWeight > maxWeight
        ? Math.ceil(chargeableWeight - maxWeight) * additionalKgRate
        : 0;
      return {
        baseRate,
        additionalKgCharge,
        totalRate: baseRate + additionalKgCharge,
        appliedTier: null,
        usingManualTier: false,
        usingCustomRates: true,
        chargeableWeight,
      };
    }
  }

  // SDD: use client-specific rate if set (Zone 1 only), otherwise fall through to volume tier
  if (params.serviceType === "SDD" && client) {
    const sddBase = client.customSddBaseRate;
    const sddPerKg = client.customSddPerKg;
    if (sddBase) {
      const baseRate = parseFloat(sddBase);
      const additionalKgRate = sddPerKg ? parseFloat(sddPerKg) : 0;
      const maxWeight = 5;
      let chargeableWeight = params.weight;
      if (params.length && params.width && params.height) {
        const volumetricWeight = (params.length * params.width * params.height) / 5000;
        chargeableWeight = Math.max(params.weight, volumetricWeight);
      }
      const additionalKgCharge = chargeableWeight > maxWeight
        ? Math.ceil(chargeableWeight - maxWeight) * additionalKgRate
        : 0;
      return {
        baseRate,
        additionalKgCharge,
        totalRate: baseRate + additionalKgCharge,
        appliedTier: null,
        usingManualTier: false,
        usingCustomRates: true,
        chargeableWeight,
      };
    }
  }

  // BULLET: use client-specific rate if set, otherwise fixed default rates
  if (params.serviceType === "BULLET") {
    const bulletBase = client?.customBulletBaseRate;
    const bulletPerKg = client?.customBulletPerKg;
    const baseRate = bulletBase ? parseFloat(bulletBase) : 50;
    const additionalKgRate = bulletPerKg ? parseFloat(bulletPerKg) : 5;
    const maxWeight = 5;
    let chargeableWeight = params.weight;
    if (params.length && params.width && params.height) {
      const volumetricWeight = (params.length * params.width * params.height) / 5000;
      chargeableWeight = Math.max(params.weight, volumetricWeight);
    }
    const additionalKgCharge = chargeableWeight > maxWeight
      ? Math.ceil(chargeableWeight - maxWeight) * additionalKgRate
      : 0;
    return {
      baseRate,
      additionalKgCharge,
      totalRate: baseRate + additionalKgCharge,
      appliedTier: null,
      usingManualTier: false,
      usingCustomRates: bulletBase ? true : undefined,
      chargeableWeight,
    };
  }

  let applicableTier: RateTier | null = null;

  // PRIORITY 1 (fallback): calculate based on monthly volume tier
  {
    const monthlyVolume = await getMonthlyShipmentCount(params.clientId);

    // Find applicable rate tier
    const tiers = await db
      .select()
      .from(rateTiers)
      .where(
        and(
          eq(rateTiers.serviceType, params.serviceType as "DOM" | "SDD"),
          eq(rateTiers.isActive, 1),
          gte(rateTiers.minVolume, 0)
        )
      )
      .orderBy(rateTiers.minVolume);

    for (const tier of tiers) {
      if (monthlyVolume >= tier.minVolume) {
        if (tier.maxVolume === null || monthlyVolume <= tier.maxVolume) {
          applicableTier = tier;
          break;
        }
      }
    }

    // If no tier found, use the highest volume tier
    if (!applicableTier && tiers.length > 0) {
      applicableTier = tiers[tiers.length - 1];
    }
  }

  if (!applicableTier) {
    return { baseRate: 0, additionalKgCharge: 0, totalRate: 0, appliedTier: null, usingManualTier: false };
  }

  const baseRate = parseFloat(applicableTier.baseRate);
  const additionalKgRate = parseFloat(applicableTier.additionalKgRate);
  const maxWeight = applicableTier.maxWeight;

  let totalRate = baseRate;
  let additionalKgCharge = 0;

  let chargeableWeight = params.weight;

  if (params.length && params.width && params.height) {
    const volumetricWeight = (params.length * params.width * params.height) / 5000;
    chargeableWeight = Math.max(params.weight, volumetricWeight);
  }

  if (chargeableWeight > maxWeight) {
    const extraKg = Math.ceil(chargeableWeight - maxWeight);
    additionalKgCharge = extraKg * additionalKgRate;
    totalRate += additionalKgCharge;
  }

  return {
    baseRate,
    additionalKgCharge,
    totalRate,
    appliedTier: applicableTier,
    usingManualTier: false,
    chargeableWeight,
  };
}

/**
 * Calculate COD fee
 */
/**
 * Calculate COD fee
 */
export async function calculateCODFee(codAmount: number, clientId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // 1. Check for client-specific COD settings
  const client = await getClientAccountById(clientId);
  let percentage = 3.3; // Default
  let minFee = 2.0;    // Default

  // Overrides from client
  if (client?.codFeePercent) {
    percentage = parseFloat(client.codFeePercent);
  } else {
    // Fallback to global config
    const percentageConfig = await db
      .select()
      .from(serviceConfig)
      .where(eq(serviceConfig.configKey, "COD_FEE_PERCENTAGE"))
      .limit(1);
    if (percentageConfig[0]) {
      percentage = parseFloat(percentageConfig[0].configValue);
    }
  }

  if (client?.codMinFee) {
    minFee = parseFloat(client.codMinFee);
  } else {
    // Fallback to global config
    const minFeeConfig = await db
      .select()
      .from(serviceConfig)
      .where(eq(serviceConfig.configKey, "COD_MIN_FEE"))
      .limit(1);
    if (minFeeConfig[0]) {
      minFee = parseFloat(minFeeConfig[0].configValue);
    }
  }

  const calculatedFee = (codAmount * percentage) / 100;
  let finalFee = Math.max(calculatedFee, minFee);

  // Apply Max Fee CAP if defined
  if (client?.codMaxFee) {
    const maxFee = parseFloat(client.codMaxFee);
    if (!isNaN(maxFee) && maxFee > 0) {
      finalFee = Math.min(finalFee, maxFee);
    }
  }

  return finalFee;
}

/**
 * Get all active rate tiers
 */
export async function getAllRateTiers(): Promise<RateTier[]> {
  const db = await getDb();
  if (!db) return [];

  return await cachedQuery('all_rate_tiers', 60 * 60, () =>
    db!.select().from(rateTiers).where(eq(rateTiers.isActive, 1)).orderBy(rateTiers.serviceType, rateTiers.minVolume)
  );
}

/**
 * Get service configuration value
 */
export async function getServiceConfig(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(serviceConfig)
    .where(eq(serviceConfig.configKey, key))
    .limit(1);

  return result[0]?.configValue || null;
}


// Manual Tracking Management
export async function addTrackingEvent(data: {
  shipmentId: number;
  eventDatetime: Date;
  location?: string;
  statusCode: string;
  statusLabel: string;
  description?: string;
  podFileUrl?: string;
  createdBy: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(trackingEvents).values(data);
  return result;
}

// ==================== SAVED SHIPPERS FUNCTIONS ====================

export async function getSavedShippersByClient(clientId: number) {
  const db = await getDb();
  if (!db) return [];

  try {
    const { savedShippers } = await import('../drizzle/schema');
    const { eq } = await import('drizzle-orm');

    return await db.select().from(savedShippers).where(eq(savedShippers.clientId, clientId)).orderBy(savedShippers.createdAt);
  } catch (error) {
    console.error('[Database] Failed to get saved shippers:', error);
    return [];
  }
}

export async function createSavedShipper(data: {
  clientId: number;
  nickname: string;
  shipperName: string;
  shipperAddress: string;
  shipperCity: string;
  shipperCountry: string;
  shipperPhone: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const { savedShippers } = await import('../drizzle/schema');
    const [result] = await db.insert(savedShippers).values(data);
    return result.insertId;
  } catch (error) {
    console.error('[Database] Failed to create saved shipper:', error);
    throw error;
  }
}

export async function deleteSavedShipper(id: number, clientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const { savedShippers } = await import('../drizzle/schema');
    const { eq, and } = await import('drizzle-orm');

    // Ensure the shipper belongs to this client before deleting
    await db.delete(savedShippers).where(
      and(
        eq(savedShippers.id, id),
        eq(savedShippers.clientId, clientId)
      )
    );

    return true;
  } catch (error) {
    console.error('[Database] Failed to delete saved shipper:', error);
    throw error;
  }
}

/**
 * Creates an in-app notification for a client.
 * Call this from any router/mutation to send a notification to a customer.
 *
 * @param clientId - The clientAccounts.id of the recipient
 * @param type     - Notification category: ORDER_UPDATE | INVOICE_GENERATED | COD_UPDATE | SYSTEM
 * @param title    - Short heading (max 255 chars)
 * @param message  - Body text
 * @param link     - Optional, tab name to navigate to (e.g. "invoices", "cod", "orders")
 */
export async function createNotification(
  clientId: number,
  type: 'ORDER_UPDATE' | 'INVOICE_GENERATED' | 'COD_UPDATE' | 'SYSTEM',
  title: string,
  message: string,
  link?: string
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const { notifications } = await import('../drizzle/schema');
    await db.insert(notifications).values({ clientId, type, title, message, link: link ?? null });
  } catch (err) {
    // Never crash the main flow because of a notification failure
    console.warn('[Notification] Failed to create notification:', err);
  }
}

