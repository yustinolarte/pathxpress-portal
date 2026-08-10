/**
 * Repairs routeOrders.sequence across existing routes.
 *
 * Two defects left the column inconsistent:
 *   1. addOrdersToRoute derived the next sequence from the ROW COUNT, so after
 *      removeOrderFromRoute left gaps (1,2,5,6) the new stops were handed 5 and
 *      6 again — two stops sharing a number, with a non-deterministic ORDER BY.
 *   2. Legacy rows carry sequence = NULL, which MySQL sorts FIRST on ASC, so
 *      they jumped ahead of stop #1.
 *
 * What it does per route:
 *   - reads stops in their canonical order (`sequence IS NULL, sequence, id`);
 *   - if the route has NO finished stops, also applies enforcePrecedence so no
 *     delivery sits ahead of its own pickup (the driver app would show that
 *     stop permanently blocked);
 *   - if the route HAS history, the relative order is left exactly as-is and
 *     only the numbering is compacted. Renumbering history is harmless;
 *     reordering it is not.
 *   - writes 1..N in a single UPDATE ... CASE.
 *
 * Dry-run by default — it rewrites live data, so it needs --apply to commit.
 *
 * Usage:
 *   npx tsx scripts/recompact-route-sequences.ts                      # preview all
 *   npx tsx scripts/recompact-route-sequences.ts --route=DXB-2026-ABC123
 *   npx tsx scripts/recompact-route-sequences.ts --apply
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { URL } from 'url';
import { enforcePrecedence, findPrecedenceViolation } from '../shared/routeSequence';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const APPLY = process.argv.includes('--apply');
const ROUTE_ARG = process.argv.find(a => a.startsWith('--route='))?.split('=')[1];

// Mirrors FINISHED_STOP_STATUSES in server/driverAdmin.ts — 'on_hold' is not
// finished, the driver merely postponed it.
const FINISHED = new Set(['picked_up', 'delivered', 'attempted', 'returned', 'failed']);

const parsedUrl = new URL(process.env.DATABASE_URL || '');
const dbConfig = {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port) || 3306,
    user: parsedUrl.username,
    password: parsedUrl.password,
    database: parsedUrl.pathname.slice(1),
};

interface StopRow {
    id: number;
    orderId: number;
    type: 'pickup' | 'delivery';
    status: string | null;
    sequence: number | null;
    waybillNumber: string | null;
}

async function run() {
    console.log(`🔌 Connecting to database... (${APPLY ? 'APPLY' : 'DRY-RUN'})`);
    const connection = await mysql.createConnection(dbConfig);

    const stats = {
        routes: 0, withDuplicates: 0, withNulls: 0, withGaps: 0,
        withViolations: 0, violationsFixed: 0, routesRewritten: 0, rowsUpdated: 0,
    };

    try {
        const [routeRows] = await connection.query<any[]>(
            ROUTE_ARG
                ? 'SELECT id FROM driverRoutes WHERE id = ? ORDER BY date DESC'
                : 'SELECT id FROM driverRoutes ORDER BY date DESC',
            ROUTE_ARG ? [ROUTE_ARG] : [],
        );
        console.log(`📋 ${routeRows.length} route(s) to scan\n`);

        for (const { id: routeId } of routeRows) {
            stats.routes++;

            const [stops] = await connection.query<any[]>(
                `SELECT ro.id, ro.orderId, ro.type, ro.status, ro.sequence, o.waybillNumber
                   FROM routeOrders ro
                   LEFT JOIN orders o ON o.id = ro.orderId
                  WHERE ro.routeId = ?
                  ORDER BY ro.sequence IS NULL, ro.sequence, ro.id`,
                [routeId],
            );
            if (stops.length === 0) continue;

            const current = stops as StopRow[];
            const seqs = current.map(s => s.sequence);
            const nonNull = seqs.filter((s): s is number => s !== null);
            const hasNulls = seqs.some(s => s === null);
            const hasDuplicates = new Set(nonNull).size !== nonNull.length;
            const hasGaps = nonNull.some((s, i) => s !== i + 1) || nonNull.length !== current.length;

            if (hasNulls) stats.withNulls++;
            if (hasDuplicates) stats.withDuplicates++;
            if (hasGaps || hasNulls) stats.withGaps++;

            const hasHistory = current.some(s => FINISHED.has(s.status ?? ''));
            const asSequence = current.map(s => ({ key: s.id, orderId: s.orderId, type: s.type }));
            const violation = findPrecedenceViolation(asSequence);
            if (violation) stats.withViolations++;

            // Only routes with nothing worked yet get their order changed.
            let target = current;
            if (violation && !hasHistory) {
                const fixedKeys = enforcePrecedence(asSequence).map(s => s.key as number);
                const byId = new Map(current.map(s => [s.id, s]));
                target = fixedKeys.map(k => byId.get(k)!);
                stats.violationsFixed++;
            }

            const needsWrite = hasNulls || hasDuplicates || hasGaps
                || target.some((s, i) => s.id !== current[i].id);
            if (!needsWrite) continue;

            stats.routesRewritten++;
            stats.rowsUpdated += target.length;

            const reasons = [
                hasDuplicates && 'duplicados',
                hasNulls && 'NULLs',
                hasGaps && !hasDuplicates && !hasNulls && 'huecos',
                violation && (hasHistory ? 'precedencia rota (CONSERVADA: ruta con historial)' : 'precedencia corregida'),
            ].filter(Boolean).join(', ');

            console.log(`\n🔧 ${routeId} — ${reasons}`);
            console.log('   antes : ' + current.map(s =>
                `${s.sequence ?? 'NULL'}:${s.type === 'pickup' ? 'P' : 'D'}${s.orderId}`).join(' → '));
            console.log('   después: ' + target.map((s, i) =>
                `${i + 1}:${s.type === 'pickup' ? 'P' : 'D'}${s.orderId}`).join(' → '));

            if (APPLY) {
                const cases = target.map((s, i) => `WHEN ${Number(s.id)} THEN ${i + 1}`).join(' ');
                const ids = target.map(s => Number(s.id)).join(', ');
                await connection.query(
                    `UPDATE routeOrders SET sequence = CASE id ${cases} END
                      WHERE routeId = ? AND id IN (${ids})`,
                    [routeId],
                );
            }
        }

        console.log('\n' + '─'.repeat(60));
        console.log(`Rutas escaneadas ....... ${stats.routes}`);
        console.log(`  con secuencias NULL .. ${stats.withNulls}`);
        console.log(`  con duplicados ....... ${stats.withDuplicates}`);
        console.log(`  con huecos ........... ${stats.withGaps}`);
        console.log(`  con precedencia rota . ${stats.withViolations} (corregidas: ${stats.violationsFixed})`);
        console.log(`Rutas a reescribir ..... ${stats.routesRewritten}`);
        console.log(`Filas afectadas ........ ${stats.rowsUpdated}`);
        console.log('─'.repeat(60));
        console.log(APPLY
            ? '\n✅ Cambios aplicados.'
            : '\n👀 DRY-RUN — no se escribió nada. Repite con --apply para confirmar.');
    } catch (error) {
        console.error('❌ Backfill failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

run();
