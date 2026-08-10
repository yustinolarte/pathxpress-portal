/**
 * Route stop ordering — the single definition of what a valid stop sequence is.
 *
 * Pure functions, no DB and no React, so the exact same rule runs in the create
 * wizard (where stops don't exist in the database yet), in the route detail
 * sequencer, and in the server before anything is persisted.
 *
 * Business rule — pickup-before-delivery, PER ORDER:
 *   The delivery leg of order X must come after every pickup leg of order X.
 *   Different orders interleave freely: collecting in Al Quoz and dropping off
 *   next door before driving to the next pickup is the whole point of a route.
 *   The old rule ("all pickups, then all deliveries") forced the driver across
 *   the entire emirate before the first drop-off.
 *
 * A delivery whose pickup is NOT on the route is unconstrained — that's the
 * common `delivery_only` assignment, where the package is already on the van.
 */

export type StopLeg = 'pickup' | 'delivery';

/** Minimal identity any ordering check needs. */
export interface SequenceStop {
    /** Stable identity. Wizard: `${orderId}:${type}`. Route detail: routeOrders.id. */
    key: string | number;
    orderId: number;
    type: StopLeg;
}

export interface PrecedenceViolation<T> {
    /** The delivery that appears too early. */
    delivery: T;
    /** The pickup of the same order that it jumped ahead of. */
    pickup: T;
    deliveryIndex: number;
    pickupIndex: number;
}

/**
 * First pickup-before-delivery violation in `stops`, or null when the order is
 * valid. Counting rather than flag-setting is deliberate: nothing in the schema
 * stops a route from holding two pickup legs for one order, and in that case
 * *every* pickup must precede the delivery.
 */
export function findPrecedenceViolation<T extends SequenceStop>(
    stops: T[],
): PrecedenceViolation<T> | null {
    const totalPickups = new Map<number, number>();
    for (const s of stops) {
        if (s.type === 'pickup') {
            totalPickups.set(s.orderId, (totalPickups.get(s.orderId) ?? 0) + 1);
        }
    }

    const seenPickups = new Map<number, number>();
    for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        if (stop.type === 'pickup') {
            seenPickups.set(stop.orderId, (seenPickups.get(stop.orderId) ?? 0) + 1);
            continue;
        }
        const expected = totalPickups.get(stop.orderId) ?? 0;
        const seen = seenPickups.get(stop.orderId) ?? 0;
        if (seen < expected) {
            const pickupIndex = stops.findIndex(
                (p, j) => j > i && p.type === 'pickup' && p.orderId === stop.orderId,
            );
            return { delivery: stop, pickup: stops[pickupIndex], deliveryIndex: i, pickupIndex };
        }
    }

    return null;
}

export function isValidSequence(stops: SequenceStop[]): boolean {
    return findPrecedenceViolation(stops) === null;
}

/**
 * Minimal repair: every offending delivery slides down to just after the last
 * pickup of its own order; everything else keeps its relative position.
 *
 * Idempotent — a already-valid list comes back untouched. Used by the backfill
 * script and by the "Corregir orden" button on legacy routes. Never used to
 * silently overwrite an explicit admin drag: there we reject and tell them why.
 */
export function enforcePrecedence<T extends SequenceStop>(stops: T[]): T[] {
    const pendingPickups = new Map<number, number>();
    for (const s of stops) {
        if (s.type === 'pickup') {
            pendingPickups.set(s.orderId, (pendingPickups.get(s.orderId) ?? 0) + 1);
        }
    }

    const result: T[] = [];
    /** Deliveries held back because their order still owes a pickup. */
    const deferred: T[] = [];

    const releaseReady = () => {
        // A released delivery can't unblock another one, so a single pass suffices.
        for (let i = deferred.length - 1; i >= 0; i--) {
            if ((pendingPickups.get(deferred[i].orderId) ?? 0) === 0) {
                result.push(deferred.splice(i, 1)[0]);
            }
        }
    };

    for (const stop of stops) {
        if (stop.type === 'pickup') {
            result.push(stop);
            pendingPickups.set(stop.orderId, (pendingPickups.get(stop.orderId) ?? 1) - 1);
            releaseReady();
        } else if ((pendingPickups.get(stop.orderId) ?? 0) > 0) {
            deferred.push(stop);
        } else {
            result.push(stop);
        }
    }

    // Unreachable with well-formed input (every deferred delivery has a pickup
    // ahead of it by construction), but never drop a stop on the floor.
    return [...result, ...deferred];
}

/**
 * Re-pin completed stops after a drag.
 *
 * A finished stop keeps the index it already had — the driver has been there,
 * so moving it would rewrite history. The stops that are still free fill the
 * remaining slots in whatever order the drag produced.
 */
export function applyLockedPositions<T>(
    original: T[],
    dragged: T[],
    isLocked: (item: T) => boolean,
): T[] {
    if (original.length !== dragged.length) return dragged;

    const lockedAt = new Map<number, T>();
    original.forEach((item, i) => {
        if (isLocked(item)) lockedAt.set(i, item);
    });
    if (lockedAt.size === 0) return dragged;

    const free = dragged.filter(item => !isLocked(item));
    let next = 0;
    return original.map((_, i) => lockedAt.get(i) ?? free[next++]);
}
