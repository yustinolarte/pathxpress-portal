/**
 * One-time migration: renumber all existing invoices to INV-YYYY-MM-001 format.
 * Run with: npx tsx server/migrate-invoice-numbers.ts
 */
import mysql from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import { asc, eq } from "drizzle-orm";
import { invoices } from "../drizzle/schema";
import * as dotenv from "dotenv";

dotenv.config();

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const pool = mysql.createPool({ uri: url, connectionLimit: 2 });
  const db = drizzle(pool);

  // Fetch all invoices ordered by issue date ascending
  const all = await db
    .select({ id: invoices.id, issueDate: invoices.issueDate, invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .orderBy(asc(invoices.issueDate));

  console.log(`Found ${all.length} invoices to renumber.`);

  // Group by YYYY-MM of issueDate
  const groups = new Map<string, typeof all>();
  for (const inv of all) {
    const d = new Date(inv.issueDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(inv);
  }

  let updated = 0;
  for (const [ym, group] of Array.from(groups.entries())) {
    for (let i = 0; i < group.length; i++) {
      const seq = String(i + 1).padStart(3, "0");
      const newNumber = `INV-${ym}-${seq}`;
      const inv = group[i];

      if (inv.invoiceNumber === newNumber) continue; // already correct

      console.log(`  ${inv.invoiceNumber || `(id ${inv.id})`}  →  ${newNumber}`);
      await db.update(invoices).set({ invoiceNumber: newNumber }).where(eq(invoices.id, inv.id));
      updated++;
    }
  }

  console.log(`\nDone. ${updated} invoices updated.`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
