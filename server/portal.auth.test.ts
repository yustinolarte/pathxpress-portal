import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import bcrypt from 'bcryptjs';

// Mock context for testing
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

describe("portal.auth.login", () => {
  it("should successfully login with valid credentials", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // Test with the seeded admin credentials
    const result = await caller.portal.auth.login({
      email: "admin@pathxpress.ae",
      password: "admin123",
    });

    expect(result).toHaveProperty("token");
    expect(result).toHaveProperty("user");
    expect(result.user.email).toBe("admin@pathxpress.ae");
    expect(result.user.role).toBe("admin");
    expect(typeof result.token).toBe("string");
    expect(result.token.length).toBeGreaterThan(0);
  });

  it("should fail login with invalid password", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.portal.auth.login({
        email: "admin@pathxpress.ae",
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
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // First login to get token
    const loginResult = await caller.portal.auth.login({
      email: "customer@techsolutions.ae",
      password: "customer123",
    });

    // Create shipment
    const shipment = await caller.portal.customer.createShipment({
      token: loginResult.token,
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
        weight: "2.5",
        length: "30",
        width: "20",
        height: "15",
        serviceType: "standard",
        specialInstructions: "Test shipment",
      },
    });

    expect(shipment).toHaveProperty("id");
    expect(shipment).toHaveProperty("waybillNumber");
    expect(shipment.waybillNumber).toMatch(/^PX\d{9}$/);
    expect(shipment.customerName).toBe("Test Customer");
  });
});
