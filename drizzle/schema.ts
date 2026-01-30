import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Shipments table for tracking deliveries
 */
export const shipments = mysqlTable("shipments", {
  id: int("id").autoincrement().primaryKey(),
  trackingId: varchar("trackingId", { length: 20 }).notNull().unique(),
  status: varchar("status", { length: 50 }).notNull(),
  pickupAddress: text("pickupAddress"),
  deliveryAddress: text("deliveryAddress"),
  weight: varchar("weight", { length: 50 }),
  serviceType: varchar("serviceType", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Shipment = typeof shipments.$inferSelect;
export type InsertShipment = typeof shipments.$inferInsert;

/**
 * Quote requests table for storing customer quote/pickup requests
 */
export const quoteRequests = mysqlTable("quoteRequests", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  pickupAddress: text("pickupAddress").notNull(),
  deliveryAddress: text("deliveryAddress"),
  serviceType: varchar("serviceType", { length: 100 }).notNull(),
  weight: varchar("weight", { length: 100 }).notNull(),
  comments: text("comments"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type QuoteRequest = typeof quoteRequests.$inferSelect;
export type InsertQuoteRequest = typeof quoteRequests.$inferInsert;

/**
 * International rate requests table for storing international shipping rate inquiries
 */
export const internationalRateRequests = mysqlTable("internationalRateRequests", {
  id: int("id").autoincrement().primaryKey(),
  originCountry: varchar("originCountry", { length: 100 }).notNull(),
  destinationCountry: varchar("destinationCountry", { length: 100 }).notNull(),
  deliveryDate: varchar("deliveryDate", { length: 50 }).notNull(),
  weight: varchar("weight", { length: 50 }).notNull(),
  length: varchar("length", { length: 50 }).notNull(),
  width: varchar("width", { length: 50 }).notNull(),
  height: varchar("height", { length: 50 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InternationalRateRequest = typeof internationalRateRequests.$inferSelect;
export type InsertInternationalRateRequest = typeof internationalRateRequests.$inferInsert;

/**
 * Portal users table for email/password authentication (separate from Manus OAuth)
 * Used for both admin and customer portal access
 */
export const portalUsers = mysqlTable("portalUsers", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["admin", "customer"]).notNull(),
  clientId: int("clientId"), // Foreign key to clientAccounts for customer users
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn"),
});

export type PortalUser = typeof portalUsers.$inferSelect;
export type InsertPortalUser = typeof portalUsers.$inferInsert;

/**
 * Client accounts table for PATHXPRESS customers
 */
export const clientAccounts = mysqlTable("clientAccounts", {
  id: int("id").autoincrement().primaryKey(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  contactName: varchar("contactName", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  billingEmail: varchar("billingEmail", { length: 320 }).notNull(),
  billingAddress: text("billingAddress").notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  creditTerms: varchar("creditTerms", { length: 100 }), // e.g., "Net 30", "Net 60"
  defaultCurrency: varchar("defaultCurrency", { length: 10 }).default("AED").notNull(),
  codAllowed: int("codAllowed").default(0).notNull(), // 0 = no, 1 = yes
  codFeePercent: varchar("codFeePercent", { length: 50 }), // Custom COD percentage (null = use default)

  codMinFee: varchar("codMinFee", { length: 50 }), // Custom min COD fee (null = use default)
  codMaxFee: varchar("codMaxFee", { length: 50 }), // Custom max COD fee (null = use default)
  defaultRateTableId: int("defaultRateTableId"),
  manualRateTierId: int("manualRateTierId"), // Admin-assigned rate tier (overrides automatic volume calculation)

  // Custom rates - when set, these override tier rates completely
  customDomBaseRate: varchar("customDomBaseRate", { length: 20 }), // Custom DOM base rate (0-5kg)
  customDomPerKg: varchar("customDomPerKg", { length: 20 }), // Custom DOM rate per additional kg
  customSddBaseRate: varchar("customSddBaseRate", { length: 20 }), // Custom SDD base rate (0-5kg)
  customSddPerKg: varchar("customSddPerKg", { length: 20 }), // Custom SDD rate per additional kg

  // Waybill preferences
  hideShipperAddress: int("hideShipperAddress").default(0).notNull(), // 0 = show address, 1 = hide address on waybill

  // Return shipment settings
  returnFee: varchar("returnFee", { length: 20 }), // Fixed fee for return shipments (e.g., "15.00")

  // Fit on Delivery settings
  fodAllowed: int("fodAllowed").default(0).notNull(), // 0 = no, 1 = yes
  fodFee: varchar("fodFee", { length: 20 }), // Custom FOD fee (null = use default 5 AED)

  notes: text("notes"),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ClientAccount = typeof clientAccounts.$inferSelect;
export type InsertClientAccount = typeof clientAccounts.$inferInsert;

/**
 * Extended shipments/orders table with full waybill data
 * Replaces the basic shipments table with comprehensive fields
 */
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(), // Foreign key to clientAccounts
  orderNumber: varchar("orderNumber", { length: 100 }), // Client's reference number
  waybillNumber: varchar("waybillNumber", { length: 50 }).notNull().unique(), // Auto-generated PX + year + incremental

  // Shipper information
  shipperName: varchar("shipperName", { length: 255 }).notNull(),
  shipperAddress: text("shipperAddress").notNull(),
  shipperCity: varchar("shipperCity", { length: 100 }).notNull(),
  shipperCountry: varchar("shipperCountry", { length: 100 }).notNull(),
  shipperPhone: varchar("shipperPhone", { length: 50 }).notNull(),

  // Consignee information
  customerName: varchar("customerName", { length: 255 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 50 }).notNull(),
  address: text("address").notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  emirate: varchar("emirate", { length: 100 }), // For UAE destinations
  postalCode: varchar("postalCode", { length: 20 }),
  destinationCountry: varchar("destinationCountry", { length: 100 }).notNull(),

  // Shipment details
  pieces: int("pieces").notNull(),
  weight: decimal("weight", { precision: 10, scale: 2 }).notNull(), // Actual weight in kg
  volumetricWeight: decimal("volumetricWeight", { precision: 10, scale: 2 }), // Calculated volumetric weight
  length: decimal("length", { precision: 10, scale: 2 }),
  width: decimal("width", { precision: 10, scale: 2 }),
  height: decimal("height", { precision: 10, scale: 2 }),
  serviceType: varchar("serviceType", { length: 100 }).notNull(), // standard, express, same-day
  specialInstructions: text("specialInstructions"),

  // COD information
  codRequired: int("codRequired").default(0).notNull(), // 0 = no, 1 = yes
  codAmount: varchar("codAmount", { length: 50 }),
  codCurrency: varchar("codCurrency", { length: 10 }),

  // Fit on Delivery service
  fitOnDelivery: int("fitOnDelivery").default(0).notNull(), // 0 = no, 1 = yes

  // Dates
  pickupDate: timestamp("pickupDate"),
  deliveryDateEstimated: timestamp("deliveryDateEstimated"),
  deliveryDateReal: timestamp("deliveryDateReal"),

  // Status
  status: varchar("status", { length: 50 }).default("pending_pickup").notNull(), // pending_pickup, picked_up, in_transit, out_for_delivery, delivered, canceled
  lastStatusUpdate: timestamp("lastStatusUpdate").defaultNow().notNull(),

  // Route optimization data
  latitude: varchar("latitude", { length: 50 }),
  longitude: varchar("longitude", { length: 50 }),
  timeWindowStart: varchar("timeWindowStart", { length: 20 }),
  timeWindowEnd: varchar("timeWindowEnd", { length: 20 }),
  priorityLevel: int("priorityLevel").default(1),
  routeBatchId: varchar("routeBatchId", { length: 100 }),

  // Return shipment fields
  isReturn: int("isReturn").default(0).notNull(), // 0 = normal shipment, 1 = return shipment
  originalOrderId: int("originalOrderId"), // Reference to the original order that generated this return
  returnCharged: int("returnCharged").default(1).notNull(), // 0 = free return, 1 = charged return

  // Order type: standard, return, exchange
  orderType: varchar("orderType", { length: 20 }).default("standard").notNull(), // standard, return, exchange
  exchangeOrderId: int("exchangeOrderId"), // For exchanges: links return waybill to new shipment waybill

  // Pickup assignment for Driver App
  pickupDriverId: int("pickupDriverId"), // Assigned driver for pickup (null = unassigned)

  // Privacy settings for waybill printing
  hideConsigneeAddress: int("hideConsigneeAddress").default(0).notNull(), // 0 = show, 1 = hide consignee address (for returns when client has privacy)

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

/**
 * Tracking events table for shipment timeline
 */
export const trackingEvents = mysqlTable("trackingEvents", {
  id: int("id").autoincrement().primaryKey(),
  shipmentId: int("shipmentId").notNull(), // Foreign key to orders
  eventDatetime: timestamp("eventDatetime").notNull(),
  location: varchar("location", { length: 255 }),
  statusCode: varchar("statusCode", { length: 50 }).notNull(),
  statusLabel: varchar("statusLabel", { length: 255 }).notNull(),
  description: text("description"),
  podFileUrl: varchar("podFileUrl", { length: 500 }), // Proof of Delivery file URL
  createdBy: varchar("createdBy", { length: 50 }).default("system").notNull(), // system or admin
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TrackingEvent = typeof trackingEvents.$inferSelect;
export type InsertTrackingEvent = typeof trackingEvents.$inferInsert;

/**
 * Rate tables for pricing configuration
 */
export const rateTables = mysqlTable("rateTables", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  clientId: int("clientId"), // Nullable for default/global rate table
  originZone: varchar("originZone", { length: 100 }).notNull(),
  destinationZone: varchar("destinationZone", { length: 100 }).notNull(),
  minWeight: varchar("minWeight", { length: 50 }).notNull(),
  maxWeight: varchar("maxWeight", { length: 50 }).notNull(),
  pricePerKg: varchar("pricePerKg", { length: 50 }).notNull(),
  basePrice: varchar("basePrice", { length: 50 }).notNull(),
  fuelSurchargePercent: varchar("fuelSurchargePercent", { length: 50 }).default("0"),
  codFeeFixed: varchar("codFeeFixed", { length: 50 }).default("0"),
  codFeePercent: varchar("codFeePercent", { length: 50 }).default("0"),
  additionalSurcharges: text("additionalSurcharges"), // JSON string for flexible surcharges
  serviceType: varchar("serviceType", { length: 100 }), // standard, express, same-day
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RateTable = typeof rateTables.$inferSelect;
export type InsertRateTable = typeof rateTables.$inferInsert;

/**
 * Invoices table for billing
 */
export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(), // Foreign key to clientAccounts
  invoiceNumber: varchar("invoiceNumber", { length: 100 }).notNull().unique(),
  periodFrom: timestamp("periodFrom").notNull(),
  periodTo: timestamp("periodTo").notNull(),
  issueDate: timestamp("issueDate").notNull(),
  dueDate: timestamp("dueDate").notNull(),
  currency: varchar("currency", { length: 10 }).default("AED").notNull(),
  subtotal: varchar("subtotal", { length: 50 }).notNull(),
  taxes: varchar("taxes", { length: 50 }).default("0"),
  total: varchar("total", { length: 50 }).notNull(),
  amountPaid: varchar("amountPaid", { length: 50 }).default("0"),
  balance: varchar("balance", { length: 50 }).notNull(),
  status: mysqlEnum("status", ["pending", "paid", "overdue"]).default("pending").notNull(),
  paymentDate: timestamp("paymentDate"),
  paymentReference: varchar("paymentReference", { length: 255 }),
  notes: text("notes"),
  adjustmentNotes: text("adjustmentNotes"), // Notes explaining any adjustments made by admin
  isAdjusted: int("isAdjusted").default(0).notNull(), // 0 = no, 1 = yes
  lastAdjustedBy: int("lastAdjustedBy"), // Foreign key to users (admin who made the adjustment)
  lastAdjustedAt: timestamp("lastAdjustedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

/**
 * Invoice items table for line items
 */
export const invoiceItems = mysqlTable("invoiceItems", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(), // Foreign key to invoices
  shipmentId: int("shipmentId"), // Foreign key to orders (nullable for custom line items)
  description: text("description").notNull(),
  quantity: int("quantity").default(1).notNull(),
  unitPrice: varchar("unitPrice", { length: 50 }).notNull(),
  total: varchar("total", { length: 50 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = typeof invoiceItems.$inferInsert;

/**
 * COD records table for cash on delivery tracking
 */
export const codRecords = mysqlTable("codRecords", {
  id: int("id").autoincrement().primaryKey(),
  shipmentId: int("shipmentId").notNull(), // Foreign key to orders
  codAmount: varchar("codAmount", { length: 50 }).notNull(),
  codCurrency: varchar("codCurrency", { length: 10 }).notNull(),
  collectedDate: timestamp("collectedDate"),
  remittedToClientDate: timestamp("remittedToClientDate"),
  status: mysqlEnum("status", ["pending_collection", "collected", "remitted", "disputed", "cancelled"]).default("pending_collection").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CODRecord = typeof codRecords.$inferSelect;
export type InsertCODRecord = typeof codRecords.$inferInsert;

/**
 * COD Remittances table for tracking batch payments to clients
 */
export const codRemittances = mysqlTable("codRemittances", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(), // Foreign key to clientAccounts
  remittanceNumber: varchar("remittanceNumber", { length: 50 }).notNull().unique(),
  grossAmount: varchar("grossAmount", { length: 50 }).notNull(), // Total COD collected before fees
  feeAmount: varchar("feeAmount", { length: 50 }).notNull().default("0"), // Fee deducted
  feePercentage: varchar("feePercentage", { length: 10 }).notNull().default("0"), // Fee percentage applied
  totalAmount: varchar("totalAmount", { length: 50 }).notNull(), // Net amount to client (grossAmount - feeAmount)
  currency: varchar("currency", { length: 10 }).notNull(),
  shipmentCount: int("shipmentCount").notNull(),
  status: mysqlEnum("status", ["pending", "processed", "completed"]).default("pending").notNull(),
  paymentMethod: varchar("paymentMethod", { length: 50 }), // bank_transfer, cash, cheque
  paymentReference: varchar("paymentReference", { length: 100 }),
  processedDate: timestamp("processedDate"),
  notes: text("notes"),
  createdBy: int("createdBy").notNull(), // Admin user ID
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CODRemittance = typeof codRemittances.$inferSelect;
export type InsertCODRemittance = typeof codRemittances.$inferInsert;

/**
 * COD Remittance Items table for linking shipments to remittances
 */
export const codRemittanceItems = mysqlTable("codRemittanceItems", {
  id: int("id").autoincrement().primaryKey(),
  remittanceId: int("remittanceId").notNull(), // Foreign key to codRemittances
  codRecordId: int("codRecordId").notNull(), // Foreign key to codRecords
  shipmentId: int("shipmentId").notNull(), // Foreign key to orders
  amount: varchar("amount", { length: 50 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CODRemittanceItem = typeof codRemittanceItems.$inferSelect;
export type InsertCODRemittanceItem = typeof codRemittanceItems.$inferInsert;

/**
 * Audit logs table for tracking important changes
 */
export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // Portal user who made the change
  action: varchar("action", { length: 100 }).notNull(), // e.g., "status_change", "invoice_update", "cod_update"
  entityType: varchar("entityType", { length: 50 }).notNull(), // e.g., "order", "invoice", "codRecord"
  entityId: int("entityId").notNull(),
  changes: text("changes"), // JSON string with before/after values
  ipAddress: varchar("ipAddress", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;


/**
 * Rate tables for pricing configuration
 */
export const rateTiers = mysqlTable("rateTiers", {
  id: int("id").autoincrement().primaryKey(),
  serviceType: mysqlEnum("serviceType", ["DOM", "SDD"]).notNull(), // DOM = Domestic Express, SDD = Same Day
  minVolume: int("minVolume").notNull(), // Minimum monthly shipments
  maxVolume: int("maxVolume"), // Maximum monthly shipments (null = unlimited)
  baseRate: varchar("baseRate", { length: 20 }).notNull(), // Base rate for 0-5kg
  additionalKgRate: varchar("additionalKgRate", { length: 20 }).notNull(), // Rate per additional kg
  maxWeight: int("maxWeight").notNull().default(5), // Maximum weight for base rate
  isActive: int("isActive").notNull().default(1), // 1 = active, 0 = inactive
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});


export type RateTier = typeof rateTiers.$inferSelect;
export type InsertRateTier = typeof rateTiers.$inferInsert;

/**
 * Service configuration table
 */
export const serviceConfig = mysqlTable("serviceConfig", {
  id: int("id").autoincrement().primaryKey(),
  configKey: varchar("configKey", { length: 100 }).notNull().unique(),
  configValue: text("configValue").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ServiceConfig = typeof serviceConfig.$inferSelect;
export type InsertServiceConfig = typeof serviceConfig.$inferInsert;

/**
 * Saved shippers table for customer convenience
 * Allows customers to save frequently used shipper information
 */
export const savedShippers = mysqlTable("savedShippers", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(), // Foreign key to clientAccounts
  nickname: varchar("nickname", { length: 255 }).notNull(),
  shipperName: varchar("shipperName", { length: 255 }).notNull(),
  shipperAddress: text("shipperAddress").notNull(),
  shipperCity: varchar("shipperCity", { length: 100 }).notNull(),
  shipperCountry: varchar("shipperCountry", { length: 100 }).notNull(),
  shipperPhone: varchar("shipperPhone", { length: 50 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SavedShipper = typeof savedShippers.$inferSelect;
export type InsertSavedShipper = typeof savedShippers.$inferInsert;

/**
 * Contact messages table for storing "Contact Us" form submissions
 */
export const contactMessages = mysqlTable("contactMessages", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["new", "read", "archived"]).default("new").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = typeof contactMessages.$inferInsert;

// ==================== DRIVER MANAGEMENT TABLES ====================

/**
 * Drivers table for delivery drivers
 */
export const drivers = mysqlTable("drivers", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  fullName: varchar("fullName", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  vehicleNumber: varchar("vehicleNumber", { length: 50 }),
  photoUrl: text("photoUrl"),
  emiratesId: varchar("emiratesId", { length: 50 }),
  emiratesIdExp: timestamp("emiratesIdExp"),
  licenseNo: varchar("licenseNo", { length: 50 }),
  licenseExp: timestamp("licenseExp"),
  status: mysqlEnum("status", ["active", "inactive", "suspended"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Driver = typeof drivers.$inferSelect;
export type InsertDriver = typeof drivers.$inferInsert;

/**
 * Driver routes - daily routes assigned to drivers
 */
export const driverRoutes = mysqlTable("driverRoutes", {
  id: varchar("id", { length: 50 }).primaryKey(), // e.g., DXB-2025-0001
  driverId: int("driverId"),
  date: timestamp("date").notNull(),
  zone: varchar("zone", { length: 100 }),
  vehicleInfo: varchar("vehicleInfo", { length: 100 }),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "cancelled"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DriverRoute = typeof driverRoutes.$inferSelect;
export type InsertDriverRoute = typeof driverRoutes.$inferInsert;

/**
 * Route orders - links orders to routes with pickup/delivery stops
 */
export const routeOrders = mysqlTable("routeOrders", {
  id: int("id").autoincrement().primaryKey(),
  routeId: varchar("routeId", { length: 50 }).notNull(),
  orderId: int("orderId").notNull(),
  sequence: int("sequence"), // Optimized stop order
  type: mysqlEnum("type", ["pickup", "delivery"]).default("delivery").notNull(), // Type of stop
  status: mysqlEnum("status", ["pending", "in_progress", "picked_up", "delivered", "attempted", "returned"]).default("pending").notNull(),
  proofPhotoUrl: text("proofPhotoUrl"),
  notes: text("notes"),
  attemptedAt: timestamp("attemptedAt"),
  deliveredAt: timestamp("deliveredAt"),
  pickedUpAt: timestamp("pickedUpAt"), // For pickup stops
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RouteOrder = typeof routeOrders.$inferSelect;
export type InsertRouteOrder = typeof routeOrders.$inferInsert;

/**
 * Driver reports - issue reports from drivers
 */
export const driverReports = mysqlTable("driverReports", {
  id: int("id").autoincrement().primaryKey(),
  driverId: int("driverId").notNull(),
  issueType: varchar("issueType", { length: 50 }).notNull(),
  description: text("description"),
  photoUrl: text("photoUrl"),
  latitude: varchar("latitude", { length: 50 }),
  longitude: varchar("longitude", { length: 50 }),
  accuracy: varchar("accuracy", { length: 50 }),
  status: mysqlEnum("status", ["pending", "in_review", "resolved", "rejected"]).default("pending").notNull(),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DriverReport = typeof driverReports.$inferSelect;
export type InsertDriverReport = typeof driverReports.$inferInsert;

/**
 * Driver shifts - work shifts tracking
 */
export const driverShifts = mysqlTable("driverShifts", {
  id: int("id").autoincrement().primaryKey(),
  driverId: int("driverId").notNull(),
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DriverShift = typeof driverShifts.$inferSelect;
export type InsertDriverShift = typeof driverShifts.$inferInsert;
