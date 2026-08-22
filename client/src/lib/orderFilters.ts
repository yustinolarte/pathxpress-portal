/**
 * Client-side filtering of available orders for the dispatch map + pickers.
 * getAvailableOrders already returns the full active set, so filtering locally
 * keeps map, panel and pick list on one source of truth.
 */
import { resolveZoneByEmirateOrCity } from '@shared/deliveryZones';

export type ZoneName = 'ZONA 1' | 'ZONA 2' | 'ZONA 3';

export function zoneForOrder(order: { emirate?: string | null; city?: string | null }): ZoneName {
  const zone = resolveZoneByEmirateOrCity(order.emirate || order.city || undefined);
  return zone === 1 ? 'ZONA 1' : zone === 2 ? 'ZONA 2' : 'ZONA 3';
}

export type OrderTypeFilter = 'all' | 'pickup' | 'delivery' | 'return' | 'exchange';

export interface DispatchFilterState {
  status: string;        // '' = all
  emirate: string;       // '' = all
  zone: string;          // '' = all, else 'ZONA 1' | 'ZONA 2' | 'ZONA 3'
  type: OrderTypeFilter;
  dateFrom: string;      // yyyy-mm-dd over createdAt, '' = no bound
  dateTo: string;
  search: string;        // waybill / customer / address
}

export const EMPTY_DISPATCH_FILTERS: DispatchFilterState = {
  status: '',
  emirate: '',
  zone: '',
  type: 'all',
  dateFrom: '',
  dateTo: '',
  search: '',
};

export function hasActiveFilters(f: DispatchFilterState): boolean {
  return Boolean(f.status || f.emirate || f.zone || f.type !== 'all' || f.dateFrom || f.dateTo || f.search.trim());
}

function matchesType(order: any, type: OrderTypeFilter): boolean {
  switch (type) {
    case 'all': return true;
    case 'return': return order.isReturn === 1 || order.orderType === 'return';
    case 'exchange': return order.orderType === 'exchange';
    case 'pickup': return Boolean(order.canPickup);
    case 'delivery': return Boolean(order.canDeliver);
  }
}

// Already failed once — still assignable (not a terminal status, so retrying is
// possible), but kept off the dispatch map/list by default to avoid clutter.
// Filtering explicitly by one of these statuses (where supported) brings it back into view.
export const HIDDEN_BY_DEFAULT_STATUSES = new Set(['failed_pickup', 'failed_delivery']);

/**
 * The default assignable pool: everything getAvailableOrders() returned minus the
 * already-failed orders, which are retryable but would otherwise dominate the list.
 *
 * Every picker must go through this — Create Route, Add Orders and the dispatch
 * board's unassigned panel. Each used to inline its own copy of this rule, and the
 * one that forgot showed more than twice as many orders as the others.
 *
 * Orders already selected stay visible whatever their status, so a deliberate pick
 * (e.g. a retry chosen from an explicit status filter) can still be reviewed and
 * deselected instead of vanishing from under the cursor.
 */
export function pickableOrders<T extends { id: number; status: string }>(
  orders: T[] | undefined,
  selectedIds: Iterable<number> = [],
  { includeFailed = false }: { includeFailed?: boolean } = {},
): T[] {
  if (!orders) return [];
  if (includeFailed) return orders;
  const keep = new Set(selectedIds);
  return orders.filter(o => !HIDDEN_BY_DEFAULT_STATUSES.has(o.status) || keep.has(o.id));
}

/** How many orders the default pool is holding back — for a "show them" affordance. */
export function countHiddenByDefault<T extends { status: string }>(orders: T[] | undefined): number {
  if (!orders) return 0;
  return orders.filter(o => HIDDEN_BY_DEFAULT_STATUSES.has(o.status)).length;
}

export function filterAvailableOrders(orders: any[], f: DispatchFilterState): any[] {
  const q = f.search.trim().toLowerCase();
  const from = f.dateFrom ? new Date(`${f.dateFrom}T00:00:00`) : null;
  const to = f.dateTo ? new Date(`${f.dateTo}T23:59:59.999`) : null;

  return orders.filter((o: any) => {
    if (HIDDEN_BY_DEFAULT_STATUSES.has(o.status) && f.status !== o.status) return false;
    if (f.status && o.status !== f.status) return false;
    if (f.emirate && (o.emirate || '').trim().toLowerCase() !== f.emirate.toLowerCase()) return false;
    if (f.zone && zoneForOrder(o) !== f.zone) return false;
    if (!matchesType(o, f.type)) return false;

    if (from || to) {
      const created = o.createdAt ? new Date(o.createdAt) : null;
      if (!created || Number.isNaN(created.getTime())) return false;
      if (from && created < from) return false;
      if (to && created > to) return false;
    }

    if (q) {
      const hit =
        o.waybillNumber?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.address?.toLowerCase().includes(q) ||
        o.city?.toLowerCase().includes(q);
      if (!hit) return false;
    }

    return true;
  });
}

/** Distinct, non-empty emirates present in the data (for the filter dropdown). */
export function distinctEmirates(orders: any[]): string[] {
  const set = new Map<string, string>();
  for (const o of orders) {
    const raw = (o.emirate || '').trim();
    if (raw) set.set(raw.toLowerCase(), raw);
  }
  return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
}

/** Distinct statuses present in the data (for the filter dropdown). */
export function distinctStatuses(orders: any[]): string[] {
  const set = new Set<string>();
  for (const o of orders) if (o.status) set.add(o.status);
  return Array.from(set).sort();
}

// ── Stop leg geography ────────────────────────────────────────────────────
// A route stop is one LEG of an order, and the two legs sit at different
// addresses. Everything that draws or corrects a stop pin goes through here so
// the map, the "Ubicar" dialog and the server's optimizer agree on which end of
// the order a given stop refers to.

/**
 * A pickup stop happens at the shipper (except on returns, where the pickup
 * is at the consignee and the "delivery" leg goes back to the shipper) — so
 * the non-consignee side always corresponds to the shipperLat/shipperLng
 * columns on the order.
 */
export function stopLocationTarget(d: { type?: string; isReturn?: number }): 'delivery' | 'shipper' {
  const consigneeSide = d.isReturn === 1 ? d.type === 'pickup' : d.type !== 'pickup';
  return consigneeSide ? 'delivery' : 'shipper';
}

export interface LegCoordSource {
  type?: string;
  isReturn?: number;
  latitude?: string | number | null;
  longitude?: string | number | null;
  shipperLat?: string | number | null;
  shipperLng?: string | number | null;
  locationAccuracy?: string | null;
}

export interface LegCoords {
  lat: number | null;
  lng: number | null;
  accuracy: string | null;
  /** True when the shipper leg had to borrow the consignee pin. */
  approx: boolean;
}

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Coordinates for one stop leg. Mirrors resolveStopCoords() in
 * server/driverAdmin.ts, fallback included: a shipper-side leg with no
 * shipperLat/Lng borrows the consignee pin rather than dropping off the map,
 * because most orders have never had a shipper pin captured. Those are flagged
 * `approx` so the UI can say the position is only indicative.
 */
export function stopLegCoords(d: LegCoordSource): LegCoords {
  const consigneeSide = stopLocationTarget(d) === 'delivery';
  const lat = num(d.latitude);
  const lng = num(d.longitude);

  if (consigneeSide) {
    return { lat, lng, accuracy: d.locationAccuracy ?? null, approx: false };
  }

  const sLat = num(d.shipperLat);
  const sLng = num(d.shipperLng);
  if (sLat !== null && sLng !== null) {
    return { lat: sLat, lng: sLng, accuracy: null, approx: false };
  }
  return { lat, lng, accuracy: d.locationAccuracy ?? null, approx: lat !== null && lng !== null };
}
