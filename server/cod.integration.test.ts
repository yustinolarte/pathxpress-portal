import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { codRecords, orders } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// portal.customer.createShipment authenticates via ctx.portalUser (set from an
// HttpOnly cookie in real requests), not via a token field in the input — so the
// mock context must set portalUser directly rather than passing a generated token.
//
// clientId 28 = dedicated test-fixture client account (companyName starts with
// "__TEST FIXTURE__", codAllowed=1). Do not point this at a real client id —
// these tests insert real rows via the live DB connection.
function createCustomerContext(): TrpcContext {
  return {
    user: null,
    portalUser: { userId: 2, email: "test-customer@pathxpress.internal", role: "customer", clientId: 28 },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("COD Integration Flow", () => {
  it("should create COD record automatically when shipment has COD", async () => {
    const ctx = createCustomerContext();
    const caller = appRouter.createCaller(ctx);

    // Create shipment with COD
    const shipment = await caller.portal.customer.createShipment({
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
        length: 30,
        width: 20,
        height: 15,
        serviceType: "DOM",
        specialInstructions: "Test shipment with COD",
        codRequired: 1,
        codAmount: "500.00",
        codCurrency: "AED",
      },
    });

    expect(shipment).toBeDefined();
    expect(shipment.codRequired).toBe(1);
    expect(shipment.codAmount).toBe("500.00");
    expect(shipment.codCurrency).toBe("AED");

    // Verify COD record was created
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
    expect(codRecord).toBeDefined();
    expect(codRecord!.shipmentId).toBe(shipment.id);
    expect(codRecord!.codAmount).toBe("500.00");
    expect(codRecord!.codCurrency).toBe("AED");
    expect(codRecord!.status).toBe("pending_collection");

    console.log("✅ COD record created automatically:", codRecord);
  });

  it("should NOT create COD record when shipment has no COD", async () => {
    const ctx = createCustomerContext();
    const caller = appRouter.createCaller(ctx);

    // Create shipment WITHOUT COD
    const shipment = await caller.portal.customer.createShipment({
      shipment: {
        shipperName: "Test Shipper No COD",
        shipperAddress: "789 Test Ave",
        shipperCity: "Dubai",
        shipperCountry: "UAE",
        shipperPhone: "+971501234567",
        customerName: "Test Customer No COD",
        customerPhone: "+971509876543",
        address: "999 Customer St",
        city: "Dubai",
        emirate: "Dubai",
        destinationCountry: "UAE",
        pieces: 1,
        weight: 1.5,
        serviceType: "DOM",
        specialInstructions: "Test shipment without COD",
        codRequired: 0,
      },
    });

    expect(shipment).toBeDefined();
    expect(shipment.codRequired).toBe(0);

    // Verify NO COD record was created
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    const codRecordsList = await db
      .select()
      .from(codRecords)
      .where(eq(codRecords.shipmentId, shipment.id))
      .limit(1);

    expect(codRecordsList.length).toBe(0);
    console.log("✅ No COD record created for non-COD shipment");
  });

  it("should include COD info in shipment data for PDF generation", async () => {
    const ctx = createCustomerContext();
    const caller = appRouter.createCaller(ctx);

    // Create shipment with COD
    const shipment = await caller.portal.customer.createShipment({
      shipment: {
        shipperName: "PDF Test Shipper",
        shipperAddress: "111 PDF St",
        shipperCity: "Dubai",
        shipperCountry: "UAE",
        shipperPhone: "+971501234567",
        customerName: "PDF Test Customer",
        customerPhone: "+971509876543",
        address: "222 PDF Ave",
        city: "Dubai",
        emirate: "Dubai",
        destinationCountry: "UAE",
        pieces: 1,
        weight: 3.0,
        serviceType: "DOM",
        specialInstructions: "Test for PDF",
        codRequired: 1,
        codAmount: "750.50",
        codCurrency: "AED",
      },
    });

    // Verify shipment has all COD data needed for PDF
    expect(shipment.codRequired).toBe(1);
    expect(shipment.codAmount).toBe("750.50");
    expect(shipment.codCurrency).toBe("AED");
    expect(shipment.waybillNumber).toBeDefined();

    // Simulate PDF generation data structure
    const pdfData = {
      waybillNumber: shipment.waybillNumber,
      codRequired: shipment.codRequired,
      codAmount: shipment.codAmount,
      codCurrency: shipment.codCurrency,
    };

    expect(pdfData.codRequired).toBe(1);
    expect(pdfData.codAmount).toBe("750.50");
    console.log("✅ Shipment has all COD data for PDF generation:", pdfData);
  });
});
