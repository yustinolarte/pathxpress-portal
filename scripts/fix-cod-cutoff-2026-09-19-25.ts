/**
 * One-off: pulls two waybills into the 2026-09-19..2026-09-25 weekly COD cutoff
 * (Friday 18:00 Dubai = 2026-09-25T14:00:00Z), confirmed with the user
 * (PathXpress owner) on 2026-09-26.
 *
 * - PX202601465-ENT (order 2580, "orden 1465"): already status "collected"
 *   (cash), but collectedDate was 2026-09-25T18:12:46Z — 4h12m after the
 *   cutoff, so it was sitting in next week's accumulating bucket. Owner
 *   confirmed the cash should count in last week's batch anyway; moved
 *   collectedDate to just before the cutoff instant.
 *
 * - PX202601298-FPR (order 2406, "orden 1298"): COD was still
 *   "pending_collection" (card, AED 477) even though the shipment itself was
 *   delivered/invoiced weeks earlier (unrelated billing invoice INV-2026-09-012,
 *   already paid). Owner confirmed the card payment was actually collected
 *   last week (19-25 sep) but has no gateway transaction reference on hand,
 *   so paymentReference is a generic office confirmation, not a real ref.
 *   Fee is computed the same way the admin "mark collected" mutation does
 *   (calculateCODFeeByMethod), not hardcoded.
 *
 * Run with:  npx tsx scripts/fix-cod-cutoff-2026-09-19-25.ts [--yes]
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { calculateCODFeeByMethod } from '../server/db';

dotenv.config();

const CUTOFF_ISO = '2026-09-25T14:00:00.000Z'; // Friday 18:00 Dubai

// The connection below uses dateStrings: true, so timestamp columns come back
// as 'YYYY-MM-DD HH:MM:SS' (UTC) and must be written back in that same shape,
// not as an ISO string with 'T'/'Z' (MySQL rejects that as an invalid datetime).
function toSqlDatetime(isoString: string): string {
  return isoString.replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

const TARGETS = [
  {
    orderId: 2580,
    waybill: 'PX202601465-ENT',
    action: 'realign' as const,
    newCollectedDate: '2026-09-25T13:59:00.000Z',
  },
  {
    orderId: 2406,
    waybill: 'PX202601298-FPR',
    action: 'mark_collected' as const,
    newCollectedDate: '2026-09-25T13:30:00.000Z',
    method: 'card' as const,
    paymentReference: 'Confirmed by office - no gateway ref on hand',
  },
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
        'SELECT id, clientId, waybillNumber, status, lastStatusUpdate FROM orders WHERE id = ?', [target.orderId]
      );
      const order = orderRows[0];
      if (!order || order.waybillNumber !== target.waybill) {
        console.error(`❌ Order ${target.orderId} / ${target.waybill} mismatch. Aborting this target.`);
        continue;
      }

      const [codRows]: any = await connection.query(
        'SELECT id, status, collectedMethod, collectedDate, remittedToClientDate, codAmount, allowedMethods, paymentReference FROM codRecords WHERE shipmentId = ? AND status <> "cancelled"',
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

      if (new Date(target.newCollectedDate) > new Date(CUTOFF_ISO)) {
        console.error(`❌ ${target.waybill}: target collectedDate is not before the cutoff. Skipping.`);
        continue;
      }

      console.log(`\n${target.waybill} (order ${order.id}, status "${order.status}")`);

      if (target.action === 'realign') {
        console.log(`  COD record #${cod.id}: status "${cod.status}" (unchanged)`);
        console.log(`  collectedDate  : ${cod.collectedDate} -> ${target.newCollectedDate}`);

        if (!confirmed) continue;

        await connection.query(
          'UPDATE codRecords SET collectedDate = ? WHERE id = ?',
          [toSqlDatetime(target.newCollectedDate), cod.id]
        );
      } else {
        const method = target.method;
        const fee = await calculateCODFeeByMethod(parseFloat(cod.codAmount), order.clientId, method);
        console.log(`  COD record #${cod.id}: status "${cod.status}" -> "collected"`);
        console.log(`  collectedMethod: ${cod.collectedMethod ?? '(null)'} -> ${method}`);
        console.log(`  paymentReference: ${cod.paymentReference ?? '(null)'} -> ${target.paymentReference}`);
        console.log(`  feeAmount      : (null) -> ${fee.toFixed(2)}`);
        console.log(`  collectedDate  : ${cod.collectedDate ?? '(null)'} -> ${target.newCollectedDate}`);

        if (!confirmed) continue;

        await connection.query(
          'UPDATE codRecords SET status = "collected", collectedMethod = ?, paymentReference = ?, feeAmount = ?, collectedDate = ? WHERE id = ?',
          [method, target.paymentReference, fee.toFixed(2), toSqlDatetime(target.newCollectedDate), cod.id]
        );
      }

      const [after]: any = await connection.query(
        'SELECT status, collectedMethod, collectedDate, feeAmount, paymentReference FROM codRecords WHERE id = ?', [cod.id]
      );
      console.log(`  ✅ updated ->`, after[0]);
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
