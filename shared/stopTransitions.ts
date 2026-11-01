/**
 * Route stop status rules — the single definition of which stop status changes
 * are allowed, what they do to the order, and when a route is done.
 *
 * Pure functions, no DB. The driver app endpoints, the admin status sync and the
 * admin "correct stop" tool all run these exact rules (server/stopStatus.ts).
 *
 * Why it exists: before, three write paths each wrote stop/order statuses with
 * no validation. A replayed offline request could roll a delivered order back
 * to out_for_delivery, a delivery could be closed before its pickup, and a
 * failed pickup left its delivery open forever so the route never finished.
 *
 * Statuses per leg:
 *   open        pending, in_progress            — not worked yet
 *   retryable   attempted, on_hold (delivery)   — worked, can still be retried
 *               on_hold (pickup)                  on the same route
 *   final       pickup:   picked_up, failed, attempted
 *               delivery: delivered, failed, returned
 * A pickup attempt is final: the order goes back to the pool as failed_pickup
 * and is re-dispatched with a fresh pickup leg (decided 2026-10-31).
 */
import type { StopLeg } from './routeSequence';

export type { StopLeg };

export const STOP_STATUSES = [
    'pending', 'in_progress', 'picked_up', 'delivered', 'attempted', 'returned', 'failed', 'on_hold',
] as const;
export type StopStatus = typeof STOP_STATUSES[number];

export type StopActor = 'driver' | 'admin';

const OPEN: readonly StopStatus[] = ['pending', 'in_progress'];

const LEG_RULES: Record<StopLeg, { retryable: readonly StopStatus[]; final: readonly StopStatus[] }> = {
    pickup: { retryable: ['on_hold'], final: ['picked_up', 'failed', 'attempted'] },
    delivery: { retryable: ['attempted', 'on_hold'], final: ['delivered', 'failed', 'returned'] },
};

export function isStopStatus(value: unknown): value is StopStatus {
    return typeof value === 'string' && (STOP_STATUSES as readonly string[]).includes(value);
}

export function legOf(type: string | null | undefined): StopLeg {
    return type === 'pickup' ? 'pickup' : 'delivery';
}

export const isStopOpen = (status: string | null | undefined) =>
    OPEN.includes((status ?? 'pending') as StopStatus);

export const isStopFinal = (leg: StopLeg, status: string | null | undefined) =>
    LEG_RULES[leg].final.includes(status as StopStatus);

export const isStopRetryable = (leg: StopLeg, status: string | null | undefined) =>
    LEG_RULES[leg].retryable.includes(status as StopStatus);

/** Worked for this route's purposes: final, or retryable. */
export const isStopSettled = (leg: StopLeg, status: string | null | undefined) =>
    isStopFinal(leg, status) || isStopRetryable(leg, status);

/** The statuses a stop of this leg may hold at all. */
export function validStatusesFor(leg: StopLeg): StopStatus[] {
    return [...OPEN, ...LEG_RULES[leg].retryable, ...LEG_RULES[leg].final];
}

export type TransitionVerdict =
    | { kind: 'ok' }
    /** Already in that status — a replay. Write nothing, answer with the current state. */
    | { kind: 'noop' }
    /** A legitimate status, but not from where the stop is now. */
    | { kind: 'conflict'; reason: string }
    /** Not a status this leg can hold. */
    | { kind: 'invalid'; reason: string };

/**
 * Whether `actor` may move a `leg` stop from `from` to `to`.
 *
 * Driver: open → anything valid; retryable → another outcome (the afternoon
 * retry); final → only the same status again (noop). Repeating a retryable
 * status is also a noop: a second identical request is far more likely an
 * offline replay than a second attempt, and duplicating it double-logs events.
 *
 * Admin: anything valid, from anywhere — that is how mistakes get corrected.
 */
export function checkStopTransition(leg: StopLeg, from: string | null | undefined, to: string, actor: StopActor): TransitionVerdict {
    const current = (from ?? 'pending') as StopStatus;
    if (!isStopStatus(to) || !validStatusesFor(leg).includes(to)) {
        return { kind: 'invalid', reason: `'${to}' is not a valid status for a ${leg} stop` };
    }
    if (current === to) return { kind: 'noop' };
    if (actor === 'admin') return { kind: 'ok' };

    if (isStopFinal(leg, current)) {
        return { kind: 'conflict', reason: `This ${leg} stop is already ${current.replace('_', ' ')}` };
    }
    if (OPEN.includes(to)) {
        // The app may mark a pending stop in_progress; it can never re-open a worked one.
        return current === 'pending' && to === 'in_progress'
            ? { kind: 'ok' }
            : { kind: 'conflict', reason: `A ${leg} stop that was already worked cannot go back to ${to.replace('_', ' ')}` };
    }
    return { kind: 'ok' };
}

/** What a stop change implies for the other leg of the same order on the same route. */
export type SiblingEffect =
    | { kind: 'none' }
    /** The package was delivered/attempted, so it was in hand: close the open pickup. */
    | { kind: 'completeSiblingPickup' }
    /** The pickup failed: there is nothing to deliver. Close the delivery as failed. */
    | { kind: 'failSiblingDelivery' }
    | { kind: 'conflict'; reason: string };

/**
 * Pair rule for one order's two legs on one route. `sibling` is the other leg's
 * current status, or undefined when it isn't on this route (delivery-only or
 * pickup-only assignment — unconstrained).
 *
 * A delivery outcome while the pickup is still open completes the pickup
 * instead of being rejected: the driver can only attempt a delivery with the
 * package in hand, and the offline queue may deliver the two taps out of order.
 * The late pickup then lands as a noop.
 */
export function siblingEffect(leg: StopLeg, to: StopStatus, sibling: string | null | undefined, actor: StopActor): SiblingEffect {
    if (sibling === undefined || sibling === null) return { kind: 'none' };
    if (leg === 'delivery') {
        if (OPEN.includes(to)) return { kind: 'none' };
        if (sibling === 'failed' || sibling === 'attempted') {
            return actor === 'admin'
                ? { kind: 'none' }
                : { kind: 'conflict', reason: 'The pickup of this order failed — there is nothing to deliver' };
        }
        return isStopOpen(sibling) || sibling === 'on_hold' ? { kind: 'completeSiblingPickup' } : { kind: 'none' };
    }
    if ((to === 'failed' || to === 'attempted') && !isStopFinal('delivery', sibling)) {
        return { kind: 'failSiblingDelivery' };
    }
    return { kind: 'none' };
}

export interface OrderStatusChange {
    /** New orders.status, or null to leave the order untouched. */
    status: string | null;
    /** Tracking events to log, oldest first. */
    events: { statusCode: string; statusLabel: string }[];
}

export interface OrderStatusContext {
    /** This order also has a delivery leg on the same route (pickup → straight out for delivery). */
    hasDeliveryLegOnRoute: boolean;
    /** What a successful delivery closes as — `deliveredStatusFor(order)` from shared/rto. */
    deliveredStatus: string;
    /** The route is on the road (decides where a reverted delivery stop leaves the package). */
    routeInProgress: boolean;
}

const LABELS: Record<string, string> = {
    picked_up: 'Picked Up',
    out_for_delivery: 'Out for Delivery',
    in_transit: 'In Transit',
    pending_pickup: 'Pending Pickup',
    delivered: 'Delivered',
    returned_to_sender: 'Returned to Sender',
    delivery_attempted: 'Delivery Attempted',
    failed_delivery: 'Failed Delivery',
    returned: 'Returned',
    on_hold: 'On Hold',
};

const single = (statusCode: string, statusLabel = LABELS[statusCode] ?? statusCode): OrderStatusChange =>
    ({ status: statusCode, events: [{ statusCode, statusLabel }] });

/** The order status (and tracking events) a stop reaching `to` produces. */
export function orderStatusForStop(leg: StopLeg, to: StopStatus, ctx: OrderStatusContext): OrderStatusChange {
    if (leg === 'pickup') {
        switch (to) {
            case 'picked_up':
                return ctx.hasDeliveryLegOnRoute
                    ? {
                        status: 'out_for_delivery',
                        events: [
                            { statusCode: 'picked_up', statusLabel: LABELS.picked_up },
                            { statusCode: 'out_for_delivery', statusLabel: LABELS.out_for_delivery },
                        ],
                    }
                    : single('picked_up');
            case 'failed': return single('failed_pickup', 'Pickup Failed');
            case 'attempted': return single('failed_pickup', 'Pickup Attempted');
            case 'pending':
            case 'in_progress': return single('pending_pickup');
            default: return { status: null, events: [] }; // on_hold pickup: stop-level only
        }
    }
    switch (to) {
        case 'delivered': return single(ctx.deliveredStatus);
        case 'attempted': return single('delivery_attempted');
        case 'failed': return single('failed_delivery');
        case 'returned': return single('returned');
        case 'on_hold': return single('on_hold');
        default: return single(ctx.routeInProgress ? 'out_for_delivery' : 'in_transit');
    }
}

/**
 * The stop status an admin order-status change implies for each leg, or null
 * when that leg should be left alone. Mirrors orderStatusForStop in reverse so
 * a manual status change (or a correction) keeps the route stops truthful.
 */
export function stopStatusForOrderStatus(leg: StopLeg, orderStatus: string): StopStatus | null {
    const s = orderStatus.trim().toLowerCase();
    if (leg === 'pickup') {
        if (s === 'pending_pickup' || s === 'pending') return 'pending';
        if (s === 'failed_pickup') return 'failed';
        // The package left the shipper — any in-custody or delivered state implies the pickup happened.
        if (['picked_up', 'in_transit', 'out_for_delivery', 'delivery_attempted', 'failed_delivery',
            'delivered', 'returned_to_sender', 'returned'].includes(s)) return 'picked_up';
        return null;
    }
    switch (s) {
        case 'delivered':
        case 'returned_to_sender': return 'delivered';
        case 'delivery_attempted': return 'attempted';
        case 'failed_delivery': return 'failed';
        case 'returned': return 'returned';
        case 'on_hold': return 'on_hold';
        case 'pending_pickup':
        case 'pending':
        case 'picked_up':
        case 'in_transit':
        case 'out_for_delivery': return 'pending';
        default: return null;
    }
}

export interface StopLike { type: string | null | undefined; status: string | null | undefined; }

/** Every stop is final — nothing left for the driver to do. The server auto-completes the route. */
export function isRouteFinished(stops: StopLike[]): boolean {
    return stops.length > 0 && stops.every(s => isStopFinal(legOf(s.type), s.status));
}

/** Every stop was worked at least once (finals plus retryable attempts/holds). */
export function isRouteSettled(stops: StopLike[]): boolean {
    return stops.length > 0 && stops.every(s => isStopSettled(legOf(s.type), s.status));
}

export type RouteStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

/**
 * Route status changes the driver app may request. The app starts a route and
 * finishes it; it can never cancel one or re-open a closed one (a late replay
 * of "in_progress" used to resurrect completed routes).
 */
export function checkDriverRouteTransition(from: RouteStatus, to: string): TransitionVerdict {
    if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(to)) {
        return { kind: 'invalid', reason: `'${to}' is not a route status` };
    }
    if (from === to) return { kind: 'noop' };
    if (from === 'pending' && to === 'in_progress') return { kind: 'ok' };
    if (from === 'in_progress' && to === 'completed') return { kind: 'ok' };
    if (from === 'completed' || from === 'cancelled') {
        return { kind: 'conflict', reason: `This route is already ${from}` };
    }
    return { kind: 'conflict', reason: `A driver cannot move a route from ${from.replace('_', ' ')} to ${to.replace('_', ' ')}` };
}
