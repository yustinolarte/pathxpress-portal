/**
 * One-off: corrects the fee on CCOD remittance REM-2026-000047 (id 52),
 * client 13 "Noor and grace", waybill PX202601147-TU9 / COD record #717.
 *
 * The consignee paid by card. Client 13's CCOD fee is 1.5% (cardFeePercent=1.5,
 * cardMinFee=1, no cap) => on a 200.00 AED collection the fee is 3.00, net 197.00.
 * The COD record froze a stale fee of 5.20 (2.6%) at collection time, and the
 * remittance summed that: feeAmount 5.20, totalAmount 194.80.
 *
 * Realigns both the frozen fee on the COD record and the remittance totals:
 *   codRecords.feeAmount        5.20  -> 3.00
 *   codRemittances.feeAmount    5.20  -> 3.00
 *   codRemittances.totalAmount  194.80 -> 197.00
 *   codRemittances.feePercentage   0  -> 1.5   (CCOD card rate)
 *
 * Run with:  npx tsx scripts/fix-remittance-fee-REM-2026-000047.ts [--yes]
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const REM_NUMBER = 'REM-2026-000047';
const COD_RECORD_ID = 717;
const NEW_FEE = '3.00';
const NEW_TOTAL = '197.00';
const NEW_FEE_PCT = '1.5';

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
      'SELECT id, status, grossAmount, feeAmount, feePercentage, totalAmount FROM codRemittances WHERE remittanceNumber = ?',
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
      'SELECT codRecordId FROM codRemittanceItems WHERE remittanceId = ?', [rem.id]
    );
    if (items.length !== 1 || items[0].codRecordId !== COD_RECORD_ID) {
      console.error(`❌ Unexpected remittance items: ${JSON.stringify(items)}. Aborting.`);
      return;
    }

    const [codRows]: any = await connection.query(
      'SELECT id, codAmount, feeAmount, collectedMethod, status FROM codRecords WHERE id = ?', [COD_RECORD_ID]
    );
    const cod = codRows[0];

    console.log(`Remittance ${REM_NUMBER} (id ${rem.id}, status "${rem.status}")`);
    console.log(`  grossAmount   : ${rem.grossAmount}`);
    console.log(`  feeAmount     : ${rem.feeAmount}  ->  ${NEW_FEE}`);
    console.log(`  feePercentage : ${rem.feePercentage}  ->  ${NEW_FEE_PCT}`);
    console.log(`  totalAmount   : ${rem.totalAmount}  ->  ${NEW_TOTAL}`);
    console.log(`COD record #${cod.id} (${cod.collectedMethod}, ${cod.status})`);
    console.log(`  feeAmount     : ${cod.feeAmount}  ->  ${NEW_FEE}\n`);

    if (!confirmed) {
      console.log('ℹ️  Re-run with --yes to apply.');
      return;
    }

    const [r1]: any = await connection.query(
      'UPDATE codRecords SET feeAmount = ? WHERE id = ?', [NEW_FEE, COD_RECORD_ID]
    );
    const [r2]: any = await connection.query(
      'UPDATE codRemittances SET feeAmount = ?, feePercentage = ?, totalAmount = ? WHERE id = ?',
      [NEW_FEE, NEW_FEE_PCT, NEW_TOTAL, rem.id]
    );
    const [after]: any = await connection.query(
      'SELECT feeAmount, feePercentage, totalAmount FROM codRemittances WHERE id = ?', [rem.id]
    );
    console.log(`✅ codRecords rows updated: ${r1.affectedRows}`);
    console.log(`✅ codRemittances rows updated: ${r2.affectedRows}`);
    console.log(`   now: fee ${after[0].feeAmount} (${after[0].feePercentage}%), total ${after[0].totalAmount}`);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main();
