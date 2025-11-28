import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { generatePortalToken } from "./portalAuth";
import { getDb } from "./db";
import { codRecords } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function createMockContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("COD Status Update", () => {
  it("should update COD record status from pending_collection to collected", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // Generate admin token
    const adminToken = generatePortalToken({
      userId: 1,
      email: "admin@pathxpress.ae",
      role: "admin",
    });

    // First, create a shipment with COD
    const customerToken = generatePortalToken({
      userId: 2,
      email: "customer@techsolutions.ae",
      role: "customer",
      clientId: 1,
    });

    const shipment = await caller.portal.customer.createShipment({
      token: customerToken,
      shipment: {
        shipperName: "Test Shipper",
        shipperAddress: "123 Test St",
        shipperCity: "Dubai",
        shipperCountry: "UAE",
        shipperPhone: "+971501234567",
        customerName: "Test Customer",
        customerPhone: "+971509876543",
        address: "456 Customer Ave",
        city: "Dubai",
        emirate: "Dubai",
        destinationCountry: "UAE",
        pieces: 1,
        weight: 2.5,
        serviceType: "DOM",
        specialInstructions: "Test shipment with COD",
        codRequired: 1,
        codAmount: "300.00",
        codCurrency: "AED",
      },
    });

    // Get the COD record
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    const codRecordsList = await db
      .select()
      .from(codRecords)
      .where(eq(codRecords.shipmentId, shipment.id))
      .limit(1);

    expect(codRecordsList.length).toBe(1);
    const codRecord = codRecordsList[0];
    expect(codRecord!.status).toBe("pending_collection");

    // Update status to collected
    const updateResult = await caller.portal.cod.updateCODStatus({
      token: adminToken,
      codRecordId: codRecord!.id,
      status: "collected",
    });

    expect(updateResult.success).toBe(true);

    // Verify status was updated
    const updatedRecords = await db
      .select()
      .from(codRecords)
      .where(eq(codRecords.id, codRecord!.id))
      .limit(1);

    expect(updatedRecords.length).toBe(1);
    const updatedRecord = updatedRecords[0];
    expect(updatedRecord!.status).toBe("collected");
    expect(updatedRecord!.collectedDate).not.toBeNull();

    console.log("✅ COD status updated from pending_collection to collected");
    console.log("✅ collectedDate set:", updatedRecord!.collectedDate);
  });

  it("should update COD record status to remitted", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // Generate admin token
    const adminToken = generatePortalToken({
      userId: 1,
      email: "admin@pathxpress.ae",
      role: "admin",
    });

    // Create a shipment with COD
    const customerToken = generatePortalToken({
      userId: 2,
      email: "customer@techsolutions.ae",
      role: "customer",
      clientId: 1,
    });

    const shipment = await caller.portal.customer.createShipment({
      token: customerToken,
      shipment: {
        shipperName: "Test Shipper 2",
        shipperAddress: "789 Test Ave",
        shipperCity: "Dubai",
        shipperCountry: "UAE",
        shipperPhone: "+971501234567",
        customerName: "Test Customer 2",
        customerPhone: "+971509876543",
        address: "999 Customer St",
        city: "Dubai",
        emirate: "Dubai",
        destinationCountry: "UAE",
        pieces: 1,
        weight: 1.5,
        serviceType: "DOM",
        specialInstructions: "Test shipment",
        codRequired: 1,
        codAmount: "150.00",
        codCurrency: "AED",
      },
    });

    // Get the COD record
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    const codRecordsList = await db
      .select()
      .from(codRecords)
      .where(eq(codRecords.shipmentId, shipment.id))
      .limit(1);

    const codRecord = codRecordsList[0];

    // Update status to remitted
    await caller.portal.cod.updateCODStatus({
      token: adminToken,
      codRecordId: codRecord!.id,
      status: "remitted",
    });

    // Verify status was updated
    const updatedRecords = await db
      .select()
      .from(codRecords)
      .where(eq(codRecords.id, codRecord!.id))
      .limit(1);

    expect(updatedRecords[0]!.status).toBe("remitted");
    console.log("✅ COD status updated to remitted");
  });

  it("should reject status update from non-admin user", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // Generate customer token (not admin)
    const customerToken = generatePortalToken({
      userId: 2,
      email: "customer@techsolutions.ae",
      role: "customer",
      clientId: 1,
    });

    // Try to update COD status as customer
    await expect(
      caller.portal.cod.updateCODStatus({
        token: customerToken,
        codRecordId: 1,
        status: "collected",
      })
    ).rejects.toThrow("Admin access required");

    console.log("✅ Non-admin user correctly rejected");
  });
});
