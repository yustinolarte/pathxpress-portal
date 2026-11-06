import { describe, expect, it } from "vitest";
import { comparePriority, computeDispatchPriority } from "@shared/dispatchPriority";
import { ETA_MODEL, defaultRouteStartTime, estimateStopEtas, etaClock, isPeakHour, parseTimeSlot, travelMinutes } from "@shared/routeEta";

// 2026-10-31 10:00 in Dubai
const NOW = new Date("2026-10-31T06:00:00Z");

describe("computeDispatchPriority", () => {
    const base = { serviceType: "DOM", createdAt: "2026-10-31T04:00:00Z" };

    it("is normal for a fresh DOM order", () => {
        expect(computeDispatchPriority(base, NOW)).toMatchObject({ level: "normal", overridden: false, reasons: [] });
    });

    it("makes Bullet urgent", () => {
        expect(computeDispatchPriority({ ...base, serviceType: "BULLET" }, NOW).level).toBe("urgent");
    });

    it("makes Preferred Time urgent on its day and overdue after, not before", () => {
        const pt = { ...base, serviceType: "PREFERRED_TIME" };
        expect(computeDispatchPriority({ ...pt, preferredDeliveryDate: "2026-10-31" }, NOW).reasons).toContain("Preferred time today");
        expect(computeDispatchPriority({ ...pt, preferredDeliveryDate: "2026-10-30" }, NOW).reasons).toContain("Preferred time overdue");
        expect(computeDispatchPriority({ ...pt, preferredDeliveryDate: "2026-11-01" }, NOW).level).toBe("normal");
    });

    it("reads Same Day against the Dubai calendar day", () => {
        // 23:30 Dubai on the 30th = 19:30Z on the 30th: yesterday, so overdue.
        const lateLastNight = computeDispatchPriority({ serviceType: "SDD", createdAt: "2026-10-30T19:30:00Z" }, NOW);
        expect(lateLastNight.reasons).toContain("Same day — overdue");
        // 00:30 Dubai on the 31st = 20:30Z on the 30th: today, even though the UTC date says the 30th.
        const earlyToday = computeDispatchPriority({ serviceType: "SDD", createdAt: "2026-10-30T20:30:00Z" }, NOW);
        expect(earlyToday.reasons).toContain("Same day");
    });

    it("raises retries and Express Zone 2 to high", () => {
        expect(computeDispatchPriority({ ...base, attemptCount: 1 }, NOW)).toMatchObject({ level: "high", reasons: ["Retry — attempt #2"] });
        expect(computeDispatchPriority({ ...base, serviceType: "EXPRESS_ZONE2" }, NOW).level).toBe("high");
    });

    it("lets dispatch override either way", () => {
        const down = computeDispatchPriority({ ...base, serviceType: "BULLET", priorityOverride: "normal" }, NOW);
        expect(down).toMatchObject({ level: "normal", computed: "urgent", overridden: true });
        expect(computeDispatchPriority({ ...base, priorityOverride: "urgent" }, NOW).level).toBe("urgent");
        expect(computeDispatchPriority({ ...base, priorityOverride: "bogus" }, NOW).overridden).toBe(false);
    });

    it("sorts by priority, then oldest first", () => {
        const mk = (level: "urgent" | "high" | "normal", createdAt: string) => ({ priority: { level }, createdAt });
        const sorted = [mk("normal", "2026-10-29"), mk("urgent", "2026-10-31"), mk("urgent", "2026-10-30"), mk("high", "2026-10-31")]
            .sort(comparePriority).map(o => `${o.priority.level}:${o.createdAt}`);
        expect(sorted).toEqual(["urgent:2026-10-30", "urgent:2026-10-31", "high:2026-10-31", "normal:2026-10-29"]);
    });
});

describe("parseTimeSlot", () => {
    it("reads windows with any dash and single times as one hour", () => {
        expect(parseTimeSlot("06:00 - 07:00")).toEqual({ start: "06:00", end: "07:00" });
        expect(parseTimeSlot("14:00–15:30")).toEqual({ start: "14:00", end: "15:30" });
        expect(parseTimeSlot("18:00")).toEqual({ start: "18:00", end: "19:00" });
        expect(parseTimeSlot("9:30")).toEqual({ start: "09:30", end: "10:30" });
    });

    it("rejects junk", () => {
        expect(parseTimeSlot("")).toBeNull();
        expect(parseTimeSlot("evening")).toBeNull();
    });
});

describe("estimateStopEtas", () => {
    const start = new Date("2026-10-31T05:00:00Z"); // 09:00 Dubai
    const marina = { lat: 25.0805, lng: 55.1403 };
    const downtown = { lat: 25.1972, lng: 55.2744 };
    const abuDhabi = { lat: 24.4539, lng: 54.3773 };

    it("gives plausible Dubai driving times", () => {
        const nearby = travelMinutes(downtown, { lat: 25.2048, lng: 55.2708 }); // ~1 km
        expect(nearby).toBeGreaterThanOrEqual(2);
        expect(nearby).toBeLessThanOrEqual(5);
        const city = travelMinutes(marina, downtown); // Marina → Downtown via SZR
        expect(city).toBeGreaterThanOrEqual(25);
        expect(city).toBeLessThanOrEqual(35);
        const intercity = travelMinutes(downtown, abuDhabi);
        expect(intercity).toBeGreaterThanOrEqual(100);
        expect(intercity).toBeLessThanOrEqual(130);
    });

    it("accumulates travel and handling time from the start", () => {
        const plan = estimateStopEtas([
            { key: 1, type: "pickup", coords: marina },
            { key: 2, type: "delivery", coords: downtown },
        ], { startAt: start, origin: marina });
        // first stop is at the origin: arrive at 09:00, leave after 10 min pickup
        expect(plan.stops[0].arriveAt).toBe("2026-10-31T05:00:00.000Z");
        expect(plan.stops[0].departAt).toBe("2026-10-31T05:10:00.000Z");
        const second = new Date(plan.stops[1].arriveAt).getTime();
        // Leaves the pickup at 09:10 Dubai — morning rush hour.
        const leaves = new Date("2026-10-31T05:10:00Z");
        const expected = leaves.getTime() + travelMinutes(marina, downtown, leaves) * 60_000;
        expect(travelMinutes(marina, downtown, leaves)).toBeGreaterThan(travelMinutes(marina, downtown));
        expect(second).toBe(expected);
        expect(plan.endAt).toBe(new Date(expected + ETA_MODEL.serviceMinutes.delivery * 60_000).toISOString());
    });

    it("counts a stop without coordinates as an unknown leg and marks everything after it approximate", () => {
        const plan = estimateStopEtas([
            { key: 1, type: "delivery", coords: downtown },
            { key: 2, type: "delivery", coords: null },
            { key: 3, type: "delivery", coords: marina },
        ], { startAt: start, origin: downtown });
        expect(plan.stops.map(s => s.approx)).toEqual([false, true, true]);
        const firstLeaves = new Date(plan.stops[0].departAt).getTime();
        expect(new Date(plan.stops[1].arriveAt).getTime()).toBe(firstLeaves + ETA_MODEL.unknownLegMinutes * 60_000);
    });

    it("without a start point, assumes an unknown first leg instead of arriving at the start time", () => {
        const plan = estimateStopEtas([
            { key: 1, type: "delivery", coords: downtown },
            { key: 2, type: "delivery", coords: marina },
        ], { startAt: start });
        expect(plan.stops[0].arriveAt).toBe(new Date(start.getTime() + ETA_MODEL.unknownLegMinutes * 60_000).toISOString());
        expect(plan.stops.map(s => s.approx)).toEqual([true, true]);
    });

    it("re-anchors on a worked stop: what follows it is measured again", () => {
        const doneAt = new Date("2026-10-31T06:00:00Z");
        const plan = estimateStopEtas([
            { key: 1, type: "delivery", coords: marina, doneAt },
            { key: 2, type: "delivery", coords: downtown },
        ], { startAt: start, now: new Date("2026-10-31T07:00:00Z") });
        expect(plan.stops[1].approx).toBe(false);
    });

    it("hands over a second parcel in the same building in a couple of minutes", () => {
        const sameTower = { lat: downtown.lat + 0.0003, lng: downtown.lng }; // ~33 m
        const plan = estimateStopEtas([
            { key: 1, type: "delivery", coords: downtown },
            { key: 2, type: "delivery", coords: sameTower },
        ], { startAt: start, origin: downtown });
        const first = plan.stops[0], second = plan.stops[1];
        expect(new Date(first.departAt).getTime() - new Date(first.arriveAt).getTime()).toBe(ETA_MODEL.serviceMinutes.delivery * 60_000);
        expect(new Date(second.departAt).getTime() - new Date(second.arriveAt).getTime()).toBe(ETA_MODEL.sameSpotMinutes * 60_000);
    });

    it("projects remaining stops from now and the last worked stop on a live route", () => {
        const doneAt = new Date("2026-10-31T06:00:00Z");
        const now = new Date("2026-10-31T07:00:00Z");
        const plan = estimateStopEtas([
            { key: 1, type: "delivery", coords: marina, doneAt },
            { key: 2, type: "delivery", coords: downtown },
        ], { startAt: start, now });
        expect(plan.stops[0]).toMatchObject({ actual: true, arriveAt: doneAt.toISOString() });
        const projected = now.getTime() + travelMinutes(marina, downtown) * 60_000;
        expect(plan.stops[1].arriveAt).toBe(new Date(projected).toISOString());
    });

    it("flags a stop that misses its window or Bullet deadline, and an early arrival", () => {
        const plan = estimateStopEtas([
            { key: 1, type: "delivery", coords: downtown, latestArrival: new Date("2026-10-31T04:30:00Z"), deadlineKind: "window" },
            { key: 2, type: "delivery", coords: downtown, earliestArrival: new Date("2026-10-31T12:00:00Z") },
            { key: 3, type: "delivery", coords: downtown, latestArrival: new Date("2026-10-31T05:01:00Z"), deadlineKind: "bullet" },
        ], { startAt: start, origin: downtown });
        expect(plan.stops[0].lateRisk).toBe("window");
        expect(plan.stops[1]).toMatchObject({ lateRisk: null, early: true });
        expect(plan.stops[2].lateRisk).toBe("bullet");
    });
});

describe("rush hour", () => {
    it("covers 07:00–10:00 and 16:00–20:00 Dubai time", () => {
        const at = (hhmm: string) => new Date(`2026-10-31T${hhmm}:00+04:00`);
        expect(isPeakHour(at("06:59"))).toBe(false);
        expect(isPeakHour(at("07:00"))).toBe(true);
        expect(isPeakHour(at("09:59"))).toBe(true);
        expect(isPeakHour(at("10:00"))).toBe(false);
        expect(isPeakHour(at("13:00"))).toBe(false);
        expect(isPeakHour(at("16:00"))).toBe(true);
        expect(isPeakHour(at("19:59"))).toBe(true);
        expect(isPeakHour(at("20:00"))).toBe(false);
    });

    it("slows the drive only when the leg sets off in it", () => {
        const a = { lat: 25.0805, lng: 55.1403 }, b = { lat: 25.1972, lng: 55.2744 };
        const base = travelMinutes(a, b);
        expect(travelMinutes(a, b, new Date("2026-10-31T13:00:00+04:00"))).toBe(base);
        expect(travelMinutes(a, b, new Date("2026-10-31T17:00:00+04:00"))).toBeGreaterThan(base);
    });
});

describe("etaClock", () => {
    const now = new Date("2026-10-31T10:00:00Z"); // 14:00 Dubai
    const past = "2026-10-31T05:00:00Z";          // 09:00 Dubai
    const future = "2026-10-31T12:00:00Z";        // 16:00 Dubai

    it("plans from the planned start while it's still ahead", () => {
        expect(etaClock({ status: "pending", plannedStartAt: future }, now)).toMatchObject({ mode: "planned", now: null });
    });

    it("projects from now when the planned start passed and the route hasn't left", () => {
        expect(etaClock({ status: "pending", plannedStartAt: past }, now)).toMatchObject({ mode: "late_start", now });
        // A wizard draft has no status — it hasn't left either.
        expect(etaClock({ plannedStartAt: past }, now)).toMatchObject({ mode: "late_start", now });
    });

    it("is live on the road, and leaves finished routes alone", () => {
        expect(etaClock({ status: "in_progress", plannedStartAt: past }, now)).toMatchObject({ mode: "live", now });
        expect(etaClock({ status: "completed", plannedStartAt: past }, now)).toMatchObject({ mode: "planned", now: null });
    });

    it("needs a start time", () => {
        expect(etaClock({ status: "pending" }, now)).toBeNull();
        expect(etaClock({ status: "in_progress", startedAt: past }, now)?.mode).toBe("live");
    });

    it("never puts a late-start route's first stop before now", () => {
        const clock = etaClock({ status: "pending", plannedStartAt: past }, now)!;
        const plan = estimateStopEtas([{ key: 1, type: "delivery", coords: { lat: 25.1972, lng: 55.2744 } }],
            { startAt: clock.startAt, origin: { lat: 25.0805, lng: 55.1403 }, now: clock.now });
        expect(new Date(plan.stops[0].arriveAt).getTime()).toBeGreaterThan(now.getTime());
    });
});

describe("defaultRouteStartTime", () => {
    const now = new Date("2026-10-31T09:07:00Z"); // 13:07 Dubai

    it("uses the usual departure on another day, 09:00 without history", () => {
        expect(defaultRouteStartTime("2026-11-01", "14:00", now)).toBe("14:00");
        expect(defaultRouteStartTime("2026-11-01", null, now)).toBe("09:00");
        expect(defaultRouteStartTime("2026-11-01", "bogus", now)).toBe("09:00");
    });

    it("never opens today in the past: the next quarter hour once the usual time has gone", () => {
        expect(defaultRouteStartTime("2026-10-31", "14:00", now)).toBe("14:00");
        expect(defaultRouteStartTime("2026-10-31", "09:00", now)).toBe("13:15");
        expect(defaultRouteStartTime("2026-10-31", "09:00", new Date("2026-10-31T19:55:00Z"))).toBe("23:45");
    });
});
