import { describe, expect, it } from "vitest";
import { comparePriority, computeDispatchPriority } from "@shared/dispatchPriority";
import { estimateStopEtas, parseTimeSlot, travelMinutes } from "@shared/routeEta";

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
        const expected = new Date("2026-10-31T05:10:00Z").getTime() + travelMinutes(marina, downtown) * 60_000;
        expect(second).toBe(expected);
        expect(plan.endAt).toBe(new Date(expected + 6 * 60_000).toISOString());
    });

    it("marks everything after a stop without coordinates as approximate", () => {
        const plan = estimateStopEtas([
            { key: 1, type: "delivery", coords: downtown },
            { key: 2, type: "delivery", coords: null },
            { key: 3, type: "delivery", coords: marina },
        ], { startAt: start });
        expect(plan.stops.map(s => s.approx)).toEqual([false, true, true]);
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
