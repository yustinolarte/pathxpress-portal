/**
 * Backfills the historical driverRoutes.shiftId link.
 *
 * A shift can span several routes (a driver may finish one route and start
 * another during the same clock-in), so the link lives on the route, not the
 * shift. Until the `eq(driverShifts.endTime, null)` bug was fixed — that
 * compiles to `endTime = NULL`, which is never true in SQL — the write path
 * that should have set this link never ran. Result: every driverRoutes row
 * has shiftId = NULL and no driverShifts row is referenced by any route. In
 * the admin Shifts & payroll view every shift card shows 0 routes/0 stops/0
 * AED while all the real work piles into a single "(UNLINKED)" bucket per
 * driver. This script recovers the history; it does not change the write
 * path (already fixed) and does not touch shifts, only driverRoutes.shiftId.
 *
 * MATCHING
 *   For each route with shiftId IS NULL, infer the route's real working
 *   window:
 *     - If driverRoutes.startedAt is set, use [startedAt, COALESCE(finishedAt, startedAt)].
 *       This is the most trustworthy signal (the app clocks in at the same
 *       instant it starts a route) but only 8/116 routes have it.
 *     - Otherwise fall back to MIN/MAX(COALESCE(deliveredAt, pickedUpAt, attemptedAt))
 *       across the route's routeOrders — the only signal available for the
 *       other ~108 routes.
 *   driverRoutes.date is the PLANNED day and is deliberately never used —
 *   routes are routinely worked 1-3 days after their planned date.
 *
 *   A route links to a shift only if the shift belongs to the same driver
 *   AND its interval overlaps the route's working window, AND exactly one
 *   shift satisfies that. Zero or multiple candidates leaves shiftId NULL —
 *   this script never guesses.
 *
 * SYNTHETIC SHIFTS (produced by scripts/repair-orphan-driver-shifts.ts)
 *   That repair closed orphaned open shifts using DATE(driverRoutes.date) —
 *   the same unreliable planned-date field this script avoids — so its
 *   inferred end times are approximations, not real clock-outs:
 *     - Shifts closed with "no activity that day" got endTime = startTime,
 *       i.e. zero duration. A zero-width interval will essentially never
 *       overlap a route window under a strict test, because the real
 *       clock-in typically precedes the first stop of the day (drive time
 *       to the first stop). These are treated as a single POINT expanded by
 *       +/- ZERO_DURATION_TOLERANCE_HOURS for overlap purposes only — the
 *       shift row itself is never modified. Matches made this way are always
 *       reported in their own bucket, never silently folded into "clean"
 *       matches, so a human can eyeball them before trusting them.
 *     - Shifts closed with real-but-overrunning activity were capped at 14h
 *       (that repair's MAX_SHIFT_HOURS). These have a real, non-zero
 *       duration and need no special tolerance, but are still flagged in
 *       the report as resting on an inferred (not clocked-out) end time.
 *   An open shift (endTime IS NULL, e.g. #265 — a missed clock-out) is
 *   treated as open-ended going forward, never as an empty interval.
 *
 * SAFETY
 *   - Dry-run by default; --apply performs writes.
 *   - Writes only driverRoutes.shiftId. Never touches driverShifts (start/end
 *     time, or any other column), routeOrders, orders or COD data.
 *   - The UPDATE is guarded with `WHERE id = ? AND shiftId IS NULL`, so a
 *     re-run can never clobber a link the (now-fixed) live code has since
 *     written correctly. Idempotent: re-running after a partial apply only
 *     touches what is still NULL.
 *   - Shifts whose driverId no longer exists in `drivers` (deleted drivers)
 *     are excluded from the candidate pool entirely and reported separately
 *     — never crash, never match a route to a dangling shift.
 *   - Routes with no driverId, or with a driverId that no longer exists in
 *     `drivers`, or with no usable timestamp signal at all, are reported as
 *     unmatchable and left untouched.
 *
 * Run with:  npx tsx scripts/link-driver-routes-to-shifts.ts [--apply]
 *            (dry-run unless --apply is passed)
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { URL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const APPLY = process.argv.includes('--apply');

/**
 * How far a zero-duration (synthetic) shift's single instant is allowed to
 * sit from the start of a route's working window and still count as an
 * overlap. Covers the drive-time gap between clock-in and the first stop of
 * the day. Kept modest on purpose: shifts for the same driver are normally
 * ~24h apart, so even a generous value here is very unlikely to bridge into
 * a neighbouring day's shift and produce a false single match.
 */
const ZERO_DURATION_TOLERANCE_HOURS = 4;
const ZERO_DURATION_TOLERANCE_MS = ZERO_DURATION_TOLERANCE_HOURS * 60 * 60 * 1000;

/** Must match repair-orphan-driver-shifts.ts's cap, to recognise capped shifts for reporting. */
const SYNTHETIC_CAP_HOURS = 14;

const parsedUrl = new URL(process.env.DATABASE_URL || '');
const dbConfig = {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port) || 3306,
    user: parsedUrl.username,
    password: parsedUrl.password,
    database: parsedUrl.pathname.slice(1),
};

interface ShiftRow {
    id: number;
    driverId: number;
    startTime: Date;
    endTime: Date | null;
}

interface RouteRow {
    id: string;
    driverId: number | null;
    startedAt: Date | null;
    finishedAt: Date | null;
}

interface Window {
    start: Date;
    end: Date;
    source: 'startedAt/finishedAt' | 'stop activity';
}

interface MatchResult {
    route: RouteRow;
    window: Window;
    shift: ShiftRow;
    zeroDurationTolerance: boolean;
    cappedAt14h: boolean;
}

interface AmbiguousResult {
    route: RouteRow;
    window: Window;
    candidates: ShiftRow[];
}

interface UnmatchedResult {
    route: RouteRow;
    reason: string;
}

function fmt(d: Date): string {
    return d.toISOString().replace('T', ' ').replace('.000Z', 'Z');
}

/** Inclusive overlap test between a route's working window and a shift's interval. */
function overlaps(window: Window, shift: ShiftRow): boolean {
    const isZeroDuration = shift.endTime !== null && shift.endTime.getTime() === shift.startTime.getTime();
    let effStart = shift.startTime.getTime();
    let effEnd = shift.endTime === null ? Infinity : shift.endTime.getTime();
    if (isZeroDuration) {
        effStart -= ZERO_DURATION_TOLERANCE_MS;
        effEnd += ZERO_DURATION_TOLERANCE_MS;
    }
    return window.start.getTime() <= effEnd && window.end.getTime() >= effStart;
}

async function main() {
    const conn = await mysql.createConnection(dbConfig);
    try {
        // --- Load candidate shifts: only ones whose driver still exists. ---
        const [validShiftRows] = await conn.query<any[]>(
            `SELECT ds.id, ds.driverId, ds.startTime, ds.endTime
               FROM driverShifts ds
               JOIN drivers d ON d.id = ds.driverId
              ORDER BY ds.driverId, ds.startTime`
        );
        const shifts: ShiftRow[] = validShiftRows.map(r => ({
            id: r.id,
            driverId: r.driverId,
            startTime: new Date(r.startTime),
            endTime: r.endTime === null ? null : new Date(r.endTime),
        }));
        const shiftsByDriver = new Map<number, ShiftRow[]>();
        for (const s of shifts) {
            if (!shiftsByDriver.has(s.driverId)) shiftsByDriver.set(s.driverId, []);
            shiftsByDriver.get(s.driverId)!.push(s);
        }

        const [orphanShiftRows] = await conn.query<any[]>(
            `SELECT ds.id, ds.driverId FROM driverShifts ds
               LEFT JOIN drivers d ON d.id = ds.driverId
              WHERE d.id IS NULL`
        );
        console.log(
            `Loaded ${shifts.length} shift(s) with a valid driver (skipped ${orphanShiftRows.length} shift(s) ` +
            `referencing a deleted driver: ${orphanShiftRows.map((r: any) => `#${r.id} (driver ${r.driverId})`).join(', ') || 'none'}).`
        );

        // --- Load routes that still need linking. ---
        const [routeRows] = await conn.query<any[]>(
            `SELECT id, driverId, startedAt, finishedAt
               FROM driverRoutes
              WHERE shiftId IS NULL
              ORDER BY driverId, COALESCE(startedAt, date)`
        );
        const routes: RouteRow[] = routeRows.map(r => ({
            id: r.id,
            driverId: r.driverId,
            startedAt: r.startedAt === null ? null : new Date(r.startedAt),
            finishedAt: r.finishedAt === null ? null : new Date(r.finishedAt),
        }));
        console.log(`${routes.length} route(s) currently have shiftId = NULL.\n`);

        // --- Batch-load stop-activity windows (MIN/MAX of stop timestamps) per route. ---
        const [activityRows] = await conn.query<any[]>(
            `SELECT routeId,
                    MIN(COALESCE(deliveredAt, pickedUpAt, attemptedAt)) AS minTs,
                    MAX(COALESCE(deliveredAt, pickedUpAt, attemptedAt)) AS maxTs
               FROM routeOrders
              WHERE deliveredAt IS NOT NULL OR pickedUpAt IS NOT NULL OR attemptedAt IS NOT NULL
              GROUP BY routeId`
        );
        const activityByRoute = new Map<string, { min: Date; max: Date }>();
        for (const r of activityRows) {
            activityByRoute.set(r.routeId, { min: new Date(r.minTs), max: new Date(r.maxTs) });
        }

        // --- Existing drivers, for readable driver labels + "driver deleted" detection. ---
        const [driverRows] = await conn.query<any[]>(`SELECT id, fullName FROM drivers`);
        const driverNames = new Map<number, string>(driverRows.map((d: any) => [d.id, d.fullName]));

        const matched: MatchResult[] = [];
        const ambiguous: AmbiguousResult[] = [];
        const unmatched: UnmatchedResult[] = [];

        for (const route of routes) {
            if (route.driverId === null) {
                unmatched.push({ route, reason: 'route has no driverId assigned' });
                continue;
            }

            // Determine the route's real working window.
            let window: Window | null = null;
            if (route.startedAt) {
                window = { start: route.startedAt, end: route.finishedAt ?? route.startedAt, source: 'startedAt/finishedAt' };
            } else {
                const activity = activityByRoute.get(route.id);
                if (activity) {
                    window = { start: activity.min, end: activity.max, source: 'stop activity' };
                }
            }

            if (!window) {
                unmatched.push({ route, reason: 'no working-window data (no startedAt and no timestamped stops)' });
                continue;
            }

            if (!driverNames.has(route.driverId)) {
                unmatched.push({ route, reason: `driver #${route.driverId} no longer exists (deleted)` });
                continue;
            }

            const driverShiftsList = shiftsByDriver.get(route.driverId) ?? [];
            if (driverShiftsList.length === 0) {
                unmatched.push({ route, reason: `driver #${route.driverId} has no shift records at all` });
                continue;
            }

            const candidates = driverShiftsList.filter(s => overlaps(window!, s));

            if (candidates.length === 0) {
                unmatched.push({ route, reason: "no shift overlaps this route's working window" });
            } else if (candidates.length > 1) {
                ambiguous.push({ route, window, candidates });
            } else {
                const shift = candidates[0];
                const zeroDurationTolerance = shift.endTime !== null && shift.endTime.getTime() === shift.startTime.getTime();
                const durationHours = shift.endTime ? (shift.endTime.getTime() - shift.startTime.getTime()) / 3_600_000 : null;
                const cappedAt14h = durationHours !== null && Math.abs(durationHours - SYNTHETIC_CAP_HOURS) < 1e-9;
                matched.push({ route, window, shift, zeroDurationTolerance, cappedAt14h });
            }
        }

        // ---------------------------------------------------------------
        // Report
        // ---------------------------------------------------------------
        console.log('='.repeat(78));
        console.log(
            `Would LINK ${matched.length} route(s) ` +
            `(${matched.filter(m => !m.zeroDurationTolerance && !m.cappedAt14h).length} clean, ` +
            `${matched.filter(m => m.zeroDurationTolerance).length} via zero-duration-shift tolerance, ` +
            `${matched.filter(m => m.cappedAt14h).length} to a 14h-capped synthetic shift):`
        );
        console.log('='.repeat(78));
        for (const m of matched) {
            const flag = m.zeroDurationTolerance
                ? `  [zero-duration shift, +/-${ZERO_DURATION_TOLERANCE_HOURS}h tolerance]`
                : m.cappedAt14h
                    ? '  [synthetic shift, capped at 14h by earlier repair]'
                    : '';
            console.log(
                `  ${m.route.id.padEnd(20)} driver ${String(m.route.driverId).padEnd(4)} ` +
                `window [${fmt(m.window.start)} .. ${fmt(m.window.end)}] (${m.window.source})` +
                `  ->  shift #${m.shift.id} [${fmt(m.shift.startTime)} .. ${m.shift.endTime ? fmt(m.shift.endTime) : 'OPEN'}]${flag}`
            );
        }

        console.log(`\nAmbiguous — ${ambiguous.length} route(s) with more than one candidate shift (left unlinked):`);
        for (const a of ambiguous) {
            console.log(
                `  ${a.route.id.padEnd(20)} driver ${String(a.route.driverId).padEnd(4)} ` +
                `window [${fmt(a.window.start)} .. ${fmt(a.window.end)}] (${a.window.source})` +
                `  ->  candidates: ${a.candidates.map(s => `#${s.id} [${fmt(s.startTime)}..${s.endTime ? fmt(s.endTime) : 'OPEN'}]`).join(', ')}`
            );
        }

        const reasonGroups = new Map<string, UnmatchedResult[]>();
        for (const u of unmatched) {
            const key = u.reason;
            if (!reasonGroups.has(key)) reasonGroups.set(key, []);
            reasonGroups.get(key)!.push(u);
        }
        console.log(`\nUnmatched — ${unmatched.length} route(s), grouped by reason:`);
        for (const [reason, items] of Array.from(reasonGroups.entries())) {
            console.log(`  ${reason}: ${items.length}`);
            for (const it of items) {
                console.log(`    ${it.route.id}  (driver ${it.route.driverId ?? 'none'})`);
            }
        }

        // Per-driver breakdown.
        console.log('\nPer-driver breakdown:');
        const allDriverIds = new Set<number>();
        for (const r of routes) if (r.driverId !== null) allDriverIds.add(r.driverId);
        const sortedDrivers = Array.from(allDriverIds).sort((a, b) => a - b);
        for (const driverId of sortedDrivers) {
            const name = driverNames.get(driverId) ?? '(deleted driver)';
            const mCount = matched.filter(m => m.route.driverId === driverId).length;
            const aCount = ambiguous.filter(a => a.route.driverId === driverId).length;
            const uCount = unmatched.filter(u => u.route.driverId === driverId).length;
            console.log(`  driver #${driverId} (${name}): linked=${mCount} ambiguous=${aCount} unmatched=${uCount}`);
        }
        const noDriverCount = unmatched.filter(u => u.route.driverId === null).length;
        if (noDriverCount > 0) console.log(`  (no driver assigned): unmatched=${noDriverCount}`);

        console.log(`\nTOTAL: ${routes.length} route(s) considered -> ${matched.length} linkable, ${ambiguous.length} ambiguous, ${unmatched.length} unmatched.`);

        if (!APPLY) {
            console.log('\nDry run — nothing changed. Re-run with --apply to write the shiftId links.');
            return;
        }

        let written = 0;
        for (const m of matched) {
            const [result] = await conn.query<any>(
                `UPDATE driverRoutes SET shiftId = ? WHERE id = ? AND shiftId IS NULL`,
                [m.shift.id, m.route.id]
            );
            if (result.affectedRows > 0) written++;
        }
        console.log(`\n✅ Linked ${written}/${matched.length} route(s) (skipped ones already linked by a concurrent write, if any).`);
    } finally {
        await conn.end();
    }
}

main().catch(err => { console.error('❌ Link repair failed:', err); process.exit(1); });
