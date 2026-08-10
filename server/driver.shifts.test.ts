/**
 * Regression tests for the driver shift <-> route linkage.
 *
 * These exist because the original code matched an open shift with
 * `eq(driverShifts.endTime, null)`, which compiles to `endTime = NULL` and is
 * never true in SQL. Every shift endpoint silently did the wrong thing:
 * /shifts/start opened a duplicate shift on every call, /shifts/end always 404'd
 * so no shift ever closed, /shifts/status always said off-duty, and route-report
 * never linked driverRoutes.shiftId. Nothing failed loudly — the data just
 * quietly drifted (79 open shifts, 0 closed, 0 routes with a shiftId).
 *
 * All fixtures are created and torn down inside each test.
 */
import { describe, expect, it } from "vitest";
import { getDb } from "./db";
import { findOpenShift, findOrCreateOpenShift, markRouteStarted, routeClaimPatch, buildRouteReportPatch } from "./driverApi";
import {
    getDriverShiftReport, updateDriverShift, closeDriverShift, deleteDriverShift,
    getDispatchOverview,
} from "./driverAdmin";
import { MAX_SHIFT_HOURS } from "./driverShiftRules";
import { drivers, driverShifts, driverRoutes, routeOrders } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

const HOUR = 60 * 60 * 1000;
const isoDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// driverShifts/driverRoutes/routeOrders timestamp columns are DATETIME_PRECISION 0
// (whole seconds) in the real DB, so a Date.now()-derived fixture timestamp with a
// nonzero millisecond component silently loses it on write. Tests that assert exact
// getTime() equality after a round trip must floor to the second first.
const floorSec = (d: Date) => new Date(Math.floor(d.getTime() / 1000) * 1000);

const uniqueSuffix = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function withFixtureDriver<T>(fn: (db: NonNullable<Awaited<ReturnType<typeof getDb>>>, driverId: number) => Promise<T>): Promise<T> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const username = `__test_shift_${uniqueSuffix()}`;
    const [inserted] = await db.insert(drivers).values({
        username,
        passwordHash: "x",
        fullName: "__TEST FIXTURE__ Shift Driver",
    }).$returningId();

    try {
        return await fn(db, inserted.id);
    } finally {
        // routeOrders rows aren't linked to driverId directly (only via routeId), so
        // they have to be swept up before their parent routes or they'd be orphaned
        // in the real DB forever — see feedback_always_clear_qa_test_orders.
        const fixtureRoutes = await db.select({ id: driverRoutes.id })
            .from(driverRoutes).where(eq(driverRoutes.driverId, inserted.id));
        if (fixtureRoutes.length > 0) {
            await db.delete(routeOrders).where(inArray(routeOrders.routeId, fixtureRoutes.map(r => r.id)));
        }
        await db.delete(driverRoutes).where(eq(driverRoutes.driverId, inserted.id));
        await db.delete(driverShifts).where(eq(driverShifts.driverId, inserted.id));
        await db.delete(drivers).where(eq(drivers.id, inserted.id));
    }
}

describe("Driver shifts", () => {
    it("finds a shift whose endTime is NULL, and stops finding it once closed", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const [shift] = await db.insert(driverShifts)
                .values({ driverId, startTime: new Date() })
                .$returningId();

            const open = await findOpenShift(db, driverId);
            expect(open?.id).toBe(shift.id);

            await db.update(driverShifts).set({ endTime: new Date() }).where(eq(driverShifts.id, shift.id));

            expect(await findOpenShift(db, driverId)).toBeUndefined();
        });
    }, 20000);

    it("resolves to the most recent shift when several are left open", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const older = new Date(Date.now() - 3 * 60 * 60 * 1000);
            const newer = new Date(Date.now() - 30 * 60 * 1000);
            await db.insert(driverShifts).values({ driverId, startTime: older });
            const [latest] = await db.insert(driverShifts)
                .values({ driverId, startTime: newer })
                .$returningId();

            const open = await findOpenShift(db, driverId);
            expect(open?.id).toBe(latest.id);
        });
    }, 20000);

    it("stamps startedAt and links the open shift when a route starts", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const [shift] = await db.insert(driverShifts)
                .values({ driverId, startTime: new Date() })
                .$returningId();

            const routeId = `__TEST-${uniqueSuffix()}`;
            await db.insert(driverRoutes).values({ id: routeId, driverId, date: new Date(), status: "in_progress" });

            await markRouteStarted(db, routeId, driverId, { startedAt: null, shiftId: null });

            const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
            expect(route.shiftId).toBe(shift.id);
            expect(route.startedAt).toBeInstanceOf(Date);

            // A re-scan of the same route must not restart the clock.
            const firstStart = route.startedAt!.getTime();
            await markRouteStarted(db, routeId, driverId, { startedAt: route.startedAt, shiftId: route.shiftId });
            const [again] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
            expect(again.startedAt!.getTime()).toBe(firstStart);
        });
    }, 20000);

    // Production had 116/116 routes with shiftId NULL because markRouteStarted
    // only ever linked an *already-open* shift — a driver who started a route
    // without having called /shifts/start first (or whose call was lost) left
    // the route unattributed forever. Starting a route is itself proof of
    // being on duty, so the server now opens the shift instead of skipping it.
    it("opens a shift and links the route when the driver has no open shift", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const routeId = `__TEST-${uniqueSuffix()}`;
            await db.insert(driverRoutes).values({ id: routeId, driverId, date: new Date(), status: "in_progress" });

            await markRouteStarted(db, routeId, driverId, { startedAt: null, shiftId: null });

            const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
            expect(route.startedAt).toBeInstanceOf(Date);
            expect(route.shiftId).not.toBeNull();

            const shifts = await db.select().from(driverShifts).where(eq(driverShifts.driverId, driverId));
            expect(shifts.length).toBe(1);
            expect(shifts[0].id).toBe(route.shiftId);
            expect(shifts[0].endTime).toBeNull();
        });
    }, 20000);

    it("links to the existing open shift instead of opening a second one", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const [shift] = await db.insert(driverShifts)
                .values({ driverId, startTime: new Date() })
                .$returningId();

            const routeId = `__TEST-${uniqueSuffix()}`;
            await db.insert(driverRoutes).values({ id: routeId, driverId, date: new Date(), status: "in_progress" });

            await markRouteStarted(db, routeId, driverId, { startedAt: null, shiftId: null });

            const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
            expect(route.shiftId).toBe(shift.id);

            const shifts = await db.select().from(driverShifts).where(eq(driverShifts.driverId, driverId));
            expect(shifts.length).toBe(1);
        });
    }, 20000);

    // Mirrors "Clock-in concurrency" below: the app can fire duplicate route-start
    // requests (double tap, retry, offline-queue replay) for a driver with no open
    // shift. A plain check-then-insert inside markRouteStarted would lose that race
    // the same way the original /shifts/start bug did, just reached from a
    // different endpoint — both must go through the same locked helper.
    it("creates exactly one shift when routes start concurrently for a driver with no open shift", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const routeIds = [0, 1, 2].map(() => `__TEST-${uniqueSuffix()}`);
            await Promise.all(routeIds.map(id =>
                db.insert(driverRoutes).values({ id, driverId, date: new Date(), status: "in_progress" })
            ));

            await Promise.all(routeIds.map(id =>
                markRouteStarted(db, id, driverId, { startedAt: null, shiftId: null })
            ));

            const shifts = await db.select().from(driverShifts).where(eq(driverShifts.driverId, driverId));
            expect(shifts.length).toBe(1);

            const routes = await db.select().from(driverRoutes).where(eq(driverRoutes.driverId, driverId));
            expect(routes.every(r => r.shiftId === shifts[0].id)).toBe(true);
        });
    }, 30000);
});

describe("findOrCreateOpenShift", () => {
    it("returns the existing open shift instead of creating a new one", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const [shift] = await db.insert(driverShifts)
                .values({ driverId, startTime: new Date() })
                .$returningId();

            const found = await findOrCreateOpenShift(db, driverId);
            expect(found.id).toBe(shift.id);

            const shifts = await db.select().from(driverShifts).where(eq(driverShifts.driverId, driverId));
            expect(shifts.length).toBe(1);
        });
    }, 20000);

    it("creates a shift when the driver has none open", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const created = await findOrCreateOpenShift(db, driverId);
            expect(created.id).toBeDefined();

            const [row] = await db.select().from(driverShifts).where(eq(driverShifts.id, created.id)).limit(1);
            expect(row.endTime).toBeNull();
        });
    }, 20000);
});

describe("Route report clockIn does not overwrite startedAt", () => {
    // clockIn is sent from handleFinishRoute, well after markRouteStarted already
    // stamped the real moment the route went on the road at claim/start time.
    // Applying it unconditionally overwrote the true startedAt with that stale
    // finish-time value on every single report.
    it("keeps the existing startedAt when the route already has one", () => {
        const startedAt = new Date("2026-08-05T04:03:59Z");
        const patch = buildRouteReportPatch(
            { shiftId: 9, startedAt },
            undefined,
            { clockIn: "2026-08-05T09:15:00Z" },
        );
        expect(patch.startedAt).toBeUndefined();
    });

    it("fills startedAt from clockIn when the route has none yet", () => {
        const patch = buildRouteReportPatch(
            { shiftId: 9, startedAt: null },
            undefined,
            { clockIn: "2026-08-05T09:15:00Z" },
        );
        expect(patch.startedAt).toEqual(new Date("2026-08-05T09:15:00Z"));
    });

    it("still fills a missing shiftId even when startedAt is left alone", () => {
        const patch = buildRouteReportPatch(
            { shiftId: null, startedAt: new Date("2026-08-05T04:03:59Z") },
            { id: 42 },
            { clockIn: "2026-08-05T09:15:00Z" },
        );
        expect(patch.startedAt).toBeUndefined();
        expect(patch.shiftId).toBe(42);
    });
});

describe("Scanning a route QR (claim)", () => {
    // The bug this pins: the status update was skipped whenever the route was
    // already assigned to the scanning driver — which is the normal flow, since the
    // admin picks a driver when creating the route. Those routes stayed 'pending'
    // while their stops flipped to in_progress, so dispatch never saw them start.
    it("starts a route that was already assigned to the scanning driver", () => {
        expect(routeClaimPatch({ driverId: 7, status: "pending" }, 7))
            .toEqual({ status: "in_progress" });
    });

    it("claims and starts an unassigned route", () => {
        expect(routeClaimPatch({ driverId: null, status: "pending" }, 7))
            .toEqual({ driverId: 7, status: "in_progress" });
    });

    it("is a no-op when the route is already running under this driver", () => {
        expect(routeClaimPatch({ driverId: 7, status: "in_progress" }, 7)).toEqual({});
    });

    it("re-starts a route that had been pushed back to pending", () => {
        expect(routeClaimPatch({ driverId: null, status: "in_progress" }, 7))
            .toEqual({ driverId: 7 });
    });

    // End to end over the real tables: the exact production shape (route created by
    // the admin WITH a driver already on it) must come out running, timed and linked.
    it("leaves a pre-assigned route running, timed and linked to the shift", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const [shift] = await db.insert(driverShifts)
                .values({ driverId, startTime: new Date() })
                .$returningId();

            const routeId = `__TEST-${uniqueSuffix()}`;
            await db.insert(driverRoutes)
                .values({ id: routeId, driverId, date: new Date(), status: "pending" });

            const [before] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
            const patch = routeClaimPatch(before, driverId);
            if (Object.keys(patch).length > 0) {
                await db.update(driverRoutes).set(patch).where(eq(driverRoutes.id, routeId));
            }
            await markRouteStarted(db, routeId, driverId, before);

            const [after] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
            expect(after.status).toBe("in_progress");
            expect(after.startedAt).toBeInstanceOf(Date);
            expect(after.shiftId).toBe(shift.id);
        });
    }, 30000);
});

describe("Clock-in concurrency", () => {
    // The driver app can fire /shifts/start more than once (double tap, retry,
    // offline-queue replay). A plain check-then-insert loses that race and leaves
    // the driver with two open shifts that can never be cleanly clocked out —
    // exactly what happened in production on 2026-08-04.
    it("creates a single shift when clock-in is called concurrently", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const clockIn = () => db.transaction(async (tx) => {
                await tx.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, driverId)).for("update");
                const existing = await findOpenShift(tx as never, driverId);
                if (existing) return existing.id;
                const [row] = await tx.insert(driverShifts)
                    .values({ driverId, startTime: new Date() })
                    .$returningId();
                return row.id;
            });

            const ids = await Promise.all([clockIn(), clockIn(), clockIn(), clockIn(), clockIn()]);
            const rows = await db.select().from(driverShifts).where(eq(driverShifts.driverId, driverId));

            expect(rows.length).toBe(1);
            expect(new Set(ids).size).toBe(1);
        });
    }, 30000);
});

describe("Shift payroll report", () => {
    it("clips on-duty time to the requested range instead of counting the whole shift", async () => {
        await withFixtureDriver(async (db, driverId) => {
            // Yesterday 22:00 -> today 02:00. Only the 2h after midnight belong to today.
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const start = new Date(today.getTime() - 2 * HOUR);
            const end = new Date(today.getTime() + 2 * HOUR);
            await db.insert(driverShifts).values({ driverId, startTime: start, endTime: end });

            const report = await getDriverShiftReport({ from: isoDay(today), to: isoDay(today), driverId });
            const row = report.payroll.find(r => r.driverId === driverId);
            expect(row?.onDutySeconds).toBe(2 * 3600);

            // Widening the range to include yesterday picks up the whole 4 hours.
            const yesterday = new Date(today.getTime() - 24 * HOUR);
            const wider = await getDriverShiftReport({ from: isoDay(yesterday), to: isoDay(today), driverId });
            expect(wider.payroll.find(r => r.driverId === driverId)?.onDutySeconds).toBe(4 * 3600);
        });
    }, 20000);

    it("counts an open shift up to now, never into the future", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const start = new Date(Date.now() - 3 * HOUR);
            await db.insert(driverShifts).values({ driverId, startTime: start });

            // The range spans yesterday too, so the whole 3h is inside it whatever
            // time of day the suite happens to run at.
            const yesterday = new Date(Date.now() - 24 * HOUR);
            const report = await getDriverShiftReport({
                from: isoDay(yesterday), to: isoDay(new Date()), driverId,
            });
            const row = report.payroll.find(r => r.driverId === driverId);

            expect(row?.openShiftCount).toBe(1);
            // ~3h, allowing a little slack for test execution time. Crucially it is
            // not more: an open shift must never be counted past the current moment.
            expect(row!.onDutySeconds).toBeGreaterThan(3 * 3600 - 120);
            expect(row!.onDutySeconds).toBeLessThan(3 * 3600 + 120);
        });
    }, 20000);

    it("filters to a single driver", async () => {
        await withFixtureDriver(async (db, driverId) => {
            await db.insert(driverShifts).values({ driverId, startTime: new Date(Date.now() - HOUR) });
            const day = isoDay(new Date());

            const scoped = await getDriverShiftReport({ from: day, to: day, driverId });
            expect(scoped.payroll.every(r => r.driverId === driverId)).toBe(true);
            expect(scoped.payroll.length).toBe(1);
        });
    }, 20000);

    it("rejects a range that ends before it starts", async () => {
        await expect(getDriverShiftReport({ from: "2026-08-10", to: "2026-08-01" }))
            .rejects.toThrow(/end date cannot be before/i);
    }, 20000);

    // Production had driverRoutes.date (the day dispatch PLANNED the route) drift
    // days away from driverRoutes.startedAt (the day it was actually driven), while
    // shifts are selected by their real clock-in. Filtering routes on `date` alone
    // put a route and the shift it was worked under in different day buckets even
    // when their timestamps matched to the second (shift 219 / route AHSYGY).
    it("includes a route by when it was actually worked (startedAt), even when its nominal date falls outside the range", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const nominalDate = new Date(today.getTime() - 3 * 24 * HOUR); // planned 3 days before the range
            const workedAt = new Date(today.getTime() + 5 * HOUR); // actually driven inside the range

            const routeId = `__TEST-${uniqueSuffix()}`;
            await db.insert(driverRoutes).values({
                id: routeId, driverId, date: nominalDate, startedAt: workedAt, status: "completed",
            });

            const day = isoDay(today);
            const report = await getDriverShiftReport({ from: day, to: day, driverId });

            const found = report.groups.flatMap(g => g.routes).find(r => r.routeId === routeId);
            expect(found).toBeDefined();
        });
    }, 20000);

    it("still selects a route that never started (no startedAt) by its nominal date", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const routeId = `__TEST-${uniqueSuffix()}`;
            await db.insert(driverRoutes).values({
                id: routeId, driverId, date: today, startedAt: null, status: "pending",
            });

            const day = isoDay(today);
            const report = await getDriverShiftReport({ from: day, to: day, driverId });

            const found = report.groups.flatMap(g => g.routes).find(r => r.routeId === routeId);
            expect(found).toBeDefined();
        });
    }, 20000);

    // dayShifts only holds shifts overlapping the requested range. A route's
    // shiftId can point outside it (range narrower than the shift, or a shift
    // correction moved its startTime) — `.find` on dayShifts alone used to return
    // undefined there and the group rendered with a null shiftStartTime/
    // onDutySeconds instead of the route's real shift.
    it("resolves a route's shift even when that shift falls entirely outside the requested range", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Closed the day before the range — excluded from this range's own
            // shift query.
            const shiftStart = new Date(today.getTime() - 20 * HOUR);
            const shiftEnd = new Date(today.getTime() - 18 * HOUR);
            const [shift] = await db.insert(driverShifts)
                .values({ driverId, startTime: shiftStart, endTime: shiftEnd })
                .$returningId();

            // Route worked inside the range, still pointing at that shift.
            const workedAt = new Date(today.getTime() + 2 * HOUR);
            const routeId = `__TEST-${uniqueSuffix()}`;
            await db.insert(driverRoutes).values({
                id: routeId, driverId, date: today, startedAt: workedAt, status: "completed", shiftId: shift.id,
            });

            const day = isoDay(today);
            const report = await getDriverShiftReport({ from: day, to: day, driverId });

            const group = report.groups.find(g => g.driverId === driverId && g.shiftId === shift.id);
            expect(group).toBeDefined();
            expect(group!.shiftStartTime?.getTime()).toBe(shiftStart.getTime());
            expect(group!.onDutySeconds).not.toBeNull();
            expect(group!.routes.some(r => r.routeId === routeId)).toBe(true);

            // Must not also land in the shiftId: null unlinked bucket.
            const unlinked = report.groups.find(g => g.driverId === driverId && g.shiftId === null);
            expect(unlinked).toBeUndefined();
        });
    }, 20000);

    it("puts a shift and its route in the same group when their timestamps match (shift 219 / AHSYGY scenario)", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const clockIn = new Date(today.getTime() + 4 * HOUR + 3 * 60_000 + 59_000);

            const [shift] = await db.insert(driverShifts)
                .values({ driverId, startTime: clockIn })
                .$returningId();

            // Nominal date is 2 days earlier than when the route was actually run —
            // the exact drift that used to split the shift and its route into two
            // different groups even though they share the same startedAt.
            const nominalDate = new Date(today.getTime() - 2 * 24 * HOUR);
            const routeId = `__TEST-${uniqueSuffix()}`;
            await db.insert(driverRoutes).values({
                id: routeId, driverId, date: nominalDate, startedAt: clockIn, status: "in_progress", shiftId: shift.id,
            });

            const day = isoDay(today);
            const report = await getDriverShiftReport({ from: day, to: day, driverId });

            const driverGroups = report.groups.filter(g => g.driverId === driverId);
            expect(driverGroups.length).toBe(1);
            expect(driverGroups[0].shiftId).toBe(shift.id);
            expect(driverGroups[0].routes.map(r => r.routeId)).toContain(routeId);
        });
    }, 20000);
});

describe("Dispatch on-duty accuracy", () => {
    // A shift nobody closed kept reporting its driver as working. Production had
    // steven showing as an active driver 46 hours after he went home, with zero
    // routes and zero stops — the "drivers that aren't even on a route" symptom.
    it("does not count a never-closed shift as on duty, and reports it instead", async () => {
        await withFixtureDriver(async (db, driverId) => {
            await db.insert(driverShifts)
                .values({ driverId, startTime: new Date(Date.now() - 46 * HOUR) })
                .$returningId();

            const overview = await getDispatchOverview();

            expect(overview.roster.some(r => r.driverId === driverId)).toBe(false);
            const stale = overview.staleShifts.find(s => s.driverId === driverId);
            expect(stale).toBeDefined();
            expect(stale!.hoursOpen).toBeGreaterThan(40);
        });
    }, 30000);

    it("counts a shift opened a moment ago as on duty", async () => {
        await withFixtureDriver(async (db, driverId) => {
            await db.insert(driverShifts).values({ driverId, startTime: new Date(Date.now() - HOUR) });

            const overview = await getDispatchOverview();

            expect(overview.roster.some(r => r.driverId === driverId && r.dutyState === "active")).toBe(true);
            expect(overview.staleShifts.some(s => s.driverId === driverId)).toBe(false);
        });
    }, 30000);
});

describe("Shift corrections", () => {
    it("closes an open shift and refuses an impossible correction", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const start = new Date(Date.now() - 2 * HOUR);
            const [shift] = await db.insert(driverShifts).values({ driverId, startTime: start }).$returningId();

            await closeDriverShift({ id: shift.id });
            const [closed] = await db.select().from(driverShifts).where(eq(driverShifts.id, shift.id)).limit(1);
            expect(closed.endTime).toBeInstanceOf(Date);

            // Clock-out before clock-in.
            await expect(updateDriverShift({ id: shift.id, endTime: new Date(start.getTime() - HOUR) }))
                .rejects.toThrow(/after the clock-in/i);

            // Beyond the plausible-shift guard. Both bounds are in the past so the
            // future check can't fire first and mask the duration check.
            const longAgo = new Date(Date.now() - 40 * HOUR);
            await expect(updateDriverShift({
                id: shift.id,
                startTime: longAgo,
                endTime: new Date(longAgo.getTime() + 30 * HOUR),
            })).rejects.toThrow(/limit/i);

            // A clock-out in the future is rejected on its own.
            await expect(updateDriverShift({ id: shift.id, endTime: new Date(Date.now() + 2 * HOUR) }))
                .rejects.toThrow(/future/i);

            // Explicit null re-opens it.
            await updateDriverShift({ id: shift.id, endTime: null });
            expect(await findOpenShift(db, driverId)).toBeTruthy();
        });
    }, 20000);

    it("refuses to delete a shift a route still points at", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const [shift] = await db.insert(driverShifts)
                .values({ driverId, startTime: new Date(Date.now() - HOUR) })
                .$returningId();
            const routeId = `__TEST-${uniqueSuffix()}`;
            await db.insert(driverRoutes)
                .values({ id: routeId, driverId, date: new Date(), status: "completed", shiftId: shift.id });

            await expect(deleteDriverShift(shift.id)).rejects.toThrow(/linked to this shift/i);

            // Once nothing references it, the record can go.
            await db.delete(driverRoutes).where(eq(driverRoutes.id, routeId));
            await deleteDriverShift(shift.id);
            const rows = await db.select().from(driverShifts).where(eq(driverShifts.id, shift.id));
            expect(rows.length).toBe(0);
        });
    }, 20000);
});

// One shared rule (isStaleOpenShift / MAX_SHIFT_HOURS, driverShiftRules.ts) now
// governs three places that used to disagree: getDispatchOverview() (on-duty
// roster), getDriverShiftReport() (payroll), and findOrCreateOpenShift() /
// markRouteStarted() (what a new clock-in or route-start attaches to). Production
// shift #265 (driver 4, open 31.6h) is the motivating case: dispatch already
// excluded it from "on duty" while payroll billed the full 31.6h against it.
describe("Payroll caps a stale open shift instead of billing it to now", () => {
    it("caps on-duty time at MAX_SHIFT_HOURS for an open shift older than that, instead of counting to now", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const start = new Date(Date.now() - (MAX_SHIFT_HOURS + 10) * HOUR);
            await db.insert(driverShifts).values({ driverId, startTime: start });

            // Wide enough that the shift's full (would-be) span never gets clipped
            // by the requested range itself — only the MAX_SHIFT_HOURS cap should bite.
            const twoDaysAgo = new Date(Date.now() - 2 * 24 * HOUR);
            const report = await getDriverShiftReport({ from: isoDay(twoDaysAgo), to: isoDay(new Date()), driverId });
            const row = report.payroll.find(r => r.driverId === driverId);

            expect(row?.openShiftCount).toBe(1);
            expect(row?.staleShiftCount).toBe(1);
            expect(row?.onDutySeconds).toBe(MAX_SHIFT_HOURS * 3600);
        });
    }, 20000);

    it("does NOT cap a CLOSED shift longer than MAX_SHIFT_HOURS — an admin's endTime is authoritative", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const start = floorSec(new Date(Date.now() - (MAX_SHIFT_HOURS + 6) * HOUR));
            const end = floorSec(new Date(Date.now() - 2 * HOUR));
            expect((end.getTime() - start.getTime()) / HOUR).toBeGreaterThan(MAX_SHIFT_HOURS);
            // Inserted directly (bypassing updateDriverShift's write-time guard) because
            // production can already hold long closed shifts recorded before that guard
            // existed — the report must still trust them as-is, not silently reshape them.
            await db.insert(driverShifts).values({ driverId, startTime: start, endTime: end });

            const twoDaysAgo = new Date(Date.now() - 2 * 24 * HOUR);
            const report = await getDriverShiftReport({ from: isoDay(twoDaysAgo), to: isoDay(new Date()), driverId });
            const row = report.payroll.find(r => r.driverId === driverId);

            expect(row?.onDutySeconds).toBe(Math.round((end.getTime() - start.getTime()) / 1000));
            expect(row?.staleShiftCount ?? 0).toBe(0);
        });
    }, 20000);

    it("dispatch and payroll agree about the same stale shift", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const start = new Date(Date.now() - (MAX_SHIFT_HOURS + 15.6) * HOUR); // mirrors production shift #265
            const [shift] = await db.insert(driverShifts).values({ driverId, startTime: start }).$returningId();

            const overview = await getDispatchOverview();
            expect(overview.roster.some(r => r.driverId === driverId)).toBe(false);
            expect(overview.staleShifts.some(s => s.shiftId === shift.id)).toBe(true);

            const twoDaysAgo = new Date(Date.now() - 2 * 24 * HOUR);
            const report = await getDriverShiftReport({ from: isoDay(twoDaysAgo), to: isoDay(new Date()), driverId });
            const row = report.payroll.find(r => r.driverId === driverId);

            expect(row?.staleShiftCount).toBe(1);
            expect(row?.onDutySeconds).toBe(MAX_SHIFT_HOURS * 3600);
        });
    }, 30000);
});

describe("findOrCreateOpenShift refuses to hand back a stale shift", () => {
    it("closes a stale shift at its own startTime when it has no linked activity, and opens a fresh one", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const staleStart = floorSec(new Date(Date.now() - (MAX_SHIFT_HOURS + 4) * HOUR));
            const [stale] = await db.insert(driverShifts).values({ driverId, startTime: staleStart }).$returningId();

            const fresh = await findOrCreateOpenShift(db, driverId);
            expect(fresh.id).not.toBe(stale.id);
            expect(fresh.endTime).toBeNull();

            const [closed] = await db.select().from(driverShifts).where(eq(driverShifts.id, stale.id)).limit(1);
            // Closed at its own startTime (no activity to go on) — never at `now`
            // and never at the MAX_SHIFT_HOURS cap, both of which would invent hours.
            expect(closed.endTime?.getTime()).toBe(staleStart.getTime());

            const stillOpen = (await db.select().from(driverShifts).where(eq(driverShifts.driverId, driverId)))
                .filter(s => s.endTime === null);
            expect(stillOpen.length).toBe(1);
            expect(stillOpen[0].id).toBe(fresh.id);
        });
    }, 20000);

    it("closes a stale shift at its last attributable stop activity when its linked routes have one", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const staleStart = floorSec(new Date(Date.now() - (MAX_SHIFT_HOURS + 8) * HOUR));
            const [stale] = await db.insert(driverShifts).values({ driverId, startTime: staleStart }).$returningId();

            const routeId = `__TEST-${uniqueSuffix()}`;
            await db.insert(driverRoutes).values({
                id: routeId, driverId, date: staleStart, status: "completed", shiftId: stale.id,
            });
            const lastActivity = floorSec(new Date(staleStart.getTime() + 3 * HOUR));
            // No FK on routeOrders.orderId — a fixture-only synthetic id is fine here,
            // only the timestamp columns matter for this test.
            await db.insert(routeOrders).values({
                routeId, orderId: 900_000_000 + Math.floor(Math.random() * 1_000_000),
                type: "delivery", status: "delivered", deliveredAt: lastActivity,
            });

            await findOrCreateOpenShift(db, driverId);

            const [closed] = await db.select().from(driverShifts).where(eq(driverShifts.id, stale.id)).limit(1);
            expect(closed.endTime?.getTime()).toBe(lastActivity.getTime());
        });
    }, 20000);

    it("leaves a recent open shift alone — no close, no new shift", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const [shift] = await db.insert(driverShifts)
                .values({ driverId, startTime: new Date(Date.now() - HOUR) })
                .$returningId();

            const found = await findOrCreateOpenShift(db, driverId);
            expect(found.id).toBe(shift.id);

            const shifts = await db.select().from(driverShifts).where(eq(driverShifts.driverId, driverId));
            expect(shifts.length).toBe(1);
            expect(shifts[0].endTime).toBeNull();
        });
    }, 20000);
});

describe("markRouteStarted never attaches a new route to a zombie shift", () => {
    it("closes the stale shift and links the route to a brand new one", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const staleStart = new Date(Date.now() - (MAX_SHIFT_HOURS + 5) * HOUR);
            const [stale] = await db.insert(driverShifts).values({ driverId, startTime: staleStart }).$returningId();

            const routeId = `__TEST-${uniqueSuffix()}`;
            await db.insert(driverRoutes).values({ id: routeId, driverId, date: new Date(), status: "in_progress" });

            await markRouteStarted(db, routeId, driverId, { startedAt: null, shiftId: null });

            const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, routeId)).limit(1);
            expect(route.shiftId).not.toBeNull();
            expect(route.shiftId).not.toBe(stale.id);

            const [closedStale] = await db.select().from(driverShifts).where(eq(driverShifts.id, stale.id)).limit(1);
            expect(closedStale.endTime).not.toBeNull();

            const [newShift] = await db.select().from(driverShifts).where(eq(driverShifts.id, route.shiftId!)).limit(1);
            expect(newShift.endTime).toBeNull();

            // Exactly two shifts total for this driver: the closed zombie and the new one.
            const allShifts = await db.select().from(driverShifts).where(eq(driverShifts.driverId, driverId));
            expect(allShifts.length).toBe(2);
        });
    }, 20000);

    // /shifts/start (explicit clock-in) is a thin wrapper over findOrCreateOpenShift,
    // so this same fix covers it: a driver tapping "clock in" over a zombie shift
    // gets a fresh shift instead of silently resuming a two-day-old one.
    it("clocking in over a stale shift (findOrCreateOpenShift) behaves the same as starting a route", async () => {
        await withFixtureDriver(async (db, driverId) => {
            const staleStart = new Date(Date.now() - (MAX_SHIFT_HOURS + 5) * HOUR);
            const [stale] = await db.insert(driverShifts).values({ driverId, startTime: staleStart }).$returningId();

            const clockIn = await findOrCreateOpenShift(db, driverId);
            expect(clockIn.id).not.toBe(stale.id);

            const [closedStale] = await db.select().from(driverShifts).where(eq(driverShifts.id, stale.id)).limit(1);
            expect(closedStale.endTime).not.toBeNull();
        });
    }, 20000);
});
