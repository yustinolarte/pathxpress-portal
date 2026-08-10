/**
 * Repairs the driver shifts left behind by the `eq(endTime, null)` bug.
 *
 * Until that was fixed, matching an open shift compiled to `endTime = NULL`,
 * which is never true in SQL. So /shifts/start opened a brand new shift on every
 * call and /shifts/end could never find one to close — the table filled up with
 * duplicate shifts that stay "on duty" forever.
 *
 * The repair, per driver per calendar day:
 *   - KEEP the earliest open shift (that clock-in really happened) and close it at
 *     the driver's last recorded stop activity that day; if there is no activity to
 *     go on, close it at the shift's own start time.
 *   - DELETE the later duplicates for that same day — they are artifacts of the bug
 *     re-clocking the driver in, not real shifts.
 *   - LEAVE today's newest open shift alone: the driver may genuinely still be on duty.
 *   - CAP any shift longer than MAX_SHIFT_HOURS. Stops on a route dated day D often
 *     complete on D+1 (the driver finishes the next morning), so "last stop activity"
 *     can infer a 30-hour shift. Nobody works 30 hours; the cap keeps the inferred
 *     end conservative instead of confidently wrong.
 *
 * Shifts referenced by a route (driverRoutes.shiftId) are never deleted.
 *
 * Safe to re-run: closing, deleting and capping are all no-ops once applied.
 *
 * Run with:  npx tsx scripts/repair-orphan-driver-shifts.ts [--apply]
 *            (dry-run unless --apply is passed)
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { URL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const APPLY = process.argv.includes('--apply');

/** Longest plausible single delivery shift. Anything beyond this was inferred wrong. */
const MAX_SHIFT_HOURS = 14;
const MAX_SHIFT_MS = MAX_SHIFT_HOURS * 60 * 60 * 1000;

const parsedUrl = new URL(process.env.DATABASE_URL || '');
const dbConfig = {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port) || 3306,
    user: parsedUrl.username,
    password: parsedUrl.password,
    database: parsedUrl.pathname.slice(1),
};

const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface ShiftRow { id: number; driverId: number; startTime: Date; }

async function main() {
    const conn = await mysql.createConnection(dbConfig);
    try {
        const [openShifts] = await conn.query<any[]>(
            `SELECT id, driverId, startTime FROM driverShifts WHERE endTime IS NULL ORDER BY driverId, startTime`
        );
        const [linked] = await conn.query<any[]>(
            `SELECT DISTINCT shiftId FROM driverRoutes WHERE shiftId IS NOT NULL`
        );
        const linkedIds = new Set(linked.map(r => r.shiftId));

        console.log(`${openShifts.length} open shift(s); ${linkedIds.size} shift(s) referenced by a route.`);
        if (openShifts.length === 0) return;

        const today = dayKey(new Date());

        // Group by driver + calendar day.
        const groups = new Map<string, ShiftRow[]>();
        for (const s of openShifts as ShiftRow[]) {
            const key = `${s.driverId}|${dayKey(new Date(s.startTime))}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(s);
        }

        const toClose: { id: number; driverId: number; start: Date; end: Date; reason: string }[] = [];
        const toDelete: { id: number; driverId: number; start: Date }[] = [];

        for (const [key, shifts] of Array.from(groups.entries())) {
            const [, day] = key.split('|');
            const [keep, ...duplicates] = shifts; // already ordered by startTime

            for (const dup of duplicates) {
                if (linkedIds.has(dup.id)) continue; // a route points at it — leave it be
                toDelete.push({ id: dup.id, driverId: dup.driverId, start: new Date(dup.startTime) });
            }

            // A shift opened today might still be legitimately running.
            if (day === today) continue;

            const [[activity]] = await conn.query<any[]>(
                `SELECT MAX(COALESCE(ro.deliveredAt, ro.pickedUpAt, ro.attemptedAt)) AS lastActivity
                   FROM routeOrders ro
                   JOIN driverRoutes dr ON dr.id = ro.routeId
                  WHERE dr.driverId = ?
                    AND DATE(dr.date) = ?`,
                [keep.driverId, day]
            );

            const start = new Date(keep.startTime);
            const last = activity?.lastActivity ? new Date(activity.lastActivity) : null;
            let end = last && last > start ? last : start;
            let reason = last && last > start ? 'last stop activity' : 'no activity — closed at start';
            if (end.getTime() - start.getTime() > MAX_SHIFT_MS) {
                end = new Date(start.getTime() + MAX_SHIFT_MS);
                reason = `capped at ${MAX_SHIFT_HOURS}h (activity ran into the next day)`;
            }
            toClose.push({ id: keep.id, driverId: keep.driverId, start, end, reason });
        }

        // Already-closed shifts that exceed the cap — either from an earlier run of this
        // script before the cap existed, or from a genuinely bad end time.
        const [overlong] = await conn.query<any[]>(
            `SELECT id, driverId, startTime, endTime
               FROM driverShifts
              WHERE endTime IS NOT NULL
                AND TIMESTAMPDIFF(SECOND, startTime, endTime) > ?
              ORDER BY startTime`,
            [MAX_SHIFT_HOURS * 3600]
        );
        const toCap = overlong.map(s => ({
            id: s.id,
            driverId: s.driverId,
            start: new Date(s.startTime),
            oldEnd: new Date(s.endTime),
            newEnd: new Date(new Date(s.startTime).getTime() + MAX_SHIFT_MS),
        }));

        console.log(`\nWould CLOSE ${toClose.length} shift(s):`);
        for (const c of toClose.slice(0, 15)) {
            console.log(`  #${c.id} driver ${c.driverId}  ${c.start.toISOString()} -> ${c.end.toISOString()}  (${c.reason})`);
        }
        if (toClose.length > 15) console.log(`  ... and ${toClose.length - 15} more`);

        console.log(`\nWould DELETE ${toDelete.length} duplicate shift(s):`);
        for (const d of toDelete.slice(0, 15)) {
            console.log(`  #${d.id} driver ${d.driverId}  ${d.start.toISOString()}`);
        }
        if (toDelete.length > 15) console.log(`  ... and ${toDelete.length - 15} more`);

        console.log(`\nWould CAP ${toCap.length} already-closed shift(s) longer than ${MAX_SHIFT_HOURS}h:`);
        for (const c of toCap.slice(0, 15)) {
            const hrs = ((c.oldEnd.getTime() - c.start.getTime()) / 3_600_000).toFixed(1);
            console.log(`  #${c.id} driver ${c.driverId}  ${hrs}h -> ${MAX_SHIFT_HOURS}h  (end ${c.oldEnd.toISOString()} -> ${c.newEnd.toISOString()})`);
        }
        if (toCap.length > 15) console.log(`  ... and ${toCap.length - 15} more`);

        const untouched = openShifts.length - toClose.length - toDelete.length;
        console.log(`\n${untouched} shift(s) left open (started today, or referenced by a route).`);

        if (!APPLY) {
            console.log('\nDry run — nothing changed. Re-run with --apply to perform the repair.');
            return;
        }

        for (const c of toClose) {
            await conn.query(`UPDATE driverShifts SET endTime = ? WHERE id = ? AND endTime IS NULL`, [c.end, c.id]);
        }
        if (toDelete.length > 0) {
            await conn.query(`DELETE FROM driverShifts WHERE id IN (?)`, [toDelete.map(d => d.id)]);
        }
        for (const c of toCap) {
            await conn.query(`UPDATE driverShifts SET endTime = ? WHERE id = ?`, [c.newEnd, c.id]);
        }
        console.log(`\n✅ Closed ${toClose.length}, deleted ${toDelete.length}, capped ${toCap.length}.`);
    } finally {
        await conn.end();
    }
}

main().catch(err => { console.error('❌ Repair failed:', err); process.exit(1); });
