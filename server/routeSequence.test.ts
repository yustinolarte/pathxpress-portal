import { describe, expect, it } from "vitest";
import {
    applyLockedPositions,
    enforcePrecedence,
    findPrecedenceViolation,
    isValidSequence,
} from "@shared/routeSequence";
import type { SequenceStop } from "@shared/routeSequence";

/** Terse fixture builder: p(1) = pickup of order 1, d(1) = its delivery. */
const p = (orderId: number): SequenceStop => ({ key: `${orderId}:pickup`, orderId, type: "pickup" });
const d = (orderId: number): SequenceStop => ({ key: `${orderId}:delivery`, orderId, type: "delivery" });
const keys = (stops: SequenceStop[]) => stops.map(s => s.key);

describe("findPrecedenceViolation", () => {
    it("accepts an empty route", () => {
        expect(findPrecedenceViolation([])).toBeNull();
    });

    it("accepts pickup then its own delivery", () => {
        expect(findPrecedenceViolation([p(1), d(1)])).toBeNull();
    });

    it("accepts interleaved orders — the whole point of per-pair precedence", () => {
        expect(findPrecedenceViolation([p(1), d(1), p(2), d(2)])).toBeNull();
        expect(findPrecedenceViolation([p(1), p(2), d(2), d(1)])).toBeNull();
    });

    it("accepts a pickup-only route", () => {
        expect(findPrecedenceViolation([p(1), p(2), p(3)])).toBeNull();
    });

    it("accepts a delivery-only route — packages already on the van", () => {
        expect(findPrecedenceViolation([d(1), d(2), d(3)])).toBeNull();
    });

    it("accepts a delivery whose pickup is not on this route", () => {
        expect(findPrecedenceViolation([d(9), p(1), d(1)])).toBeNull();
    });

    it("reports the offending pair when a delivery precedes its pickup", () => {
        const stops = [p(1), d(2), d(1), p(2)];
        const violation = findPrecedenceViolation(stops);
        expect(violation).not.toBeNull();
        expect(violation!.delivery.orderId).toBe(2);
        expect(violation!.pickup.orderId).toBe(2);
        expect(violation!.deliveryIndex).toBe(1);
        expect(violation!.pickupIndex).toBe(3);
    });

    it("requires ALL pickups of an order to precede its delivery", () => {
        // Two pickup legs for one order: one seen, one still ahead.
        expect(findPrecedenceViolation([p(1), d(1), p(1)])).not.toBeNull();
        expect(findPrecedenceViolation([p(1), p(1), d(1)])).toBeNull();
    });

    it("isValidSequence mirrors it", () => {
        expect(isValidSequence([p(1), d(1)])).toBe(true);
        expect(isValidSequence([d(1), p(1)])).toBe(false);
    });
});

describe("enforcePrecedence", () => {
    it("leaves a valid list untouched", () => {
        const stops = [p(1), d(1), p(2), d(2)];
        expect(keys(enforcePrecedence(stops))).toEqual(keys(stops));
    });

    it("moves an offending delivery to just after its pickup", () => {
        const fixed = enforcePrecedence([d(1), p(1), p(2), d(2)]);
        expect(keys(fixed)).toEqual(["1:pickup", "1:delivery", "2:pickup", "2:delivery"]);
    });

    it("is idempotent", () => {
        const once = enforcePrecedence([d(2), p(1), d(1), p(2)]);
        const twice = enforcePrecedence(once);
        expect(keys(twice)).toEqual(keys(once));
        expect(findPrecedenceViolation(once)).toBeNull();
    });

    it("preserves every stop, including unconstrained deliveries", () => {
        const stops = [d(9), d(1), p(1), p(2), d(2)];
        const fixed = enforcePrecedence(stops);
        expect(fixed).toHaveLength(stops.length);
        expect(new Set(keys(fixed))).toEqual(new Set(keys(stops)));
        // The orphan delivery keeps its head position — nothing constrains it.
        expect(fixed[0].orderId).toBe(9);
        expect(findPrecedenceViolation(fixed)).toBeNull();
    });

    it("holds a delivery until the LAST pickup of its order", () => {
        const fixed = enforcePrecedence([d(1), p(1), p(1)]);
        expect(keys(fixed)).toEqual(["1:pickup", "1:pickup", "1:delivery"]);
    });
});

describe("applyLockedPositions", () => {
    const locked = (item: string) => item.startsWith("!");

    it("returns the dragged order untouched when nothing is locked", () => {
        const original = ["a", "b", "c"];
        expect(applyLockedPositions(original, ["c", "a", "b"], locked)).toEqual(["c", "a", "b"]);
    });

    it("pins locked items back to their original index", () => {
        const original = ["!done", "a", "b"];
        // The drag tried to push the completed stop to the end.
        expect(applyLockedPositions(original, ["a", "b", "!done"], locked)).toEqual(["!done", "a", "b"]);
    });

    it("lets free items reorder around a locked item", () => {
        const original = ["a", "!done", "b", "c"];
        expect(applyLockedPositions(original, ["c", "b", "!done", "a"], locked)).toEqual([
            "c", "!done", "b", "a",
        ]);
    });

    it("bails out if the drag changed the length", () => {
        const original = ["!done", "a"];
        expect(applyLockedPositions(original, ["a"], locked)).toEqual(["a"]);
    });
});
