/**
 * End-of-shift reconciliation (/shifts/end), the shift-scoped wallet summary and
 * the dispatch live-location feed (/location → getLiveDriverLocations).
 *
 * The reconciliation figures must come from the server's own routeOrders/orders
 * data for the routes worked under the shift — never from the app — and the
 * clock-out must be safe to replay from the app's offline queue.
 *
 * All fixtures are created and torn down inside each test, against the test
 * database (vitest.setup.ts) — see feedback_always_clear_qa_test_orders.
 */
import { describe, expect, it } from "vitest";
import { getDb } from "./db";
import {
    computeWalletSummary, resolveShiftRouteIds, endShiftWithReconciliation,
    findOrCreateOpenShift, upsertDriverLocation,
} from "./driverApi";
import { getLiveDriverLocations } from "./driverAdmin";
import { drivers, driverRoutes, driverShifts, driverLocations, routeOrders, orders, codRecords } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

const HOUR = 60 * 60 * 1000;
const uniqueSuffix = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
// Timestamp columns are whole seconds in the DB.
const floorSec = (d: Date) => new Date(Math.floor(d.getTime() / 1000) * 1000);

// clientId 28 = dedicated test-fixture client account, same as the other COD tests.
const FIXTURE_CLIENT_ID = 28;

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

interface Fixture {
    db: Db;
    driverId: number;
    openShift: (startTime: Date, clientRef?: string) => Promise<number>;
    makeRoute: (opts: { shiftId: number | null; status?: "pending" | "in_progress" | "completed" }) => Promise<string>;
    makeCodStop: (routeId: string, opts: { codAmount: string; collectedAmount: string | null; status?: "delivered" | "attempted"; method?: "cash" | "card" }) => Promise<void>;
    getShift: (id: number) => Promise<typeof driverShifts.$inferSelect>;
}

async function withFixture<T>(fn: (ctx: Fixture) => Promise<T>): Promise<T> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [driver] = await db.insert(drivers).values({
        username: `__test_recon_${uniqueSuffix()}`,
        passwordHash: "x",
        fullName: "__TEST FIXTURE__ Reconciliation Driver",
    }).$returningId();
    const driverId = driver.id;
    const routeIds: string[] = [];
    const orderIds: number[] = [];

    const ctx: Fixture = {
        db,
        driverId,
        openShift: async (startTime, clientRef) => {
            const [row] = await db.insert(driverShifts).values({ driverId, startTime, clientRef: clientRef ?? null }).$returningId();
            return row.id;
        },
        makeRoute: async ({ shiftId, status }) => {
            const id = `__TEST-RC-${uniqueSuffix()}`;
            await db.insert(driverRoutes).values({ id, driverId, date: new Date(), shiftId, status: status ?? "in_progress" });
            routeIds.push(id);
            return id;
        },
        makeCodStop: async (routeId, opts) => {
            const [order] = await db.insert(orders).values({
                clientId: FIXTURE_CLIENT_ID,
                waybillNumber: `__TEST-RC-${uniqueSuffix()}`,
                shipperName: "Test Shipper",
                shipperAddress: "Test Shipper Address",
                shipperCity: "Dubai",
                shipperCountry: "UAE",
                shipperPhone: "+971500000000",
                customerName: "Test Customer",
                customerPhone: "+971500000001",
                address: "Test Customer Address",
                city: "Dubai",
                destinationCountry: "UAE",
                pieces: 1,
                weight: "1.00",
                serviceType: "DOM",
                codRequired: 1,
                codAmount: opts.codAmount,
                codCurrency: "AED",
            }).$returningId();
            orderIds.push(order.id);
            await db.insert(routeOrders).values({
                routeId,
                orderId: order.id,
                type: "delivery",
                status: opts.status ?? "delivered",
                deliveredAt: new Date(),
                collectedAmount: opts.collectedAmount,
            });
            if (opts.method === "card") {
                // The wallet summary only reads collectedMethod. 'cancelled' keeps this
                // row out of the fixture client's COD totals, which other test files
                // (cod.remittance-automation) diff before/after while running in parallel.
                await db.insert(codRecords).values({
                    shipmentId: order.id,
                    codAmount: opts.codAmount,
                    codCurrency: "AED",
                    collectedMethod: "card",
                    paymentReference: "TEST-REF",
                    status: "cancelled",
                });
            }
        },
        getShift: async (id) => {
            const [row] = await db.select().from(driverShifts).where(eq(driverShifts.id, id)).limit(1);
            return row;
        },
    };

    try {
        return await fn(ctx);
    } finally {
        if (routeIds.length > 0) await db.delete(routeOrders).where(inArray(routeOrders.routeId, routeIds));
        await db.delete(driverRoutes).where(eq(driverRoutes.driverId, driverId));
        if (orderIds.length > 0) {
            await db.delete(codRecords).where(inArray(codRecords.shipmentId, orderIds));
            await db.delete(orders).where(inArray(orders.id, orderIds));
        }
        await db.delete(driverLocations).where(eq(driverLocations.driverId, driverId));
        await db.delete(driverShifts).where(eq(driverShifts.driverId, driverId));
        await db.delete(drivers).where(eq(drivers.id, driverId));
    }
}

describe("Shift-scoped wallet summary", () => {
    it("covers the shift's routes plus unlinked in-progress ones, and nothing from other shifts", async () => {
        await withFixture(async ({ db, driverId, openShift, makeRoute }) => {
            const now = new Date();
            const shiftId = await openShift(new Date(now.getTime() - 4 * HOUR));
            const otherShift = await openShift(new Date(now.getTime() - 30 * HOUR));
            await db.update(driverShifts).set({ endTime: new Date(now.getTime() - 20 * HOUR) }).where(eq(driverShifts.id, otherShift));

            const linked = await makeRoute({ shiftId, status: "completed" });
            const unlinkedLive = await makeRoute({ shiftId: null, status: "in_progress" });
            const otherShiftRoute = await makeRoute({ shiftId: otherShift, status: "completed" });
            const unlinkedDone = await makeRoute({ shiftId: null, status: "completed" });

            const ids = await resolveShiftRouteIds(db, driverId, shiftId);
            expect(ids.sort()).toEqual([linked, unlinkedLive].sort());
            expect(ids).not.toContain(otherShiftRoute);
            expect(ids).not.toContain(unlinkedDone);
        });
    });

    it("splits card out of the cash figures and only counts delivered stops", async () => {
        await withFixture(async ({ db, openShift, makeRoute, makeCodStop }) => {
            const shiftId = await openShift(new Date(Date.now() - 2 * HOUR));
            const routeId = await makeRoute({ shiftId });
            await makeCodStop(routeId, { codAmount: "100.00", collectedAmount: "100.00" });
            await makeCodStop(routeId, { codAmount: "200.00", collectedAmount: "150.00" }); // short 50
            await makeCodStop(routeId, { codAmount: "80.00", collectedAmount: "80.00", method: "card" });
            await makeCodStop(routeId, { codAmount: "500.00", collectedAmount: null, status: "attempted" });

            const summary = await computeWalletSummary(db, [routeId]);
            expect(summary.totalExpected).toBe(300);
            expect(summary.totalCollected).toBe(250);
            expect(summary.discrepancy).toBe(-50);
            expect(summary.cardCollected).toBe(80);
            expect(summary.orders).toHaveLength(4);
        });
    });
});

describe("Clock-out with reconciliation (/shifts/end)", () => {
    it("closes the open shift at the phone's clock-out time and snapshots the server's figures", async () => {
        await withFixture(async ({ db, driverId, openShift, makeRoute, makeCodStop, getShift }) => {
            const now = floorSec(new Date());
            const shiftId = await openShift(new Date(now.getTime() - 8 * HOUR));
            const routeId = await makeRoute({ shiftId, status: "completed" });
            await makeCodStop(routeId, { codAmount: "300.00", collectedAmount: "300.00" });
            await makeCodStop(routeId, { codAmount: "50.00", collectedAmount: "50.00", method: "card" });

            const clockOut = new Date(now.getTime() - 20 * 60 * 1000); // queued offline 20 min ago
            const result = await endShiftWithReconciliation(db, driverId, {
                clientRef: "ref-a", clockOut: clockOut.toISOString(), declaredCash: 300,
            }, now);

            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.reconciliation).toEqual({
                expectedCash: 300, collectedCash: 300, cardCollected: 50,
                declaredCash: 300, cashDiscrepancy: 0, declaredVariance: 0,
            });

            const row = await getShift(shiftId);
            expect(row.endTime?.getTime()).toBe(clockOut.getTime());
            expect(row.reconciledAt).not.toBeNull();
            expect(Number(row.declaredCash)).toBe(300);
            expect(Number(row.cardCollected)).toBe(50);
            expect(row.clientRef).toBe("ref-a");
        });
    });

    it("refuses to close without a note when the cash doesn't match, and leaves the shift open", async () => {
        await withFixture(async ({ db, driverId, openShift, makeRoute, makeCodStop, getShift }) => {
            const now = floorSec(new Date());
            const shiftId = await openShift(new Date(now.getTime() - 3 * HOUR));
            const routeId = await makeRoute({ shiftId });
            await makeCodStop(routeId, { codAmount: "200.00", collectedAmount: "200.00" });

            const refused = await endShiftWithReconciliation(db, driverId, { declaredCash: 180 }, now);
            expect(refused).toMatchObject({ ok: false, status: 400, code: "NOTE_REQUIRED" });
            if (refused.ok) return;
            expect(refused.reconciliation?.declaredVariance).toBe(-20);
            expect((await getShift(shiftId)).endTime).toBeNull();

            const accepted = await endShiftWithReconciliation(db, driverId, { declaredCash: 180, note: "Customer paid 180, short 20" }, now);
            expect(accepted.ok).toBe(true);
            const row = await getShift(shiftId);
            expect(row.endTime).not.toBeNull();
            expect(Number(row.declaredVariance)).toBe(-20);
            expect(row.reconciliationNote).toBe("Customer paid 180, short 20");
        });
    });

    it("also requires a note when the stops themselves recorded less than was due", async () => {
        await withFixture(async ({ db, driverId, openShift, makeRoute, makeCodStop }) => {
            const now = floorSec(new Date());
            const shiftId = await openShift(new Date(now.getTime() - 3 * HOUR));
            const routeId = await makeRoute({ shiftId });
            await makeCodStop(routeId, { codAmount: "200.00", collectedAmount: "150.00" });

            // Declared matches what the stops recorded, but the stops are 50 short of what was due.
            const result = await endShiftWithReconciliation(db, driverId, { declaredCash: 150 }, now);
            expect(result).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });
        });
    });

    it("rejects a negative or non-numeric declared amount", async () => {
        await withFixture(async ({ db, driverId, openShift }) => {
            await openShift(new Date(Date.now() - HOUR));
            expect(await endShiftWithReconciliation(db, driverId, { declaredCash: -5 })).toMatchObject({ ok: false, code: "INVALID_DECLARED_CASH" });
            expect(await endShiftWithReconciliation(db, driverId, { declaredCash: "abc" })).toMatchObject({ ok: false, code: "INVALID_DECLARED_CASH" });
        });
    });

    it("is idempotent for a replayed clock-out and never closes the next shift", async () => {
        await withFixture(async ({ db, driverId, openShift, getShift }) => {
            const now = floorSec(new Date());
            const first = await openShift(new Date(now.getTime() - 6 * HOUR), "ref-replay");
            const input = { clientRef: "ref-replay", clockOut: new Date(now.getTime() - HOUR).toISOString(), declaredCash: 0 };

            const once = await endShiftWithReconciliation(db, driverId, input, now);
            expect(once).toMatchObject({ ok: true, alreadyClosed: false, shiftId: first });
            const closedAt = (await getShift(first)).endTime;

            // The driver starts a new shift before the queued replay arrives.
            const next = await openShift(new Date(now.getTime() - 10 * 60 * 1000), "ref-next");
            const replay = await endShiftWithReconciliation(db, driverId, input, now);
            expect(replay).toMatchObject({ ok: true, alreadyClosed: true, shiftId: first });
            expect((await getShift(first)).endTime?.getTime()).toBe(closedAt?.getTime());
            expect((await getShift(next)).endTime).toBeNull();
        });
    });

    it("attaches a late reconciliation to a shift an admin already closed, without moving its end", async () => {
        await withFixture(async ({ db, driverId, openShift, getShift }) => {
            const now = floorSec(new Date());
            const shiftId = await openShift(new Date(now.getTime() - 9 * HOUR), "ref-admin");
            const adminEnd = new Date(now.getTime() - 2 * HOUR);
            await db.update(driverShifts).set({ endTime: adminEnd }).where(eq(driverShifts.id, shiftId));

            const result = await endShiftWithReconciliation(db, driverId, { clientRef: "ref-admin", declaredCash: 0, clockOut: now.toISOString() }, now);
            expect(result).toMatchObject({ ok: true, alreadyClosed: true });
            const row = await getShift(shiftId);
            expect(row.endTime?.getTime()).toBe(adminEnd.getTime());
            expect(row.reconciledAt).not.toBeNull();
        });
    });

    it("clamps the clock-out between the shift start and now", async () => {
        await withFixture(async ({ db, driverId, openShift, getShift }) => {
            const now = floorSec(new Date());
            const start = new Date(now.getTime() - 2 * HOUR);
            const shiftId = await openShift(start);
            await endShiftWithReconciliation(db, driverId, { clockOut: new Date(now.getTime() + 5 * HOUR).toISOString() }, now);
            expect((await getShift(shiftId)).endTime?.getTime()).toBe(now.getTime());

            const second = await openShift(start);
            await endShiftWithReconciliation(db, driverId, { clockOut: new Date(start.getTime() - HOUR).toISOString() }, now);
            expect((await getShift(second)).endTime?.getTime()).toBe(start.getTime());
        });
    });

    it("keeps the old behaviour for an empty body: closes now, unreconciled", async () => {
        await withFixture(async ({ db, driverId, openShift, getShift }) => {
            const now = floorSec(new Date());
            const shiftId = await openShift(new Date(now.getTime() - HOUR));
            const result = await endShiftWithReconciliation(db, driverId, {}, now);
            expect(result).toMatchObject({ ok: true, reconciliation: null });
            const row = await getShift(shiftId);
            expect(row.endTime?.getTime()).toBe(now.getTime());
            expect(row.reconciledAt).toBeNull();
        });
    });

    it("records a closed shift from the phone's times when the clock-in never reached the server", async () => {
        await withFixture(async ({ db, driverId, getShift }) => {
            const now = floorSec(new Date());
            const clockIn = new Date(now.getTime() - 5 * HOUR);
            const clockOut = new Date(now.getTime() - HOUR);
            const result = await endShiftWithReconciliation(db, driverId, {
                clientRef: "ref-offline", clockIn: clockIn.toISOString(), clockOut: clockOut.toISOString(), declaredCash: 0,
            }, now);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            const row = await getShift(result.shiftId);
            expect(row.startTime.getTime()).toBe(clockIn.getTime());
            expect(row.endTime?.getTime()).toBe(clockOut.getTime());
            expect(row.reconciledAt).not.toBeNull();
        });
    });

    it("404s with no shift and no clock-in to rebuild one from", async () => {
        await withFixture(async ({ db, driverId }) => {
            expect(await endShiftWithReconciliation(db, driverId, { declaredCash: 0 })).toMatchObject({ ok: false, status: 404 });
        });
    });
});

describe("Clock-in clientRef", () => {
    it("attaches the app's ref to a shift a route claim already opened", async () => {
        await withFixture(async ({ driverId, db, openShift, getShift }) => {
            const shiftId = await openShift(new Date(Date.now() - 60 * 1000));
            const shift = await findOrCreateOpenShift(db, driverId, "ref-claim");
            expect(shift.id).toBe(shiftId);
            expect((await getShift(shiftId)).clientRef).toBe("ref-claim");

            // ...and never overwrites a ref that's already there.
            await findOrCreateOpenShift(db, driverId, "ref-other");
            expect((await getShift(shiftId)).clientRef).toBe("ref-claim");
        });
    });
});

describe("Live driver location", () => {
    const point = (lat: number, lng: number, recordedAt: Date) => ({ lat, lng, accuracy: 8, heading: 90, speed: 12, recordedAt: recordedAt.toISOString() });

    it("stores nothing and tells the app to stop while the driver is off duty", async () => {
        await withFixture(async ({ db, driverId }) => {
            const result = await upsertDriverLocation(db, driverId, { points: [point(25.2, 55.27, new Date())] });
            expect(result).toEqual({ tracking: false, accepted: 0 });
            const rows = await db.select().from(driverLocations).where(eq(driverLocations.driverId, driverId));
            expect(rows).toHaveLength(0);
        });
    });

    it("keeps the newest fix of a batch and ignores a later batch of older fixes", async () => {
        await withFixture(async ({ db, driverId, openShift }) => {
            const now = floorSec(new Date());
            await openShift(new Date(now.getTime() - HOUR));

            const result = await upsertDriverLocation(db, driverId, {
                routeId: "R-1",
                points: [
                    point(25.10, 55.10, new Date(now.getTime() - 60_000)),
                    point(25.20, 55.20, now),
                    point(25.15, 55.15, new Date(now.getTime() - 30_000)),
                    { lat: 999, lng: 55, recordedAt: now.toISOString() }, // invalid, dropped
                ],
            }, now);
            expect(result).toEqual({ tracking: true, accepted: 3 });

            const late = await upsertDriverLocation(db, driverId, { points: [point(24.0, 54.0, new Date(now.getTime() - 120_000))] }, now);
            expect(late.accepted).toBe(0);

            const [row] = await db.select().from(driverLocations).where(eq(driverLocations.driverId, driverId));
            expect(row.lat).toBe(25.2);
            expect(row.lng).toBe(55.2);
            expect(row.routeId).toBe("R-1");
            expect(row.recordedAt.getTime()).toBe(now.getTime());
        });
    });

    it("shows on-duty drivers on the dispatch map and drops them once the shift closes", async () => {
        await withFixture(async ({ db, driverId, openShift, makeRoute }) => {
            const now = floorSec(new Date());
            const shiftId = await openShift(new Date(now.getTime() - HOUR));
            const routeId = await makeRoute({ shiftId, status: "in_progress" });
            await upsertDriverLocation(db, driverId, { points: [point(25.2, 55.27, now)] }, now);

            const live = (await getLiveDriverLocations()).find(d => d.driverId === driverId);
            expect(live).toMatchObject({ lat: 25.2, lng: 55.27, routeIds: [routeId] });

            await endShiftWithReconciliation(db, driverId, {}, now);
            expect((await getLiveDriverLocations()).some(d => d.driverId === driverId)).toBe(false);
        });
    });
});
