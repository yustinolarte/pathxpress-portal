/**
 * Canonical UAE geography + phone helpers.
 *
 * Both portals used to keep their own emirate lists: the customer form stored
 * full names ("Ras Al Khaimah") while the admin dialog stored short codes
 * ("RAK"), so the same destination landed in the database under two different
 * strings — splitting reports and breaking the `availableRegions` match in
 * getAvailableServicesForClient, which compares against the full names saved by
 * RatesPanel. Everything now normalizes through here before hitting the DB.
 */

/** The only emirate spellings ever written to `orders.emirate`. */
export const UAE_EMIRATES = [
  'Dubai',
  'Abu Dhabi',
  'Sharjah',
  'Ajman',
  'Ras Al Khaimah',
  'Fujairah',
  'Umm Al Quwain',
] as const;

export type UaeEmirate = (typeof UAE_EMIRATES)[number];

/**
 * Cities offered in address pickers. Al Ain is a city of Abu Dhabi rather than
 * an emirate of its own, so it is selectable as a city but bills as Abu Dhabi.
 */
export const UAE_CITIES = [
  'Dubai',
  'Abu Dhabi',
  'Al Ain',
  'Sharjah',
  'Ajman',
  'Ras Al Khaimah',
  'Fujairah',
  'Umm Al Quwain',
] as const;

/**
 * Fold a place name to a comparable key: strip diacritics (Google returns
 * "Raʾs al-Khaymah", "Abū Ẓaby", "Ash Shāriqah"), turn separators into spaces,
 * drop anything that is not a letter, and collapse whitespace.
 */
function fold(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[-_/,.]+/g, ' ')
    .replace(/[^a-zA-Z ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every spelling we have seen from Google, imports or legacy rows. */
const EMIRATE_ALIASES: Record<string, UaeEmirate> = {
  dubai: 'Dubai',
  dubayy: 'Dubai',
  dxb: 'Dubai',

  'abu dhabi': 'Abu Dhabi',
  abudhabi: 'Abu Dhabi',
  'abu zaby': 'Abu Dhabi',
  'emirate of abu dhabi': 'Abu Dhabi',
  auh: 'Abu Dhabi',
  'al ain': 'Abu Dhabi',
  'al ayn': 'Abu Dhabi',

  sharjah: 'Sharjah',
  'ash shariqah': 'Sharjah',
  'al shariqah': 'Sharjah',
  shj: 'Sharjah',

  ajman: 'Ajman',
  ajaman: 'Ajman',

  'ras al khaimah': 'Ras Al Khaimah',
  'ras al khaymah': 'Ras Al Khaimah',
  'ras alkhaimah': 'Ras Al Khaimah',
  'rass al khaimah': 'Ras Al Khaimah',
  rak: 'Ras Al Khaimah',

  fujairah: 'Fujairah',
  'al fujayrah': 'Fujairah',
  'al fujairah': 'Fujairah',
  fuj: 'Fujairah',

  'umm al quwain': 'Umm Al Quwain',
  'umm al qaywayn': 'Umm Al Quwain',
  'umm al qaiwain': 'Umm Al Quwain',
  'umm alquwain': 'Umm Al Quwain',
  uaq: 'Umm Al Quwain',
};

/**
 * Map any emirate/city spelling to its canonical emirate, or undefined when the
 * value is not recognisable as one of the seven emirates.
 */
export function normalizeEmirate(raw?: string | null): UaeEmirate | undefined {
  if (!raw) return undefined;
  const key = fold(raw);
  if (!key) return undefined;
  const direct = EMIRATE_ALIASES[key];
  if (direct) return direct;
  // Google often returns "Emirate of Sharjah" or "Dubai - United Arab Emirates".
  for (const [alias, emirate] of Object.entries(EMIRATE_ALIASES)) {
    if (alias.length >= 4 && key.includes(alias)) return emirate;
  }
  return undefined;
}

/** Canonical city name for a raw city string, when we recognise it. */
export function normalizeCity(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const key = fold(raw);
  if (!key) return undefined;
  const match = UAE_CITIES.find(c => fold(c) === key);
  if (match) return match;
  // "Abudhabi", "RasAlKhaimah" — the same name with the spaces lost somewhere in
  // an import or a hand-typed address form. Compared before the partial match
  // below, which would otherwise never see them.
  const squashed = key.replace(/ /g, '');
  const spacing = UAE_CITIES.find(c => fold(c).replace(/ /g, '') === squashed);
  if (spacing) return spacing;
  // "Al Ain City", "Dubai Marina" -> nearest known city, otherwise keep as-is.
  const partial = UAE_CITIES.find(c => key.includes(fold(c)));
  return partial ?? undefined;
}

/**
 * Normalise a free-form city that is outside the UAE without maintaining a
 * worldwide city dictionary. Existing mixed-case spelling is preserved;
 * values entered entirely in lower/upper case are converted to title case.
 */
export function normalizeDisplayName(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return undefined;
  const uaeCity = normalizeCity(trimmed);
  if (uaeCity) return uaeCity;

  const hasLower = /[a-z]/.test(trimmed);
  const hasUpper = /[A-Z]/.test(trimmed);
  if (hasLower && hasUpper) return trimmed;

  return trimmed
    .toLocaleLowerCase('en')
    .replace(/(^|[\s-])([a-z])/g, (_match, separator: string, letter: string) =>
      `${separator}${letter.toLocaleUpperCase('en')}`,
    );
}

/**
 * Where to point the map for a given city. Al Ain bills as Abu Dhabi but sits
 * 120 km inland, so biasing its searches at Abu Dhabi city would surface the
 * wrong suggestions.
 */
export const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  'Al Ain': { lat: 24.2075, lng: 55.7447 },
};

/** Approximate centre of each emirate, used to bias address autocomplete. */
export const EMIRATE_CENTERS: Record<UaeEmirate, { lat: number; lng: number }> = {
  Dubai: { lat: 25.2048, lng: 55.2708 },
  'Abu Dhabi': { lat: 24.4539, lng: 54.3773 },
  Sharjah: { lat: 25.3463, lng: 55.4209 },
  Ajman: { lat: 25.4052, lng: 55.5136 },
  'Ras Al Khaimah': { lat: 25.7895, lng: 55.9432 },
  Fujairah: { lat: 25.1288, lng: 56.3265 },
  'Umm Al Quwain': { lat: 25.5647, lng: 55.5532 },
};

/**
 * Rough radius (km) used to sanity-check that a dropped pin actually sits in
 * the emirate the operator selected. Generous on purpose — this warns, it does
 * not block.
 */
export const EMIRATE_RADIUS_KM: Record<UaeEmirate, number> = {
  Dubai: 60,
  'Abu Dhabi': 180,
  Sharjah: 70,
  Ajman: 30,
  'Ras Al Khaimah': 60,
  Fujairah: 55,
  'Umm Al Quwain': 35,
};

/** Great-circle distance in kilometres. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * True when the coordinates plausibly fall inside the given emirate. Returns
 * true for unknown emirates so callers never warn on data they can't judge.
 */
export function isPinNearEmirate(
  pin: { lat: number; lng: number },
  emirate?: string | null,
): boolean {
  const canonical = normalizeEmirate(emirate);
  if (!canonical) return true;
  return distanceKm(pin, EMIRATE_CENTERS[canonical]) <= EMIRATE_RADIUS_KM[canonical];
}

/**
 * Country dialling codes offered in the portal phone inputs, with the national
 * number length we expect after the trunk "0" is stripped.
 */
export const PHONE_PREFIXES = [
  { code: '+971', label: 'AE +971', flag: '\u{1F1E6}\u{1F1EA}', nationalDigits: 9 },
  { code: '+966', label: 'SA +966', flag: '\u{1F1F8}\u{1F1E6}', nationalDigits: 9 },
  { code: '+965', label: 'KW +965', flag: '\u{1F1F0}\u{1F1FC}', nationalDigits: 8 },
  { code: '+973', label: 'BH +973', flag: '\u{1F1E7}\u{1F1ED}', nationalDigits: 8 },
  { code: '+968', label: 'OM +968', flag: '\u{1F1F4}\u{1F1F2}', nationalDigits: 8 },
  { code: '+974', label: 'QA +974', flag: '\u{1F1F6}\u{1F1E6}', nationalDigits: 8 },
] as const;

/**
 * Turn whatever was typed into `+<cc> <national>`.
 *
 * Operators paste numbers in every shape: "0551234567", "+971 55 123 4567",
 * "971551234567". Storing them verbatim produced entries like
 * "+971 0551234567" that the driver app could not dial.
 */
export function normalizePhone(prefix: string, national: string): string {
  const cc = String(prefix ?? '').replace(/\D/g, '');
  let digits = String(national ?? '').replace(/\D/g, '');
  // Number pasted with its own country code (e.g. "971551234567").
  if (cc && digits.startsWith(cc) && digits.length > cc.length + 6) {
    digits = digits.slice(cc.length);
  }
  // Local trunk prefix — "055..." is the same subscriber as "+971 55...".
  digits = digits.replace(/^0+/, '');
  if (!digits) return '';
  return cc ? `+${cc} ${digits}` : digits;
}

/** The national part only, cleaned the same way normalizePhone cleans it. */
export function nationalDigits(prefix: string, national: string): string {
  const normalized = normalizePhone(prefix, national);
  const space = normalized.indexOf(' ');
  return space === -1 ? normalized : normalized.slice(space + 1);
}

/**
 * Loose plausibility check — right digit count for the selected country, and
 * for the UAE the subscriber number must start with a valid leading digit.
 */
export function isPlausiblePhone(prefix: string, national: string): boolean {
  const digits = nationalDigits(prefix, national);
  if (!digits) return false;
  const spec = PHONE_PREFIXES.find(p => p.code === prefix);
  if (!spec) return digits.length >= 7 && digits.length <= 12;
  if (prefix === '+971') {
    // Mobiles are 9 digits starting with 5; landlines are 8 starting with 2/3/4/6/7/9.
    return /^5\d{8}$/.test(digits) || /^[2-46-9]\d{7}$/.test(digits);
  }
  return digits.length === spec.nationalDigits || digits.length === spec.nationalDigits - 1;
}

/** True when the number looks like a UAE mobile (the only reachable-by-SMS case). */
export function isUaeMobile(prefix: string, national: string): boolean {
  return prefix === '+971' && /^5\d{8}$/.test(nationalDigits(prefix, national));
}

/**
 * Clean an already-assembled phone string ("+971 0551234567", "971 55 123 4567")
 * without knowing which field held the prefix. Used server-side as a last line
 * of defence for numbers arriving from older clients and integrations.
 */
export function normalizeStoredPhone(stored?: string | null): string {
  const value = String(stored ?? '').trim();
  if (!value) return '';
  const known = PHONE_PREFIXES.find(p => value.startsWith(p.code));
  if (known) {
    return normalizePhone(known.code, value.slice(known.code.length)) || value;
  }
  // A "+" with a dialling code we don't offer (e.g. +44) is left untouched
  // rather than being mangled into a UAE number.
  if (value.startsWith('+')) return value.replace(/\s+/g, ' ');
  return normalizePhone('+971', value) || value;
}

/**
 * Split a stored "+971 551234567" back into prefix + national parts so edit
 * forms can round-trip a saved number.
 */
export function splitPhone(stored?: string | null): { prefix: string; national: string } {
  const value = String(stored ?? '').trim();
  if (!value) return { prefix: '+971', national: '' };
  const match = PHONE_PREFIXES.find(p => value.startsWith(p.code));
  if (match) {
    return { prefix: match.code, national: nationalDigits(match.code, value.slice(match.code.length)) };
  }
  return { prefix: '+971', national: nationalDigits('+971', value) };
}
