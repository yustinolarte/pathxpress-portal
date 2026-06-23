/**
 * Route optimization engine — pure functions, no DB, no network.
 *
 * Algorithm: Nearest-Neighbor greedy to get an initial tour, then 2-opt to
 * improve it. Distances default to Haversine (straight-line, free). The
 * distanceFn is injectable so Google Directions can be swapped in later with
 * zero changes to callers.
 *
 * Business rule — pickup-before-delivery:
 *   Stops are split into two groups: pickups first, deliveries second.
 *   Each group is optimized independently, so every pickup is guaranteed to
 *   precede its corresponding delivery (matching how the driver app blocks
 *   deliveries until pickup is done).
 */

export interface LatLng {
    lat: number;
    lng: number;
}

export interface OptimizableStop {
    id: number;
    type: 'pickup' | 'delivery';
    coords: LatLng | null;
}

export type DistanceFn = (a: LatLng, b: LatLng) => number;

export function haversine(a: LatLng, b: LatLng): number {
    const R = 6_371_000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const c = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
    return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

function tourLength(points: LatLng[], dist: DistanceFn): number {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
        total += dist(points[i], points[i + 1]);
    }
    return total;
}

function nearestNeighbor(points: LatLng[], origin: LatLng | null, dist: DistanceFn): number[] {
    if (points.length === 0) return [];
    const unvisited = points.map((_, i) => i);
    const tour: number[] = [];
    let current = origin ?? points[0];

    while (unvisited.length > 0) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < unvisited.length; i++) {
            const d = dist(current, points[unvisited[i]]);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        const chosen = unvisited.splice(bestIdx, 1)[0];
        tour.push(chosen);
        current = points[chosen];
    }
    return tour;
}

function twoOpt(points: LatLng[], order: number[], dist: DistanceFn): number[] {
    let improved = true;
    let best = [...order];
    while (improved) {
        improved = false;
        for (let i = 0; i < best.length - 1; i++) {
            for (let j = i + 2; j < best.length; j++) {
                const a = points[best[i]];
                const b = points[best[i + 1]];
                const c = points[best[j]];
                const d = best[j + 1] !== undefined ? points[best[j + 1]] : null;

                const before = dist(a, b) + (d ? dist(c, d) : 0);
                const after = dist(a, c) + (d ? dist(b, d) : 0);
                if (after < before - 0.01) {
                    best = [
                        ...best.slice(0, i + 1),
                        ...best.slice(i + 1, j + 1).reverse(),
                        ...best.slice(j + 1),
                    ];
                    improved = true;
                }
            }
        }
    }
    return best;
}

/**
 * Returns the optimized order as an array of `id` values from the input stops.
 *
 * Stops without coordinates are appended at the end of their group in original
 * order — they don't break the optimization of the geo-located stops.
 *
 * @param stops  Array of stops to optimize.
 * @param origin Optional starting point (e.g. warehouse location).
 * @param dist   Distance function (default: haversine).
 */
export function optimizeStops(
    stops: OptimizableStop[],
    origin: LatLng | null = null,
    dist: DistanceFn = haversine,
): number[] {
    const pickups = stops.filter(s => s.type === 'pickup');
    const deliveries = stops.filter(s => s.type === 'delivery');

    function optimizeGroup(group: OptimizableStop[], groupOrigin: LatLng | null): number[] {
        const withCoords = group.filter(s => s.coords !== null);
        const withoutCoords = group.filter(s => s.coords === null);

        if (withCoords.length === 0) return group.map(s => s.id);

        const points = withCoords.map(s => s.coords as LatLng);
        const initial = nearestNeighbor(points, groupOrigin, dist);
        const optimized = withCoords.length > 2 ? twoOpt(points, initial, dist) : initial;

        return [
            ...optimized.map(i => withCoords[i].id),
            ...withoutCoords.map(s => s.id),
        ];
    }

    // Last pickup's coord becomes origin for deliveries (best geographic handoff)
    const pickupIds = optimizeGroup(pickups, origin);
    const lastPickupCoord = (() => {
        const lastId = pickupIds[pickupIds.length - 1];
        return pickups.find(p => p.id === lastId)?.coords ?? origin;
    })();

    const deliveryIds = optimizeGroup(deliveries, lastPickupCoord);

    return [...pickupIds, ...deliveryIds];
}
