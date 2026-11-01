/**
 * Where each pin came from: the WhatsApp bot, the merchant, PathXpress staff
 * or the geocoder — and the return-order bot fix (the location the bot gets
 * for a return belongs to the PICKUP leg, not the merchant's delivery pin).
 *
 * Runs against the test database (vitest.setup.ts); fixtures are removed.
 */
import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import { eq, inArray } from "drizzle-orm";
import { createOrder, getDb, updateOrder, updateOrderLocation } from "./db";
import { ENV } from "./_core/env";
import botRouter from "./botRouter";
import { orders, trackingEvents } from "../drizzle/schema";

const FIXTURE_CLIENT_ID = 28;
const created: number[] = [];
const uniqueSuffix = () => `${Date.now()}${Math.floor(Math.random() * 100000)}`;

async function db() {
    const d = await getDb();
    if (!d) throw new Error("Database not available");
    return d;
}

async function makeOrder(overrides: Partial<typeof orders.$inferInsert> = {}) {
    const [row] = await (await db()).insert(orders).values({
        clientId: FIXTURE_CLIENT_ID,
        waybillNumber: `__TEST-LOC-${uniqueSuffix()}`,
        shipperName: "Test Shipper", shipperAddress: "Warehouse 4, Al Quoz", shipperCity: "Dubai", shipperCountry: "UAE",
        shipperPhone: "+971500000000", customerName: "Test Customer", customerPhone: "+971500000001",
        address: "Villa 9, Jumeirah", city: "Dubai", emirate: "Dubai", destinationCountry: "UAE",
        pieces: 1, weight: "1.00", serviceType: "DOM", status: "pending_pickup",
        ...overrides,
    }).$returningId();
    created.push(row.id);
    return row.id;
}

const orderRow = async (id: number) => (await (await db()).select().from(orders).where(eq(orders.id, id)))[0];

async function putBotLocation(waybill: string, body: Record<string, unknown>) {
    const previousKey = ENV.botApiKey;
    (ENV as { botApiKey: string }).botApiKey = "test-bot-key";
    const app = express();
    app.use(express.json());
    app.use("/api/bot", botRouter);
    const server = app.listen(0);
    try {
        const { port } = server.address() as AddressInfo;
        const res = await fetch(`http://127.0.0.1:${port}/api/bot/orders/${waybill}/location`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "X-Bot-Key": "test-bot-key" },
            body: JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() as any };
    } finally {
        server.close();
        (ENV as { botApiKey: string }).botApiKey = previousKey;
    }
}

afterEach(async () => {
    if (created.length) {
        const d = await db();
        await d.delete(trackingEvents).where(inArray(trackingEvents.shipmentId, created));
        await d.delete(orders).where(inArray(orders.id, created));
        created.length = 0;
    }
});

describe("location source", () => {
    it("marks a pin the recipient shared through the bot as verified by the bot", { timeout: 30000 }, async () => {
        const id = await makeOrder();
        const { waybillNumber } = await orderRow(id);
        const res = await putBotLocation(waybillNumber, { latitude: 25.1, longitude: 55.2 });
        expect(res.status).toBe(200);
        expect(res.body.leg).toBe("delivery");
        expect(await orderRow(id)).toMatchObject({ latitude: "25.1", longitude: "55.2", locationSource: "bot", locationAccuracy: "exact" });
        expect((await orderRow(id)).locationVerifiedAt).not.toBeNull();
    });

    it("puts the location the bot gets for a RETURN on the pickup leg and leaves the merchant pin alone", { timeout: 30000 }, async () => {
        const id = await makeOrder({ isReturn: 1, latitude: "25.13", longitude: "55.23", locationSource: "client" });
        const { waybillNumber } = await orderRow(id);
        const res = await putBotLocation(waybillNumber, { latitude: 25.05, longitude: 55.15 });
        expect(res.status).toBe(200);
        expect(res.body.leg).toBe("pickup");
        expect(await orderRow(id)).toMatchObject({
            shipperLat: "25.05", shipperLng: "55.15", shipperLocationSource: "bot",
            latitude: "25.13", longitude: "55.23", locationSource: "client",
        });
    });

    it("records staff pins as admin, merchant pins as client, and un-verifies a pin when only the address text changes", { timeout: 30000 }, async () => {
        const fromMerchant = await createOrder({
            clientId: FIXTURE_CLIENT_ID, waybillNumber: `__TEST-LOC-${uniqueSuffix()}`,
            shipperName: "S", shipperAddress: "A", shipperCity: "Dubai", shipperCountry: "UAE", shipperPhone: "+971500000000",
            customerName: "C", customerPhone: "+971500000001", address: "Villa 1", city: "Dubai", destinationCountry: "UAE",
            pieces: 1, weight: "1.00", serviceType: "DOM", latitude: "25.2", longitude: "55.3",
        });
        if (!fromMerchant) throw new Error("createOrder failed");
        created.push(fromMerchant.id);
        expect((await orderRow(fromMerchant.id)).locationSource).toBe("client");

        await updateOrderLocation(fromMerchant.id, "25.21", "55.31");
        expect((await orderRow(fromMerchant.id)).locationSource).toBe("admin");

        // The edit form re-sends the same pin with a new address: the pin no longer confirms it.
        const result = await updateOrder(fromMerchant.id, { address: "Villa 2, another street", latitude: "25.21", longitude: "55.31" });
        expect(result.success).toBe(true);
        expect(await orderRow(fromMerchant.id)).toMatchObject({ latitude: "25.21", locationSource: null, locationVerifiedAt: null });
    });
});
