/**
 * One-off: corrects the COD collection date of waybill PX202600987-828.
 *
 * The order was delivered on 2026-08-01 16:54:06 (server clock, ~20:54 Dubai) but
 * the COD record was only flagged as collected on 2026-08-08, which pushed it past
 * the Friday 18:00 Dubai weekly cutoff and out of the remittance batch it belongs to.
 * Realigns collectedDate with the actual delivery instant.
 *
 * Run with:  npx tsx scripts/fix-cod-collected-date-PX202600987-828.ts [--yes]
 *
 * The timestamp is written as a literal string so the driver's timezone handling
 * cannot shift the stored wall-clock value.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const WAYBILL = 'PX202600987-828';
const NEW_COLLECTED_DATE = '2026-08-01 16:54:06'; // = orders.lastStatusUpdate (delivery)

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
    const [orderRows]: any = await connection.query(
      'SELECT id, status, lastStatusUpdate FROM orders WHERE waybillNumber = ?', [WAYBILL]
    );
    const order = orderRows[0];
    if (!order) {
      console.error(`❌ Waybill ${WAYBILL} not found.`);
      return;
    }

    const [codRows]: any = await connection.query(
      'SELECT id, status, collectedDate, remittedToClientDate FROM codRecords WHERE shipmentId = ? AND status <> "cancelled"',
      [order.id]
    );
    if (codRows.length !== 1) {
      console.error(`❌ Expected exactly 1 active COD record, found ${codRows.length}. Aborting.`);
      return;
    }
    const cod = codRows[0];

    // Never rewrite the collection date of money already paid out to the client —
    // that would desync the record from the remittance it was settled in.
    const [items]: any = await connection.query(
      'SELECT COUNT(*) c FROM codRemittanceItems WHERE codRecordId = ?', [cod.id]
    );
    if (cod.status === 'remitted' || cod.remittedToClientDate || Number(items[0].c) > 0) {
      console.error('❌ This COD record is already remitted. Aborting.');
      return;
    }

    console.log(`Waybill ${WAYBILL} (order ${order.id}, status "${order.status}")`);
    console.log(`  delivered at : ${order.lastStatusUpdate}`);
    console.log(`  COD record   : #${cod.id} (${cod.status})`);
    console.log(`  collectedDate: ${cod.collectedDate}  ->  ${NEW_COLLECTED_DATE}\n`);

    if (!confirmed) {
      console.log('ℹ️  Re-run with --yes to apply.');
      return;
    }

    const [res]: any = await connection.query(
      'UPDATE codRecords SET collectedDate = ? WHERE id = ?', [NEW_COLLECTED_DATE, cod.id]
    );
    const [after]: any = await connection.query(
      'SELECT collectedDate FROM codRecords WHERE id = ?', [cod.id]
    );
    console.log(`✅ ${res.affectedRows} row updated — collectedDate is now ${after[0].collectedDate}`);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main();
