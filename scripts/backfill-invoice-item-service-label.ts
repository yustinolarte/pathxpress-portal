/**
 * Backfill the service short code inside existing invoice item descriptions.
 *
 * Invoice lines are stored as "WAYBILL - LABEL - 2.5kg - City". The domestic
 * invoice generator used to know only DOM/SDD/BULLET, so orders on the newer
 * services (PREFERRED_TIME, PREFERRED_TIME_SDD, EXPRESS_ZONE2) were written
 * with the label "DOM". This rewrites just the label segment of already-issued
 * lines to match the order's real service type.
 *
 * Only domestic services are touched — international lines intentionally keep
 * the full service code written by generateIntlInvoice.
 *
 * Dry run (default):  npx tsx scripts/backfill-invoice-item-service-label.ts
 * Apply:              npx tsx scripts/backfill-invoice-item-service-label.ts --apply
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { abbreviateServiceType } from '../shared/const';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const APPLY = process.argv.includes('--apply');

// Domestic codes only; anything else (intl, unknown) is left untouched.
const DOMESTIC_CODES: Record<string, string> = {
  DOM: 'DOM',
  SDD: 'SDD',
  'SAME DAY': 'SDD',
  BULLET: 'BULLET',
  EXPRESS_ZONE2: 'EXPRESS_ZONE2',
  PREFERRED_TIME: 'PREFERRED_TIME',
  PREFERRED_TIME_SDD: 'PREFERRED_TIME_SDD',
};

async function main() {
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment');
    process.exit(1);
  }

  const url = new URL(DATABASE_URL);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port || '3306'),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  });

  console.log(`✅ Connected to database${APPLY ? '' : ' (DRY RUN — pass --apply to write)'}`);

  try {
    const [rows]: any = await connection.query(
      `SELECT ii.id, ii.description, o.serviceType
         FROM invoiceItems ii
         JOIN orders o ON o.id = ii.shipmentId
        WHERE ii.description LIKE '% - %kg - %'`
    );

    let changed = 0;
    for (const row of rows as Array<{ id: number; description: string; serviceType: string | null }>) {
      const svcUpper = (row.serviceType || 'DOM').toUpperCase();
      const canonical = DOMESTIC_CODES[svcUpper];
      if (!canonical) continue; // international or unknown → leave as-is

      const parts = row.description.split(' - ');
      if (parts.length < 4) continue; // FOD fee / manual lines

      const expected = abbreviateServiceType(canonical);
      if (parts[1] === expected) continue;

      const updated = [parts[0], expected, ...parts.slice(2)].join(' - ');
      changed++;
      console.log(`  #${row.id}: "${row.description}" → "${updated}"`);

      if (APPLY) {
        await connection.query('UPDATE invoiceItems SET description = ? WHERE id = ?', [updated, row.id]);
      }
    }

    console.log(
      APPLY
        ? `✅ Updated ${changed} invoice item(s)`
        : `ℹ️  ${changed} invoice item(s) would be updated — re-run with --apply`
    );
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
    console.log('👋 Database connection closed');
  }
}

main();
