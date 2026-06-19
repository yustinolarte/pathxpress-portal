export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const APP_TITLE = import.meta.env.VITE_APP_TITLE || "PATHXPRESS";

// Canonical domestic service catalog — keep in sync with the server's
// SERVICE_DEFS in portalRouters.ts (services.getAvailable) and the schema enum.
// Used by every manual service picker (admin create order, returns/exchanges)
// so they all expose the full set instead of a hardcoded subset.
export interface DomesticServiceType {
  code: string;
  label: string;
  sublabel: string;
  accent?: "red";
}

export const DOMESTIC_SERVICE_TYPES: DomesticServiceType[] = [
  { code: "DOM", label: "Domestic Express", sublabel: "Standard Next Day" },
  { code: "SDD", label: "Same Day (SDD)", sublabel: "Delivered today" },
  { code: "BULLET", label: "🚀 Bullet Service", sublabel: "Premium 4-Hour Delivery", accent: "red" },
  { code: "EXPRESS_ZONE2", label: "Express – Zone 2", sublabel: "Express delivery (Zone 2)" },
  { code: "PREFERRED_TIME", label: "Next Day Preferred Time", sublabel: "Next day · scheduled" },
  { code: "PREFERRED_TIME_SDD", label: "Same Day Preferred Time", sublabel: "Same day · scheduled" },
];

// Preferred Time services are booked against a delivery window (date + slot).
export const isPreferredTimeService = (code: string): boolean =>
  code === "PREFERRED_TIME" || code === "PREFERRED_TIME_SDD";

// Same Day Preferred Time is locked to the current day.
export const isSameDayPreferredService = (code: string): boolean =>
  code === "PREFERRED_TIME_SDD";

// Default hourly delivery windows (06:00–22:00) for Preferred Time when no
// custom slots are configured. Mirrors the server's DEFAULT_PREFERRED_SLOTS.
export const DEFAULT_PREFERRED_SLOTS: string[] = Array.from({ length: 16 }, (_, i) => {
  const start = String(6 + i).padStart(2, "0");
  const end = String(7 + i).padStart(2, "0");
  return `${start}:00 - ${end}:00`;
});

// Local YYYY-MM-DD helpers for Preferred Time date pickers.
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const todayStr = (): string => toLocalDateStr(new Date());

export const tomorrowStr = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalDateStr(d);
};

export const APP_LOGO = "/pathxpress-logo.png";

// Dark (black) wordmark for light theme / light backgrounds
export const APP_LOGO_LIGHT = "/pathxpress-waybill-logo.png";

// Separate logo for waybill PDFs (can be different from app logo)
export const WAYBILL_LOGO = "/pathxpress-waybill-logo.png";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
