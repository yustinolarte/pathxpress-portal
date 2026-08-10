export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// Short codes shown wherever an order's service type appears in a list, table,
// pill, detail view or invoice line — full codes like PREFERRED_TIME_SDD blow
// out narrow columns. Covers both the domestic codes (client/src/const.ts's
// DOMESTIC_SERVICE_TYPES) and the international ones from
// AdminCreateIntlOrderDialog / internationalRateEngine's SERVICE map.
// Exports (CSV/Excel) and the waybill/report PDFs intentionally keep the
// untouched code, since those are records rather than UI views.
// Lives in shared/ because the server writes it into invoice item descriptions.
export const SERVICE_TYPE_ABBREVIATIONS: Record<string, string> = {
  DOM: "DOM",
  SDD: "SDD",
  BULLET: "BLT",
  EXPRESS_ZONE2: "EZ2",
  PREFERRED_TIME: "PT",
  PREFERRED_TIME_SDD: "PTSD",
  PRIME_EXPRESS: "PEX",
  PRIME_TRACKED: "PTR",
  PRIME_REGISTERED_POD: "PRP",
  GCC: "GCC",
  PREMIUM_EXPORT: "PEXP",
};

export const abbreviateServiceType = (code?: string | null): string =>
  (code && SERVICE_TYPE_ABBREVIATIONS[code]) || code || "";

// Readable names for the same codes, for places with room to spell them out —
// analytics legends, revenue breakdowns, report headings. Raw codes like
// PRIME_REGISTERED_POD are storage identifiers, not something to show a reader.
export const SERVICE_TYPE_LABELS: Record<string, string> = {
  DOM: "Domestic Express",
  SDD: "Same Day",
  BULLET: "Bullet (4h)",
  EXPRESS_ZONE2: "Express – Zone 2",
  PREFERRED_TIME: "Next Day Preferred Time",
  PREFERRED_TIME_SDD: "Same Day Preferred Time",
  PRIME_EXPRESS: "Prime Express",
  PRIME_TRACKED: "Prime Tracked",
  PRIME_REGISTERED_POD: "Prime Registered (POD)",
  GCC: "GCC",
  PREMIUM_EXPORT: "Premium Export",
  // Invoice lines with no shipment behind them: surcharges, discounts, manual items.
  OTHER_CHARGES: "Other charges & adjustments",
};

export const serviceTypeLabel = (code?: string | null): string =>
  (code && SERVICE_TYPE_LABELS[code]) || code || "";
