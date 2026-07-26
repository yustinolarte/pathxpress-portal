import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb, getLastWeeklyCutoff, getReadyToRemitRecordsByClient, getAccumulatingByClient, getCODSummaryByClient } from "./db";
import { codRecords } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// See cod.status.test.ts / cod.integration.test.ts — clientId 28 is a dedicated
// test-fixture client account (companyName starts with "__TEST FIXTURE__",
// codAllowed=1). Neither mock user is looked up against the DB, only clientId
// needs to reference a real, COD-enabled client.
function createMockContext(portalUser: TrpcContext["portalUser"] = null): TrpcContext {
  return {
    user: null,
    portalUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const CUSTOMER_PORTAL_USER = { userId: 2, email: "test-customer@pathxpress.internal", role: "customer" as const, clientId: 28 };

describe("getLastWeeklyCutoff", () => {
  // 2026-07-24 and 2026-07-17 are both Fridays (verified via getUTCDay() === 5).
  // Friday 18:00 Dubai (UTC+4) == Friday 14:00 UTC.
  const FRIDAY_CUTOFF_UTC = new Date("2026-07-24T14:00:00Z").getTime();
  const PREVIOUS_FRIDAY_CUTOFF_UTC = new Date("2026-07-17T14:00:00Z").getTime();

  it("returns the previous Friday cutoff when just before this Friday's 18:00 Dubai", () => {
    const ref = new Date("2026-07-24T13:59:00Z"); // 17:59 Dubai, Friday
    expect(getLastWeeklyCutoff(ref).getTime()).toBe(PREVIOUS_FRIDAY_CUTOFF_UTC);
  });

  it("returns this Friday's cutoff at exactly 18:00 Dubai", () => {
    const ref = new Date("2026-07-24T14:00:00Z"); // exactly 18:00 Dubai, Friday
    expect(getLastWeeklyCutoff(ref).getTime()).toBe(FRIDAY_CUTOFF_UTC);
  });

  it("returns this Friday's cutoff just after 18:00 Dubai", () => {
    const ref = new Date("2026-07-24T14:01:00Z"); // 18:01 Dubai, Friday
    expect(getLastWeeklyCutoff(ref).getTime()).toBe(FRIDAY_CUTOFF_UTC);
  });

  it("returns last Friday's cutoff mid-week", () => {
    const ref = new Date("2026-07-22T10:00:00Z"); // Wednesday
    expect(getLastWeeklyCutoff(ref).getTime()).toBe(PREVIOUS_FRIDAY_CUTOFF_UTC);
  });

  it("returns last Friday's cutoff on the weekend", () => {
    const ref = new Date("2026-07-26T10:00:00Z"); // Sunday, 2 days after the Friday cutoff
    expect(getLastWeeklyCutoff(ref).getTime()).toBe(FRIDAY_CUTOFF_UTC);
  });
});

describe("Weekly cutoff bucketing (Ready to Remit vs Accumulating)", () => {
  // Two sequential createShipment calls against the real (remote) test DB — slower
  // than the 5000ms vitest default, same as other multi-shipment tests in this suite.
  it("a record collected just before cutoff is ready to remit; one just after is not", async () => {
    const caller = appRouter.createCaller(createMockContext(CUSTOMER_PORTAL_USER));

    const shipmentBeforeCutoff = await caller.portal.customer.createShipment({
      shipment: {
        shipperName: "Cutoff Test Shipper",
        shipperAddress: "1 Cutoff St",
        shipperCity: "Dubai",
        shipperCountry: "UAE",
        shipperPhone: "+971501234567",
        customerName: "Cutoff Test Customer A",
        customerPhone: "+971509876543",
        address: "1 Customer Ave",
        city: "Dubai",
        emirate: "Dubai",
        destinationCountry: "UAE",
        pieces: 1,
        weight: 1,
        serviceType: "DOM",
        codRequired: 1,
        codAmount: "200.00",
        codCurrency: "AED",
      },
    });

    const shipmentAfterCutoff = await caller.portal.customer.createShipment({
      shipment: {
        shipperName: "Cutoff Test Shipper",
        shipperAddress: "1 Cutoff St",
        shipperCity: "Dubai",
        shipperCountry: "UAE",
        shipperPhone: "+971501234567",
        customerName: "Cutoff Test Customer B",
        customerPhone: "+971509876543",
        address: "2 Customer Ave",
        city: "Dubai",
        emirate: "Dubai",
        destinationCountry: "UAE",
        pieces: 1,
        weight: 1,
        serviceType: "DOM",
        codRequired: 1,
        codAmount: "300.00",
        codCurrency: "AED",
      },
    });

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Simulate the driver app collecting each one at a specific instant relative
    // to the 2026-07-24T14:00:00Z (Friday 18:00 Dubai) cutoff used below.
    const BEFORE_CUTOFF = new Date("2026-07-24T13:59:00Z");
    const AFTER_CUTOFF = new Date("2026-07-24T14:01:00Z");
    const REFERENCE_AFTER_CUTOFF_PASSED = new Date("2026-07-24T15:00:00Z");

    await db.update(codRecords)
      .set({ status: "collected", collectedDate: BEFORE_CUTOFF })
      .where(eq(codRecords.shipmentId, shipmentBeforeCutoff.id));

    await db.update(codRecords)
      .set({ status: "collected", collectedDate: AFTER_CUTOFF })
      .where(eq(codRecords.shipmentId, shipmentAfterCutoff.id));

    const ready = await getReadyToRemitRecordsByClient(28, REFERENCE_AFTER_CUTOFF_PASSED);
    const readyShipmentIds = ready.map(r => r.shipmentId);
    expect(readyShipmentIds).toContain(shipmentBeforeCutoff.id);
    expect(readyShipmentIds).not.toContain(shipmentAfterCutoff.id);

    const accumulating = await getAccumulatingByClient(REFERENCE_AFTER_CUTOFF_PASSED);
    const accumulatingForClient = accumulating.find(c => c.clientId === 28);
    expect(accumulatingForClient).toBeDefined();
    expect(accumulatingForClient!.count).toBeGreaterThanOrEqual(1);

    console.log("✅ Cutoff bucketing: before-cutoff record is ready, after-cutoff record is accumulating");
  }, 20000);
});

describe("getCODSummaryByClient (SQL aggregation fix)", () => {
  it("reflects a newly collected record in the client's collected total", async () => {
    const caller = appRouter.createCaller(createMockContext(CUSTOMER_PORTAL_USER));

    const before = await getCODSummaryByClient(28);

    const shipment = await caller.portal.customer.createShipment({
      shipment: {
        shipperName: "Summary Test Shipper",
        shipperAddress: "1 Summary St",
        shipperCity: "Dubai",
        shipperCountry: "UAE",
        shipperPhone: "+971501234567",
        customerName: "Summary Test Customer",
        customerPhone: "+971509876543",
        address: "1 Customer Ave",
        city: "Dubai",
        emirate: "Dubai",
        destinationCountry: "UAE",
        pieces: 1,
        weight: 1,
        serviceType: "DOM",
        codRequired: 1,
        codAmount: "123.45",
        codCurrency: "AED",
      },
    });

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.update(codRecords)
      .set({ status: "collected", collectedDate: new Date() })
      .where(eq(codRecords.shipmentId, shipment.id));

    const after = await getCODSummaryByClient(28);

    const delta = parseFloat(after.collected) - parseFloat(before.collected);
    expect(delta).toBeCloseTo(123.45, 2);

    console.log("✅ getCODSummaryByClient reflects the new collected amount:", delta);
  }, 10000);
});
