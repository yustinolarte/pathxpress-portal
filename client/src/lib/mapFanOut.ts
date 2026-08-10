/**
 * Spreading map pins that share a location.
 *
 * Orders collected from the same shipper carry identical shipper coordinates,
 * so a route with 12 pickups from one warehouse rendered as a single clickable
 * pin with eleven markers buried underneath it — invisible and unreachable.
 *
 * Co-located pins are placed on a small circle around the true point and keep a
 * leader line back to it, so the displacement reads as "moved so you can see
 * it" rather than a quiet lie about where the stop is.
 *
 * Kept apart from OrdersMap.tsx so the geometry can be unit-tested without the
 * Google Maps SDK.
 */

export interface LatLngLike { lat: number; lng: number; }

export interface FannedPoint<T> {
    point: T;
    /** Where to draw it — displaced when it collides with others. */
    lat: number;
    lng: number;
    /** The shared true location, or null when the pin stands alone. */
    anchor: LatLngLike | null;
}

/** ~1 m: only pins that are genuinely on top of each other get fanned. */
const KEY_PRECISION = 5;
/** ~9 m at the equator, before the group-size term. */
const BASE_RADIUS_DEG = 0.00008;

export function fanOutCollisions<T extends LatLngLike>(points: T[]): FannedPoint<T>[] {
    const groups = new Map<string, T[]>();
    for (const p of points) {
        const key = `${p.lat.toFixed(KEY_PRECISION)},${p.lng.toFixed(KEY_PRECISION)}`;
        const bucket = groups.get(key);
        if (bucket) bucket.push(p);
        else groups.set(key, [p]);
    }

    const out: FannedPoint<T>[] = [];
    groups.forEach((group) => {
        if (group.length === 1) {
            out.push({ point: group[0], lat: group[0].lat, lng: group[0].lng, anchor: null });
            return;
        }

        const anchor: LatLngLike = { lat: group[0].lat, lng: group[0].lng };
        // Opens up as the group grows — a fixed radius starts self-overlapping
        // somewhere past eight pins.
        const radius = BASE_RADIUS_DEG * (1 + group.length / 8);
        // Longitude degrees narrow towards the poles; without this the ring
        // renders as a squashed ellipse rather than a circle.
        const lngScale = 1 / Math.max(0.2, Math.cos((anchor.lat * Math.PI) / 180));

        group.forEach((point, i) => {
            const angle = (2 * Math.PI * i) / group.length - Math.PI / 2; // start at 12 o'clock
            out.push({
                point,
                lat: anchor.lat + radius * Math.sin(angle),
                lng: anchor.lng + radius * Math.cos(angle) * lngScale,
                anchor,
            });
        });
    });
    return out;
}
