/**
 * One-off: pulls two waybills into the weekly COD cutoff of Friday 2026-10-02
 * 18:00 Dubai (= 2026-10-02T14:00:00Z). Both COD records were still
 * 'pending_collection' although delivered; the owner confirmed on 2026-10-04
 * that the money was collected (V6R card, RDS cash), so they are marked
 * collected (fee via calculateCODFeeByMethod) with collectedDate just before
 * the cutoff.
 *
 * Run with:  npx tsx scripts/fix-cod-cutoff-2026-10-02.ts [--yes]
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { calculateCODFeeByMethod } from '../server/db';

dotenv.config();

const NEW_COLLECTED_DATE = '2026-10-02 13:59:00'; // UTC, dateStrings shape
const WAYBILLS = ['PX202601321-V6R', 'PX202601471-RDS'];
const CARD_REF = 'Confirmed by office - no gateway ref on hand';

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
    for (const waybill of WAYBILLS) {
      const [orderRows]: any = await connection.query(
        'SELECT id, status, clientId FROM orders WHERE waybillNumber = ?', [waybill]
      );
      const order = orderRows[0];
      if (!order) { console.error(`❌ ${waybill} not found.`); continue; }

      const [codRows]: any = await connection.query(
        'SELECT id, status, collectedDate, remittedToClientDate, codAmount, allowedMethods FROM codRecords WHERE shipmentId = ? AND status <> "cancelled"',
        [order.id]
      );
      if (codRows.length !== 1) {
        console.error(`❌ ${waybill}: expected 1 active COD record, found ${codRows.length}. Skipping.`);
        continue;
      }
      const cod = codRows[0];

      const [items]: any = await connection.query(
        'SELECT COUNT(*) c FROM codRemittanceItems WHERE codRecordId = ?', [cod.id]
      );
      if (cod.status === 'remitted' || cod.remittedToClientDate || Number(items[0].c) > 0) {
        console.error(`❌ ${waybill}: already remitted. Skipping.`);
        continue;
      }
      if (cod.status !== 'pending_collection' && cod.status !== 'collected') {
        console.error(`❌ ${waybill}: unexpected COD status "${cod.status}". Skipping.`);
        continue;
      }

      const method = cod.allowedMethods === 'card' ? 'card' : 'cash';
      const fee = await calculateCODFeeByMethod(parseFloat(cod.codAmount), order.clientId, method);

      console.log(`\n${waybill} (order ${order.id}, status "${order.status}", AED ${cod.codAmount})`);
      console.log(`  COD #${cod.id}: ${cod.status} -> collected, method ${method}, fee ${fee.toFixed(2)}`);
      console.log(`  collectedDate: ${cod.collectedDate ?? '(null)'} -> ${NEW_COLLECTED_DATE}`);

      if (!confirmed) continue;
      await connection.query(
        'UPDATE codRecords SET status = "collected", collectedMethod = ?, paymentReference = ?, feeAmount = ?, collectedDate = ?, updatedAt = UTC_TIMESTAMP() WHERE id = ?',
        [method, method === 'card' ? CARD_REF : null, fee.toFixed(2), NEW_COLLECTED_DATE, cod.id]
      );
      const [after]: any = await connection.query(
        'SELECT status, collectedMethod, collectedDate, feeAmount FROM codRecords WHERE id = ?', [cod.id]
      );
      console.log('  ✅ updated ->', after[0]);
    }
    if (!confirmed) console.log('\nℹ️  Dry run only. Re-run with --yes to apply.');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main();
