import { describe, expect, it } from "vitest";
import { getAvailableServicesForClient, getDb } from "./db";
import { clientServiceSettings } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// clientId 28 = dedicated test-fixture client account, see billing.pricing.test.ts.
const TEST_CLIENT_ID = 28;

// Real-world config seen on a production client: SDD offered only to the
// zone-1 emirates, EXPRESS_ZONE2 only to the zone-2 ones. Neither list can
// literally contain "Al Ain" — the region picker only ever offered the 7
// canonical emirates — so this reproduces the bug where Al Ain (zone 2, but
// labelled "Abu Dhabi") slipped through SDD's zone-1-only region list.
async function withServiceSettings(fn: () => Promise<void>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(clientServiceSettings).values([
    {
      clientId: TEST_CLIENT_ID,
      serviceCode: "SDD",
      isEnabled: 1,
      baseRate: "20",
      perKgRate: "3",
      availableRegions: JSON.stringify(["Dubai", "Sharjah", "Ajman", "Abu Dhabi"]),
    },
    {
      clientId: TEST_CLIENT_ID,
      serviceCode: "EXPRESS_ZONE2",
      isEnabled: 1,
      baseRate: "100",
      perKgRate: "2",
      availableRegions: JSON.stringify(["Umm Al Quwain", "Ras Al Khaimah", "Fujairah"]),
    },
  ]);
  try {
    await fn();
  } finally {
    await db.delete(clientServiceSettings).where(
      and(
        eq(clientServiceSettings.clientId, TEST_CLIENT_ID),
        eq(clientServiceSettings.isEnabled, 1),
      ),
    );
  }
}

describe("getAvailableServicesForClient — Al Ain vs a zone-1-only region list", () => {
  it("excludes SDD for Al Ain (raw city, no coordinates) even though its region list contains \"Abu Dhabi\"", async () => {
    await withServiceSettings(async () => {
      const services = await getAvailableServicesForClient(TEST_CLIENT_ID, {
        emirate: "Al Ain",
        weight: 1,
      });
      const sdd = services.find(s => s.code === "SDD");
      expect(sdd?.available).toBe(false);
    });
  });

  it("still offers EXPRESS_ZONE2 for Al Ain even though \"Al Ain\" isn't literally in its region list", async () => {
    await withServiceSettings(async () => {
      const services = await getAvailableServicesForClient(TEST_CLIENT_ID, {
        emirate: "Al Ain",
        weight: 1,
      });
      const expressZone2 = services.find(s => s.code === "EXPRESS_ZONE2");
      expect(expressZone2?.available).toBe(true);
    });
  });

  it("excludes SDD for an Al Ain coordinate even when the emirate string sent is the collapsed \"Abu Dhabi\" label", async () => {
    await withServiceSettings(async () => {
      const services = await getAvailableServicesForClient(TEST_CLIENT_ID, {
        emirate: "Abu Dhabi",
        weight: 1,
        lat: 24.2075,
        lng: 55.7447,
      });
      const sdd = services.find(s => s.code === "SDD");
      const expressZone2 = services.find(s => s.code === "EXPRESS_ZONE2");
      expect(sdd?.available).toBe(false);
      expect(expressZone2?.available).toBe(true);
    });
  });

  it("keeps SDD available for a real Abu Dhabi destination (unaffected by the Al Ain special-case)", async () => {
    await withServiceSettings(async () => {
      const services = await getAvailableServicesForClient(TEST_CLIENT_ID, {
        emirate: "Abu Dhabi",
        weight: 1,
      });
      const sdd = services.find(s => s.code === "SDD");
      expect(sdd?.available).toBe(true);
    });
  });
});
