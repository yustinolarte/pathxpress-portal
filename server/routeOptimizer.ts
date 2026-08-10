/**
 * Route optimization engine — pure functions, no DB, no network.
 *
 * Algorithm: Nearest-Neighbor greedy to get an initial tour, then 2-opt to
 * improve it. Distances default to Haversine (straight-line, free). The
 * distanceFn is injectable so Google Directions can be swapped in later with
 * zero changes to callers.
 *
 * Business rule — pickup-before-delivery, PER ORDER:
 *   The delivery leg of order X must come after every pickup leg of order X,
 *   but different orders interleave freely. Both phases enforce this natively:
 *   nearest-neighbor only considers deliveries whose pickups are already done,
 *   and 2-opt skips any inversion that would flip a pair (see twoOptPD).
 *
 *   This replaced a cruder rule — "all pickups, then all deliveries" — which
 *   forced the driver to collect across the whole emirate before the first
 *   drop-off, even when a delivery was next door to the pickup.
 *
 * The invariant itself is defined once in shared/routeSequence.ts, so the
 * wizard, the route detail sequencer and this file can't drift apart.
 */

import { enforcePrecedence } from '@shared/routeSequence';
import { haversine, type LatLng } from '@shared/geo';

export { haversine };
export type { LatLng };

export interface OptimizableStop {
    id: number;
    /** Needed to pair a delivery with its own pickup. */
    orderId: number;
    type: 'pickup' | 'delivery';
    coords: LatLng | null;
}

export type DistanceFn = (a: LatLng, b: LatLng) => number;

/**
 * Nearest-neighbor restricted to *feasible* next stops: a delivery only becomes
 * eligible once its order owes no more pickups. Returns indices into `stops`.
 */
function nearestNeighborPD(
    stops: OptimizableStop[],
    origin: LatLng | null,
    dist: DistanceFn,
): number[] {
    const pendingPickups = new Map<number, number>();
    for (const s of stops) {
        if (s.type === 'pickup') {
            pendingPickups.set(s.orderId, (pendingPickups.get(s.orderId) ?? 0) + 1);
        }
    }

    const remaining = stops.map((_, i) => i);
    const tour: number[] = [];
    let current = origin ?? stops[0].coords!;

    while (remaining.length > 0) {
        let bestPos = -1;
        let bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const stop = stops[remaining[i]];
            if (stop.type === 'delivery' && (pendingPickups.get(stop.orderId) ?? 0) > 0) continue;
            const d = dist(current, stop.coords!);
            if (d < bestDist) { bestDist = d; bestPos = i; }
        }
        // Can't deadlock — pickups are always eligible, so a blocked delivery
        // always has a pickup left to unblock it. Belt and braces anyway.
        if (bestPos === -1) bestPos = 0;

        const idx = remaining.splice(bestPos, 1)[0];
        const chosen = stops[idx];
        tour.push(idx);
        if (chosen.type === 'pickup') {
            pendingPickups.set(chosen.orderId, pendingPickups.get(chosen.orderId)! - 1);
        }
        current = chosen.coords!;
    }
    return tour;
}

/**
 * A 2-opt move reverses the window [from..to]. That flips the relative order of
 * every pair with BOTH legs inside the window, and of no pair that straddles it.
 * So the move is precedence-safe exactly when no order has two legs in there —
 * an O(window) check, not a heuristic.
 */
function windowKeepsPrecedence(
    stops: OptimizableStop[],
    order: number[],
    from: number,
    to: number,
): boolean {
    const seen = new Set<number>();
    for (let k = from; k <= to; k++) {
        const orderId = stops[order[k]].orderId;
        if (seen.has(orderId)) return false;
        seen.add(orderId);
    }
    return true;
}

function twoOptPD(stops: OptimizableStop[], order: number[], dist: DistanceFn): number[] {
    const points = stops.map(s => s.coords!);
    let improved = true;
    let best = [...order];

    while (improved) {
        improved = false;
        for (let i = 0; i < best.length - 1; i++) {
            for (let j = i + 2; j < best.length; j++) {
                if (!windowKeepsPrecedence(stops, best, i + 1, j)) continue;

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
 * Stops without coordinates are appended at the end in their original order —
 * they can't take part in a geographic tour, but they still can't jump ahead of
 * their own pickup, which the final enforcePrecedence pass guarantees.
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
    const withCoords = stops.filter(s => s.coords !== null);
    const withoutCoords = stops.filter(s => s.coords === null);

    let ordered: OptimizableStop[];
    if (withCoords.length === 0) {
        ordered = stops;
    } else {
        const initial = nearestNeighborPD(withCoords, origin, dist);
        const tour = withCoords.length > 2 ? twoOptPD(withCoords, initial, dist) : initial;
        ordered = [...tour.map(i => withCoords[i]), ...withoutCoords];
    }

    return enforcePrecedence(
        ordered.map(s => ({ key: s.id, orderId: s.orderId, type: s.type })),
    ).map(s => s.key as number);
}
