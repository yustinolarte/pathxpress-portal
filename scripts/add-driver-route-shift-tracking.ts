/**
 * Adds shift<->route linkage + time/COD reporting columns to driverRoutes,
 * so per-route active time and driver shifts can be reconciled server-side.
 *
 * Usage: npx tsx scripts/add-driver-route-shift-tracking.ts
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
        console.log('📦 Adding shift/route tracking columns to driverRoutes...');

        await addColumn(connection, 'shiftId', `ALTER TABLE driverRoutes ADD COLUMN shiftId INT DEFAULT NULL`);
        await addColumn(connection, 'startedAt', `ALTER TABLE driverRoutes ADD COLUMN startedAt TIMESTAMP DEFAULT NULL`);
        await addColumn(connection, 'finishedAt', `ALTER TABLE driverRoutes ADD COLUMN finishedAt TIMESTAMP DEFAULT NULL`);
        await addColumn(connection, 'activeSeconds', `ALTER TABLE driverRoutes ADD COLUMN activeSeconds INT DEFAULT NULL`);
        await addColumn(connection, 'codCollectedReported', `ALTER TABLE driverRoutes ADD COLUMN codCollectedReported DECIMAL(10,2) DEFAULT NULL`);
        await addColumn(connection, 'completedStopsReported', `ALTER TABLE driverRoutes ADD COLUMN completedStopsReported INT DEFAULT NULL`);

        try {
            await connection.query(`CREATE INDEX driverRoutes_shiftId_idx ON driverRoutes (shiftId)`);
            console.log('  ✅ driverRoutes_shiftId_idx created');
        } catch (error: any) {
            if (error.code === 'ER_DUP_KEYNAME') {
                console.log('  ⚠️ driverRoutes_shiftId_idx already exists, skipping...');
            } else {
                throw error;
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
