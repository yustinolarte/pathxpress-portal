/**
 * Script to clear all invoices and invoice items.
 * IRREVERSIBLE — deletes every invoice for every client, no filtering, no backup.
 *
 * Run with: npx tsx scripts/clear-invoices.ts
 * Requires typing the database name to confirm (prints the row count first).
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { createInterface } from 'node:readline/promises';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
    if (!DATABASE_URL) {
        console.error('❌ DATABASE_URL not found in environment');
        process.exit(1);
    }

    // Parse DATABASE_URL
    const url = new URL(DATABASE_URL);
    const dbName = url.pathname.slice(1); // Remove leading /
    const connection = await mysql.createConnection({
        host: url.hostname,
        port: parseInt(url.port || '3306'),
        user: url.username,
        password: url.password,
        database: dbName,
        ssl: { rejectUnauthorized: false }
    });

    console.log('✅ Connected to database');

    try {
        const [[{ count }]]: any = await connection.query('SELECT COUNT(*) as count FROM invoices');
        console.log(`⚠️  This will permanently delete ${count} invoice(s) and all their line items from "${dbName}" (${url.hostname}). This cannot be undone.`);

        if (count > 0) {
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            const answer = await rl.question(`Type the database name ("${dbName}") to confirm: `);
            rl.close();
            if (answer.trim() !== dbName) {
                console.log('❌ Confirmation did not match — aborting, nothing was deleted.');
                return;
            }
        }

        console.log('🗑️ Clearing invoice items...');
        await connection.query('DELETE FROM invoiceItems');
        console.log('   ✅ Invoice items cleared');

        console.log('🗑️ Clearing invoices...');
        await connection.query('DELETE FROM invoices');
        console.log('   ✅ Invoices cleared');

        console.log('\n✨ All invoices have been deleted successfully!');

    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await connection.end();
        console.log('\n👋 Database connection closed');
    }
}

main();
