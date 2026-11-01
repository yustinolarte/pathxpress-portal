/**
 * Return to Origin (RTO) — the same waybill goes back to the shipper.
 *
 * Pure functions, no DB and no React, so the portal decides when to offer the
 * action with the exact rule the server enforces.
 *
 * The swap happens IN PLACE on the order row: the driver app and the dispatch
 * map always read a delivery stop's destination from the live consignee
 * fields, so swapping them is what actually sends the driver to the shipper.
 * The original values are kept in `rtoSnapshot` (JSON) so that:
 *  - billing still prices the original destination's zone (the trip back is
 *    free — the shipment is billed once, when it closes as returned_to_sender);
 *  - the RTO can be undone (the edit form can't touch shipper fields).
 */
import { isUAEDomestic, normalizeEmirate } from './uae';

/**
 * The package has left the shipper and isn't closed yet. pending_pickup is out:
 * the package is still with the shipper — that's a cancellation, not a return.
 */
export const RTO_ELIGIBLE_STATUSES = [
    'picked_up', 'in_transit', 'out_for_delivery', 'delivery_attempted', 'failed_delivery', 'on_hold',
];

/** Order statuses an RTO can no longer be undone from. */
const RTO_CLOSED_STATUSES = ['delivered', 'returned', 'returned_to_sender', 'canceled', 'cancelled'];

/** The order fields an RTO reads and rewrites. */
export interface RtoOrderFields {
    status: string;
    isReturn: number;
    isRto: number;
    rtoSnapshot: string | null;
    shipperName: string;
    shipperAddress: string;
    shipperCity: string;
    shipperCountry: string;
    shipperPhone: string;
    shipperLat: string | null;
    shipperLng: string | null;
    customerName: string;
    customerPhone: string;
    address: string;
    city: string;
    emirate: string | null;
    postalCode: string | null;
    destinationCountry: string;
    latitude: string | null;
    longitude: string | null;
    locationAccuracy: string;
    codRequired: number;
    codAmount: string | null;
    codCurrency: string | null;
    codPaymentMethod: string | null;
    fitOnDelivery: number;
    preferredDeliveryDate: string | null;
    preferredDeliveryTime: string | null;
}

type SwappedFields = Omit<RtoOrderFields, 'isReturn' | 'isRto' | 'rtoSnapshot'>;

/** The original values, as they were before the RTO. */
export interface RtoSnapshot extends SwappedFields {
    /** The status the RTO set — undo only restores `status` if it's still this one. */
    rtoStatus: string;
}

export type RtoUpdate = SwappedFields & {
    isRto: number;
    rtoAt: Date | null;
    rtoSnapshot: string | null;
};

export function isRtoEligible(order: Pick<RtoOrderFields, 'status' | 'isReturn' | 'isRto' | 'destinationCountry'>): boolean {
    return order.isRto !== 1
        && order.isReturn !== 1
        && isUAEDomestic(order.destinationCountry)
        && RTO_ELIGIBLE_STATUSES.includes(order.status);
}

export function canUndoRto(order: Pick<RtoOrderFields, 'status' | 'isRto'>): boolean {
    return order.isRto === 1 && !RTO_CLOSED_STATUSES.includes(order.status);
}

export function parseRtoSnapshot(raw: string | null | undefined): RtoSnapshot | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as RtoSnapshot;
    } catch {
        return null;
    }
}

/**
 * Shipper ↔ consignee swap (same mapping as a return waybill, doCreateReturn).
 * COD, FOD and the preferred delivery slot belonged to the consignee's delivery
 * and are dropped — nothing is collected from the shipper. codAmount is
 * cleared too: a leftover amount with codRequired=0 still shows up as COD in
 * the driver app.
 */
export function buildRtoSwap(order: RtoOrderFields, now: Date = new Date()): RtoUpdate {
    // Already out with a driver → the existing stop now leads to the shipper.
    // Anything else goes back to in_transit so dispatch can route it again
    // (failed_delivery is hidden from the dispatch picker by default).
    const status = order.status === 'out_for_delivery' ? 'out_for_delivery' : 'in_transit';

    const snapshot: RtoSnapshot = {
        status: order.status,
        rtoStatus: status,
        shipperName: order.shipperName,
        shipperAddress: order.shipperAddress,
        shipperCity: order.shipperCity,
        shipperCountry: order.shipperCountry,
        shipperPhone: order.shipperPhone,
        shipperLat: order.shipperLat,
        shipperLng: order.shipperLng,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        address: order.address,
        city: order.city,
        emirate: order.emirate,
        postalCode: order.postalCode,
        destinationCountry: order.destinationCountry,
        latitude: order.latitude,
        longitude: order.longitude,
        locationAccuracy: order.locationAccuracy,
        codRequired: order.codRequired,
        codAmount: order.codAmount,
        codCurrency: order.codCurrency,
        codPaymentMethod: order.codPaymentMethod,
        fitOnDelivery: order.fitOnDelivery,
        preferredDeliveryDate: order.preferredDeliveryDate,
        preferredDeliveryTime: order.preferredDeliveryTime,
    };

    return {
        status,

        shipperName: order.customerName,
        shipperAddress: order.address,
        shipperCity: order.city,
        shipperCountry: order.destinationCountry,
        shipperPhone: order.customerPhone,
        shipperLat: order.latitude,
        shipperLng: order.longitude,

        customerName: order.shipperName,
        customerPhone: order.shipperPhone,
        address: order.shipperAddress,
        city: order.shipperCity,
        emirate: normalizeEmirate(order.shipperCity) ?? null,
        postalCode: null,
        destinationCountry: order.shipperCountry,
        latitude: order.shipperLat,
        longitude: order.shipperLng,
        locationAccuracy: order.shipperLat && order.shipperLng ? 'exact' : 'none',

        codRequired: 0,
        codAmount: null,
        codCurrency: null,
        codPaymentMethod: null,
        fitOnDelivery: 0,
        preferredDeliveryDate: null,
        preferredDeliveryTime: null,

        isRto: 1,
        rtoAt: now,
        rtoSnapshot: JSON.stringify(snapshot),
    };
}

/**
 * Undo: put every original value back. The status only goes back if it's still
 * the one the RTO set — if the order moved on (e.g. a driver attempted the
 * return), that newer status is kept.
 */
export function buildRtoRevert(order: RtoOrderFields): RtoUpdate | null {
    const snapshot = parseRtoSnapshot(order.rtoSnapshot);
    if (!snapshot) return null;
    const { rtoStatus, status, ...original } = snapshot;

    return {
        ...original,
        status: order.status === rtoStatus ? status : order.status,
        isRto: 0,
        rtoAt: null,
        rtoSnapshot: null,
    };
}

/** What "delivered" means for this order: an RTO handed back to the shipper is returned_to_sender. */
export function deliveredStatusFor(order: { isRto?: number | null }): 'delivered' | 'returned_to_sender' {
    return order.isRto === 1 ? 'returned_to_sender' : 'delivered';
}

/**
 * The destination billing prices against. An RTO is billed once, for the
 * original trip — so the original consignee's zone, not the shipper's.
 */
export function billingDestination(order: Pick<RtoOrderFields, 'isRto' | 'rtoSnapshot' | 'city' | 'emirate' | 'latitude' | 'longitude'>) {
    const snapshot = order.isRto === 1 ? parseRtoSnapshot(order.rtoSnapshot) : null;
    const source = snapshot ?? order;
    return {
        city: source.city,
        emirate: source.emirate,
        latitude: source.latitude,
        longitude: source.longitude,
    };
}
