/**
 * Return to Origin, end to end: admin RTO → undo → RTO again → the driver app
 * marks the stop delivered → the order closes as returned_to_sender, nothing
 * is collected, and billing prices it once at the ORIGINAL destination.
 *
 * Fixtures are created and torn down inside the test, against the test
 * database (vitest.setup.ts) — see feedback_always_clear_qa_test_orders.
 */
import { describe, expect, it } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "net";
import { and, desc, eq } from "drizzle-orm";
import { calculateShipmentRate, getBillableShipments, getDb } from "./db";
import driverRouter from "./driverApi";
import { initiateReturnToOrigin, undoReturnToOrigin } from "./rto";
import { codRecords, driverRoutes, drivers, orders, routeOrders, trackingEvents } from "../drizzle/schema";

// clientId 28 = dedicated test-fixture client account, same as the other COD tests.
const FIXTURE_CLIENT_ID = 28;
const uniqueSuffix = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

const ORIGINAL = {
    city: "Al Ain",
    emirate: "Abu Dhabi",
    latitude: "24.2075",
    longitude: "55.7447",
};

async function putStopStatus(stopId: number, token: string, body: Record<string, unknown>) {
    const app = express();
    app.use(express.json());
    app.use("/api/driver", driverRouter);
    const server = app.listen(0);
    try {
        const { port } = server.address() as AddressInfo;
        const res = await fetch(`http://127.0.0.1:${port}/api/driver/stops/${stopId}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    } finally {
        server.close();
    }
}

describe("Return to Origin", () => {
    it("swaps, undoes, closes as returned_to_sender and bills the original zone", async () => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const [driver] = await db.insert(drivers).values({
            username: `__test_rto_${uniqueSuffix()}`,
            passwordHash: "x",
            fullName: "__TEST FIXTURE__ RTO Driver",
        }).$returningId();
        const [order] = await db.insert(orders).values({
            clientId: FIXTURE_CLIENT_ID,
            waybillNumber: `__TEST-RTO-${uniqueSuffix()}`,
            shipperName: "Test Shipper",
            shipperAddress: "Warehouse 4, Al Quoz",
            shipperCity: "Dubai",
            shipperCountry: "UAE",
            shipperPhone: "+971500000000",
            shipperLat: "25.1300",
            shipperLng: "55.2300",
            customerName: "Test Customer",
            customerPhone: "+971500000001",
            address: "Villa 9, Al Jimi",
            ...ORIGINAL,
            locationAccuracy: "exact",
            destinationCountry: "UAE",
            pieces: 1,
            weight: "1.00",
            serviceType: "DOM",
            codRequired: 1,
            codAmount: "250.00",
            codCurrency: "AED",
            codPaymentMethod: "cash",
            status: "failed_delivery",
        }).$returningId();
        const orderId = order.id;
        const routeId = `__TEST-RTO-${uniqueSuffix()}`;

        try {
            // 'cancelled' (what failed_delivery leaves behind): undo must reopen it.
            await db.insert(codRecords).values({
                shipmentId: orderId, codAmount: "250.00", codCurrency: "AED", status: "cancelled",
            });
            const codStatus = async () =>
                (await db.select().from(codRecords).where(eq(codRecords.shipmentId, orderId)))[0].status;

            // 1. RTO: destination flips to the shipper, COD is dropped
            const rto = await initiateReturnToOrigin(orderId, "test");
            expect(rto).toMatchObject({
                isRto: 1,
                status: "in_transit",
                customerName: "Test Shipper",
                address: "Warehouse 4, Al Quoz",
                city: "Dubai",
                emirate: "Dubai",
                latitude: "25.1300",
                shipperName: "Test Customer",
                shipperCity: "Al Ain",
                codRequired: 0,
                codAmount: null,
            });
            await expect(initiateReturnToOrigin(orderId, "test")).rejects.toThrow();

            // 2. Undo restores everything (COD included), then RTO again
            const undone = await undoReturnToOrigin(orderId, "test");
            expect(undone).toMatchObject({
                isRto: 0, status: "failed_delivery", customerName: "Test Customer", ...ORIGINAL, codRequired: 1, codAmount: "250.00",
            });
            expect(await codStatus()).toBe("pending_collection");
            await initiateReturnToOrigin(orderId, "test");
            expect(await codStatus()).toBe("cancelled");

            // 3. The driver delivers it back to the shipper
            await db.insert(driverRoutes).values({ id: routeId, driverId: driver.id, date: new Date(), status: "in_progress" });
            const [stop] = await db.insert(routeOrders).values({ routeId, orderId, type: "delivery", status: "pending" }).$returningId();
            const token = jwt.sign({ id: driver.id, username: "test" }, process.env.JWT_SECRET!);
            const res = await putStopStatus(stop.id, token, { status: "delivered" });
            expect(res.status).toBe(200);

            const [closed] = await db.select().from(orders).where(eq(orders.id, orderId));
            expect(closed.status).toBe("returned_to_sender");
            expect(closed.deliveryDateReal).not.toBeNull();
            expect(await codStatus()).toBe("cancelled");
            const [event] = await db.select().from(trackingEvents)
                .where(and(eq(trackingEvents.shipmentId, orderId), eq(trackingEvents.createdBy, "driver")))
                .orderBy(desc(trackingEvents.id)).limit(1);
            expect(event).toMatchObject({ statusCode: "returned_to_sender", statusLabel: "Returned to Sender" });

            // 4. Billed once, at the original consignee's destination. Client 28's
            // test rates are flat across zones, so this proves "once, normal rate";
            // the original-zone choice itself is covered by billingDestination in
            // rto.helpers.test.ts.
            const now = new Date();
            const billable = (await getBillableShipments(
                FIXTURE_CLIENT_ID, new Date(now.getTime() - 86_400_000), new Date(now.getTime() + 86_400_000),
            )).filter(s => s.id === orderId);
            expect(billable).toHaveLength(1);
            const expected = await calculateShipmentRate({
                clientId: FIXTURE_CLIENT_ID,
                serviceType: "DOM",
                weight: 1,
                emirate: ORIGINAL.city,
                lat: ORIGINAL.latitude,
                lng: ORIGINAL.longitude,
                asOfDate: closed.createdAt,
            });
            expect(billable[0].calculatedRate).toBe(Math.round(expected.totalRate * 100) / 100);
        } finally {
            await db.delete(routeOrders).where(eq(routeOrders.routeId, routeId));
            await db.delete(driverRoutes).where(eq(driverRoutes.id, routeId));
            await db.delete(trackingEvents).where(eq(trackingEvents.shipmentId, orderId));
            await db.delete(codRecords).where(eq(codRecords.shipmentId, orderId));
            await db.delete(orders).where(eq(orders.id, orderId));
            await db.delete(drivers).where(eq(drivers.id, driver.id));
        }
    });
});
