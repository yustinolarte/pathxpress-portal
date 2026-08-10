/**
 * Regression tests for Part A: driver COD reconciliation must select routes by
 * when they were actually WORKED (driverRoutes.startedAt), not by the planned
 * `date` column — see driverRoutesWorkedOn() in driverAdmin.ts, which mirrors
 * the same fix already applied to getDriverShiftReport().
 *
 * Production drift example that motivated this: DXB-2026-MC7UZD, dated
 * 2026-08-03, was actually started 2026-08-06 (+3 days). A date-only filter
 * puts the route's COD on the wrong day's reconciliation entirely.
 *
 * getDriverCodReconciliation() (what the admin SEES) and
 * markDriverCashRemitted() (what "mark cash received" FREEZES) now share one
 * predicate — these tests also prove they still agree on the same route set
 * and the same amount, which is the whole point of sharing it.
 *
 * All fixtures are created and torn down inside each test, against the real
 * DATABASE_URL (loaded via vitest.setup.ts) — see feedback_always_clear_qa_test_orders.
 */
import { describe, expect, it } from "vitest";
import { getDb } from "./db";
import { getDriverCodReconciliation, markDriverCashRemitted } from "./driverAdmin";
import { drivers, driverRoutes, routeOrders, orders } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

const DAY_MS = 24 * 60 * 60 * 1000;
const uniqueSuffix = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

const isoDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// clientId 28 = dedicated test-fixture client account (companyName starts with
// "__TEST FIXTURE__"), same one server/cod.integration.test.ts attaches to —
// safe to attach throwaway orders to, never a real client's data.
const FIXTURE_CLIENT_ID = 28;

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function withFixture<T>(
    fn: (ctx: {
        db: Db;
        driverId: number;
        makeRoute: (opts: { date: Date; startedAt: Date | null; status?: "pending" | "in_progress" | "completed" }) => Promise<string>;
        makeCodStop: (routeId: string, opts: { codAmount: string; collectedAmount: string }) => Promise<void>;
    }) => Promise<T>
): Promise<T> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const username = `__test_codrecon_${uniqueSuffix()}`;
    const [driver] = await db.insert(drivers).values({
        username,
        passwordHash: "x",
        fullName: "__TEST FIXTURE__ COD Recon Driver",
    }).$returningId();
    const driverId = driver.id;

    const routeIds: string[] = [];
    const orderIds: number[] = [];

    const makeRoute: Parameters<typeof fn>[0]["makeRoute"] = async (opts) => {
        const routeId = `__TEST-CR-${uniqueSuffix()}`;
        await db.insert(driverRoutes).values({
            id: routeId,
            driverId,
            date: opts.date,
            startedAt: opts.startedAt,
            status: opts.status ?? "completed",
        });
        routeIds.push(routeId);
        return routeId;
    };

    const makeCodStop: Parameters<typeof fn>[0]["makeCodStop"] = async (routeId, opts) => {
        const waybillNumber = `__TEST-CR-${uniqueSuffix()}`;
        const [order] = await db.insert(orders).values({
            clientId: FIXTURE_CLIENT_ID,
            waybillNumber,
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
            status: "delivered",
            deliveredAt: new Date(),
            collectedAmount: opts.collectedAmount,
        });
    };

    try {
        return await fn({ db, driverId, makeRoute, makeCodStop });
    } finally {
        // routeOrders aren't linked to driverId directly, so sweep them up
        // before their parent routes or they'd be orphaned in the real DB.
        if (routeIds.length > 0) {
            await db.delete(routeOrders).where(inArray(routeOrders.routeId, routeIds));
        }
        await db.delete(driverRoutes).where(eq(driverRoutes.driverId, driverId));
        if (orderIds.length > 0) {
            await db.delete(orders).where(inArray(orders.id, orderIds));
        }
        await db.delete(drivers).where(eq(drivers.id, driverId));
    }
}

describe("Driver COD reconciliation — routes selected by when they were worked", () => {
    it("a route dated outside the requested day, but started inside it, is selected for the day it was worked (not its stale planned date)", async () => {
        await withFixture(async ({ driverId, makeRoute, makeCodStop }) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const workedDay = isoDay(today);
            const plannedDate = new Date(today.getTime() - 3 * DAY_MS); // dispatch planned it 3 days earlier
            const startedAt = new Date(today.getTime() + 10 * 60 * 60 * 1000); // the real clock-in, today at 10:00

            const routeId = await makeRoute({ date: plannedDate, startedAt, status: "completed" });
            await makeCodStop(routeId, { codAmount: "250.00", collectedAmount: "250.00" });

            const worked = await getDriverCodReconciliation(workedDay);
            const workedRow = worked.drivers.find(d => d.driverId === driverId);
            expect(workedRow, "route must appear on the day it was actually worked").toBeDefined();
            expect(workedRow!.routeIds).toContain(routeId);
            expect(workedRow!.cash).toBe(250);
            expect(workedRow!.expected).toBe(250);

            const planned = await getDriverCodReconciliation(isoDay(plannedDate));
            const plannedRow = planned.drivers.find(d => d.driverId === driverId);
            expect(plannedRow, "route must NOT appear on its stale planned day once it has a real startedAt").toBeUndefined();
        });
    }, 20000);

    it("a route that never started is still selected by its planned date", async () => {
        await withFixture(async ({ driverId, makeRoute }) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const routeId = await makeRoute({ date: today, startedAt: null, status: "pending" });

            const recon = await getDriverCodReconciliation(isoDay(today));
            const row = recon.drivers.find(d => d.driverId === driverId);
            expect(row, "an unstarted route must fall back to its planned date").toBeDefined();
            expect(row!.routeIds).toContain(routeId);
        });
    }, 20000);

    it("markDriverCashRemitted freezes exactly the amount getDriverCodReconciliation displayed for the same day", async () => {
        await withFixture(async ({ db, driverId, makeRoute, makeCodStop }) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const workedDay = isoDay(today);
            const plannedDate = new Date(today.getTime() - 2 * DAY_MS);
            const startedAt = new Date(today.getTime() + 9 * 60 * 60 * 1000);

            const routeId = await makeRoute({ date: plannedDate, startedAt, status: "completed" });
            await makeCodStop(routeId, { codAmount: "180.00", collectedAmount: "180.00" });

            const shown = await getDriverCodReconciliation(workedDay);
            const shownRow = shown.drivers.find(d => d.driverId === driverId);
            expect(shownRow, "fixture route must show up on the worked day").toBeDefined();
            expect(shownRow!.cash).toBe(180);
            expect(shownRow!.toRemit).toBe(180);

            // The stale planned day must freeze nothing. Before the shared predicate,
            // this call filtered on `date` alone and WOULD have matched the route here
            // — a different amount than the screen (queried for workedDay) showed.
            const staleResult = await markDriverCashRemitted(driverId, isoDay(plannedDate));
            expect(staleResult).toEqual({ routes: 0, amount: 0 });

            const result = await markDriverCashRemitted(driverId, workedDay);
            expect(result.routes).toBe(1);
            expect(result.amount).toBe(shownRow!.cash);

            const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
            expect(route.cashRemittedAt).not.toBeNull();
            expect(parseFloat(route.cashRemittedAmount || "0")).toBe(180);

            const after = await getDriverCodReconciliation(workedDay);
            const afterRow = after.drivers.find(d => d.driverId === driverId);
            expect(afterRow!.remitted).toBe(180);
            expect(afterRow!.toRemit).toBe(0);
            expect(afterRow!.fullyRemitted).toBe(true);
        });
    }, 20000);
});
