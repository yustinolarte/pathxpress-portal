/**
 * Backfill paymentDate for invoices already marked 'paid' before paymentDate
 * started being recorded. Uses updatedAt as the best available estimate of
 * when the status changed to 'paid'.
 *
 * Run with: npx tsx scripts/backfill-invoice-payment-date.ts
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

    const url = new URL(DATABASE_URL);
    const connection = await mysql.createConnection({
        host: url.hostname,
        port: parseInt(url.port || '3306'),
        user: url.username,
        password: url.password,
        database: url.pathname.slice(1),
        ssl: { rejectUnauthorized: false }
    });

    console.log('✅ Connected to database');

    try {
        const [result]: any = await connection.query(
            "UPDATE invoices SET paymentDate = updatedAt WHERE status = 'paid' AND paymentDate IS NULL"
        );
        console.log(`✅ Backfilled paymentDate for ${result.affectedRows} invoice(s)`);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await connection.end();
        console.log('👋 Database connection closed');
    }
}

main();
