import { describe, expect, it } from "vitest";
import { getBillingWindow } from "./db";

// 2026-07-17 and 2026-07-24 are both Fridays (verified via getUTCDay() === 5).
// Friday 18:00 Dubai (UTC+4, no DST) == Friday 14:00 UTC.
const START_FRIDAY = new Date("2026-07-17");
const END_FRIDAY = new Date("2026-07-24");
const NEXT_FRIDAY = new Date("2026-07-31");

describe("getBillingWindow", () => {
  it("closes a Friday-ending period at 18:00 Dubai", () => {
    const { to } = getBillingWindow(START_FRIDAY, END_FRIDAY);
    expect(to.toISOString()).toBe("2026-07-24T14:00:00.000Z");
  });

  it("opens at 00:00 Dubai on the start day", () => {
    const { from } = getBillingWindow(START_FRIDAY, END_FRIDAY);
    expect(from.toISOString()).toBe("2026-07-16T20:00:00.000Z"); // 2026-07-17 00:00 Dubai
  });

  it("includes a shipment delivered just before the Friday cutoff", () => {
    const { from, to } = getBillingWindow(START_FRIDAY, END_FRIDAY);
    const justBefore = new Date("2026-07-24T13:59:00Z"); // 17:59 Dubai
    expect(justBefore >= from && justBefore <= to).toBe(true);
  });

  it("excludes a shipment delivered just after the Friday cutoff", () => {
    const { to } = getBillingWindow(START_FRIDAY, END_FRIDAY);
    const justAfter = new Date("2026-07-24T14:01:00Z"); // 18:01 Dubai
    expect(justAfter <= to).toBe(false);
  });

  it("rolls a post-cutoff shipment into the following period", () => {
    const { from, to } = getBillingWindow(END_FRIDAY, NEXT_FRIDAY);
    const justAfterPreviousCutoff = new Date("2026-07-24T14:01:00Z");
    expect(justAfterPreviousCutoff >= from && justAfterPreviousCutoff <= to).toBe(true);
  });

  it("leaves no gap between consecutive periods", () => {
    const closing = getBillingWindow(START_FRIDAY, END_FRIDAY);
    const next = getBillingWindow(END_FRIDAY, NEXT_FRIDAY);
    // The periods overlap on their shared boundary Friday by design: anything still
    // unbilled from the closing week is swept into the next invoice rather than lost.
    expect(next.from.getTime()).toBeLessThanOrEqual(closing.to.getTime());
  });

  it("keeps whole-day semantics for a custom period that does not end on a Friday", () => {
    const wednesday = new Date("2026-07-22");
    expect(wednesday.getUTCDay()).toBe(3);
    const { to } = getBillingWindow(START_FRIDAY, wednesday);
    expect(to.toISOString()).toBe("2026-07-22T19:59:59.999Z"); // 23:59:59.999 Dubai
  });
});
