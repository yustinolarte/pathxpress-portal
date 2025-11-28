import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { generatePortalToken } from "./portalAuth";

describe("Shipment Creation", () => {
  it("should generate unique waybill numbers", async () => {
    // Create a mock context with customer token
    const token = generatePortalToken({ userId: 2, email: "customer@techsolutions.ae", role: "customer", clientId: 1 });
    
    const ctx: TrpcContext = {
      user: null,
      req: {
        protocol: "https",
        headers: {},
      } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(ctx);

    // Create first shipment
    const shipment1Data = {
      token,
      shipment: {
        shipperName: "Test Shipper 1",
        shipperAddress: "123 Test St",
        shipperCity: "Dubai",
        shipperCountry: "UAE",
        shipperPhone: "+971501234567",
        customerName: "Test Customer 1",
        customerPhone: "+971507654321",
        address: "456 Delivery St",
        city: "Abu Dhabi",
        emirate: "Abu Dhabi",
        destinationCountry: "UAE",
        pieces: 1,
        weight: 5,
        length: 30,
        width: 20,
        height: 10,
        serviceType: "standard",
      }
    };

    const result1 = await caller.portal.customer.createShipment(shipment1Data);
    expect(result1).toBeDefined();
    expect(result1.waybillNumber).toMatch(/^PX\d{9}$/);
    console.log("✅ First shipment created:", result1.waybillNumber);

    // Create second shipment - should have different waybill
    const shipment2Data = {
      token,
      shipment: {
        ...shipment1Data.shipment,
        shipperName: "Test Shipper 2",
        customerName: "Test Customer 2",
      }
    };

    const result2 = await caller.portal.customer.createShipment(shipment2Data);
    expect(result2).toBeDefined();
    expect(result2.waybillNumber).toMatch(/^PX\d{9}$/);
    expect(result2.waybillNumber).not.toBe(result1.waybillNumber);
    console.log("✅ Second shipment created:", result2.waybillNumber);
    console.log("✅ Waybill numbers are unique!");
  });

  it("should create shipment with valid data", async () => {
    const token = generatePortalToken({ userId: 2, email: "customer@techsolutions.ae", role: "customer", clientId: 1 });
    
    const ctx: TrpcContext = {
      user: null,
      req: {
        protocol: "https",
        headers: {},
      } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(ctx);

    const shipmentData = {
      token,
      shipment: {
        shipperName: "Valid Shipper",
        shipperAddress: "789 Valid St",
        shipperCity: "Sharjah",
        shipperCountry: "UAE",
        shipperPhone: "+971509876543",
        customerName: "Valid Customer",
        customerPhone: "+971503456789",
        address: "321 Valid Ave",
        city: "Dubai",
        emirate: "Dubai",
        destinationCountry: "UAE",
        pieces: 2,
        weight: 10,
        length: 40,
        width: 30,
        height: 20,
        serviceType: "express",
      }
    };

    const result = await caller.portal.customer.createShipment(shipmentData);
    
    expect(result).toBeDefined();
    expect(result.shipperName).toBe("Valid Shipper");
    expect(result.customerName).toBe("Valid Customer");
    expect(result.status).toBe("pending_pickup");
    expect(result.serviceType).toBe("express");
    console.log("✅ Shipment created with valid data:", result.waybillNumber);
  });
});
