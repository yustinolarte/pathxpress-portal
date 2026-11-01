/**
 * Estimated arrival time per route stop — an internal planning aid for
 * dispatch, never shown to drivers or customers (decided 2026-10-31).
 *
 * Pure and free: straight-line distance (shared/geo haversine) stretched by a
 * road factor, at an urban or highway speed, plus a fixed handling time per
 * stop. Expect ±15–20 min over a day; it exists to spot a Preferred Time
 * window or a Bullet deadline that the planned order can't make. Tune the
 * constants here — they are the whole model.
 */
import { haversine, stopCoordinates, type LatLng, type StopCoordinateSource } from './geo';
import { dubaiDateTime, isDateKey } from './dubaiTime';

export const ETA_MODEL = {
    /** Roads are longer than the straight line between two pins. */
    roadFactor: 1.3,
    /** The first km of every leg are city streets (getting out, getting in)… */
    urbanKm: 10,
    urbanKmh: 30,
    /** …and the rest is highway (SZR, E11, E311). */
    highwayKmh: 90,
    /** Minutes spent at the stop (park, find the door, POD, payment). */
    serviceMinutes: { pickup: 10, delivery: 6 },
    /** Bullet promises delivery within this many hours of creation. */
    bulletHours: 4,
} as const;

const MINUTE = 60_000;

/** Whole minutes to drive between two points under the model above. */
export function travelMinutes(from: LatLng, to: LatLng): number {
    const roadKm = (haversine(from, to) / 1000) * ETA_MODEL.roadFactor;
    const cityKm = Math.min(roadKm, ETA_MODEL.urbanKm);
    const hours = cityKm / ETA_MODEL.urbanKmh + (roadKm - cityKm) / ETA_MODEL.highwayKmh;
    return Math.round(hours * 60);
}

/**
 * A Preferred Time slot: a window ("06:00 - 07:00", any dash) or a single time
 * ("18:00", read as a one-hour window starting then). Null when unparseable.
 */
export function parseTimeSlot(slot: string | null | undefined): { start: string; end: string } | null {
    if (!slot) return null;
    const parts = slot.split(/[-–—]/).map(p => p.trim()).filter(Boolean);
    const valid = (t: string | undefined) => !!t && /^([01]?\d|2[0-3]):[0-5]\d$/.test(t);
    const pad = (t: string) => t.length === 4 ? `0${t}` : t;
    if (!valid(parts[0])) return null;
    const start = pad(parts[0]);
    if (valid(parts[1])) return { start, end: pad(parts[1]) };
    const [h, m] = start.split(':').map(Number);
    const endH = Math.min(23, h + 1);
    return { start, end: `${String(endH).padStart(2, '0')}:${String(endH === h ? 59 : m).padStart(2, '0')}` };
}

export interface EtaStopInput {
    key: string | number;
    type: 'pickup' | 'delivery';
    coords: LatLng | null;
    /** When the stop was actually worked (live routes) — its ETA is that time. */
    doneAt?: Date | null;
    /** Must arrive by this instant (Preferred Time window end, Bullet deadline). */
    latestArrival?: Date | null;
    /** Window start, if any — arriving before it is reported, not flagged. */
    earliestArrival?: Date | null;
    /** What `latestArrival` stands for, for the warning label. */
    deadlineKind?: 'window' | 'bullet' | null;
}

export interface EtaStop {
    key: string | number;
    arriveAt: string;
    departAt: string;
    /** The time is the real one recorded by the driver. */
    actual: boolean;
    /** Missing coordinates somewhere before (or at) this stop — the time is a guess. */
    approx: boolean;
    /** Arrives after latestArrival. */
    lateRisk: 'window' | 'bullet' | null;
    /** Arrives before earliestArrival (driver will wait). */
    early: boolean;
}

export interface EtaPlan {
    stops: EtaStop[];
    endAt: string | null;
}

/**
 * ETAs for stops in route order.
 *
 * Planned: from `startAt` at `origin` (no origin → the first stop is reached
 * at `startAt`). Live (`now` given): worked stops keep their real time, and the
 * remaining ones are projected from max(now, last worked stop) and from the
 * driver's last known position (`livePosition`, else the last worked stop).
 */
export function estimateStopEtas(
    stops: EtaStopInput[],
    opts: { startAt: Date; origin?: LatLng | null; now?: Date | null; livePosition?: LatLng | null },
): EtaPlan {
    let clock = opts.startAt.getTime();
    let position: LatLng | null = opts.origin ?? null;
    let uncertain = false;
    let liveAnchored = false;
    const out: EtaStop[] = [];

    for (const s of stops) {
        if (s.doneAt) {
            const at = s.doneAt.getTime();
            clock = Math.max(clock, at);
            if (s.coords) position = s.coords;
            out.push({ key: s.key, arriveAt: s.doneAt.toISOString(), departAt: s.doneAt.toISOString(), actual: true, approx: false, lateRisk: null, early: false });
            continue;
        }
        if (opts.now && !liveAnchored) {
            clock = Math.max(clock, opts.now.getTime());
            if (opts.livePosition) position = opts.livePosition;
            liveAnchored = true;
        }
        let arrive = clock;
        if (s.coords && position) arrive += travelMinutes(position, s.coords) * MINUTE;
        if (!s.coords) uncertain = true;
        const depart = arrive + ETA_MODEL.serviceMinutes[s.type] * MINUTE;
        const late = s.latestArrival && arrive > s.latestArrival.getTime() ? (s.deadlineKind ?? 'window') : null;
        out.push({
            key: s.key,
            arriveAt: new Date(arrive).toISOString(),
            departAt: new Date(depart).toISOString(),
            actual: false,
            approx: uncertain,
            lateRisk: late,
            early: !!s.earliestArrival && arrive < s.earliestArrival.getTime(),
        });
        clock = depart;
        if (s.coords) position = s.coords;
    }

    return { stops: out, endAt: out.length > 0 ? out[out.length - 1].departAt : null };
}

/** The order fields an ETA needs — satisfied by an orders row or a dispatch payload. */
export interface EtaOrderFields extends StopCoordinateSource {
    serviceType?: string | null;
    preferredDeliveryDate?: string | null;
    preferredDeliveryTime?: string | null;
    createdAt: Date | string;
}

/**
 * One stop's ETA input: its physical pin (shipper side for a pickup), and for
 * a delivery the latest acceptable arrival — the end of a Preferred Time
 * window, or the Bullet deadline (created + 4h).
 */
export function etaInputFor(key: string | number, type: 'pickup' | 'delivery', order: EtaOrderFields, doneAt?: Date | null): EtaStopInput {
    return { key, type, coords: stopCoordinates(type, order), doneAt: doneAt ?? null, ...(type === 'delivery' ? deliveryDeadline(order) : {}) };
}

/** A delivery's time constraint: its Preferred Time window, or the Bullet deadline. */
export function deliveryDeadline(order: Omit<EtaOrderFields, keyof StopCoordinateSource>): Pick<EtaStopInput, 'earliestArrival' | 'latestArrival' | 'deadlineKind'> {
    const service = (order.serviceType ?? '').toUpperCase();
    if ((service === 'PREFERRED_TIME' || service === 'PREFERRED_TIME_SDD') && isDateKey(order.preferredDeliveryDate)) {
        const slot = parseTimeSlot(order.preferredDeliveryTime);
        if (slot) {
            return {
                earliestArrival: dubaiDateTime(order.preferredDeliveryDate, slot.start),
                latestArrival: dubaiDateTime(order.preferredDeliveryDate, slot.end),
                deadlineKind: 'window',
            };
        }
    } else if (service === 'BULLET') {
        return {
            latestArrival: new Date(new Date(order.createdAt).getTime() + ETA_MODEL.bulletHours * 60 * MINUTE),
            deadlineKind: 'bullet',
        };
    }
    return {};
}
