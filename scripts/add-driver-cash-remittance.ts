/**
 * Adds the driver cash hand-over columns to driverRoutes, so the admin COD
 * reconciliation can record when a driver physically returned the cash
 * collected on a route (card/Tap to Pay never passes through the driver).
 *
 * Usage: npx tsx scripts/add-driver-cash-remittance.ts
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { URL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const dbUrl = process.env.DATABASE_URL || '';
const parsedUrl = new URL(dbUrl);

const dbConfig = {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port) || 3306,
    user: parsedUrl.username,
    password: parsedUrl.password,
    database: parsedUrl.pathname.slice(1),
};

async function addColumn(connection: mysql.Connection, label: string, sql: string) {
    try {
        await connection.query(sql);
        console.log(`  ✅ ${label} added`);
    } catch (error: any) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log(`  ⚠️ ${label} already exists, skipping...`);
        } else {
            throw error;
        }
    }
}

async function migrate() {
    console.log('🔌 Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);

    try {
        console.log('📦 Adding cash remittance columns to driverRoutes...');

        await addColumn(connection, 'cashRemittedAt', `ALTER TABLE driverRoutes ADD COLUMN cashRemittedAt TIMESTAMP NULL DEFAULT NULL`);
        await addColumn(connection, 'cashRemittedAmount', `ALTER TABLE driverRoutes ADD COLUMN cashRemittedAmount DECIMAL(10,2) DEFAULT NULL`);

        console.log('\n✅ Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

migrate();
