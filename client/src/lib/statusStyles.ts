/**
 * PathXpress portal design — functional status color system.
 * Ink-dominant UI: color is reserved for operational state
 * (green = delivered, blue = moving, amber = waiting, red = problem, gray = closed).
 * Pairs with the .badge2 / .b-* classes in index.css.
 */

export type StatusTone = 'green' | 'blue' | 'amber' | 'red' | 'gray';

/** Domestic + shared shipment statuses → tone */
export const STATUS_TONE: Record<string, StatusTone> = {
  // moving
  picked_up: 'blue',
  in_transit: 'blue',
  out_for_delivery: 'blue',
  processing: 'blue',
  // waiting
  pending_pickup: 'amber',
  on_hold: 'amber',
  delivery_attempted: 'amber',
  exchange: 'amber',
  pending: 'amber',
  customs_clearance: 'amber',
  address_issue: 'amber',
  rescheduled: 'amber',
  // done
  delivered: 'green',
  completed: 'green',
  paid: 'green',
  processed: 'green',
  active: 'green',
  approved: 'green',
  // problem
  failed_delivery: 'red',
  failed_pickup: 'red',
  damaged: 'red',
  returned_to_sender: 'red',
  overdue: 'red',
  rejected: 'red',
  failed: 'red',
  // closed / neutral
  returned: 'gray',
  canceled: 'gray',
  cancelled: 'gray',
  inactive: 'gray',
  draft: 'gray',
};

/** Class string for the design's dot badge (span/Badge className) */
export function statusBadgeClass(status: string): string {
  const tone = STATUS_TONE[status] ?? 'gray';
  return `badge2 b-${tone}`;
}

/** Solid color for charts / timeline dots (CSS var, theme-aware) */
export function statusColor(status: string): string {
  const tone = STATUS_TONE[status] ?? 'gray';
  return tone === 'red' ? 'var(--primary)' : `var(--st-${tone})`;
}

/** Theme-aware chart palette — ink + red accent + functional colors */
export const CHART_PALETTE = [
  'var(--primary)',
  'var(--st-blue)',
  'var(--st-green)',
  'var(--st-amber)',
  'var(--ink-2)',
  'var(--st-gray)',
];

export const CHART_INK = 'var(--ink)';
export const CHART_ACCENT = 'var(--primary)';
export const CHART_LINE = 'var(--line)';
export const CHART_MUTED = 'var(--muted-foreground)';

/** Mono axis tick style for recharts */
export const AXIS_TICK = {
  fill: 'var(--muted-foreground)',
  fontSize: 10,
  fontFamily: "'Space Mono', ui-monospace, monospace",
} as const;

/** Tooltip style matching panel surfaces */
export const TOOLTIP_STYLE = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  color: 'var(--foreground)',
  fontSize: '12.5px',
  fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
  boxShadow: '0 2px 6px rgba(0,0,0,.08), 0 18px 40px -24px rgba(0,0,0,.22)',
} as const;
