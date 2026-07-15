import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { createClientAccount, createPortalUser, getDb } from "./db";
import { clientAccounts, portalUsers } from "../drizzle/schema";
import { hashPassword } from "./portalAuth";

// Dedicated throwaway client + portal user for this suite — deliberately NOT
// the shared clientId 28 fixture (see cod.integration.test.ts), since this
// suite flips status/login access and must not disturb other integration tests.
const FIXTURE_EMAIL = "test-clientstatus-fixture@pathxpress.internal";
const FIXTURE_PASSWORD = "TestFixtureClientStatus!2026";

let testClientId: number;
let testPortalUserId: number;

function createAdminContext(): TrpcContext {
  return {
    user: null,
    portalUser: { userId: 1, email: "test-admin@pathxpress.internal", role: "admin" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createLoginContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("portal.admin.setClientStatus", () => {
  beforeAll(async () => {
    const client = await createClientAccount({
      companyName: "__TEST FIXTURE__ Client Status",
      contactName: "Test Contact",
      phone: "+971500000000",
      billingEmail: FIXTURE_EMAIL,
      billingAddress: "123 Test St",
      country: "UAE",
      city: "Dubai",
    });
    if (!client) throw new Error("Failed to create test fixture client");
    testClientId = client.id;

    const user = await createPortalUser({
      email: FIXTURE_EMAIL,
      passwordHash: await hashPassword(FIXTURE_PASSWORD),
      role: "customer",
      clientId: testClientId,
      status: "active",
    });
    if (!user) throw new Error("Failed to create test fixture portal user");
    testPortalUserId = user.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(portalUsers).where(eq(portalUsers.id, testPortalUserId));
    await db.delete(clientAccounts).where(eq(clientAccounts.id, testClientId));
  });

  it("deactivating a client locks its portal login, reactivating restores it", async () => {
    const adminCaller = appRouter.createCaller(createAdminContext());

    // Sanity: login works while active
    const activeLogin = await appRouter.createCaller(createLoginContext()).portal.auth.login({
      email: FIXTURE_EMAIL,
      password: FIXTURE_PASSWORD,
    });
    expect(activeLogin.user.email).toBe(FIXTURE_EMAIL);

    // Deactivate via the admin mutation
    const result = await adminCaller.portal.admin.setClientStatus({ clientId: testClientId, status: "inactive" });
    expect(result.success).toBe(true);

    const db = await getDb();
    const [client] = await db!.select().from(clientAccounts).where(eq(clientAccounts.id, testClientId));
    expect(client.status).toBe("inactive");
    const [userAfterDeactivate] = await db!.select().from(portalUsers).where(eq(portalUsers.id, testPortalUserId));
    expect(userAfterDeactivate.status).toBe("inactive");

    // Portal login must now be rejected with the contact-support message
    await expect(
      appRouter.createCaller(createLoginContext()).portal.auth.login({
        email: FIXTURE_EMAIL,
        password: FIXTURE_PASSWORD,
      })
    ).rejects.toThrow(/inactive.*contact support/i);

    // Reactivate
    const reactivateResult = await adminCaller.portal.admin.setClientStatus({ clientId: testClientId, status: "active" });
    expect(reactivateResult.success).toBe(true);

    const [userAfterReactivate] = await db!.select().from(portalUsers).where(eq(portalUsers.id, testPortalUserId));
    expect(userAfterReactivate.status).toBe("active");

    const reactivatedLogin = await appRouter.createCaller(createLoginContext()).portal.auth.login({
      email: FIXTURE_EMAIL,
      password: FIXTURE_PASSWORD,
    });
    expect(reactivatedLogin.user.email).toBe(FIXTURE_EMAIL);
  });
});
