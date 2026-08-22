/**
 * Emirate/city → delivery zone fallback table, for callers with no coordinate
 * (bare emirate dropdowns, un-geocoded orders, CSV rows without lat/lng).
 *
 * When coordinates ARE available, server/zones/zonePolygons.ts's point-in-polygon
 * lookup against server/zones/delivery-zones.geojson is the authority instead —
 * this table is a hand-transcribed mirror of that same GeoJSON's
 * properties.emirate/zone_code pairs (kept in sync by a test that reads the
 * GeoJSON and cross-checks it against this table), duplicated here only because
 * shared/ code also runs in the browser bundle and can't read a file off disk.
 *
 * Al Ain is the one deliberate divergence from normalizeEmirate(): it collapses
 * to the canonical emirate label "Abu Dhabi" (correct for display/persistence —
 * Al Ain is administratively part of Abu Dhabi), but it must NOT inherit Abu
 * Dhabi's zone. So the raw input is checked against "al ain" before it is ever
 * run through normalizeEmirate — callers must pass the raw city/emirate string
 * here, not an already-normalized one, or Al Ain silently becomes zone 1 again.
 */
import { fold, normalizeEmirate, type UaeEmirate } from './uae';

/** Keyed by the folded (lowercase, accent-stripped) canonical emirate name. */
export const EMIRATE_TO_ZONE: Record<UaeEmirate, 1 | 2 | 3> = {
  Dubai: 1,
  'Abu Dhabi': 1,
  Sharjah: 1,
  Ajman: 1,
  'Ras Al Khaimah': 2,
  Fujairah: 2,
  'Umm Al Quwain': 2,
};

/** Zone for Al Ain specifically — see file header for why this can't just live in EMIRATE_TO_ZONE. */
const AL_AIN_ZONE = 2;

/**
 * Resolve a delivery zone from a raw emirate or city string. Defaults to zone 3
 * for anything unrecognized, matching the polygon lookup's "outside every
 * mapped urban area" default.
 */
export function resolveZoneByEmirateOrCity(input?: string | null): 1 | 2 | 3 {
  if (!input) return 3;
  const key = fold(input);
  if (!key) return 3;
  if (key === 'al ain' || key === 'al ayn') return AL_AIN_ZONE;

  const canonical = normalizeEmirate(input);
  if (canonical) return EMIRATE_TO_ZONE[canonical];

  return 3;
}

/**
 * Like normalizeEmirate(), but keeps "Al Ain" as its own string instead of
 * collapsing it into "Abu Dhabi" — for callers that still need short-code
 * expansion (e.g. "RAK" -> "Ras Al Khaimah", for clientServiceSettings
 * .availableRegions name matching) but would otherwise lose the one piece of
 * information that distinguishes Al Ain's zone from Abu Dhabi's.
 */
export function normalizeForZoneMatching(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const key = fold(raw);
  if (key === 'al ain' || key === 'al ayn') return 'Al Ain';
  return normalizeEmirate(raw) ?? undefined;
}
