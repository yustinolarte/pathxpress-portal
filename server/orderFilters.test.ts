/**
 * The assignable-order pool shared by Create Route, Add Orders and the dispatch
 * board's unassigned panel.
 *
 * Each of those used to inline its own copy of the "hide already-failed orders"
 * rule. The dispatch panel was written without it and ended up listing 20 orders
 * where the other pickers listed 9 — more than half the list was retry noise.
 * These tests pin the shared rule so a fourth consumer can't drift again.
 *
 * Lives under server/ because that's the only path vitest collects; the module
 * itself is pure TypeScript with no DOM or React dependency.
 */
import { describe, expect, it } from "vitest";
import {
    pickableOrders,
    countHiddenByDefault,
    HIDDEN_BY_DEFAULT_STATUSES,
} from "../client/src/lib/orderFilters";

const order = (id: number, status: string) => ({ id, status });

const pool = [
    order(1, "pending_pickup"),
    order(2, "picked_up"),
    order(3, "failed_pickup"),
    order(4, "in_transit"),
    order(5, "failed_delivery"),
    order(6, "on_hold"),
];

describe("pickableOrders", () => {
    it("drops already-failed orders from the default pool", () => {
        const result = pickableOrders(pool);
        expect(result.map(o => o.id)).toEqual([1, 2, 4, 6]);
    });

    it("keeps a failed order visible once it has been deliberately selected", () => {
        // Otherwise a retry chosen from an explicit status filter would vanish
        // from under the cursor and could never be deselected.
        const result = pickableOrders(pool, [3]);
        expect(result.map(o => o.id)).toEqual([1, 2, 3, 4, 6]);
    });

    it("returns everything when failures are explicitly requested", () => {
        const result = pickableOrders(pool, [], { includeFailed: true });
        expect(result.map(o => o.id)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("treats a missing list as empty rather than throwing", () => {
        expect(pickableOrders(undefined)).toEqual([]);
        expect(countHiddenByDefault(undefined)).toBe(0);
    });

    it("reports how many orders it is holding back", () => {
        expect(countHiddenByDefault(pool)).toBe(2);
    });

    it("hides exactly the statuses the shared constant lists", () => {
        for (const status of Array.from(HIDDEN_BY_DEFAULT_STATUSES)) {
            expect(pickableOrders([order(99, status)])).toEqual([]);
        }
        // ...and nothing else. A terminal status never reaches this pool
        // (getAvailableOrders filters those server-side), so anything that does
        // arrive here is assignable unless it is on that list.
        expect(pickableOrders([order(99, "delivery_attempted")])).toHaveLength(1);
    });
});
