/**
 * Stop status engine, end to end through the driver REST API and the admin
 * status sync: replays are no-ops, the offline queue can deliver taps out of
 * order, a failed pickup closes its delivery, routes close themselves, an old
 * route never overwrites a re-dispatched order, and claims/assignments can't race.
 *
 * Fixtures are created and torn down inside each test, against the test
 * database (vitest.setup.ts) — see feedback_always_clear_qa_test_orders.
 */
import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "net";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, updateOrderStatus } from "./db";
import driverRouter from "./driverApi";
import { createDriverRoute, getAssignmentFlags } from "./driverAdmin";
import {
    codRecords, driverRoutes, driverShifts, drivers, orders, routeAuditLog, routeOrders, trackingEvents,
} from "../drizzle/schema";

// clientId 28 = dedicated test-fixture client account, same as the other COD tests.
const FIXTURE_CLIENT_ID = 28;
const uniqueSuffix = () => `${Date.now()}${Math.floor(Math.random() * 100000)}`;

const created = { drivers: [] as number[], orders: [] as number[], routes: [] as string[] };

async function db() {
    const d = await getDb();
    if (!d) throw new Error("Database not available");
    return d;
}

async function makeDriver(): Promise<{ id: number; token: string }> {
    const [row] = await (await db()).insert(drivers).values({
        username: `__test_stop_${uniqueSuffix()}`,
        passwordHash: "x",
        fullName: "__TEST FIXTURE__ Stop Driver",
    }).$returningId();
    created.drivers.push(row.id);
    return { id: row.id, token: jwt.sign({ id: row.id, username: "test" }, process.env.JWT_SECRET!) };
}

async function makeOrder(overrides: Partial<typeof orders.$inferInsert> = {}): Promise<number> {
    const [row] = await (await db()).insert(orders).values({
        clientId: FIXTURE_CLIENT_ID,
        waybillNumber: `__TEST-STOP-${uniqueSuffix()}`,
        shipperName: "Test Shipper",
        shipperAddress: "Warehouse 4, Al Quoz",
        shipperCity: "Dubai",
        shipperCountry: "UAE",
        shipperPhone: "+971500000000",
        customerName: "Test Customer",
        customerPhone: "+971500000001",
        address: "Villa 9, Jumeirah",
        city: "Dubai",
        emirate: "Dubai",
        destinationCountry: "UAE",
        pieces: 1,
        weight: "1.00",
        serviceType: "DOM",
        status: "pending_pickup",
        ...overrides,
    }).$returningId();
    created.orders.push(row.id);
    return row.id;
}

async function makeRoute(driverId: number | null, status: "pending" | "in_progress" | "completed" = "in_progress"): Promise<string> {
    const id = `__T-${uniqueSuffix()}`.slice(0, 50);
    await (await db()).insert(driverRoutes).values({ id, driverId, date: new Date(), status });
    created.routes.push(id);
    return id;
}

async function addStop(routeId: string, orderId: number, type: "pickup" | "delivery", status = "pending", sequence?: number) {
    const [row] = await (await db()).insert(routeOrders).values({
        routeId, orderId, type, status: status as any, sequence: sequence ?? null,
    }).$returningId();
    return row.id;
}

async function call(method: string, path: string, token: string, body?: Record<string, unknown>) {
    const app = express();
    app.use(express.json());
    app.use("/api/driver", driverRouter);
    const server = app.listen(0);
    try {
        const { port } = server.address() as AddressInfo;
        const res = await fetch(`http://127.0.0.1:${port}/api/driver${path}`, {
            method,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: body ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, body: await res.json() as any };
    } finally {
        server.close();
    }
}

const putStop = (stopId: number, token: string, body: Record<string, unknown>) =>
    call("PUT", `/stops/${stopId}/status`, token, body);

async function stopRow(id: number) {
    return (await (await db()).select().from(routeOrders).where(eq(routeOrders.id, id)))[0];
}
async function orderRow(id: number) {
    return (await (await db()).select().from(orders).where(eq(orders.id, id)))[0];
}
async function routeRow(id: string) {
    return (await (await db()).select().from(driverRoutes).where(eq(driverRoutes.id, id)))[0];
}
async function events(orderId: number) {
    return (await db()).select().from(trackingEvents).where(eq(trackingEvents.shipmentId, orderId)).orderBy(trackingEvents.id);
}

afterEach(async () => {
    const d = await db();
    if (created.routes.length) {
        await d.delete(routeOrders).where(inArray(routeOrders.routeId, created.routes));
        await d.delete(routeAuditLog).where(inArray(routeAuditLog.routeId, created.routes));
        await d.delete(driverRoutes).where(inArray(driverRoutes.id, created.routes));
    }
    if (created.orders.length) {
        await d.delete(routeOrders).where(inArray(routeOrders.orderId, created.orders));
        await d.delete(routeAuditLog).where(inArray(routeAuditLog.orderId, created.orders));
        await d.delete(trackingEvents).where(inArray(trackingEvents.shipmentId, created.orders));
        await d.delete(codRecords).where(inArray(codRecords.shipmentId, created.orders));
        await d.delete(orders).where(inArray(orders.id, created.orders));
    }
    if (created.drivers.length) {
        await d.delete(driverShifts).where(inArray(driverShifts.driverId, created.drivers));
        await d.delete(drivers).where(inArray(drivers.id, created.drivers));
    }
    created.drivers = []; created.orders = []; created.routes = [];
});

describe("stop status engine", () => {
    it("handles an out-of-order offline queue, replays and a remitted COD", { timeout: 30000 }, async () => {
        const d = await db();
        const driver = await makeDriver();
        const orderId = await makeOrder({ codRequired: 1, codAmount: "150.00", codCurrency: "AED", codPaymentMethod: "cash" });
        await d.insert(codRecords).values({ shipmentId: orderId, codAmount: "150.00", codCurrency: "AED", status: "pending_collection" });
        const routeId = await makeRoute(driver.id);
        const pickup = await addStop(routeId, orderId, "pickup", "pending", 1);
        const delivery = await addStop(routeId, orderId, "delivery", "in_progress", 2);

        // The delivery tap reaches the server before the queued pickup.
        const delivered = await putStop(delivery, driver.token, { status: "delivered", collectedAmount: 150 });
        expect(delivered.status).toBe(200);
        expect(delivered.body.ignored).toBeUndefined();
        expect((await stopRow(pickup)).status).toBe("picked_up");
        expect((await orderRow(orderId)).status).toBe("delivered");
        expect((await events(orderId)).map(e => e.statusCode)).toEqual(["picked_up", "delivered"]);
        // Both legs final → the route closed itself.
        expect((await routeRow(routeId)).status).toBe("completed");

        const [cod] = await d.select().from(codRecords).where(eq(codRecords.shipmentId, orderId));
        expect(cod.status).toBe("collected");
        const collectedDate = cod.collectedDate;

        // The late pickup is now a no-op; the order is not dragged back to out_for_delivery.
        const latePickup = await putStop(pickup, driver.token, { status: "picked_up" });
        expect(latePickup.status).toBe(200);
        expect(latePickup.body.ignored).toBe(true);
        expect((await orderRow(orderId)).status).toBe("delivered");

        // The COD gets remitted; a replay of "delivered" must not reopen it.
        await d.update(codRecords).set({ status: "remitted" }).where(eq(codRecords.id, cod.id));
        const replay = await putStop(delivery, driver.token, { status: "delivered", collectedAmount: 150 });
        expect(replay.status).toBe(200);
        expect(replay.body.ignored).toBe(true);
        const [after] = await d.select().from(codRecords).where(eq(codRecords.shipmentId, orderId));
        expect(after.status).toBe("remitted");
        expect(after.collectedDate?.getTime()).toBe(collectedDate?.getTime());
        expect(await events(orderId)).toHaveLength(2);

        // A queued "failed" after the delivery is refused, not applied.
        const lateFail = await putStop(delivery, driver.token, { status: "failed" });
        expect(lateFail.body.ignored).toBe(true);
        expect((await stopRow(delivery)).status).toBe("delivered");
    });

    it("closes the delivery when the pickup fails and lets dispatch re-plan a pickup", { timeout: 30000 }, async () => {
        const driver = await makeDriver();
        const orderId = await makeOrder();
        const routeId = await makeRoute(driver.id);
        const pickup = await addStop(routeId, orderId, "pickup", "pending", 1);
        const delivery = await addStop(routeId, orderId, "delivery", "in_progress", 2);

        const res = await putStop(pickup, driver.token, { status: "attempted", notes: "Shipper closed" });
        expect(res.status).toBe(200);
        expect((await stopRow(delivery))).toMatchObject({ status: "failed", notes: "Pickup failed" });
        expect((await orderRow(orderId)).status).toBe("failed_pickup");
        expect((await routeRow(routeId)).status).toBe("completed");

        const flags = (await getAssignmentFlags([orderId])).get(orderId)!;
        expect(flags.canBoth).toBe(true);
        expect(flags.canPickup).toBe(true);
    });

    it("lets the first driver claim an unassigned route through a stop update and locks out the rest", { timeout: 30000 }, async () => {
        const a = await makeDriver();
        const b = await makeDriver();
        const orderId = await makeOrder({ status: "in_transit" });
        const routeId = await makeRoute(null, "pending");
        const delivery = await addStop(routeId, orderId, "delivery", "pending", 1);

        expect((await putStop(delivery, b.token, { status: "in_progress" })).status).toBe(200);
        expect((await routeRow(routeId))).toMatchObject({ driverId: b.id, status: "in_progress" });
        expect((await putStop(delivery, a.token, { status: "delivered" })).status).toBe(403);
    });

    it("never lets a stop on an old route overwrite a re-dispatched order", { timeout: 30000 }, async () => {
        const driver = await makeDriver();
        const orderId = await makeOrder({ status: "out_for_delivery" });
        const oldRoute = await makeRoute(driver.id, "in_progress");
        const oldStop = await addStop(oldRoute, orderId, "delivery", "in_progress", 1);
        const newRoute = await makeRoute(driver.id, "in_progress");
        await addStop(newRoute, orderId, "delivery", "in_progress", 1);

        const res = await putStop(oldStop, driver.token, { status: "failed" });
        expect(res.body.ignored).toBe(true);
        expect((await orderRow(orderId)).status).toBe("out_for_delivery");
        expect((await stopRow(oldStop)).status).toBe("in_progress");
    });

    it("rejects garbage instead of writing it", { timeout: 30000 }, async () => {
        const driver = await makeDriver();
        const orderId = await makeOrder({ status: "in_transit" });
        const routeId = await makeRoute(driver.id);
        const delivery = await addStop(routeId, orderId, "delivery", "in_progress", 1);

        expect((await putStop(delivery, driver.token, {})).status).toBe(400);
        expect((await putStop(delivery, driver.token, { status: "picked_up" })).status).toBe(400);
        expect((await putStop(delivery, driver.token, { status: "delivered", collectedAmount: "abc" })).status).toBe(400);
        expect((await stopRow(delivery)).status).toBe("in_progress");
    });
});

describe("admin status sync", () => {
    it("moves only the matching leg, and a correction re-opens it", { timeout: 30000 }, async () => {
        const driver = await makeDriver();
        const orderId = await makeOrder();
        const routeId = await makeRoute(driver.id);
        const pickup = await addStop(routeId, orderId, "pickup", "pending", 1);
        const delivery = await addStop(routeId, orderId, "delivery", "in_progress", 2);

        await updateOrderStatus(orderId, "picked_up", "qa@test");
        expect((await stopRow(pickup)).status).toBe("picked_up");
        // The old sync stamped 'picked_up' onto the delivery leg too.
        expect((await stopRow(delivery)).status).toBe("in_progress");

        await updateOrderStatus(orderId, "delivered", "qa@test");
        expect((await stopRow(delivery)).status).toBe("delivered");
        expect((await routeRow(routeId)).status).toBe("completed");

        // Admin realises it was a mistake: back to pending_pickup re-opens both legs.
        await updateOrderStatus(orderId, "pending_pickup", "qa@test");
        expect((await stopRow(pickup)).status).toBe("pending");
        expect((await stopRow(delivery))).toMatchObject({ status: "pending", deliveredAt: null });
    });

    it("leaves stops on older routes alone", { timeout: 30000 }, async () => {
        const driver = await makeDriver();
        const orderId = await makeOrder({ status: "out_for_delivery" });
        const oldRoute = await makeRoute(driver.id, "completed");
        const oldStop = await addStop(oldRoute, orderId, "delivery", "pending", 1);
        const newRoute = await makeRoute(driver.id, "in_progress");
        const newStop = await addStop(newRoute, orderId, "delivery", "in_progress", 1);

        await updateOrderStatus(orderId, "delivered", "qa@test");
        expect((await stopRow(newStop)).status).toBe("delivered");
        expect((await stopRow(oldStop)).status).toBe("pending");
    });
});

describe("routes", () => {
    it("lets exactly one of two concurrent claims win", { timeout: 30000 }, async () => {
        const a = await makeDriver();
        const b = await makeDriver();
        const orderId = await makeOrder({ status: "in_transit" });
        const routeId = await makeRoute(null, "pending");
        await addStop(routeId, orderId, "delivery", "pending", 1);

        const [ra, rb] = await Promise.all([
            call("POST", `/routes/${routeId}/claim`, a.token),
            call("POST", `/routes/${routeId}/claim`, b.token),
        ]);
        expect([ra.status, rb.status].sort()).toEqual([200, 403]);
        const winner = ra.status === 200 ? a.id : b.id;
        expect((await routeRow(routeId)).driverId).toBe(winner);
    });

    it("finishing with an unworked stop brings the order back to the warehouse; a late restart is ignored", { timeout: 30000 }, async () => {
        const driver = await makeDriver();
        const orderId = await makeOrder({ status: "out_for_delivery" });
        const routeId = await makeRoute(driver.id, "in_progress");
        await addStop(routeId, orderId, "delivery", "in_progress", 1);

        const done = await call("PUT", `/routes/${routeId}/status`, driver.token, { status: "completed" });
        expect(done.status).toBe(200);
        expect((await routeRow(routeId)).status).toBe("completed");
        expect((await orderRow(orderId)).status).toBe("in_transit");
        expect((await events(orderId)).at(-1)).toMatchObject({ statusCode: "in_transit" });

        const restart = await call("PUT", `/routes/${routeId}/status`, driver.token, { status: "in_progress" });
        expect(restart.status).toBe(200);
        expect(restart.body.ignored).toBe(true);
        expect((await routeRow(routeId)).status).toBe("completed");
    });

    it("never puts the same leg on two routes when two admins create at once", { timeout: 30000 }, async () => {
        const driver = await makeDriver();
        const orderId = await makeOrder({ status: "in_transit" });

        const attempt = () => createDriverRoute({
            date: new Date(), driverId: driver.id, stops: [{ orderId, type: "delivery" }],
        }).then(r => { created.routes.push(r.id); return "ok"; }, () => "refused");
        const outcomes = await Promise.all([attempt(), attempt()]);
        expect(outcomes.sort()).toEqual(["ok", "refused"]);

        const legs = await (await db()).select().from(routeOrders)
            .where(and(eq(routeOrders.orderId, orderId), eq(routeOrders.type, "delivery")));
        expect(legs).toHaveLength(1);
    });
});
