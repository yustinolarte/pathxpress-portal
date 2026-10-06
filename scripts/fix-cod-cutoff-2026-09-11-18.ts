/**
 * One-off: aligns COD collection with the 2026-09-11..2026-09-18 weekly cutoff
 * for two waybills whose collection was recorded after the Friday cutoff had
 * already passed, pushing them into the following week's batch.
 *
 * - PX202601270-Q7C (order 2377): already status "collected" but collectedDate
 *   was 2026-09-19 (after cutoff). Realigned to lastStatusUpdate (delivery
 *   instant, 2026-09-14 06:15:29), which falls inside the 11-18 window.
 * - PX202601372-A7U (order 2482): was "pending_collection". Marked collected
 *   (cash, confirmed by office) with collectedDate = lastStatusUpdate
 *   (2026-09-17 17:17:53), also inside the 11-18 window.
 *
 * PX202601285-QS4 (order 2393) was deliberately excluded: delivered 2026-09-04
 * (a week earlier) and already remitted to the client — not touched.
 *
 * Run with:  npx tsx scripts/fix-cod-cutoff-2026-09-11-18.ts [--yes]
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const TARGETS = [
  { orderId: 2377, waybill: 'PX202601270-Q7C', action: 'realign' as const },
  { orderId: 2482, waybill: 'PX202601372-A7U', action: 'mark_collected' as const },
];

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment');
    process.exit(1);
  }

  const confirmed = process.argv.includes('--yes');
  const url = new URL(DATABASE_URL);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port || '3306'),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
    dateStrings: true,
  });

  try {
    for (const target of TARGETS) {
      const [orderRows]: any = await connection.query(
        'SELECT id, waybillNumber, status, lastStatusUpdate FROM orders WHERE id = ?', [target.orderId]
      );
      const order = orderRows[0];
      if (!order || order.waybillNumber !== target.waybill) {
        console.error(`❌ Order ${target.orderId} / ${target.waybill} mismatch. Aborting this target.`);
        continue;
      }

      const [codRows]: any = await connection.query(
        'SELECT id, status, collectedMethod, collectedDate, remittedToClientDate FROM codRecords WHERE shipmentId = ? AND status <> "cancelled"',
        [order.id]
      );
      if (codRows.length !== 1) {
        console.error(`❌ ${target.waybill}: expected exactly 1 active COD record, found ${codRows.length}. Skipping.`);
        continue;
      }
      const cod = codRows[0];

      const [items]: any = await connection.query(
        'SELECT COUNT(*) c FROM codRemittanceItems WHERE codRecordId = ?', [cod.id]
      );
      if (cod.status === 'remitted' || cod.remittedToClientDate || Number(items[0].c) > 0) {
        console.error(`❌ ${target.waybill}: COD record already remitted. Skipping (never rewrite paid-out money).`);
        continue;
      }

      const newCollectedDate = order.lastStatusUpdate;

      console.log(`\n${target.waybill} (order ${order.id}, status "${order.status}")`);
      console.log(`  delivered at   : ${order.lastStatusUpdate}`);
      console.log(`  COD record #${cod.id}: status "${cod.status}" -> "collected"`);
      console.log(`  collectedMethod: ${cod.collectedMethod ?? '(null)'} -> ${cod.collectedMethod ?? 'cash'}`);
      console.log(`  collectedDate  : ${cod.collectedDate ?? '(null)'} -> ${newCollectedDate}`);

      if (!confirmed) {
        continue;
      }

      const method = cod.collectedMethod ?? 'cash';
      const [res]: any = await connection.query(
        'UPDATE codRecords SET status = "collected", collectedMethod = ?, collectedDate = ? WHERE id = ?',
        [method, newCollectedDate, cod.id]
      );
      const [after]: any = await connection.query(
        'SELECT status, collectedMethod, collectedDate FROM codRecords WHERE id = ?', [cod.id]
      );
      console.log(`  ✅ ${res.affectedRows} row updated ->`, after[0]);
    }

    if (!confirmed) {
      console.log('\nℹ️  Dry run only. Re-run with --yes to apply.');
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main();
