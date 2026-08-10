/**
 * Great-circle distance. Lives in shared/ because the route optimizer (server)
 * and the stop sequencer's "~X km" summary (client) must agree to the metre —
 * otherwise the distance dispatch sees isn't the one the optimizer minimised.
 */

export interface LatLng {
    lat: number;
    lng: number;
}

/** Metres between two coordinates. */
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

/** Total metres walking a list of points in order, optionally from an origin. */
export function pathLength(points: LatLng[], origin: LatLng | null = null): number {
    const all = origin ? [origin, ...points] : points;
    let total = 0;
    for (let i = 0; i < all.length - 1; i++) total += haversine(all[i], all[i + 1]);
    return total;
}
