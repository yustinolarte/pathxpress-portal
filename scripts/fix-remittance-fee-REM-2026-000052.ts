/**
 * One-off: zeroes the fee on CCOD remittance REM-2026-000052 only.
 *
 * Sets:
 *   codRemittances.feeAmount      -> 0.00
 *   codRemittances.feePercentage  -> 0
 *   codRemittances.totalAmount    -> grossAmount (net = gross when fee is 0)
 *   codRecords.feeAmount          -> 0.00   (for each linked COD record)
 *   codRemittances.paymentReference -> set to PAYMENT_REFERENCE below
 *
 * Run with:  npx tsx scripts/fix-remittance-fee-REM-2026-000052.ts        (preview only)
 *            npx tsx scripts/fix-remittance-fee-REM-2026-000052.ts --yes  (apply)
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const REM_NUMBER = 'REM-2026-000052';
const NEW_FEE = '0.00';
const NEW_FEE_PCT = '0';
const PAYMENT_REFERENCE = 'Dom2026091223508541';

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
    const [remRows]: any = await connection.query(
      'SELECT id, clientId, status, grossAmount, feeAmount, feePercentage, totalAmount, currency, paymentReference FROM codRemittances WHERE remittanceNumber = ?',
      [REM_NUMBER]
    );
    const rem = remRows[0];
    if (!rem) {
      console.error(`❌ Remittance ${REM_NUMBER} not found.`);
      return;
    }
    if (rem.status === 'completed') {
      console.error('❌ Remittance is already "completed" (paid & client notified). Aborting — correct out of band.');
      return;
    }

    const [items]: any = await connection.query(
      'SELECT codRecordId, shipmentId, amount FROM codRemittanceItems WHERE remittanceId = ?', [rem.id]
    );
    const codRecordIds = items.map((i: any) => i.codRecordId);

    let codRows: any[] = [];
    if (codRecordIds.length > 0) {
      const [rows]: any = await connection.query(
        `SELECT id, shipmentId, codAmount, feeAmount, collectedMethod, status FROM codRecords WHERE id IN (${codRecordIds.map(() => '?').join(',')})`,
        codRecordIds
      );
      codRows = rows;
    }

    const NEW_TOTAL = rem.grossAmount;

    console.log(`Remittance ${REM_NUMBER} (id ${rem.id}, client ${rem.clientId}, status "${rem.status}")`);
    console.log(`  grossAmount   : ${rem.grossAmount}`);
    console.log(`  feeAmount     : ${rem.feeAmount}  ->  ${NEW_FEE}`);
    console.log(`  feePercentage : ${rem.feePercentage}  ->  ${NEW_FEE_PCT}`);
    console.log(`  totalAmount   : ${rem.totalAmount}  ->  ${NEW_TOTAL}`);
    console.log(`  paymentReference : ${rem.paymentReference}  ->  ${PAYMENT_REFERENCE}`);
    console.log(`Linked COD records (${codRows.length}):`);
    for (const cod of codRows) {
      console.log(`  #${cod.id} shipment ${cod.shipmentId} (${cod.collectedMethod}, ${cod.status})  feeAmount ${cod.feeAmount}  ->  ${NEW_FEE}`);
    }
    console.log('');

    if (!confirmed) {
      console.log('ℹ️  Preview only. Re-run with --yes to apply.');
      return;
    }

    const [r1]: any = codRecordIds.length > 0
      ? await connection.query(
          `UPDATE codRecords SET feeAmount = ? WHERE id IN (${codRecordIds.map(() => '?').join(',')})`,
          [NEW_FEE, ...codRecordIds]
        )
      : [{ affectedRows: 0 }];
    const [r2]: any = await connection.query(
      'UPDATE codRemittances SET feeAmount = ?, feePercentage = ?, totalAmount = ?, paymentReference = ? WHERE id = ?',
      [NEW_FEE, NEW_FEE_PCT, NEW_TOTAL, PAYMENT_REFERENCE, rem.id]
    );
    const [after]: any = await connection.query(
      'SELECT feeAmount, feePercentage, totalAmount, paymentReference FROM codRemittances WHERE id = ?', [rem.id]
    );
    console.log(`✅ codRecords rows updated: ${r1.affectedRows}`);
    console.log(`✅ codRemittances rows updated: ${r2.affectedRows}`);
    console.log(`   now: fee ${after[0].feeAmount} (${after[0].feePercentage}%), total ${after[0].totalAmount}, ref ${after[0].paymentReference}`);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main();
