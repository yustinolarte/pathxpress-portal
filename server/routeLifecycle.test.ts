/**
 * Dispatch tools end to end against the test database: cancel / remove / move /
 * reassign / reopen / correct, the out-for-delivery revert, cash hand-overs and
 * the clock-out route close.
 *
 * Fixtures are created and torn down inside each test (vitest.setup.ts points
 * at the test DB) — see feedback_always_clear_qa_test_orders.
 */
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import {
    getAssignmentFlags, getAvailableOrders, getDriverCodReconciliation, markDriverCashRemitted, removeOrderFromRoute,
    setOrderPriority, voidCashHandover,
} from "./driverAdmin";
import {
    cancelRoute, closeSettledRoutesForDriver, correctStop, getRouteAuditLog, moveStops, reassignRoute, reopenRoute,
} from "./routeLifecycle";
import {
    codRecords, driverCashHandovers, driverRoutes, drivers, orders, routeAuditLog, routeOrders, trackingEvents,
} from "../drizzle/schema";

const FIXTURE_CLIENT_ID = 28;
const ACTOR = "qa@test";
const uniqueSuffix = () => `${Date.now()}${Math.floor(Math.random() * 100000)}`;
const created = { drivers: [] as number[], orders: [] as number[], routes: [] as string[] };

async function db() {
    const d = await getDb();
    if (!d) throw new Error("Database not available");
    return d;
}

async function makeDriver() {
    const [row] = await (await db()).insert(drivers).values({
        username: `__test_life_${uniqueSuffix()}`, passwordHash: "x", fullName: "__TEST FIXTURE__ Lifecycle Driver",
    }).$returningId();
    created.drivers.push(row.id);
    return row.id;
}

async function makeOrder(overrides: Partial<typeof orders.$inferInsert> = {}) {
    const [row] = await (await db()).insert(orders).values({
        clientId: FIXTURE_CLIENT_ID,
        waybillNumber: `__TEST-LIFE-${uniqueSuffix()}`,
        shipperName: "Test Shipper", shipperAddress: "Warehouse 4, Al Quoz", shipperCity: "Dubai", shipperCountry: "UAE",
        shipperPhone: "+971500000000", customerName: "Test Customer", customerPhone: "+971500000001",
        address: "Villa 9, Jumeirah", city: "Dubai", emirate: "Dubai", destinationCountry: "UAE",
        pieces: 1, weight: "1.00", serviceType: "DOM", status: "pending_pickup",
        ...overrides,
    }).$returningId();
    created.orders.push(row.id);
    return row.id;
}

async function makeRoute(driverId: number | null, status: "pending" | "in_progress" | "completed" = "in_progress", extra: Partial<typeof driverRoutes.$inferInsert> = {}) {
    const id = `__L-${uniqueSuffix()}`.slice(0, 50);
    await (await db()).insert(driverRoutes).values({ id, driverId, date: new Date(), status, ...extra });
    created.routes.push(id);
    return id;
}

async function addStop(routeId: string, orderId: number, type: "pickup" | "delivery", status = "pending", extra: Partial<typeof routeOrders.$inferInsert> = {}) {
    const [row] = await (await db()).insert(routeOrders).values({ routeId, orderId, type, status: status as any, ...extra }).$returningId();
    return row.id;
}

const order = async (id: number) => (await (await db()).select().from(orders).where(eq(orders.id, id)))[0];
const route = async (id: string) => (await (await db()).select().from(driverRoutes).where(eq(driverRoutes.id, id)))[0];
const stop = async (id: number) => (await (await db()).select().from(routeOrders).where(eq(routeOrders.id, id)))[0];

afterEach(async () => {
    const d = await db();
    if (created.drivers.length) {
        const routes = await d.select({ id: driverRoutes.id }).from(driverRoutes).where(inArray(driverRoutes.driverId, created.drivers));
        created.routes.push(...routes.map(r => r.id));
    }
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
        await d.delete(driverCashHandovers).where(inArray(driverCashHandovers.driverId, created.drivers));
        await d.delete(drivers).where(inArray(drivers.id, created.drivers));
    }
    created.drivers = []; created.orders = []; created.routes = [];
});

describe("route lifecycle", () => {
    it("cancelling a scanned route brings its out-for-delivery orders back and frees the legs", { timeout: 30000 }, async () => {
        const driverId = await makeDriver();
        const orderId = await makeOrder({ status: "out_for_delivery" });
        const routeId = await makeRoute(driverId);
        await addStop(routeId, orderId, "delivery", "in_progress", { sequence: 1 });

        const res = await cancelRoute(routeId, ACTOR, "Van broke down");
        expect(res.backToWarehouse).toBe(1);
        expect((await route(routeId)).status).toBe("cancelled");
        expect((await order(orderId)).status).toBe("in_transit");
        expect((await getAssignmentFlags([orderId])).get(orderId)!.canDeliver).toBe(true);
        expect((await getRouteAuditLog(routeId)).map(e => e.action)).toEqual(expect.arrayContaining(["route_cancelled", "order_back_to_warehouse"]));
    });

    it("removing an unpicked pickup takes its delivery with it; removing a scanned delivery reverts the order", { timeout: 30000 }, async () => {
        const driverId = await makeDriver();
        const pending = await makeOrder();
        const out = await makeOrder({ status: "out_for_delivery" });
        const routeId = await makeRoute(driverId);
        await addStop(routeId, pending, "pickup", "pending", { sequence: 1 });
        await addStop(routeId, pending, "delivery", "in_progress", { sequence: 2 });
        await addStop(routeId, out, "delivery", "in_progress", { sequence: 3 });

        await removeOrderFromRoute(routeId, pending, "pickup", ACTOR);
        const left = await (await db()).select().from(routeOrders).where(eq(routeOrders.routeId, routeId));
        expect(left.map(s => s.orderId)).toEqual([out]);
        expect(left[0].sequence).toBe(1);

        await removeOrderFromRoute(routeId, out, "delivery", ACTOR);
        expect((await order(out)).status).toBe("in_transit");
    });

    it("hands over unworked stops (pairs kept together) and closes the source when only finished work remains", { timeout: 30000 }, async () => {
        const a = await makeDriver();
        const b = await makeDriver();
        const done = await makeOrder({ status: "delivered" });
        const open = await makeOrder();
        const from = await makeRoute(a);
        await addStop(from, done, "delivery", "delivered", { sequence: 1, deliveredAt: new Date() });
        const openPickup = await addStop(from, open, "pickup", "pending", { sequence: 2 });
        await addStop(from, open, "delivery", "in_progress", { sequence: 3 });

        // Only the pickup is selected; its delivery must come along.
        const res = await moveStops({ fromRouteId: from, newRoute: { driverId: b, date: new Date() }, stopIds: [openPickup] }, ACTOR);
        expect(res.moved).toBe(2);
        const moved = await (await db()).select().from(routeOrders).where(eq(routeOrders.routeId, res.toRouteId)).orderBy(routeOrders.sequence);
        expect(moved.map(s => [s.type, s.sequence])).toEqual([["pickup", 1], ["delivery", 2]]);
        expect((await route(res.toRouteId)).driverId).toBe(b);
        expect((await route(from)).status).toBe("completed");

        // A worked stop can't move.
        const [doneStop] = await (await db()).select().from(routeOrders).where(eq(routeOrders.routeId, from));
        await expect(moveStops({ fromRouteId: from, toRouteId: res.toRouteId, stopIds: [doneStop.id] }, ACTOR)).rejects.toThrow();
    });

    it("reassigns only routes nobody has worked", { timeout: 30000 }, async () => {
        const a = await makeDriver();
        const b = await makeDriver();
        const orderId = await makeOrder({ status: "in_transit" });
        const routeId = await makeRoute(a, "in_progress", { startedAt: new Date() });
        const s = await addStop(routeId, orderId, "delivery", "in_progress", { sequence: 1 });

        await reassignRoute(routeId, b, ACTOR);
        expect((await route(routeId))).toMatchObject({ driverId: b, status: "pending", startedAt: null, shiftId: null });

        await (await db()).update(routeOrders).set({ status: "attempted", attemptedAt: new Date() }).where(eq(routeOrders.id, s));
        await expect(reassignRoute(routeId, a, ACTOR)).rejects.toThrow(/Hand over stops/);
    });

    it("refuses to reopen a route whose unfinished leg was re-planned elsewhere", { timeout: 30000 }, async () => {
        const driverId = await makeDriver();
        const orderId = await makeOrder({ status: "delivery_attempted" });
        const oldRoute = await makeRoute(driverId, "completed");
        await addStop(oldRoute, orderId, "delivery", "attempted", { sequence: 1, attemptedAt: new Date() });
        const newRoute = await makeRoute(driverId, "pending");
        await addStop(newRoute, orderId, "delivery", "pending", { sequence: 1 });

        await expect(reopenRoute(oldRoute, ACTOR)).rejects.toThrow(/already planned on another route/);
        await (await db()).delete(routeOrders).where(eq(routeOrders.routeId, newRoute));
        await reopenRoute(oldRoute, ACTOR);
        expect((await route(oldRoute)).status).toBe("in_progress");
    });

    it("corrects a stop marked returned by mistake, and refuses to undo a remitted delivery", { timeout: 30000 }, async () => {
        const d = await db();
        const driverId = await makeDriver();
        const orderId = await makeOrder({ status: "returned", codRequired: 1, codAmount: "90.00", codCurrency: "AED", codPaymentMethod: "cash" });
        await d.insert(codRecords).values({ shipmentId: orderId, codAmount: "90.00", codCurrency: "AED", status: "pending_collection" });
        const routeId = await makeRoute(driverId, "completed");
        const when = new Date();
        const s = await addStop(routeId, orderId, "delivery", "returned", { sequence: 1, attemptedAt: when });
        await d.insert(trackingEvents).values({
            shipmentId: orderId, eventDatetime: when, statusCode: "returned", statusLabel: "Returned", createdBy: "driver",
        });

        const res = await correctStop({ stopId: s, status: "delivered", reason: "Customer confirmed delivery" }, ACTOR);
        expect(res.outcome).toBe("applied");
        expect((await order(orderId)).status).toBe("delivered");
        expect((await stop(s))).toMatchObject({ status: "delivered", collectedAmount: "90.00" });
        const [cod] = await d.select().from(codRecords).where(eq(codRecords.shipmentId, orderId));
        expect(cod.status).toBe("collected");
        const codes = (await d.select().from(trackingEvents).where(eq(trackingEvents.shipmentId, orderId))).map(e => e.statusCode);
        expect(codes).not.toContain("returned");
        expect(codes).toContain("delivered");

        await d.update(codRecords).set({ status: "remitted" }).where(eq(codRecords.id, cod.id));
        await expect(correctStop({ stopId: s, status: "pending", reason: "Wrong package" }, ACTOR)).rejects.toThrow(/remit/i);
        expect((await stop(s)).status).toBe("delivered");
    });

    it("closes fully worked routes at clock-out but leaves ones with open stops", { timeout: 30000 }, async () => {
        const driverId = await makeDriver();
        const o1 = await makeOrder({ status: "delivery_attempted" });
        const o2 = await makeOrder({ status: "out_for_delivery" });
        const settled = await makeRoute(driverId);
        await addStop(settled, o1, "delivery", "attempted", { sequence: 1, attemptedAt: new Date() });
        const open = await makeRoute(driverId);
        await addStop(open, o2, "delivery", "in_progress", { sequence: 1 });

        expect(await closeSettledRoutesForDriver(await db(), driverId)).toBe(1);
        expect((await route(settled)).status).toBe("completed");
        expect((await route(open)).status).toBe("in_progress");
    });
});

describe("cash hand-overs", () => {
    it("records several hand-overs a day and can undo one", { timeout: 30000 }, async () => {
        const d = await db();
        const driverId = await makeDriver();
        const o1 = await makeOrder({ status: "delivered", codRequired: 1, codAmount: "100.00", codCurrency: "AED" });
        const o2 = await makeOrder({ status: "out_for_delivery", codRequired: 1, codAmount: "40.00", codCurrency: "AED" });
        const routeId = await makeRoute(driverId, "in_progress", { startedAt: new Date() });
        await addStop(routeId, o1, "delivery", "delivered", { sequence: 1, collectedAmount: "100.00", deliveredAt: new Date() });
        const s2 = await addStop(routeId, o2, "delivery", "in_progress", { sequence: 2 });

        const first = await markDriverCashRemitted(driverId, undefined, { actor: ACTOR, note: "Midday drop" });
        expect(first).toMatchObject({ routes: 1, amount: 100 });
        expect(await markDriverCashRemitted(driverId, undefined, { actor: ACTOR })).toEqual({ routes: 0, amount: 0 });

        // Later delivery — the old code skipped the route forever after the first hand-over.
        await d.update(routeOrders).set({ status: "delivered", collectedAmount: "40.00", deliveredAt: new Date() }).where(eq(routeOrders.id, s2));
        const recon = (await getDriverCodReconciliation()).drivers.find(r => r.driverId === driverId)!;
        expect(recon.toRemit).toBe(40);
        const second = await markDriverCashRemitted(driverId, undefined, { actor: ACTOR });
        expect(second).toMatchObject({ routes: 1, amount: 40 });
        expect(parseFloat((await route(routeId)).cashRemittedAmount!)).toBe(140);

        await voidCashHandover(second.handoverId!, ACTOR, "Counted twice");
        expect(parseFloat((await route(routeId)).cashRemittedAmount!)).toBe(100);
        await expect(voidCashHandover(second.handoverId!, ACTOR, "again")).rejects.toThrow(/already undone/);
        const afterVoid = (await getDriverCodReconciliation()).drivers.find(r => r.driverId === driverId)!;
        expect(afterVoid.toRemit).toBe(40);
    });
});

describe("dispatch pool", () => {
    it("shows attempts (today vs earlier), priority and pin source", { timeout: 30000 }, async () => {
        const d = await db();
        const retried = await makeOrder({ status: "delivery_attempted", serviceType: "DOM", locationSource: "bot", latitude: "25.1", longitude: "55.2" });
        const bullet = await makeOrder({ status: "in_transit", serviceType: "BULLET" });
        const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
        await d.insert(trackingEvents).values([
            { shipmentId: retried, eventDatetime: yesterday, statusCode: "delivery_attempted", statusLabel: "Delivery Attempted", description: "Reason: Recipient unavailable.", createdBy: "driver" },
            { shipmentId: retried, eventDatetime: new Date(), statusCode: "failed_delivery", statusLabel: "Failed Delivery", description: "Gate closed", createdBy: "driver" },
        ]);

        const pool = await getAvailableOrders();
        const r = pool.find(o => o.id === retried)!;
        expect(r.attempts).toMatchObject({ count: 2, today: true, lastLeg: "delivery", lastReason: "Gate closed" });
        expect(r.priority).toMatchObject({ level: "high", reasons: ["Retry — attempt #3"] });
        expect(r.locationSource).toBe("bot");
        const b = pool.find(o => o.id === bullet)!;
        expect(b.priority.level).toBe("urgent");
        // urgent sorts ahead of high
        expect(pool.findIndex(o => o.id === bullet)).toBeLessThan(pool.findIndex(o => o.id === retried));

        await setOrderPriority(bullet, "normal", ACTOR);
        const after = (await getAvailableOrders()).find(o => o.id === bullet)!;
        expect(after.priority).toMatchObject({ level: "normal", computed: "urgent", overridden: true });
    });
});
