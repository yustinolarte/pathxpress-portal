import { describe, it, expect } from 'vitest';
import { lookupZoneByPoint } from './zonePolygons';

describe('lookupZoneByPoint', () => {
  it('resolves a known Al Ain point to zone 2', () => {
    // Same coordinate as shared/uae.ts's CITY_CENTERS['Al Ain'].
    expect(lookupZoneByPoint(24.2075, 55.7447)).toBe(2);
  });

  it('resolves a known Dubai downtown point to zone 1', () => {
    expect(lookupZoneByPoint(25.2048, 55.2708)).toBe(1);
  });

  it('keeps the Al Qudra Road communities in Dubai zone 1', () => {
    // Real delivery pins. Town Square, Mira and DAMAC Hills 2 were zone 3 until 2026-11-01.
    expect(lookupZoneByPoint(25.0132, 55.2876)).toBe(1); // Town Square (Safi)
    expect(lookupZoneByPoint(24.9984, 55.2938)).toBe(1); // Town Square (Noor)
    expect(lookupZoneByPoint(25.0084, 55.3034)).toBe(1); // Mira 4
    expect(lookupZoneByPoint(25.0138, 55.3028)).toBe(1); // Mira Oasis 3
    expect(lookupZoneByPoint(24.9814, 55.3857)).toBe(1); // DAMAC Hills 2 (Victoria)
    expect(lookupZoneByPoint(24.9965, 55.3760)).toBe(1); // DAMAC Hills 2 (Centaury)
    expect(lookupZoneByPoint(25.0182, 55.2596)).toBe(1); // DAMAC Hills 1
    expect(lookupZoneByPoint(25.0368, 55.2746)).toBe(1); // Arabian Ranches 2
    expect(lookupZoneByPoint(25.0659, 55.3269)).toBe(1); // Arabian Ranches 3
  });

  it('resolves a point in the empty desert (Liwa) to zone 3', () => {
    expect(lookupZoneByPoint(23.14, 53.75)).toBe(3);
  });

  it('returns null for invalid/unusable coordinates', () => {
    expect(lookupZoneByPoint(NaN, 55.27)).toBeNull();
    expect(lookupZoneByPoint(25.2, NaN)).toBeNull();
    expect(lookupZoneByPoint(0, 0)).toBeNull();
    expect(lookupZoneByPoint(200, 200)).toBeNull();
  });
});
