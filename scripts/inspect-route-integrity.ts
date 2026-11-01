/**
 * Route / stop / order consistency report — and repair of the cases that are
 * safe to fix mechanically.
 *
 * READ-ONLY by default. With --apply it writes a JSON backup of every row it is
 * about to touch to backups/ and then repairs ONLY:
 *   R1  pickup stops holding 'delivered' → 'picked_up'
 *       (the old updateOrderStatus sync stamped the order status onto every
 *       open stop of the order, whatever its leg)
 *   R2  delivery stops holding 'picked_up' with no field evidence → 'pending'
 *       (same bug, other direction)
 *   R3  pending/in_progress routes whose every stop is final → 'completed',
 *       finishedAt = last stop timestamp (nothing ever auto-completed a route)
 *
 * Everything else is REPORTED for a human to decide (never auto-fixed):
 *   A  delivery stop 'delivered' while the order is not delivered
 *   B  order delivered/cancelled while a stop on an active route is still open
 *   C  the same order leg open on two active routes
 *   D  shipments with more than one COD record (block migration 0046's unique key)
 *   E  return orders whose DELIVERY pin equals the original consignee's pin
 *      (the WhatsApp bot wrote the pickup person's location into the delivery
 *      columns of returns)
 *   F  routes in_progress for 2+ days with open stops
 *   G  'pending' routes that already have worked stops
 *
 * Usage:
 *   npx tsx scripts/inspect-route-integrity.ts            # report only
 *   npx tsx scripts/inspect-route-integrity.ts --apply    # report + repair R1-R3
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const APPLY = process.argv.includes('--apply');
const FINAL_SQL = `((ro.type = 'pickup' AND ro.status IN ('picked_up','failed','attempted'))
    OR (ro.type = 'delivery' AND ro.status IN ('delivered','failed','returned')))`;
const NO_EVIDENCE_SQL = `(ro.deliveredAt IS NULL AND ro.attemptedAt IS NULL AND ro.proofPhotoUrl IS NULL
    AND ro.proofPhotoUrl2 IS NULL AND (ro.collectedAmount IS NULL OR ro.collectedAmount = ''))`;

const REPAIRS = {
    R1: `SELECT ro.* FROM routeOrders ro WHERE ro.type = 'pickup' AND ro.status = 'delivered'`,
    R2: `SELECT ro.* FROM routeOrders ro WHERE ro.type = 'delivery' AND ro.status = 'picked_up' AND ${NO_EVIDENCE_SQL}`,
    R3: `SELECT r.*, MAX(COALESCE(ro.deliveredAt, ro.pickedUpAt, ro.attemptedAt)) lastStopAt
         FROM driverRoutes r JOIN routeOrders ro ON ro.routeId = r.id
         WHERE r.status IN ('pending','in_progress')
         GROUP BY r.id HAVING SUM(NOT ${FINAL_SQL}) = 0`,
};

const REPORTS: Record<string, string> = {
    'A delivered stop, order not delivered': `
        SELECT o.waybillNumber, o.status orderStatus, ro.routeId, ro.id stopId, ro.deliveredAt
        FROM routeOrders ro JOIN orders o ON o.id = ro.orderId
        WHERE ro.type = 'delivery' AND ro.status = 'delivered'
          AND o.status NOT IN ('delivered','returned_to_sender')
        ORDER BY ro.deliveredAt DESC`,
    'B closed order, open stop on active route': `
        SELECT o.waybillNumber, o.status orderStatus, r.id routeId, r.status routeStatus, ro.id stopId, ro.type, ro.status stopStatus
        FROM routeOrders ro JOIN orders o ON o.id = ro.orderId JOIN driverRoutes r ON r.id = ro.routeId
        WHERE r.status IN ('pending','in_progress') AND ro.status IN ('pending','in_progress','on_hold')
          AND o.status IN ('delivered','returned_to_sender','returned','canceled','cancelled')`,
    'C same leg open on two active routes': `
        SELECT o.waybillNumber, ro.type, GROUP_CONCAT(CONCAT(r.id, ':', r.status, ':', ro.status)) routes, COUNT(*) n
        FROM routeOrders ro JOIN driverRoutes r ON r.id = ro.routeId JOIN orders o ON o.id = ro.orderId
        WHERE r.status IN ('pending','in_progress') AND ro.status IN ('pending','in_progress','on_hold','attempted')
        GROUP BY ro.orderId, ro.type HAVING n > 1`,
    'D duplicate COD records': `
        SELECT c.shipmentId, o.waybillNumber, COUNT(*) n, GROUP_CONCAT(CONCAT(c.id, ':', c.status, ':', c.codAmount) ORDER BY c.id) records
        FROM codRecords c LEFT JOIN orders o ON o.id = c.shipmentId
        GROUP BY c.shipmentId HAVING n > 1`,
    'E return delivery pin = original consignee pin': `
        SELECT r.waybillNumber returnWaybill, o.waybillNumber originalWaybill, r.latitude, r.longitude, r.shipperLat, r.shipperLng
        FROM orders r JOIN orders o ON o.id = r.originalOrderId
        WHERE r.isReturn = 1 AND r.latitude IS NOT NULL AND r.latitude = o.latitude AND r.longitude = o.longitude`,
    'F in_progress 2+ days with open stops': `
        SELECT r.id, r.driverId, r.date, r.startedAt, COUNT(ro.id) stops,
               SUM(ro.status IN ('pending','in_progress','on_hold')) openStops
        FROM driverRoutes r JOIN routeOrders ro ON ro.routeId = r.id
        WHERE r.status = 'in_progress' AND COALESCE(r.startedAt, r.date) < NOW() - INTERVAL 2 DAY
        GROUP BY r.id HAVING openStops > 0 ORDER BY r.date`,
    'G pending route with worked stops': `
        SELECT r.id, r.driverId, r.date, COUNT(*) stops, SUM(ro.status <> 'pending') touched
        FROM driverRoutes r JOIN routeOrders ro ON ro.routeId = r.id
        WHERE r.status = 'pending' GROUP BY r.id HAVING touched > 0`,
};

async function main() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    console.log(`🔎 ${new URL(url).hostname}${new URL(url).pathname} — ${APPLY ? 'REPORT + REPAIR' : 'report only (read-only)'}\n`);
    const conn = await mysql.createConnection({ uri: url, dateStrings: true });

    try {
        const found: Record<string, any[]> = {};
        for (const [key, query] of Object.entries(REPAIRS)) {
            const [rows] = await conn.query(query) as any[];
            found[key] = rows as any[];
        }
        console.log(`R1 pickup stops marked 'delivered':            ${found.R1.length}`);
        console.log(`R2 delivery stops marked 'picked_up' (no POD): ${found.R2.length}`);
        console.log(`R3 open routes whose stops are all final:      ${found.R3.length}`);

        for (const [title, query] of Object.entries(REPORTS)) {
            const [rows] = await conn.query(query) as any[];
            console.log(`\n### ${title}: ${(rows as any[]).length}`);
            if ((rows as any[]).length > 0) console.table((rows as any[]).slice(0, 40));
        }

        if (!APPLY) {
            console.log('\nRead-only run. Re-run with --apply to repair R1-R3.');
            return;
        }
        const total = found.R1.length + found.R2.length + found.R3.length;
        if (total === 0) {
            console.log('\nNothing to repair.');
            return;
        }

        const backupPath = path.join(process.cwd(), 'backups',
            `route-integrity-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
        fs.writeFileSync(backupPath, JSON.stringify({ takenAt: new Date().toISOString(), ...found }, null, 2));
        console.log(`\n💾 Backup written to ${backupPath}`);

        await conn.beginTransaction();
        if (found.R1.length) {
            await conn.query(`UPDATE routeOrders SET status = 'picked_up' WHERE id IN (?)`, [found.R1.map(r => r.id)]);
        }
        if (found.R2.length) {
            await conn.query(`UPDATE routeOrders SET status = 'pending' WHERE id IN (?)`, [found.R2.map(r => r.id)]);
        }
        for (const route of found.R3) {
            await conn.query(
                `UPDATE driverRoutes SET status = 'completed', finishedAt = COALESCE(finishedAt, ?) WHERE id = ? AND status IN ('pending','in_progress')`,
                [route.lastStopAt, route.id],
            );
            await conn.query(
                `INSERT INTO routeAuditLog (routeId, action, fromValue, toValue, actor, reason) VALUES (?, 'route_auto_completed', ?, 'completed', 'system', 'inspect-route-integrity: every stop already final')`,
                [route.id, route.status],
            );
        }
        await conn.commit();
        console.log(`✅ Repaired R1=${found.R1.length} R2=${found.R2.length} R3=${found.R3.length}`);
    } catch (error) {
        try { await conn.rollback(); } catch { /* not in a transaction */ }
        throw error;
    } finally {
        await conn.end();
    }
}

main().catch(err => {
    console.error('❌', err);
    process.exit(1);
});
