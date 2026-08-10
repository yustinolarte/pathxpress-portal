/**
 * Pins that share a location used to stack: a route with 12 pickups from the
 * same shipper drew one clickable marker with eleven buried underneath it.
 */
import { describe, expect, it } from "vitest";
import { fanOutCollisions } from "../client/src/lib/mapFanOut";

const P = (id: string, lat: number, lng: number) => ({ id, lat, lng });
const DUBAI = { lat: 25.1972, lng: 55.2744 };

/** Metres between two close points — flat approximation is plenty at this scale. */
function metresApart(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const dLat = (a.lat - b.lat) * 111_320;
    const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
    return Math.hypot(dLat, dLng);
}

describe("fanOutCollisions", () => {
    it("leaves a lone pin exactly where it is, with no anchor", () => {
        const [out] = fanOutCollisions([P("a", DUBAI.lat, DUBAI.lng)]);
        expect(out.lat).toBe(DUBAI.lat);
        expect(out.lng).toBe(DUBAI.lng);
        expect(out.anchor).toBeNull();
    });

    it("leaves distinct locations untouched", () => {
        const pts = [P("a", 25.1972, 55.2744), P("b", 25.0802, 55.1402)];
        const out = fanOutCollisions(pts);
        expect(out.every(o => o.anchor === null)).toBe(true);
        expect(out.map(o => o.lat)).toEqual([25.1972, 25.0802]);
    });

    it("separates pins sharing a location and anchors them to the true point", () => {
        const pts = Array.from({ length: 4 }, (_, i) => P(`p${i}`, DUBAI.lat, DUBAI.lng));
        const out = fanOutCollisions(pts);

        expect(out).toHaveLength(4);
        expect(out.every(o => o.anchor?.lat === DUBAI.lat && o.anchor?.lng === DUBAI.lng)).toBe(true);

        // Every drawn position is unique — that's the whole point.
        const drawn = new Set(out.map(o => `${o.lat},${o.lng}`));
        expect(drawn.size).toBe(4);
    });

    it("keeps the displacement small enough to stay honest (under ~30 m)", () => {
        const pts = Array.from({ length: 6 }, (_, i) => P(`p${i}`, DUBAI.lat, DUBAI.lng));
        for (const o of fanOutCollisions(pts)) {
            const d = metresApart({ lat: o.lat, lng: o.lng }, DUBAI);
            expect(d).toBeGreaterThan(1);
            expect(d).toBeLessThan(30);
        }
    });

    it("keeps pins apart as the group grows — 12 pickups from one warehouse", () => {
        const pts = Array.from({ length: 12 }, (_, i) => P(`p${i}`, DUBAI.lat, DUBAI.lng));
        const out = fanOutCollisions(pts);

        let closest = Infinity;
        for (let i = 0; i < out.length; i++) {
            for (let j = i + 1; j < out.length; j++) {
                closest = Math.min(closest, metresApart(out[i], out[j]));
            }
        }
        // Pins render ~28px wide; a few metres of separation is enough to click them apart.
        expect(closest).toBeGreaterThan(3);
    });

    it("is deterministic — same input, same layout, so pins never hop between renders", () => {
        const pts = Array.from({ length: 5 }, (_, i) => P(`p${i}`, DUBAI.lat, DUBAI.lng));
        expect(fanOutCollisions(pts)).toEqual(fanOutCollisions(pts));
    });

    it("fans each cluster independently", () => {
        const pts = [
            P("a1", 25.1972, 55.2744), P("a2", 25.1972, 55.2744),
            P("b1", 25.0802, 55.1402), P("b2", 25.0802, 55.1402), P("b3", 25.0802, 55.1402),
        ];
        const out = fanOutCollisions(pts);
        expect(out.filter(o => o.anchor?.lat === 25.1972)).toHaveLength(2);
        expect(out.filter(o => o.anchor?.lat === 25.0802)).toHaveLength(3);
    });

    it("does not treat merely nearby pins as co-located", () => {
        // ~50 m apart: distinct addresses, must not be fanned.
        const out = fanOutCollisions([P("a", 25.1972, 55.2744), P("b", 25.1977, 55.2744)]);
        expect(out.every(o => o.anchor === null)).toBe(true);
    });

    it("preserves every input point", () => {
        const pts = Array.from({ length: 7 }, (_, i) => P(`p${i}`, DUBAI.lat, DUBAI.lng));
        const out = fanOutCollisions(pts);
        expect(new Set(out.map(o => o.point.id)).size).toBe(7);
    });
});
