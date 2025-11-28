import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createMockContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("PATHXPRESS API Tests", () => {
  describe("tracking.getByTrackingId", () => {
    it("should reject invalid tracking ID format", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.tracking.getByTrackingId({ trackingId: "INVALID" })
      ).rejects.toThrow();
    });

    it("should accept valid tracking ID format", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      // This will throw NOT_FOUND since we don't have test data, but format is valid
      await expect(
        caller.tracking.getByTrackingId({ trackingId: "PX00001" })
      ).rejects.toThrow("Shipment not found");
    });

    it("should reject tracking ID with wrong prefix", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.tracking.getByTrackingId({ trackingId: "AB00001" })
      ).rejects.toThrow();
    });

    it("should reject tracking ID with wrong number of digits", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.tracking.getByTrackingId({ trackingId: "PX001" })
      ).rejects.toThrow();
    });
  });

  describe("quoteRequest.create", () => {
    it("should reject request with missing required fields", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.quoteRequest.create({
          name: "",
          phone: "",
          email: "",
          pickupAddress: "",
          serviceType: "",
          weight: "",
        })
      ).rejects.toThrow();
    });

    it("should reject request with invalid email", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.quoteRequest.create({
          name: "Test User",
          phone: "+971501234567",
          email: "invalid-email",
          pickupAddress: "Dubai",
          serviceType: "same-day",
          weight: "5 kg",
        })
      ).rejects.toThrow();
    });

    it("should accept valid quote request", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quoteRequest.create({
        name: "Test User",
        phone: "+971501234567",
        email: "test@example.com",
        pickupAddress: "Dubai Marina, Dubai",
        deliveryAddress: "Downtown Dubai",
        serviceType: "same-day",
        weight: "5 kg",
        comments: "Fragile items",
      });

      expect(result).toEqual({ success: true });
    });

    it("should accept quote request without optional fields", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quoteRequest.create({
        name: "Test User",
        phone: "+971501234567",
        email: "test@example.com",
        pickupAddress: "Dubai Marina, Dubai",
        serviceType: "domestic",
        weight: "10 kg",
      });

      expect(result).toEqual({ success: true });
    });
  });
});
