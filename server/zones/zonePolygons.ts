/**
 * Point-in-polygon delivery zone lookup, backed by server/zones/delivery-zones.geojson
 * (hand-drawn UAE urban-area polygons, source of truth maintained in QGIS).
 *
 * A point outside every drawn polygon legitimately resolves to zone 3 — that is
 * the intended meaning of "zone 3" (outside any mapped urban area), not an error.
 * `null` is reserved for genuinely unusable input (missing/invalid coordinates),
 * so callers can tell "no coordinate" apart from "coordinate says zone 3".
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// esbuild bundles server/_core/index.ts into a single dist/index.js, so
// __dirname at runtime resolves to dist/, not server/zones/ — the data file
// isn't copied there. Prefer the cwd-relative source path (works whenever the
// full repo checkout is what's actually running in production, same
// assumption server/waybillPdf.ts's logo lookup already makes), falling back
// to __dirname for the case this ever does get bundled/copied alongside its
// own directory.
function resolveGeojsonPath(): string {
  const fromCwd = path.join(process.cwd(), 'server', 'zones', 'delivery-zones.geojson');
  if (existsSync(fromCwd)) return fromCwd;
  return path.join(__dirname, 'delivery-zones.geojson');
}

// Loose plausibility box around the UAE — rejects swapped lat/lng, (0,0), and
// other garbage before it ever reaches the polygon math.
const UAE_LAT_RANGE: [number, number] = [22, 27];
const UAE_LNG_RANGE: [number, number] = [51, 57];

interface PolygonGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

interface PolygonFeature {
  type: 'Feature';
  properties: Record<string, never>;
  geometry: PolygonGeometry;
}

interface ZoneFeature {
  zone: 1 | 2;
  feature: PolygonFeature;
}

function loadZoneFeatures(): ZoneFeature[] {
  const raw = readFileSync(resolveGeojsonPath(), 'utf-8');
  const geojson = JSON.parse(raw) as { features: Array<{ properties: { zone_code: 1 | 2 }; geometry: PolygonGeometry }> };
  return geojson.features.map((f) => ({
    zone: f.properties.zone_code,
    feature: { type: 'Feature', properties: {}, geometry: f.geometry },
  }));
}

// Loaded once at module load and cached in memory — the dataset is tiny (11
// polygons) and changes only when someone deliberately re-exports it from QGIS.
const zoneFeatures = loadZoneFeatures();

/**
 * Resolve a delivery zone (1, 2, or 3) from a lat/lng pair via point-in-polygon
 * against the hand-drawn zone polygons. Returns `null` only when the input
 * coordinates themselves are unusable — callers should fall back to a
 * string-based (emirate/city) lookup in that case, not treat `null` as zone 3.
 */
export function lookupZoneByPoint(lat: number, lng: number): 1 | 2 | 3 | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < UAE_LAT_RANGE[0] || lat > UAE_LAT_RANGE[1]) return null;
  if (lng < UAE_LNG_RANGE[0] || lng > UAE_LNG_RANGE[1]) return null;

  const pt = point([lng, lat]);
  const matches = zoneFeatures.filter((zf) => booleanPointInPolygon(pt, zf.feature));

  if (matches.length > 1) {
    console.warn(`⚠️ Point (${lat}, ${lng}) matched ${matches.length} zone polygons — check server/zones/delivery-zones.geojson for overlaps.`);
  }

  if (matches.length === 0) return 3;
  return matches[0].zone;
}
