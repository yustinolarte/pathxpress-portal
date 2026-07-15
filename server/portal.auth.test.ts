import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import bcrypt from 'bcryptjs';

// Mock context for testing. `login()` sets the session via ctx.res.cookie()
// (HttpOnly cookie, not a token in the response body) — cookieCalls records
// what was set so tests can assert on it without needing a real Express res.
function createMockContext(): TrpcContext & { cookieCalls: any[][] } {
  const cookieCalls: any[][] = [];
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: { cookie: (...args: any[]) => { cookieCalls.push(args); } } as unknown as TrpcContext["res"],
    cookieCalls,
  };
}

// Dedicated test-fixture admin portal user (test-admin@pathxpress.internal) —
// not a real employee account. See cod.integration.test.ts for the sibling
// client fixture (clientId 28) these integration tests share.
const FIXTURE_ADMIN_EMAIL = "test-admin@pathxpress.internal";
const FIXTURE_ADMIN_PASSWORD = "TestFixtureAdmin!2026";

describe("portal.auth.login", () => {
  it("should successfully login with valid credentials", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // Test with the seeded fixture admin credentials
    const result = await caller.portal.auth.login({
      email: FIXTURE_ADMIN_EMAIL,
      password: FIXTURE_ADMIN_PASSWORD,
    });

    // login() no longer returns the session token in the response body — it's
    // set as an HttpOnly cookie only (ctx.res.cookie), so assert on that instead.
    expect(result).toHaveProperty("user");
    expect(result.user.email).toBe(FIXTURE_ADMIN_EMAIL);
    expect(result.user.role).toBe("admin");
    expect(ctx.cookieCalls.length).toBe(1);
    const [cookieName, cookieValue] = ctx.cookieCalls[0];
    expect(cookieName).toBe("pathxpress_portal_token");
    expect(typeof cookieValue).toBe("string");
    expect(cookieValue.length).toBeGreaterThan(0);
  });

  it("should fail login with invalid password", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.portal.auth.login({
        email: FIXTURE_ADMIN_EMAIL,
        password: "wrongpassword",
      })
    ).rejects.toThrow();
  });

  it("should fail login with non-existent email", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.portal.auth.login({
        email: "nonexistent@example.com",
        password: "anypassword",
      })
    ).rejects.toThrow();
  });
});

describe("portal.customer.createShipment", () => {
  it("should create shipment with valid token", async () => {
    // portal.customer.createShipment authenticates via ctx.portalUser (set from an
    // HttpOnly cookie in real requests), not via a token field in the input — so
    // the mock context sets portalUser directly instead of logging in for real.
    const ctx: TrpcContext = {
      ...createMockContext(),
      portalUser: { userId: 2, email: "test-customer@pathxpress.internal", role: "customer", clientId: 28 },
    };
    const caller = appRouter.createCaller(ctx);

    // Create shipment
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
        serviceType: "standard",
        specialInstructions: "Test shipment",
      },
    });

    expect(shipment).toHaveProperty("id");
    expect(shipment).toHaveProperty("waybillNumber");
    expect(shipment.waybillNumber).toMatch(/^PX\d{9}-[A-Z0-9]{3}$/);
    expect(shipment.customerName).toBe("Test Customer");
  });
});
