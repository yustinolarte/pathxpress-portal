/**
 * Adds billingExcluded / billingExcludedReason to the orders table — lets an
 * order be marked as deliberately non-billable without cancelling it.
 *
 * Usage: npx tsx scripts/add-order-billing-excluded.ts
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
    ['billingExcluded', 'ALTER TABLE orders ADD COLUMN billingExcluded int NOT NULL DEFAULT 0'],
    ['billingExcludedReason', 'ALTER TABLE orders ADD COLUMN billingExcludedReason varchar(255) DEFAULT NULL'],
];

async function migrate() {
    console.log('🔌 Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);

    try {
        for (const [name, ddl] of COLUMNS) {
            try {
                await connection.query(ddl);
                console.log(`  ✅ ${name} added to orders`);
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
