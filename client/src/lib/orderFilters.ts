/**
 * Client-side filtering of available orders for the dispatch map + pickers.
 * getAvailableOrders already returns the full active set, so filtering locally
 * keeps map, panel and pick list on one source of truth.
 */

export type ZoneName = 'ZONA 1' | 'ZONA 2' | 'ZONA 3';

// Emirate → operational zone (mirrors getZoneFromEmirate on the server).
const EMIRATE_ZONE: Record<string, ZoneName> = {
  'dubai': 'ZONA 1',
  'sharjah': 'ZONA 1',
  'ajman': 'ZONA 1',
  'abu dhabi': 'ZONA 1',
  'umm al quwain': 'ZONA 2',
  'ras al khaimah': 'ZONA 2',
  'fujairah': 'ZONA 2',
};

export function zoneForOrder(order: { emirate?: string | null; city?: string | null }): ZoneName {
  const key = (order.emirate || order.city || '').trim().toLowerCase();
  return EMIRATE_ZONE[key] ?? 'ZONA 3';
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
