/**
 * Single definition of what makes an open driverShifts row "stale" — a missed
 * clock-out rather than a driver still on duty.
 *
 * Before this existed, three places each guessed independently: getDispatchOverview()
 * (driverAdmin.ts) correctly excluded a stale open shift from "on duty", but
 * getDriverShiftReport() (same file) counted it straight through to `now` for
 * payroll, and findOpenShift()/findOrCreateOpenShift()/markRouteStarted()
 * (driverApi.ts) ignored staleness entirely and would attach a brand new route to
 * a two-day-old zombie shift. Production shift #265 (driver 4, open 31+ hours)
 * showed the split-brain directly: dispatch reported 0 active drivers while
 * payroll billed 31.6h against the very same row.
 *
 * This lives in its own module rather than one of driverAdmin.ts/driverApi.ts
 * exporting to the other because:
 *   - driverAdmin.ts must NOT import driverApi.ts (an Express router file —
 *     pulling it in would drag JWT/router setup into the admin/tRPC surface for
 *     no reason).
 *   - driverApi.ts importing from driverAdmin.ts instead would work today, but it
 *     is a needless one-directional dependency for two small, pure exports, and
 *     it's the kind of edge that tends to grow into a real cycle later (e.g. if
 *     driverAdmin.ts ever needs a driverApi.ts helper). A leaf module with zero
 *     imports of its own removes the question entirely.
 */

/** Guardrail: a single shift longer than this is almost certainly a bad clock-out. */
export const MAX_SHIFT_HOURS = 16;

const MAX_SHIFT_MS = MAX_SHIFT_HOURS * 60 * 60 * 1000;

export interface OpenShiftLike {
    startTime: Date;
}

/**
 * True once an OPEN shift has been running longer than anyone plausibly works in
 * one go. Only meaningful for shifts without an endTime — a closed shift's
 * endTime is authoritative (an admin may have deliberately recorded a long one;
 * updateDriverShift() enforces MAX_SHIFT_HOURS on write instead).
 */
export function isStaleOpenShift(shift: OpenShiftLike, now: Date = new Date()): boolean {
    return now.getTime() - shift.startTime.getTime() > MAX_SHIFT_MS;
}
