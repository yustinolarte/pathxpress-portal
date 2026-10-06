/**
 * One-off: records the COD collection for waybill PX202601261-JCK so it lands in
 * this week's remittance batch.
 *
 * Order 2368 (client 26 "Prasha FZE-LLC") was delivered on 2026-08-29 10:34:20
 * (server clock / UTC, ~14:34 Dubai) but its COD record #763 was left in
 * 'pending_collection' — never flagged as collected — so it never entered any
 * remittance batch. The cash was taken at the door on delivery; this aligns the
 * record with that: status 'collected', collectedDate = orders.lastStatusUpdate.
 *
 * Fee: client 26's COD fee is 0% / 0 min (matches every other client-26 record),
 * so feeAmount = 0.00.
 *
 * Run with:  npx tsx scripts/fix-cod-collected-date-PX202601261-JCK.ts [--yes]
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const WAYBILL = 'PX202601261-JCK';
const NEW_COLLECTED_DATE = '2026-08-29 10:34:20'; // = orders.lastStatusUpdate (delivery)
const NEW_FEE = '0.00';

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
      'SELECT id, status, lastStatusUpdate, clientId FROM orders WHERE waybillNumber = ?', [WAYBILL]
    );
    const order = orderRows[0];
    if (!order) {
      console.error(`❌ Waybill ${WAYBILL} not found.`);
      return;
    }

    const [codRows]: any = await connection.query(
      'SELECT id, status, collectedDate, collectedMethod, feeAmount, allowedMethods, remittedToClientDate FROM codRecords WHERE shipmentId = ? AND status <> "cancelled"',
      [order.id]
    );
    if (codRows.length !== 1) {
      console.error(`❌ Expected exactly 1 active COD record, found ${codRows.length}. Aborting.`);
      return;
    }
    const cod = codRows[0];

    const [items]: any = await connection.query(
      'SELECT COUNT(*) c FROM codRemittanceItems WHERE codRecordId = ?', [cod.id]
    );
    if (cod.status === 'remitted' || cod.remittedToClientDate || Number(items[0].c) > 0) {
      console.error('❌ This COD record is already remitted. Aborting.');
      return;
    }
    if (cod.allowedMethods !== 'cash') {
      console.error(`❌ allowedMethods is "${cod.allowedMethods}", expected "cash". Aborting — fee logic differs for card.`);
      return;
    }

    console.log(`Waybill ${WAYBILL} (order ${order.id}, client ${order.clientId}, status "${order.status}")`);
    console.log(`  delivered at  : ${order.lastStatusUpdate}`);
    console.log(`  COD record    : #${cod.id}`);
    console.log(`  status        : ${cod.status}  ->  collected`);
    console.log(`  collectedDate : ${cod.collectedDate}  ->  ${NEW_COLLECTED_DATE}`);
    console.log(`  collectedMethod: ${cod.collectedMethod}  ->  cash`);
    console.log(`  feeAmount     : ${cod.feeAmount}  ->  ${NEW_FEE}\n`);

    if (!confirmed) {
      console.log('ℹ️  Re-run with --yes to apply.');
      return;
    }

    const [res]: any = await connection.query(
      `UPDATE codRecords
         SET status = 'collected', collectedDate = ?, collectedMethod = 'cash', feeAmount = ?, updatedAt = UTC_TIMESTAMP()
       WHERE id = ?`,
      [NEW_COLLECTED_DATE, NEW_FEE, cod.id]
    );
    const [after]: any = await connection.query(
      'SELECT status, collectedDate, collectedMethod, feeAmount FROM codRecords WHERE id = ?', [cod.id]
    );
    console.log(`✅ ${res.affectedRows} row updated —`, JSON.stringify(after[0]));
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main();
