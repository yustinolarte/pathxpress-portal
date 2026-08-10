/**
 * Deletes the throwaway orders an integration-test run leaves behind on the QA
 * client account, along with their COD records, tracking events and route stops.
 *
 * Run with:  npx tsx scripts/clear-test-client-orders.ts [clientId] [--dry-run] [--yes]
 *            (clientId defaults to 28, the "PathXpress QA" fixture account)
 *
 * This also runs automatically at the end of every Claude Code session via the
 * `Stop` hook in .claude/settings.json, so a test run never leaves throwaway
 * orders sitting on the QA account. Nothing else should depend on those orders
 * surviving past the end of a work session.
 *
 * Refuses to run against an account that doesn't look like a test fixture, and
 * refuses to delete any order that already carries billing history (an invoice
 * line or a COD remittance item) — that would be real money, not test noise.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const confirmed = args.includes('--yes');
  const clientId = parseInt(args.find(a => /^\d+$/.test(a)) ?? '28', 10);

  const url = new URL(DATABASE_URL);
  const dbName = url.pathname.slice(1);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port || '3306'),
    user: url.username,
    password: url.password,
    database: dbName,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const [clients]: any = await connection.query(
      'SELECT id, companyName FROM clientAccounts WHERE id = ?', [clientId]
    );
    const client = clients[0];
    if (!client) {
      console.error(`❌ Client ${clientId} not found in "${dbName}".`);
      return;
    }

    // Safety rail: only ever point this at a fixture account.
    if (!/\b(qa|test)\b/i.test(client.companyName)) {
      console.error(
        `❌ Client ${clientId} is "${client.companyName}" — that is not a test account. Aborting.`
      );
      return;
    }

    const [orderRows]: any = await connection.query(
      'SELECT id, waybillNumber, customerName, status, createdAt FROM orders WHERE clientId = ? ORDER BY id', [clientId]
    );
    if (orderRows.length === 0) {
      console.log(`✅ Client ${clientId} ("${client.companyName}") has no orders — nothing to do.`);
      return;
    }
    const orderIds: number[] = orderRows.map((o: any) => o.id);
    const idList = orderIds.join(',');

    const countOf = async (sql: string) => {
      const [r]: any = await connection.query(sql);
      return Number(r[0].c);
    };

    const invoiced = await countOf(`SELECT COUNT(*) c FROM invoiceItems WHERE shipmentId IN (${idList})`);
    const remitted = await countOf(`SELECT COUNT(*) c FROM codRemittanceItems WHERE shipmentId IN (${idList})`);
    if (invoiced > 0 || remitted > 0) {
      console.error(
        `❌ ${invoiced} invoice line(s) and ${remitted} remittance item(s) reference these orders. ` +
        'Clear that billing history first — aborting so nothing is orphaned.'
      );
      return;
    }

    const codCount = await countOf(`SELECT COUNT(*) c FROM codRecords WHERE shipmentId IN (${idList})`);
    const eventCount = await countOf(`SELECT COUNT(*) c FROM trackingEvents WHERE shipmentId IN (${idList})`);
    const stopCount = await countOf(`SELECT COUNT(*) c FROM routeOrders WHERE orderId IN (${idList})`);

    console.log(`Database: ${dbName} @ ${url.hostname}`);
    console.log(`Client ${clientId}: ${client.companyName}\n`);
    console.log(`⚠️  ${orderRows.length} order(s) to delete, plus ${codCount} COD record(s), ${eventCount} tracking event(s), ${stopCount} route stop(s).`);
    console.log(`   Waybills: ${orderRows.map((o: any) => o.waybillNumber).join(', ')}\n`);

    if (dryRun) {
      console.log('🔍 --dry-run: nothing was deleted.');
      return;
    }
    if (!confirmed) {
      console.log('ℹ️  Re-run with --yes to actually delete.');
      return;
    }

    // Children first — these tables hold plain int references, not real FKs.
    await connection.query(`DELETE FROM codRecords WHERE shipmentId IN (${idList})`);
    console.log(`   ✅ ${codCount} COD record(s) deleted`);
    await connection.query(`DELETE FROM trackingEvents WHERE shipmentId IN (${idList})`);
    console.log(`   ✅ ${eventCount} tracking event(s) deleted`);
    await connection.query(`DELETE FROM routeOrders WHERE orderId IN (${idList})`);
    console.log(`   ✅ ${stopCount} route stop(s) deleted`);
    const [res]: any = await connection.query('DELETE FROM orders WHERE clientId = ?', [clientId]);
    console.log(`   ✅ ${res.affectedRows} order(s) deleted`);

    console.log(`\n✨ Test orders for client ${clientId} cleared.`);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main();
