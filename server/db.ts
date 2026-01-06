import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, invoices, invoiceItems, codRecords, codRemittances, codRemittanceItems, orders, clientAccounts, rateTiers, serviceConfig, RateTier } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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
    return await db.select().from(clientAccounts).orderBy(clientAccounts.companyName);
  } catch (error) {
    console.error("[Database] Failed to get client accounts:", error);
    return [];
  }
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

export async function updateOrderStatus(id: number, status: string): Promise<Order | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    await db.update(orders).set({ status, lastStatusUpdate: new Date() }).where(eq(orders.id, id));
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
 * Generate next waybill number
 * Format: PX + YEAR + 5-digit incremental (e.g., PX202500001)
 */
export async function generateWaybillNumber(): Promise<string> {
  const db = await getDb();
  if (!db) return `PX${new Date().getFullYear()}00001`;

  try {
    const year = new Date().getFullYear();
    const prefix = `PX${year}`;

    // Get all waybill numbers for this year and find the highest
    const allOrders = await db
      .select({ waybillNumber: orders.waybillNumber })
      .from(orders)
      .where(sql`${orders.waybillNumber} LIKE ${prefix + '%'}`)
      .orderBy(desc(orders.waybillNumber))
      .limit(1);

    if (allOrders.length === 0) {
      return `${prefix}00001`;
    }

    // Extract the number and increment
    const lastNumber = parseInt(allOrders[0].waybillNumber.slice(-5));
    const nextNumber = (lastNumber + 1).toString().padStart(5, '0');
    return `${prefix}${nextNumber}`;
  } catch (error) {
    console.error("[Database] Failed to generate waybill number:", error);
    // Fallback: use timestamp to ensure uniqueness
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-5);
    return `PX${year}${timestamp}`;
  }
}


// ============================================
// INVOICE FUNCTIONS
// ============================================

// Helper to get billable shipments
export async function getBillableShipments(clientId: number, periodStart: Date, periodEnd: Date) {
  const db = await getDb();
  if (!db) return [];

  const { invoiceItems } = await import("../drizzle/schema");
  const { isNull } = await import("drizzle-orm");

  const shipmentsData = await db
    .select({
      order: orders,
    })
    .from(orders)
    .leftJoin(invoiceItems, eq(orders.id, invoiceItems.shipmentId))
    .where(
      and(
        eq(orders.clientId, clientId),
        gte(orders.createdAt, periodStart),
        lte(orders.createdAt, periodEnd),
        eq(orders.status, 'delivered'),
        isNull(invoiceItems.id)
      )
    );

  return shipmentsData.map(d => d.order);
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
    const { inArray } = await import("drizzle-orm");
    shipments = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.clientId, clientId),
          inArray(orders.id, shipmentIds),
          eq(orders.status, 'delivered')
        )
      );
  } else {
    shipments = await getBillableShipments(clientId, periodStart, periodEnd);
  }

  if (shipments.length === 0) {
    return null; // No billingable shipments found
  }

  // Get client info to determine rates
  const [client] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, clientId)).limit(1);
  if (!client) {
    throw new Error("Client not found");
  }

  // Get rate tiers for this client (if using tier-based pricing)
  let domTier: any = null;
  let sddTier: any = null;

  if (client.manualRateTierId) {
    // Get DOM tier
    const domTiers = await db.select().from(rateTiers)
      .where(and(
        eq(rateTiers.id, client.manualRateTierId),
        eq(rateTiers.serviceType, 'DOM')
      )).limit(1);
    domTier = domTiers[0];

    // Get SDD tier with same volume bracket
    if (domTier) {
      const sddTiers = await db.select().from(rateTiers)
        .where(and(
          eq(rateTiers.serviceType, 'SDD'),
          eq(rateTiers.minVolume, domTier.minVolume)
        )).limit(1);
      sddTier = sddTiers[0];
    }
  }

  // Helper function to calculate rate for a shipment
  const calculateShipmentRate = (shipment: typeof orders.$inferSelect): number => {
    const weight = parseFloat(shipment.weight || '0');
    const isBasWeight = weight <= 5;
    const additionalKg = Math.max(0, weight - 5);
    const serviceType = shipment.serviceType?.toUpperCase() || 'DOM';

    let baseRate = 0;
    let perKgRate = 0;

    // Priority 1: Custom rates
    if (serviceType === 'SDD' || serviceType === 'SAME DAY') {
      if (client.customSddBaseRate && client.customSddPerKg) {
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
      if (client.customDomBaseRate && client.customDomPerKg) {
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
    const total = isBasWeight ? baseRate : baseRate + (additionalKg * perKgRate);
    return Math.round(total * 100) / 100; // Round to 2 decimals
  };

  // Calculate totals using proper rates
  let subtotal = 0;
  const shipmentRates: { shipment: typeof orders.$inferSelect; rate: number }[] = [];

  for (const shipment of shipments) {
    const rate = calculateShipmentRate(shipment);
    subtotal += rate;
    shipmentRates.push({ shipment, rate });
  }

  const tax = 0; // No tax for shipping in UAE 
  const total = subtotal + tax;

  // Create invoice
  const now = new Date();
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 30); // 30 days payment term

  const [invoice] = await db.insert(invoices).values({
    clientId,
    invoiceNumber: `INV-${Date.now()}`,
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
  for (const { shipment, rate } of shipmentRates) {
    const weight = parseFloat(shipment.weight || '0');
    const serviceType = shipment.serviceType?.toUpperCase() === 'SDD' ? 'SDD' : 'DOM';

    await db.insert(invoiceItems).values({
      invoiceId: invoice.insertId,
      shipmentId: shipment.id,
      description: `${shipment.waybillNumber} - ${serviceType} - ${weight}kg - ${shipment.city}`,
      quantity: 1,
      unitPrice: rate.toFixed(2),
      total: rate.toFixed(2),
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
    .where(eq(orders.clientId, clientId))
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

  // Link COD records to remittance
  for (const codRecordId of data.codRecordIds) {
    const [codRecord] = await db.select().from(codRecords).where(eq(codRecords.id, codRecordId)).limit(1);

    if (codRecord) {
      await db.insert(codRemittanceItems).values({
        remittanceId,
        codRecordId,
        shipmentId: codRecord.shipmentId,
        amount: codRecord.codAmount,
        currency: codRecord.codCurrency,
      });

      // Update COD record status
      await db.update(codRecords).set({ status: 'remitted', remittedToClientDate: new Date() }).where(eq(codRecords.id, codRecordId));
    }
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

  const records = await db.select().from(codRecords);

  let pending = 0;
  let collected = 0;
  let remitted = 0;

  records.forEach(r => {
    const amount = parseFloat(r.codAmount);
    if (r.status === 'pending_collection') pending += amount;
    else if (r.status === 'collected') collected += amount;
    else if (r.status === 'remitted') remitted += amount;
  });

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
export async function calculateShipmentRate(params: {
  clientId: number;
  serviceType: "DOM" | "SDD";
  weight: number; // in kg
  length?: number; // cm
  width?: number; // cm
  height?: number; // cm
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

  // PRIORITY 1: Check for custom rates first
  if (client) {
    const isDOM = params.serviceType === "DOM";
    const customBaseRate = isDOM ? client.customDomBaseRate : client.customSddBaseRate;
    const customPerKg = isDOM ? client.customDomPerKg : client.customSddPerKg;

    if (customBaseRate) {
      const baseRate = parseFloat(customBaseRate);
      const additionalKgRate = customPerKg ? parseFloat(customPerKg) : 0;
      const maxWeight = 5; // Standard max weight for base rate

      let totalRate = baseRate;
      let additionalKgCharge = 0;
      let chargeableWeight = params.weight;

      // Calculate volumetric weight
      if (params.length && params.width && params.height) {
        const volumetricWeight = (params.length * params.width * params.height) / 5000;
        chargeableWeight = Math.max(params.weight, volumetricWeight);
      }

      // Calculate additional weight charges
      if (chargeableWeight > maxWeight) {
        const extraKg = Math.ceil(chargeableWeight - maxWeight);
        additionalKgCharge = extraKg * additionalKgRate;
        totalRate += additionalKgCharge;
      }

      return {
        baseRate,
        additionalKgCharge,
        totalRate,
        appliedTier: null,
        usingManualTier: false,
        usingCustomRates: true,
        chargeableWeight,
      };
    }
  }

  let applicableTier: RateTier | null = null;
  let usingManualTier = false;

  // PRIORITY 2: Check if client has a manual tier assigned
  if (client?.manualRateTierId) {
    const manualTier = await db
      .select()
      .from(rateTiers)
      .where(
        and(
          eq(rateTiers.id, client.manualRateTierId),
          eq(rateTiers.serviceType, params.serviceType),
          eq(rateTiers.isActive, 1)
        )
      )
      .limit(1);

    if (manualTier.length > 0) {
      applicableTier = manualTier[0];
      usingManualTier = true;
    }
  }

  // PRIORITY 3: If no manual tier, calculate based on monthly volume
  if (!applicableTier) {
    const monthlyVolume = await getMonthlyShipmentCount(params.clientId);

    // Find applicable rate tier
    const tiers = await db
      .select()
      .from(rateTiers)
      .where(
        and(
          eq(rateTiers.serviceType, params.serviceType),
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

  // Calculate volumetric weight
  let chargeableWeight = params.weight;

  if (params.length && params.width && params.height) {
    const volumetricWeight = (params.length * params.width * params.height) / 5000;
    chargeableWeight = Math.max(params.weight, volumetricWeight);
  }

  // Calculate additional weight charges using chargeable weight
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
    usingManualTier,
    chargeableWeight, // Return this so UI can show it
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

  return await db
    .select()
    .from(rateTiers)
    .where(eq(rateTiers.isActive, 1))
    .orderBy(rateTiers.serviceType, rateTiers.minVolume);
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
