import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { codRecords } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// updateCODStatus/createShipment authenticate via ctx.portalUser (set from an
// HttpOnly cookie in real requests), not via a token field in the input — so the
// mock context must set portalUser directly rather than passing a generated token.
function createMockContext(portalUser: TrpcContext["portalUser"] = null): TrpcContext {
  return {
    user: null,
    portalUser,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// clientId 28 = dedicated test-fixture client account (companyName starts with
// "__TEST FIXTURE__", codAllowed=1) — see cod.integration.test.ts for details.
// Neither mock user is looked up against the DB (portalAdminProcedure/
// portalCustomerProcedure only check ctx.portalUser.role), so the emails below
// are cosmetic; only clientId needs to reference a real, COD-enabled client.
const CUSTOMER_PORTAL_USER = { userId: 2, email: "test-customer@pathxpress.internal", role: "customer" as const, clientId: 28 };
const ADMIN_PORTAL_USER = { userId: 1, email: "test-admin@pathxpress.internal", role: "admin" as const };

describe("COD Status Update", () => {
  it("should update COD record status from pending_collection to collected", async () => {
    const customerCaller = appRouter.createCaller(createMockContext(CUSTOMER_PORTAL_USER));
    const adminCaller = appRouter.createCaller(createMockContext(ADMIN_PORTAL_USER));

    // First, create a shipment with COD
    const shipment = await customerCaller.portal.customer.createShipment({
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
    const updateResult = await adminCaller.portal.cod.updateCODStatus({
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
    const customerCaller = appRouter.createCaller(createMockContext(CUSTOMER_PORTAL_USER));
    const adminCaller = appRouter.createCaller(createMockContext(ADMIN_PORTAL_USER));

    // Create a shipment with COD
    const shipment = await customerCaller.portal.customer.createShipment({
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
    await adminCaller.portal.cod.updateCODStatus({
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
    const customerCaller = appRouter.createCaller(createMockContext(CUSTOMER_PORTAL_USER));

    // Try to update COD status as customer (not admin)
    await expect(
      customerCaller.portal.cod.updateCODStatus({
        codRecordId: 1,
        status: "collected",
      })
    ).rejects.toThrow("Admin access required");

    console.log("✅ Non-admin user correctly rejected");
  });
});
