/**
 * Order status vocabulary for dispatch — the one classification every dispatch
 * rule reads (assignment flags, the scan-to-out-for-delivery transition, the
 * available-orders pool).
 *
 * Pure, no DB and no React. Before this module each rule kept its own list and
 * they drifted: `failed_pickup` was in none of them, so a pickup that failed at
 * the merchant read as "not needing a pickup" and dispatch could only re-route
 * the package as delivery-only while it was still sitting at the shipper.
 *
 * An unknown status (free-text tracking codes, typos) is never assignable —
 * a rule that silently guesses is how the drift above went unnoticed.
 */

/** The package is still with the shipper: the next leg is a pickup. */
export const NEEDS_PICKUP_ORDER_STATUSES = ['pending', 'pending_pickup', 'failed_pickup'] as const;

/** The package is with PathXpress (van or warehouse): the next leg is a delivery. */
export const IN_CUSTODY_ORDER_STATUSES = [
    'picked_up', 'in_transit', 'out_for_delivery', 'delivery_attempted', 'failed_delivery', 'on_hold',
] as const;

/** Done or dead — never offered for assignment again. Both cancel spellings exist in the data. */
export const CLOSED_ORDER_STATUSES = ['delivered', 'returned', 'returned_to_sender', 'canceled', 'cancelled'] as const;

export type OrderStatusGroup = 'needsPickup' | 'inCustody' | 'closed' | 'unknown';

const GROUP_BY_STATUS = new Map<string, OrderStatusGroup>([
    ...NEEDS_PICKUP_ORDER_STATUSES.map(s => [s, 'needsPickup'] as const),
    ...IN_CUSTODY_ORDER_STATUSES.map(s => [s, 'inCustody'] as const),
    ...CLOSED_ORDER_STATUSES.map(s => [s, 'closed'] as const),
]);

export function orderStatusGroup(status: string | null | undefined): OrderStatusGroup {
    return GROUP_BY_STATUS.get((status ?? '').trim().toLowerCase()) ?? 'unknown';
}

export const needsPickup = (status: string | null | undefined) => orderStatusGroup(status) === 'needsPickup';
export const isInCustody = (status: string | null | undefined) => orderStatusGroup(status) === 'inCustody';
export const isClosedOrderStatus = (status: string | null | undefined) => orderStatusGroup(status) === 'closed';

/**
 * Statuses a route scan moves to `out_for_delivery` for delivery-only stops:
 * every in-custody status except out_for_delivery itself, so a next-day retry
 * (delivery_attempted / failed_delivery / on_hold) logs a fresh "Out for
 * Delivery" when it goes out again, and a re-scan never revives a delivered
 * order. `pending_pickup` is kept for walk-in drop-offs that reach the
 * warehouse without a pickup event.
 */
export const OUT_FOR_DELIVERY_FROM_STATUSES: string[] = [
    'pending_pickup',
    ...IN_CUSTODY_ORDER_STATUSES.filter(s => s !== 'out_for_delivery'),
];
