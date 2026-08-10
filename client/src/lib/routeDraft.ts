/**
 * The stop list a route is built from, before it exists in the database.
 *
 * Kept apart from RouteStopSequencer.tsx so the shape and the expansion rule
 * can be unit-tested without pulling in React, the map, or framer-motion.
 */

import { stopLegCoords } from './orderFilters';

export interface SequencerStop {
    /** Stable identity. Wizard: `${orderId}:${type}`. Detail: String(routeOrders.id). */
    key: string;
    orderId: number;
    type: 'pickup' | 'delivery';
    /** routeOrders.id — absent in the wizard, where the stop isn't persisted yet. */
    stopId?: number;
    waybillNumber: string;
    customerName?: string | null;
    city?: string | null;
    address?: string | null;
    companyName?: string | null;
    /** Returns swap which end is the shipper — needed to know which pin to edit. */
    isReturn?: number;
    serviceType?: string | null;
    codRequired?: number | boolean | null;
    codAmount?: string | number | null;
    pieces?: number | null;
    weight?: string | number | null;
    /** Already resolved for THIS leg (see stopLegCoords). null = no pin. */
    lat: number | null;
    lng: number | null;
    accuracy?: string | null;
    /** Finished stop: can't be dragged, keeps its index. */
    locked?: boolean;
    status?: string | null;
}

export type DraftSelection = { id: number; mode: 'pickup_only' | 'delivery_only' | 'both' };

const LEGS: Record<DraftSelection['mode'], Array<'pickup' | 'delivery'>> = {
    both: ['pickup', 'delivery'],
    pickup_only: ['pickup'],
    delivery_only: ['delivery'],
};

/**
 * Expand the picked orders into ordered stop legs.
 *
 * `previous` is merged in on purpose: going back to "Paquetes" to add one more
 * order must not throw away the sequence the admin already arranged, so keys
 * that survive keep their position and only genuinely new legs land at the end.
 *
 * A pickup shows the shipper's name and city (that's the address the driver
 * drives to), a delivery shows the consignee's — the same split the driver app
 * and the server's coordinate resolver make.
 */
export function buildDraftStops(
    selected: DraftSelection[],
    ordersById: Map<number, any>,
    previous: SequencerStop[] = [],
): SequencerStop[] {
    const fresh: SequencerStop[] = [];

    for (const sel of selected) {
        const order = ordersById.get(sel.id);
        if (!order) continue;

        for (const type of LEGS[sel.mode] ?? []) {
            const coords = stopLegCoords({ ...order, type });
            const isPickup = type === 'pickup';
            fresh.push({
                key: `${sel.id}:${type}`,
                orderId: sel.id,
                type,
                waybillNumber: order.waybillNumber,
                customerName: isPickup ? (order.shipperName || order.customerName) : order.customerName,
                city: isPickup ? (order.shipperCity || order.city) : order.city,
                address: order.address,
                companyName: order.companyName,
                isReturn: order.isReturn,
                serviceType: order.serviceType,
                codRequired: order.codRequired,
                codAmount: order.codAmount,
                pieces: order.pieces,
                weight: order.weight,
                lat: coords.lat,
                lng: coords.lng,
                accuracy: coords.accuracy,
            });
        }
    }

    const byKey = new Map(fresh.map(s => [s.key, s]));
    const kept = previous.filter(p => byKey.has(p.key)).map(p => byKey.get(p.key)!);
    const keptKeys = new Set(kept.map(k => k.key));
    return [...kept, ...fresh.filter(s => !keptKeys.has(s.key))];
}
