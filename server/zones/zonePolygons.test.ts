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
