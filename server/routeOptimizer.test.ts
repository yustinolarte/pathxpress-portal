import { describe, expect, it } from "vitest";
import { haversine, optimizeStops } from "./routeOptimizer";
import type { OptimizableStop } from "./routeOptimizer";

// Dubai landmarks for realistic coords
const COORDS = {
    warehouse:  { lat: 25.1972,  lng: 55.2744 },  // Al Quoz
    downtown:   { lat: 25.1972,  lng: 55.2796 },  // Burj Khalifa area
    marina:     { lat: 25.0802,  lng: 55.1402 },  // Dubai Marina
    deira:      { lat: 25.2697,  lng: 55.3095 },  // Deira
    jlt:        { lat: 25.0666,  lng: 55.1390 },  // JLT
};

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
            { id: 1, type: "delivery", coords: COORDS.deira  },
            { id: 2, type: "delivery", coords: COORDS.marina },
            { id: 3, type: "delivery", coords: COORDS.jlt    },
        ];
        const result = optimizeStops(stops, COORDS.warehouse);
        expect(result).toHaveLength(3);
        // JLT and Marina are close; they should end up together
        const marinaIdx = result.indexOf(2);
        const jltIdx    = result.indexOf(3);
        expect(Math.abs(marinaIdx - jltIdx)).toBe(1);
    });

    it("handles single stop", () => {
        const stops: OptimizableStop[] = [{ id: 42, type: "delivery", coords: COORDS.downtown }];
        expect(optimizeStops(stops)).toEqual([42]);
    });

    it("handles empty list", () => {
        expect(optimizeStops([])).toEqual([]);
    });
});

describe("optimizeStops — pickup before delivery", () => {
    it("all pickups come before all deliveries regardless of input order", () => {
        const stops: OptimizableStop[] = [
            { id: 10, type: "delivery", coords: COORDS.downtown },
            { id: 11, type: "pickup",   coords: COORDS.deira    },
            { id: 12, type: "delivery", coords: COORDS.marina   },
            { id: 13, type: "pickup",   coords: COORDS.jlt      },
        ];
        const result = optimizeStops(stops, COORDS.warehouse);
        const pickupIds   = new Set([11, 13]);
        const deliveryIds = new Set([10, 12]);
        const firstDelivery = result.findIndex(id => deliveryIds.has(id));
        const lastPickup    = result.reduce((acc, id, i) => pickupIds.has(id) ? i : acc, -1);
        expect(lastPickup).toBeLessThan(firstDelivery);
    });
});

describe("optimizeStops — stops without coordinates", () => {
    it("stops without coords are appended at end of their group in original order", () => {
        const stops: OptimizableStop[] = [
            { id: 1, type: "delivery", coords: COORDS.downtown },
            { id: 2, type: "delivery", coords: null            },
            { id: 3, type: "delivery", coords: COORDS.marina   },
            { id: 4, type: "delivery", coords: null            },
        ];
        const result = optimizeStops(stops);
        // Stops with coords come first, then null-coord stops in original order
        expect(result.slice(-2)).toEqual([2, 4]);
        expect(result.slice(0, 2).sort()).toEqual([1, 3]);
    });

    it("all stops without coords returns them in original order", () => {
        const stops: OptimizableStop[] = [
            { id: 5, type: "delivery", coords: null },
            { id: 6, type: "delivery", coords: null },
        ];
        expect(optimizeStops(stops)).toEqual([5, 6]);
    });
});

describe("optimizeStops — without origin", () => {
    it("still returns all stop ids when no origin given", () => {
        const stops: OptimizableStop[] = [
            { id: 1, type: "delivery", coords: COORDS.downtown },
            { id: 2, type: "delivery", coords: COORDS.deira    },
            { id: 3, type: "delivery", coords: COORDS.marina   },
        ];
        const result = optimizeStops(stops, null);
        expect(result).toHaveLength(3);
        expect(result.sort()).toEqual([1, 2, 3]);
    });
});
