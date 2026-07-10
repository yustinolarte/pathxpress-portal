/**
 * Server-side geocoding via the Google Geocoding API.
 *
 * Turns the written address of an order into coordinates when no pin was
 * placed at creation time. Results are always stored as 'approximate' —
 * only a human pin (LocationPicker) or the WhatsApp location bot produce
 * 'exact' coordinates.
 *
 * Requires GOOGLE_MAPS_API_KEY (a server key, IP-restricted, Geocoding API
 * only). When it's missing every function here is a silent no-op so the rest
 * of the app keeps working.
 */
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from './db';
import { orders } from '../drizzle/schema';
import { ENV } from './_core/env';

export interface GeocodeResult {
    lat: string;
    lng: string;
    formattedAddress: string;
}

// Result types that place the pin at street/building level. City-centroid
// results (locality etc.) are rejected: a false cluster of pins at "Dubai
// center" is worse than leaving the order in the "sin ubicación" panel.
const ACCEPTED_LOCATION_TYPES = new Set(['ROOFTOP', 'RANGE_INTERPOLATED', 'GEOMETRIC_CENTER']);
const CITY_LEVEL_TYPES = new Set([
    'locality', 'sublocality', 'administrative_area_level_1',
    'administrative_area_level_2', 'country', 'postal_code', 'political',
]);

export function isGeocodingConfigured(): boolean {
    return Boolean(ENV.googleMapsApiKey);
}

// Spelling variants of "UAE" seen in real order data. Empty/missing counts as
// domestic — local orders sometimes omit the country.
const UAE_COUNTRY_VARIANTS = new Set([
    'UAE', 'UNITED ARAB EMIRATES', 'U.A.E', 'U.A.E.', 'AE', 'EMIRATES',
]);

export function isUAEDomestic(country: string | null | undefined): boolean {
    const normalized = (country ?? '').trim().toUpperCase();
    return normalized === '' || UAE_COUNTRY_VARIANTS.has(normalized);
}

/**
 * Geocode a written address within the UAE. Never throws: returns null on
 * missing key, network errors, ZERO_RESULTS, quota errors, or when Google
 * only finds a city-level match.
 */
export async function geocodeAddress(parts: {
    address: string;
    city?: string | null;
    emirate?: string | null;
}): Promise<GeocodeResult | null> {
    if (!ENV.googleMapsApiKey) return null;

    const query = [parts.address, parts.city, parts.emirate, 'UAE']
        .filter((p) => p && String(p).trim())
        .join(', ');
    if (!query) return null;

    try {
        const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        url.searchParams.set('address', query);
        url.searchParams.set('components', 'country:AE');
        url.searchParams.set('key', ENV.googleMapsApiKey);

        const res = await fetch(url.toString());
        if (!res.ok) {
            console.warn(`[Geocoding] HTTP ${res.status} for "${query}"`);
            return null;
        }
        const data: any = await res.json();

        if (data.status === 'OVER_QUERY_LIMIT') {
            console.warn('[Geocoding] OVER_QUERY_LIMIT — check quota/billing');
            return null;
        }
        if (data.status !== 'OK' || !data.results?.length) return null;

        const result = data.results[0];
        const locationType = result.geometry?.location_type;
        if (!ACCEPTED_LOCATION_TYPES.has(locationType)) return null;

        // Reject matches whose types are ONLY city-level (no street/building).
        const types: string[] = result.types || [];
        if (types.length > 0 && types.every((t) => CITY_LEVEL_TYPES.has(t))) return null;

        const loc = result.geometry?.location;
        if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') return null;

        return {
            lat: String(loc.lat),
            lng: String(loc.lng),
            formattedAddress: result.formatted_address || query,
        };
    } catch (error) {
        console.warn('[Geocoding] Request failed:', error);
        return null;
    }
}

/**
 * Fire-and-forget: geocode an order's consignee address and store the result
 * as 'approximate' — but only if the row STILL has no coordinates, so a pin
 * from the WhatsApp bot (always 'exact') is never overwritten.
 */
export function geocodeAndStoreOrderLocation(
    orderId: number,
    parts: { address: string; city?: string | null; emirate?: string | null },
): void {
    if (!ENV.googleMapsApiKey) return;

    (async () => {
        const result = await geocodeAddress(parts);
        if (!result) return;

        const db = await getDb();
        if (!db) return;

        await db.update(orders)
            .set({ latitude: result.lat, longitude: result.lng, locationAccuracy: 'approximate' })
            .where(and(
                eq(orders.id, orderId),
                sql`(${orders.latitude} IS NULL OR ${orders.latitude} = '')`,
            ));
    })().catch((error) => {
        console.warn(`[Geocoding] Failed to geocode order ${orderId}:`, error);
    });
}

/**
 * Batch-geocode active orders that still have no coordinates. Human-triggered
 * (admin button) and capped per call so Google billing stays under control —
 * the UI shows `remaining` and the admin clicks again until it hits zero.
 */
export async function geocodePendingOrders(limit: number): Promise<{
    processed: number;
    geocoded: number;
    skipped: number;
    remaining: number;
}> {
    if (!ENV.googleMapsApiKey) {
        return { processed: 0, geocoded: 0, skipped: 0, remaining: 0 };
    }

    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const { TERMINAL_ORDER_STATUSES, DOMESTIC_COUNTRY_SQL } = await import('./driverAdmin');
    const { notInArray } = await import('drizzle-orm');

    const pendingWhere = and(
        sql`(${orders.latitude} IS NULL OR ${orders.latitude} = '')`,
        notInArray(orders.status, TERMINAL_ORDER_STATUSES),
        DOMESTIC_COUNTRY_SQL,
    );

    const batch = await db
        .select({ id: orders.id, address: orders.address, city: orders.city, emirate: orders.emirate })
        .from(orders)
        .where(pendingWhere)
        .limit(limit);

    let geocoded = 0;
    for (const order of batch) {
        const result = await geocodeAddress(order);
        if (result) {
            await db.update(orders)
                .set({ latitude: result.lat, longitude: result.lng, locationAccuracy: 'approximate' })
                .where(and(
                    eq(orders.id, order.id),
                    sql`(${orders.latitude} IS NULL OR ${orders.latitude} = '')`,
                ));
            geocoded++;
        }
        // Pace requests well under the Geocoding API default quota.
        await new Promise((r) => setTimeout(r, 150));
    }

    const [{ remaining }] = await db
        .select({ remaining: sql<number>`cast(count(*) as unsigned)` })
        .from(orders)
        .where(pendingWhere);

    return {
        processed: batch.length,
        geocoded,
        skipped: batch.length - geocoded,
        remaining: Number(remaining),
    };
}

/**
 * Fire-and-forget: geocode the shipper (pickup) address of an order and store
 * shipperLat/shipperLng if still empty. Pickup stops happen at the shipper.
 */
export function geocodeAndStoreShipperLocation(
    orderId: number,
    parts: { address: string; city?: string | null },
): void {
    if (!ENV.googleMapsApiKey) return;

    (async () => {
        const result = await geocodeAddress(parts);
        if (!result) return;

        const db = await getDb();
        if (!db) return;

        await db.update(orders)
            .set({ shipperLat: result.lat, shipperLng: result.lng })
            .where(and(
                eq(orders.id, orderId),
                sql`(${orders.shipperLat} IS NULL OR ${orders.shipperLat} = '')`,
            ));
    })().catch((error) => {
        console.warn(`[Geocoding] Failed to geocode shipper for order ${orderId}:`, error);
    });
}
