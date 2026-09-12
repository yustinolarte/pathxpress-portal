import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { createClientAccount, getDb } from "./db";
import { clientAccounts, orders, botSessions, botOrders, botMessages, botRuntime } from "../drizzle/schema";

// Read side of the WhatsApp Bot admin section: the list/conversation/status
// queries join the portal's orders with the bot_* tables the bot service
// maintains. Uses its own throwaway client + orders so it never depends on
// (or disturbs) the shared fixtures other suites rely on.
const FIXTURE_JID = "971500000123@s.whatsapp.net";
const WB_WAITING = "PX_TEST_BOT_WAITING";
const WB_FAILED = "PX_TEST_BOT_FAILED";
const WB_NOT_ASKED = "PX_TEST_BOT_NOTASKED";
const WB_DELIVERED = "PX_TEST_BOT_DELIVERED";
const ALL_WAYBILLS = [WB_WAITING, WB_FAILED, WB_NOT_ASKED, WB_DELIVERED];

let testClientId: number;

function createAdminContext(): TrpcContext {
  return {
    user: null,
    portalUser: { userId: 1, email: "test-admin@pathxpress.internal", role: "admin" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createCustomerContext(): TrpcContext {
  return {
    user: null,
    portalUser: { userId: 2, email: "test-customer@pathxpress.internal", role: "customer", clientId: 1 },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function orderRow(waybillNumber: string, status: string) {
  return {
    clientId: testClientId,
    waybillNumber,
    shipperName: "Test Shipper",
    shipperAddress: "1 Test St",
    shipperCity: "Dubai",
    shipperCountry: "UAE",
    shipperPhone: "+971500000999",
    customerName: "Bot Test Customer",
    customerPhone: "+971500000123",
    address: "2 Test St",
    city: "Dubai",
    destinationCountry: "UAE",
    pieces: 1,
    weight: "1.00",
    serviceType: "standard",
    status,
  };
}

describe("portal.whatsappBot", () => {
  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const client = await createClientAccount({
      companyName: "__TEST FIXTURE__ WhatsApp Bot",
      contactName: "Test Contact",
      phone: "+971500000000",
      billingEmail: "test-whatsappbot-fixture@pathxpress.internal",
      billingAddress: "123 Test St",
      country: "UAE",
      city: "Dubai",
    });
    if (!client) throw new Error("Failed to create test fixture client");
    testClientId = client.id;

    await db.insert(orders).values([
      orderRow(WB_WAITING, "pending_pickup"),
      orderRow(WB_FAILED, "picked_up"),
      orderRow(WB_NOT_ASKED, "pending_pickup"),
      orderRow(WB_DELIVERED, "delivered"),
    ]);

    const now = new Date();
    await db.insert(botSessions).values({ jid: FIXTURE_JID, phone: "971500000123", botActive: 0, lastInteractionAt: now });
    await db.insert(botOrders).values([
      { jid: FIXTURE_JID, waybillNumber: WB_WAITING, status: "awaiting_location", deliveryStatus: "sent", sendAttempts: 1, requestedAt: now, sentAt: now },
      { jid: FIXTURE_JID, waybillNumber: WB_FAILED, status: "awaiting_location", deliveryStatus: "failed", sendAttempts: 2, lastError: "WhatsApp not connected", requestedAt: now },
      { jid: FIXTURE_JID, waybillNumber: WB_DELIVERED, status: "location_received", deliveryStatus: "sent", sendAttempts: 1, requestedAt: now, sentAt: now },
    ]);
    await db.insert(botMessages).values([
      { jid: FIXTURE_JID, direction: "out", text: "Hello! Please share your location.", createdAt: new Date(now.getTime() - 2000) },
      { jid: FIXTURE_JID, direction: "in", text: "Where is the driver?", createdAt: new Date(now.getTime() - 1000) },
    ]);
    // Heartbeat written with the DB's own clock, exactly like the bot does — the
    // online check compares against NOW() in SQL, so a JS Date could be off by
    // the client/server timezone difference.
    await db.insert(botRuntime).values({ id: 1, whatsappConnected: 1, connectedSince: now, lastHeartbeatAt: sql`NOW()`, version: "test" })
      .onDuplicateKeyUpdate({ set: { whatsappConnected: 1, connectedSince: now, lastHeartbeatAt: sql`NOW()`, version: "test" } });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(botMessages).where(eq(botMessages.jid, FIXTURE_JID));
    await db.delete(botOrders).where(inArray(botOrders.waybillNumber, ALL_WAYBILLS));
    await db.delete(botSessions).where(eq(botSessions.jid, FIXTURE_JID));
    await db.delete(orders).where(inArray(orders.waybillNumber, ALL_WAYBILLS));
    await db.delete(clientAccounts).where(eq(clientAccounts.id, testClientId));
  });

  it("rejects non-admin portal users", async () => {
    const caller = appRouter.createCaller(createCustomerContext());
    await expect(caller.portal.whatsappBot.getStatus()).rejects.toThrow(/admin/i);
  });

  it("reports the bot online from a fresh heartbeat", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const status = await caller.portal.whatsappBot.getStatus();
    expect(status.online).toBe(true);
    expect(status.whatsappConnected).toBe(true);
    expect(status.version).toBe("test");
  });

  it("lists open orders with the bot status derived from bot_orders", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.portal.whatsappBot.listOrders({ page: 1, pageSize: 50, search: "PX_TEST_BOT_" });

    const byWaybill = new Map(result.rows.map((r) => [r.waybillNumber, r]));
    expect(byWaybill.get(WB_WAITING)?.botStatus).toBe("waiting");
    expect(byWaybill.get(WB_FAILED)?.botStatus).toBe("failed");
    expect(byWaybill.get(WB_FAILED)?.sendAttempts).toBe(2);
    expect(byWaybill.get(WB_NOT_ASKED)?.botStatus).toBe("not_tracked");
    // Delivered orders are closed — not part of the location-request view at all.
    expect(byWaybill.has(WB_DELIVERED)).toBe(false);
    // Every open order for this number is flagged paused via bot_sessions.botActive = 0.
    expect(byWaybill.get(WB_WAITING)?.paused).toBe(true);
    expect(byWaybill.get(WB_NOT_ASKED)?.paused).toBe(false);

    expect(result.counts.waiting).toBeGreaterThanOrEqual(1);
    expect(result.counts.failed).toBeGreaterThanOrEqual(1);
    expect(result.counts.not_tracked).toBeGreaterThanOrEqual(1);
    expect(result.counts.paused).toBeGreaterThanOrEqual(2);
  });

  it("filters by bot status", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const failed = await caller.portal.whatsappBot.listOrders({ page: 1, pageSize: 50, search: "PX_TEST_BOT_", botStatus: "failed" });
    expect(failed.rows.map((r) => r.waybillNumber)).toEqual([WB_FAILED]);

    const paused = await caller.portal.whatsappBot.listOrders({ page: 1, pageSize: 50, search: "PX_TEST_BOT_", botStatus: "paused" });
    expect(paused.rows.map((r) => r.waybillNumber).sort()).toEqual([WB_FAILED, WB_WAITING].sort());
  });

  it("returns the conversation for a tracked order, oldest first", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const conv = await caller.portal.whatsappBot.getConversation({ waybillNumber: WB_WAITING });
    expect(conv.tracked).toBe(true);
    expect(conv.paused).toBe(true);
    expect(conv.messages.map((m) => m.direction)).toEqual(["out", "in"]);

    const untracked = await caller.portal.whatsappBot.getConversation({ waybillNumber: WB_NOT_ASKED });
    expect(untracked.tracked).toBe(false);
    expect(untracked.messages).toEqual([]);
  });

  it("fails clearly when the bot service is not configured", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const previous = process.env.BOT_BASE_URL;
    delete process.env.BOT_BASE_URL;
    try {
      await expect(caller.portal.whatsappBot.setPaused({ waybillNumber: WB_WAITING, paused: true })).rejects.toThrow(/BOT_BASE_URL/);
    } finally {
      if (previous !== undefined) process.env.BOT_BASE_URL = previous;
    }
  });
});
