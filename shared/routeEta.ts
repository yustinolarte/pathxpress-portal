/**
 * Estimated arrival time per route stop — an internal planning aid for
 * dispatch, never shown to drivers or customers (decided 2026-10-31).
 *
 * Pure and free: straight-line distance (shared/geo haversine) stretched by a
 * road factor, at an urban or highway speed (slower in rush hour), plus a
 * handling time per stop. It exists to spot a Preferred Time window or a
 * Bullet deadline that the planned order can't make. Tune the constants
 * here — they are the whole model.
 *
 * Calibrated 2026-11-06 against 141 completed routes (Aug–Nov 2026), timing
 * consecutive PODs: the old 6 min per delivery made whole routes come out at
 * 0.71× their real length (3.1 h modelled vs 4.3 h real, median 8 stops).
 * Short legs were the gap — 0.15–4 km really took 18–27 min where the model
 * said 7–14 — and it is per-stop time (parking, the tower lobby, waiting for
 * the customer), not distance: driving speeds held up. Consecutive PODs at the
 * same building are under a minute apart. With these values the median route
 * comes out at ~1.05× real.
 */
import { haversine, stopCoordinates, type LatLng, type StopCoordinateSource } from './geo';
import { dubaiDateKey, dubaiDateTime, dubaiTimeOfDay, isDateKey } from './dubaiTime';

export const ETA_MODEL = {
    /** Roads are longer than the straight line between two pins. */
    roadFactor: 1.3,
    /** The first km of every leg are city streets (getting out, getting in)… */
    urbanKm: 10,
    urbanKmh: 30,
    /** …and the rest is highway (SZR, E11, E311). */
    highwayKmh: 90,
    /** Dubai rush hours, [from, to) in hours: a leg that sets off in one drives this much slower. */
    peakHours: [[7, 10], [16, 20]] as ReadonlyArray<readonly [number, number]>,
    peakFactor: 1.2,
    /** Minutes spent at the stop (park, find the door, POD, payment). */
    serviceMinutes: { pickup: 10, delivery: 14 },
    /** A stop this close to the previous one is in the same building or compound… */
    sameSpotMetres: 150,
    /** …and the van is already parked: only the handover itself. */
    sameSpotMinutes: 2,
    /** Driving time assumed for a leg we can't measure — no start point, or a stop with no pin. */
    unknownLegMinutes: 20,
    /** Bullet promises delivery within this many hours of creation. */
    bulletHours: 4,
} as const;

const MINUTE = 60_000;

/** Whether a leg setting off at this instant drives in Dubai rush hour. */
export function isPeakHour(at: Date | number): boolean {
    const [h, m] = dubaiTimeOfDay(at).split(':').map(Number);
    const hour = h + m / 60;
    return ETA_MODEL.peakHours.some(([from, to]) => hour >= from && hour < to);
}

/** Whole minutes to drive between two points under the model above; `departAt` applies rush hour. */
export function travelMinutes(from: LatLng, to: LatLng, departAt?: Date | number | null): number {
    const roadKm = (haversine(from, to) / 1000) * ETA_MODEL.roadFactor;
    const cityKm = Math.min(roadKm, ETA_MODEL.urbanKm);
    const hours = cityKm / ETA_MODEL.urbanKmh + (roadKm - cityKm) / ETA_MODEL.highwayKmh;
    const peak = departAt !== undefined && departAt !== null && isPeakHour(departAt) ? ETA_MODEL.peakFactor : 1;
    return Math.round(hours * 60 * peak);
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
    /**
     * A leg since the last known position couldn't be measured — no start
     * point, or a stop without a pin before (or at) this one: the time is a guess.
     */
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
 * Planned: from `startAt` at `origin`. Live (`now` given): worked stops keep
 * their real time, and the remaining ones are projected from max(now, last
 * worked stop) and from the driver's last known position (`livePosition`, else
 * the last worked stop). A leg that can't be measured — no start point, or a
 * stop without a pin — counts `unknownLegMinutes` and makes the times after it
 * approximate until a real time and place re-anchor the plan.
 */
export function estimateStopEtas(
    stops: EtaStopInput[],
    opts: { startAt: Date; origin?: LatLng | null; now?: Date | null; livePosition?: LatLng | null },
): EtaPlan {
    let clock = opts.startAt.getTime();
    /** Where the van is. */
    let position: LatLng | null = opts.origin ?? null;
    /** The pin of the stop just handled — the same-building rule compares against it, never the depot. */
    let lastStop: LatLng | null = null;
    let uncertain = false;
    let liveAnchored = false;
    const out: EtaStop[] = [];

    for (const s of stops) {
        if (s.doneAt) {
            const at = s.doneAt.getTime();
            // Real time and place: everything projected from here is measured again.
            if (at >= clock && s.coords) uncertain = false;
            clock = Math.max(clock, at);
            if (s.coords) position = s.coords;
            lastStop = s.coords;
            out.push({ key: s.key, arriveAt: s.doneAt.toISOString(), departAt: s.doneAt.toISOString(), actual: true, approx: false, lateRisk: null, early: false });
            continue;
        }
        if (opts.now && !liveAnchored) {
            clock = Math.max(clock, opts.now.getTime());
            if (opts.livePosition) {
                position = opts.livePosition;
                uncertain = false;
            }
            liveAnchored = true;
        }
        let drive: number;
        if (s.coords && position) {
            drive = travelMinutes(position, s.coords, clock);
        } else {
            drive = ETA_MODEL.unknownLegMinutes;
            uncertain = true;
        }
        const arrive = clock + drive * MINUTE;
        const sameSpot = !!s.coords && !!lastStop && haversine(lastStop, s.coords) <= ETA_MODEL.sameSpotMetres;
        const handling = sameSpot ? ETA_MODEL.sameSpotMinutes : ETA_MODEL.serviceMinutes[s.type];
        const depart = arrive + handling * MINUTE;
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
        lastStop = s.coords;
    }

    return { stops: out, endAt: out.length > 0 ? out[out.length - 1].departAt : null };
}

/**
 * - planned: the route leaves at its planned start.
 * - late_start: it hasn't left and its planned start is already behind us, so
 *   it can't arrive anywhere before "now + the drive" — projected from now.
 * - live: on the road, projected from now and the driver's last GPS fix.
 */
export type EtaMode = 'planned' | 'late_start' | 'live';

/**
 * Where a route's ETAs start counting from. One rule for the server (route
 * detail, dispatch map) and the browser (stop sequencer), so reordering
 * shows the same times as the list it came from. `status` omitted = a draft
 * in the create wizard, which hasn't left either.
 */
export function etaClock(
    route: { status?: string | null; plannedStartAt?: Date | string | null; startedAt?: Date | string | null },
    now: Date,
): { startAt: Date; now: Date | null; mode: EtaMode } | null {
    const raw = route.plannedStartAt ?? route.startedAt;
    if (!raw) return null;
    const startAt = new Date(raw);
    if (Number.isNaN(startAt.getTime())) return null;
    if (route.status === 'in_progress') return { startAt, now, mode: 'live' };
    const notLeftYet = !route.status || route.status === 'pending';
    if (notLeftYet && startAt.getTime() < now.getTime()) return { startAt, now, mode: 'late_start' };
    return { startAt, now: null, mode: 'planned' };
}

/**
 * The start time a new route form opens with: the time drivers usually leave
 * (`typical`, learned from recent routes; 09:00 without history), but never
 * earlier than now on today's date — a route can't leave in the past.
 */
export function defaultRouteStartTime(dateKey: string, typical: string | null | undefined, now: Date = new Date()): string {
    const base = typical && /^([01]\d|2[0-3]):[0-5]\d$/.test(typical) ? typical : '09:00';
    if (dateKey !== dubaiDateKey(now)) return base;
    const [h, m] = dubaiTimeOfDay(now).split(':').map(Number);
    const next = Math.min(23 * 60 + 45, Math.ceil((h * 60 + m) / 15) * 15);
    const soonest = `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
    return soonest > base ? soonest : base;
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
