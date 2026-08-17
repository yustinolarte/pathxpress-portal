/**
 * Adds payAtOrigin to clientAccounts, and origin payment fields to orders —
 * supports pay-per-shipment clients (e.g. Walk-in) settled cash/card at
 * drop-off instead of periodic invoicing.
 *
 * Usage: npx tsx scripts/add-pay-at-origin.ts
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { URL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const parsedUrl = new URL(process.env.DATABASE_URL || '');

const dbConfig = {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port) || 3306,
    user: parsedUrl.username,
    password: parsedUrl.password,
    database: parsedUrl.pathname.slice(1),
};

const COLUMNS: Array<[string, string]> = [
    ['clientAccounts.payAtOrigin', 'ALTER TABLE clientAccounts ADD COLUMN payAtOrigin int NOT NULL DEFAULT 0'],
    ['orders.originPaymentCollected', 'ALTER TABLE orders ADD COLUMN originPaymentCollected int NOT NULL DEFAULT 0'],
    ['orders.originPaymentMethod', 'ALTER TABLE orders ADD COLUMN originPaymentMethod varchar(10) DEFAULT NULL'],
    ['orders.originPaymentAmount', 'ALTER TABLE orders ADD COLUMN originPaymentAmount varchar(50) DEFAULT NULL'],
    ['orders.originPaymentReference', 'ALTER TABLE orders ADD COLUMN originPaymentReference varchar(100) DEFAULT NULL'],
    ['orders.originPaymentCollectedAt', 'ALTER TABLE orders ADD COLUMN originPaymentCollectedAt timestamp DEFAULT NULL'],
];

async function migrate() {
    console.log('🔌 Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);

    try {
        for (const [name, ddl] of COLUMNS) {
            try {
                await connection.query(ddl);
                console.log(`  ✅ ${name} added`);
            } catch (error: any) {
                if (error.code === 'ER_DUP_FIELDNAME') {
                    console.log(`  ⚠️ ${name} already exists, skipping...`);
                } else {
                    throw error;
                }
            }
        }
        console.log('\n✅ Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

migrate();
