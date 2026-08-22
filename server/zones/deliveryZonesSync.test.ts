/**
 * Guards against server/zones/delivery-zones.geojson (the polygon source of
 * truth) drifting silently from shared/deliveryZones.ts's hand-transcribed
 * EMIRATE_TO_ZONE fallback table — since shared/ code also runs in the
 * browser bundle and can't read the GeoJSON off disk, that table has to be
 * kept in sync by hand. This test is the tripwire for when someone updates
 * one and forgets the other.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { resolveZoneByEmirateOrCity } from '@shared/deliveryZones';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface GeoJsonZoneFeature {
  properties: { emirate: string; zone_code: 1 | 2 };
}

describe('delivery-zones.geojson vs shared/deliveryZones.ts', () => {
  it('agrees on every emirate the GeoJSON carries a zone for', () => {
    const raw = readFileSync(path.join(__dirname, 'delivery-zones.geojson'), 'utf-8');
    const geojson = JSON.parse(raw) as { features: GeoJsonZoneFeature[] };

    const seen = new Map<string, 1 | 2>();
    for (const f of geojson.features) {
      const emirate = f.properties.emirate;
      const zone = f.properties.zone_code;
      const prior = seen.get(emirate);
      if (prior !== undefined) {
        expect(prior, `GeoJSON has conflicting zone_code for "${emirate}"`).toBe(zone);
      }
      seen.set(emirate, zone);
    }

    expect(seen.size).toBeGreaterThan(0);
    for (const [emirate, zone] of seen) {
      expect(resolveZoneByEmirateOrCity(emirate), `shared/deliveryZones.ts disagrees on "${emirate}"`).toBe(zone);
    }
  });
});
