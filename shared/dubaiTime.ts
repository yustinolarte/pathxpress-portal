/**
 * Dubai calendar helpers. The UAE is UTC+4 all year (no DST), so every
 * conversion is a fixed offset — no Intl/timezone database needed, and the
 * result never depends on the browser's or the server host's timezone.
 *
 * Why: `new Date().toISOString().slice(0, 10)` is the UTC day, which between
 * 00:00 and 04:00 in Dubai is still *yesterday* — "attempted today" and
 * "due today" would silently read the wrong day for four hours every night.
 * Billing already pins `+04:00` explicitly (server/db.ts getBillingWindow);
 * this is the same idea, shared.
 */

const OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

type Instant = Date | string | number;

function toDate(at: Instant): Date {
    const d = at instanceof Date ? at : new Date(at);
    if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid date: ${String(at)}`);
    return d;
}

/** 'YYYY-MM-DD' of the Dubai calendar day containing `at`. */
export function dubaiDateKey(at: Instant = new Date()): string {
    return new Date(toDate(at).getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

export const dubaiToday = (): string => dubaiDateKey(new Date());

export function isDateKey(value: unknown): value is string {
    return typeof value === 'string' && DATE_KEY.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/** [start, end) as UTC instants for one Dubai calendar day. */
export function dubaiDayBounds(dateKey: string = dubaiToday()): { start: Date; end: Date } {
    if (!isDateKey(dateKey)) throw new RangeError(`Invalid Dubai date key: ${dateKey}`);
    const start = new Date(`${dateKey}T00:00:00+04:00`);
    return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** The instant of wall-clock `HH:MM` Dubai time on a Dubai calendar day. */
export function dubaiDateTime(dateKey: string, hhmm: string): Date {
    if (!isDateKey(dateKey)) throw new RangeError(`Invalid Dubai date key: ${dateKey}`);
    const m = TIME_OF_DAY.exec(hhmm.trim());
    if (!m) throw new RangeError(`Invalid time of day: ${hhmm}`);
    return new Date(`${dateKey}T${m[1]}:${m[2]}:00+04:00`);
}

/** 'HH:MM' Dubai wall-clock time of an instant. */
export function dubaiTimeOfDay(at: Instant): string {
    return new Date(toDate(at).getTime() + OFFSET_MS).toISOString().slice(11, 16);
}

export function isSameDubaiDay(a: Instant, b: Instant): boolean {
    return dubaiDateKey(a) === dubaiDateKey(b);
}
