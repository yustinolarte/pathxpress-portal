/**
 * Adds isRto / rtoAt / rtoSnapshot to the orders table — Return to Origin:
 * the same waybill is sent back to the shipper (see server/rto.ts).
 *
 * Usage: npx tsx scripts/add-order-rto.ts
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
    ['isRto', 'ALTER TABLE orders ADD COLUMN isRto int NOT NULL DEFAULT 0'],
    ['rtoAt', 'ALTER TABLE orders ADD COLUMN rtoAt timestamp NULL DEFAULT NULL'],
    ['rtoSnapshot', 'ALTER TABLE orders ADD COLUMN rtoSnapshot text DEFAULT NULL'],
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
