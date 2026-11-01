import { describe, expect, it } from "vitest";
import {
    checkDriverRouteTransition,
    checkStopTransition,
    isRouteFinished,
    isRouteSettled,
    orderStatusForStop,
    siblingEffect,
    stopStatusForOrderStatus,
} from "@shared/stopTransitions";
import {
    OUT_FOR_DELIVERY_FROM_STATUSES,
    isClosedOrderStatus,
    needsPickup,
    orderStatusGroup,
} from "@shared/orderStatus";
import { dubaiDateKey, dubaiDateTime, dubaiDayBounds, dubaiTimeOfDay, isSameDubaiDay } from "@shared/dubaiTime";

describe("checkStopTransition — driver", () => {
    it("lets an open delivery reach any outcome", () => {
        for (const to of ["delivered", "attempted", "failed", "returned", "on_hold"]) {
            expect(checkStopTransition("delivery", "in_progress", to, "driver").kind).toBe("ok");
        }
    });

    it("treats a repeated final status as a replay (noop)", () => {
        expect(checkStopTransition("delivery", "delivered", "delivered", "driver").kind).toBe("noop");
        expect(checkStopTransition("pickup", "picked_up", "picked_up", "driver").kind).toBe("noop");
    });

    it("refuses to move a final stop anywhere else", () => {
        expect(checkStopTransition("delivery", "delivered", "failed", "driver").kind).toBe("conflict");
        expect(checkStopTransition("delivery", "delivered", "in_progress", "driver").kind).toBe("conflict");
        expect(checkStopTransition("pickup", "picked_up", "failed", "driver").kind).toBe("conflict");
        expect(checkStopTransition("pickup", "failed", "picked_up", "driver").kind).toBe("conflict");
    });

    it("allows the afternoon retry of an attempted delivery", () => {
        expect(checkStopTransition("delivery", "attempted", "delivered", "driver").kind).toBe("ok");
        expect(checkStopTransition("delivery", "on_hold", "failed", "driver").kind).toBe("ok");
        expect(checkStopTransition("delivery", "attempted", "attempted", "driver").kind).toBe("noop");
    });

    it("never lets the driver re-open a worked stop", () => {
        expect(checkStopTransition("delivery", "attempted", "pending", "driver").kind).toBe("conflict");
        expect(checkStopTransition("delivery", "pending", "in_progress", "driver").kind).toBe("ok");
    });

    it("rejects statuses the leg cannot hold", () => {
        expect(checkStopTransition("pickup", "pending", "delivered", "driver").kind).toBe("invalid");
        expect(checkStopTransition("delivery", "pending", "picked_up", "driver").kind).toBe("invalid");
        expect(checkStopTransition("delivery", "pending", "bogus", "driver").kind).toBe("invalid");
    });

    it("treats a null legacy status as pending", () => {
        expect(checkStopTransition("delivery", null, "delivered", "driver").kind).toBe("ok");
    });
});

describe("checkStopTransition — admin", () => {
    it("can correct a final stop", () => {
        expect(checkStopTransition("delivery", "returned", "delivered", "admin").kind).toBe("ok");
        expect(checkStopTransition("delivery", "delivered", "pending", "admin").kind).toBe("ok");
    });

    it("still rejects statuses invalid for the leg", () => {
        expect(checkStopTransition("pickup", "pending", "delivered", "admin").kind).toBe("invalid");
    });
});

describe("siblingEffect", () => {
    it("is unconstrained without a sibling on the route", () => {
        expect(siblingEffect("delivery", "delivered", undefined, "driver").kind).toBe("none");
    });

    it("completes an open pickup when its delivery is worked (offline queue out of order)", () => {
        expect(siblingEffect("delivery", "delivered", "pending", "driver").kind).toBe("completeSiblingPickup");
        expect(siblingEffect("delivery", "attempted", "in_progress", "driver").kind).toBe("completeSiblingPickup");
    });

    it("leaves a picked-up pickup alone", () => {
        expect(siblingEffect("delivery", "delivered", "picked_up", "driver").kind).toBe("none");
    });

    it("refuses a delivery after its pickup failed", () => {
        expect(siblingEffect("delivery", "delivered", "failed", "driver").kind).toBe("conflict");
        expect(siblingEffect("delivery", "delivered", "attempted", "driver").kind).toBe("conflict");
    });

    it("fails the open delivery when the pickup fails or is attempted", () => {
        expect(siblingEffect("pickup", "failed", "in_progress", "driver").kind).toBe("failSiblingDelivery");
        expect(siblingEffect("pickup", "attempted", "pending", "driver").kind).toBe("failSiblingDelivery");
    });

    it("does nothing to the delivery on a successful pickup", () => {
        expect(siblingEffect("pickup", "picked_up", "in_progress", "driver").kind).toBe("none");
    });
});

describe("orderStatusForStop", () => {
    const ctx = { hasDeliveryLegOnRoute: false, deliveredStatus: "delivered", routeInProgress: true };

    it("sends a pickup with its delivery on the route straight out for delivery", () => {
        const r = orderStatusForStop("pickup", "picked_up", { ...ctx, hasDeliveryLegOnRoute: true });
        expect(r.status).toBe("out_for_delivery");
        expect(r.events.map(e => e.statusCode)).toEqual(["picked_up", "out_for_delivery"]);
    });

    it("maps a pickup-only pickup to picked_up", () => {
        expect(orderStatusForStop("pickup", "picked_up", ctx).status).toBe("picked_up");
    });

    it("maps both pickup failures to failed_pickup, keeping the outcome in the label", () => {
        expect(orderStatusForStop("pickup", "failed", ctx).events[0]).toEqual({ statusCode: "failed_pickup", statusLabel: "Pickup Failed" });
        expect(orderStatusForStop("pickup", "attempted", ctx).events[0]).toEqual({ statusCode: "failed_pickup", statusLabel: "Pickup Attempted" });
    });

    it("closes an RTO as returned_to_sender", () => {
        const r = orderStatusForStop("delivery", "delivered", { ...ctx, deliveredStatus: "returned_to_sender" });
        expect(r.status).toBe("returned_to_sender");
        expect(r.events[0].statusLabel).toBe("Returned to Sender");
    });

    it("maps delivery outcomes", () => {
        expect(orderStatusForStop("delivery", "attempted", ctx).status).toBe("delivery_attempted");
        expect(orderStatusForStop("delivery", "failed", ctx).status).toBe("failed_delivery");
        expect(orderStatusForStop("delivery", "returned", ctx).status).toBe("returned");
        expect(orderStatusForStop("delivery", "on_hold", ctx).status).toBe("on_hold");
    });

    it("puts a reverted delivery back out for delivery or in transit depending on the route", () => {
        expect(orderStatusForStop("delivery", "pending", ctx).status).toBe("out_for_delivery");
        expect(orderStatusForStop("delivery", "pending", { ...ctx, routeInProgress: false }).status).toBe("in_transit");
    });

    it("leaves the order alone for a pickup put on hold", () => {
        expect(orderStatusForStop("pickup", "on_hold", ctx)).toEqual({ status: null, events: [] });
    });
});

describe("stopStatusForOrderStatus", () => {
    it("never stamps a delivery status onto a pickup leg", () => {
        expect(stopStatusForOrderStatus("pickup", "delivered")).toBe("picked_up");
        expect(stopStatusForOrderStatus("pickup", "out_for_delivery")).toBe("picked_up");
    });

    it("never stamps picked_up onto a delivery leg", () => {
        expect(stopStatusForOrderStatus("delivery", "picked_up")).toBe("pending");
    });

    it("reverts both legs when the order goes back to pending_pickup", () => {
        expect(stopStatusForOrderStatus("pickup", "pending_pickup")).toBe("pending");
        expect(stopStatusForOrderStatus("delivery", "pending_pickup")).toBe("pending");
    });

    it("maps failed_pickup and delivery outcomes", () => {
        expect(stopStatusForOrderStatus("pickup", "failed_pickup")).toBe("failed");
        expect(stopStatusForOrderStatus("delivery", "delivery_attempted")).toBe("attempted");
        expect(stopStatusForOrderStatus("delivery", "returned_to_sender")).toBe("delivered");
    });

    it("ignores unknown free-text statuses", () => {
        expect(stopStatusForOrderStatus("delivery", "customs_hold")).toBeNull();
        expect(stopStatusForOrderStatus("pickup", "note")).toBeNull();
    });
});

describe("route completion", () => {
    it("is finished only when every stop is final", () => {
        expect(isRouteFinished([
            { type: "pickup", status: "picked_up" },
            { type: "delivery", status: "delivered" },
        ])).toBe(true);
        expect(isRouteFinished([
            { type: "delivery", status: "delivered" },
            { type: "delivery", status: "attempted" },
        ])).toBe(false);
        expect(isRouteFinished([])).toBe(false);
    });

    it("counts attempted pickups as final but attempted deliveries only as settled", () => {
        const stops = [
            { type: "pickup", status: "attempted" },
            { type: "delivery", status: "attempted" },
        ];
        expect(isRouteFinished(stops)).toBe(false);
        expect(isRouteSettled(stops)).toBe(true);
    });

    it("is not settled with an open stop", () => {
        expect(isRouteSettled([{ type: "delivery", status: "in_progress" }])).toBe(false);
    });
});

describe("checkDriverRouteTransition", () => {
    it("allows start and finish", () => {
        expect(checkDriverRouteTransition("pending", "in_progress").kind).toBe("ok");
        expect(checkDriverRouteTransition("in_progress", "completed").kind).toBe("ok");
    });

    it("never re-opens or cancels", () => {
        expect(checkDriverRouteTransition("completed", "in_progress").kind).toBe("conflict");
        expect(checkDriverRouteTransition("cancelled", "in_progress").kind).toBe("conflict");
        expect(checkDriverRouteTransition("in_progress", "cancelled").kind).toBe("conflict");
    });

    it("treats a repeat as a replay and garbage as invalid", () => {
        expect(checkDriverRouteTransition("completed", "completed").kind).toBe("noop");
        expect(checkDriverRouteTransition("pending", "done").kind).toBe("invalid");
    });
});

describe("orderStatus vocabulary", () => {
    it("treats failed_pickup as needing a new pickup", () => {
        expect(needsPickup("failed_pickup")).toBe(true);
        expect(orderStatusGroup("failed_pickup")).toBe("needsPickup");
    });

    it("closes both cancel spellings", () => {
        expect(isClosedOrderStatus("canceled")).toBe(true);
        expect(isClosedOrderStatus("cancelled")).toBe(true);
    });

    it("classifies unknown statuses as unknown, never assignable groups", () => {
        expect(orderStatusGroup("attempted")).toBe("unknown");
        expect(orderStatusGroup(undefined)).toBe("unknown");
    });

    it("sends retries out for delivery again but never an order already out", () => {
        expect(OUT_FOR_DELIVERY_FROM_STATUSES).toContain("delivery_attempted");
        expect(OUT_FOR_DELIVERY_FROM_STATUSES).toContain("failed_delivery");
        expect(OUT_FOR_DELIVERY_FROM_STATUSES).not.toContain("out_for_delivery");
        expect(OUT_FOR_DELIVERY_FROM_STATUSES).not.toContain("delivered");
    });
});

describe("dubaiTime", () => {
    it("reads 00:30 Dubai as the Dubai day, not the UTC one", () => {
        // 2026-10-30T20:30Z = 2026-10-31 00:30 in Dubai
        expect(dubaiDateKey("2026-10-30T20:30:00Z")).toBe("2026-10-31");
        expect(dubaiTimeOfDay("2026-10-30T20:30:00Z")).toBe("00:30");
    });

    it("bounds a Dubai day as 20:00Z to 20:00Z", () => {
        const { start, end } = dubaiDayBounds("2026-10-31");
        expect(start.toISOString()).toBe("2026-10-30T20:00:00.000Z");
        expect(end.toISOString()).toBe("2026-10-31T20:00:00.000Z");
    });

    it("builds a wall-clock instant", () => {
        expect(dubaiDateTime("2026-10-31", "09:00").toISOString()).toBe("2026-10-31T05:00:00.000Z");
    });

    it("rejects malformed input", () => {
        expect(() => dubaiDayBounds("31/10/2026")).toThrow(RangeError);
        expect(() => dubaiDateTime("2026-10-31", "25:00")).toThrow(RangeError);
    });

    it("compares calendar days in Dubai", () => {
        expect(isSameDubaiDay("2026-10-30T19:59:00Z", "2026-10-30T20:01:00Z")).toBe(false);
        expect(isSameDubaiDay("2026-10-30T20:01:00Z", "2026-10-31T19:59:00Z")).toBe(true);
    });
});
