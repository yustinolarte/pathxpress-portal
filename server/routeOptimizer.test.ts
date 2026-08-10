import { describe, expect, it } from "vitest";
import { haversine, optimizeStops } from "./routeOptimizer";
import type { OptimizableStop } from "./routeOptimizer";
import { findPrecedenceViolation } from "@shared/routeSequence";

// Dubai landmarks for realistic coords
const COORDS = {
    warehouse:  { lat: 25.1972,  lng: 55.2744 },  // Al Quoz
    downtown:   { lat: 25.1972,  lng: 55.2796 },  // Burj Khalifa area
    marina:     { lat: 25.0802,  lng: 55.1402 },  // Dubai Marina
    deira:      { lat: 25.2697,  lng: 55.3095 },  // Deira
    jlt:        { lat: 25.0666,  lng: 55.1390 },  // JLT
};

/** Assert the per-pair invariant on a result, given the stops that produced it. */
function expectPrecedenceHolds(result: number[], stops: OptimizableStop[]) {
    const byId = new Map(stops.map(s => [s.id, s]));
    const ordered = result.map(id => {
        const s = byId.get(id)!;
        return { key: s.id, orderId: s.orderId, type: s.type };
    });
    expect(findPrecedenceViolation(ordered)).toBeNull();
}

describe("haversine", () => {
    it("returns 0 for same point", () => {
        expect(haversine(COORDS.downtown, COORDS.downtown)).toBe(0);
    });

    it("is roughly symmetric", () => {
        const ab = haversine(COORDS.downtown, COORDS.marina);
        const ba = haversine(COORDS.marina, COORDS.downtown);
        expect(Math.abs(ab - ba)).toBeLessThan(0.001);
    });

    it("Marina is ~15-20 km from Downtown Dubai", () => {
        const d = haversine(COORDS.downtown, COORDS.marina);
        expect(d).toBeGreaterThan(12_000);
        expect(d).toBeLessThan(22_000);
    });
});

describe("optimizeStops — delivery only", () => {
    it("returns ids in a shorter-distance order than the original", () => {
        // Original order: far - near - far2 (suboptimal)
        const stops: OptimizableStop[] = [
            { id: 1, orderId: 1, type: "delivery", coords: COORDS.deira  },
            { id: 2, orderId: 2, type: "delivery", coords: COORDS.marina },
            { id: 3, orderId: 3, type: "delivery", coords: COORDS.jlt    },
        ];
        const result = optimizeStops(stops, COORDS.warehouse);
        expect(result).toHaveLength(3);
        // JLT and Marina are close; they should end up together
        const marinaIdx = result.indexOf(2);
        const jltIdx    = result.indexOf(3);
        expect(Math.abs(marinaIdx - jltIdx)).toBe(1);
    });

    it("handles single stop", () => {
        const stops: OptimizableStop[] = [
            { id: 42, orderId: 42, type: "delivery", coords: COORDS.downtown },
        ];
        expect(optimizeStops(stops)).toEqual([42]);
    });

    it("handles empty list", () => {
        expect(optimizeStops([])).toEqual([]);
    });
});

describe("optimizeStops — pickup before delivery, per order", () => {
    it("keeps each order's pickup ahead of its own delivery", () => {
        const stops: OptimizableStop[] = [
            { id: 10, orderId: 1, type: "delivery", coords: COORDS.downtown },
            { id: 11, orderId: 1, type: "pickup",   coords: COORDS.deira    },
            { id: 12, orderId: 2, type: "delivery", coords: COORDS.marina   },
            { id: 13, orderId: 2, type: "pickup",   coords: COORDS.jlt      },
        ];
        const result = optimizeStops(stops, COORDS.warehouse);
        expect(result).toHaveLength(4);
        expect(result.indexOf(11)).toBeLessThan(result.indexOf(10));
        expect(result.indexOf(13)).toBeLessThan(result.indexOf(12));
        expectPrecedenceHolds(result, stops);
    });

    it("interleaves orders instead of doing every pickup first", () => {
        // Order 1 lives in Deira (north), order 2 in Marina/JLT (south-west).
        // The old rule forced P1,P2,D1,D2 — a pointless double crossing.
        const stops: OptimizableStop[] = [
            { id: 1, orderId: 1, type: "pickup",   coords: COORDS.deira    },
            { id: 2, orderId: 1, type: "delivery", coords: COORDS.downtown },
            { id: 3, orderId: 2, type: "pickup",   coords: COORDS.marina   },
            { id: 4, orderId: 2, type: "delivery", coords: COORDS.jlt      },
        ];
        const result = optimizeStops(stops, COORDS.deira);
        // Order 1 is fully served before order 2's pickup is even reached.
        expect(result.indexOf(2)).toBeLessThan(result.indexOf(3));
        expectPrecedenceHolds(result, stops);
    });

    it("leaves a delivery whose pickup is not on the route unconstrained", () => {
        const stops: OptimizableStop[] = [
            { id: 20, orderId: 7, type: "delivery", coords: COORDS.marina   },
            { id: 21, orderId: 8, type: "pickup",   coords: COORDS.deira    },
            { id: 22, orderId: 8, type: "delivery", coords: COORDS.downtown },
        ];
        const result = optimizeStops(stops, COORDS.jlt);
        // Starting from JLT, the orphan delivery in Marina is nearest — it may go first.
        expect(result[0]).toBe(20);
        expectPrecedenceHolds(result, stops);
    });

    it("never lets a coordinate-less delivery jump ahead of its pickup", () => {
        const stops: OptimizableStop[] = [
            { id: 30, orderId: 1, type: "delivery", coords: null          },
            { id: 31, orderId: 1, type: "pickup",   coords: COORDS.marina },
            { id: 32, orderId: 2, type: "delivery", coords: COORDS.deira  },
        ];
        const result = optimizeStops(stops, COORDS.warehouse);
        expect(result).toHaveLength(3);
        expect(result.indexOf(31)).toBeLessThan(result.indexOf(30));
        expectPrecedenceHolds(result, stops);
    });

    it("handles both legs of many orders without violating any pair", () => {
        const places = [COORDS.downtown, COORDS.marina, COORDS.deira, COORDS.jlt];
        const stops: OptimizableStop[] = [];
        for (let order = 1; order <= 4; order++) {
            stops.push({ id: order * 10,     orderId: order, type: "pickup",   coords: places[order - 1] });
            stops.push({ id: order * 10 + 1, orderId: order, type: "delivery", coords: places[4 - order] });
        }
        const result = optimizeStops(stops, COORDS.warehouse);
        expect(result).toHaveLength(8);
        expect(new Set(result).size).toBe(8);
        expectPrecedenceHolds(result, stops);
    });
});

describe("optimizeStops — stops without coordinates", () => {
    it("stops without coords are appended at the end in original order", () => {
        const stops: OptimizableStop[] = [
            { id: 1, orderId: 1, type: "delivery", coords: COORDS.downtown },
            { id: 2, orderId: 2, type: "delivery", coords: null            },
            { id: 3, orderId: 3, type: "delivery", coords: COORDS.marina   },
            { id: 4, orderId: 4, type: "delivery", coords: null            },
        ];
        const result = optimizeStops(stops);
        expect(result.slice(-2)).toEqual([2, 4]);
        expect(result.slice(0, 2).sort()).toEqual([1, 3]);
    });

    it("all stops without coords returns them in original order", () => {
        const stops: OptimizableStop[] = [
            { id: 5, orderId: 5, type: "delivery", coords: null },
            { id: 6, orderId: 6, type: "delivery", coords: null },
        ];
        expect(optimizeStops(stops)).toEqual([5, 6]);
    });
});

describe("optimizeStops — without origin", () => {
    it("still returns all stop ids when no origin given", () => {
        const stops: OptimizableStop[] = [
            { id: 1, orderId: 1, type: "delivery", coords: COORDS.downtown },
            { id: 2, orderId: 2, type: "delivery", coords: COORDS.deira    },
            { id: 3, orderId: 3, type: "delivery", coords: COORDS.marina   },
        ];
        const result = optimizeStops(stops, null);
        expect(result).toHaveLength(3);
        expect(result.sort()).toEqual([1, 2, 3]);
    });
});
