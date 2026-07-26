import { describe, expect, it } from "vitest";
import { calculateShipmentRate, getMonthlyShipmentCount, getDb } from "./db";
import { clientAccounts, rateTiers } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// clientId 28 = dedicated test-fixture client account (companyName starts with
// "PathXpress QA"), see cod.integration.test.ts. Has no zone/custom rates and no
// manualRateTierId set, so DOM/SDD pricing always falls through to the tier cascade —
// exactly the code path these tests exercise.
const TEST_CLIENT_ID = 28;

async function withManualTier(tierId: number | null, fn: () => Promise<void>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [original] = await db
    .select({ manualRateTierId: clientAccounts.manualRateTierId })
    .from(clientAccounts)
    .where(eq(clientAccounts.id, TEST_CLIENT_ID))
    .limit(1);

  await db.update(clientAccounts).set({ manualRateTierId: tierId }).where(eq(clientAccounts.id, TEST_CLIENT_ID));
  try {
    await fn();
  } finally {
    await db.update(clientAccounts)
      .set({ manualRateTierId: original?.manualRateTierId ?? null })
      .where(eq(clientAccounts.id, TEST_CLIENT_ID));
  }
}

describe("calculateShipmentRate — manual rate tier override", () => {
  it("uses the admin-pinned manual tier instead of the automatic monthly-volume tier", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [domTier] = await db
      .select()
      .from(rateTiers)
      .where(and(eq(rateTiers.serviceType, "DOM"), eq(rateTiers.isActive, 1)))
      .orderBy(rateTiers.minVolume)
      .limit(1);
    if (!domTier) throw new Error("No active DOM rate tier seeded — cannot run this test");

    await withManualTier(domTier.id, async () => {
      const result = await calculateShipmentRate({
        clientId: TEST_CLIENT_ID,
        serviceType: "DOM",
        weight: 1,
      });

      // Before this fix, manualRateTierId was saved but never read here — the invoice
      // always priced using the automatic monthly-volume tier regardless of this override.
      expect(result.usingManualTier).toBe(true);
      expect(result.appliedTier?.id).toBe(domTier.id);
      expect(result.baseRate).toBe(parseFloat(domTier.baseRate));
    });
  });

  it("ignores the manual tier when its serviceType doesn't match the requested service", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [sddTier] = await db
      .select()
      .from(rateTiers)
      .where(and(eq(rateTiers.serviceType, "SDD"), eq(rateTiers.isActive, 1)))
      .limit(1);
    if (!sddTier) throw new Error("No active SDD rate tier seeded — cannot run this test");

    await withManualTier(sddTier.id, async () => {
      // Client is pinned to an SDD tier; requesting a DOM rate must not misapply it.
      const result = await calculateShipmentRate({
        clientId: TEST_CLIENT_ID,
        serviceType: "DOM",
        weight: 1,
      });

      expect(result.usingManualTier).toBe(false);
    });
  });
});

describe("getMonthlyShipmentCount — frozen as-of-date volume", () => {
  it("only counts orders created on or before the given asOfDate, not up to real-time now", async () => {
    // No fixture orders exist for this client in January 2020, so the count as-of a
    // date long before any of this client's real activity must be 0. Before this fix,
    // the function ignored its date argument entirely and always measured up to
    // literal "now", so this would have returned the client's current-month total instead.
    const count = await getMonthlyShipmentCount(TEST_CLIENT_ID, new Date('2020-01-15T00:00:00Z'));
    expect(count).toBe(0);
  });
});
