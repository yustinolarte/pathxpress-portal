/**
 * Applies drizzle/0034_driver_shifts_driver_endtime_idx.sql — driverShifts had
 * no index beyond the PK, so findOpenShift/findOrCreateOpenShift (called on
 * every clock-in, route start and dispatch refresh) did a full table scan.
 *
 * Usage: npx tsx scripts/add-driver-shifts-index.ts
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

const INDEXES: Array<{ label: string; sql: string }> = [
    { label: 'driverShifts_driverId_endTime_idx', sql: "CREATE INDEX `driverShifts_driverId_endTime_idx` ON `driverShifts` (`driverId`, `endTime`)" },
];

async function migrate() {
    console.log('🔌 Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);

    try {
        for (const { label, sql } of INDEXES) {
            try {
                await connection.query(sql);
                console.log(`  ✅ ${label} created`);
            } catch (error: any) {
                if (error.code === 'ER_DUP_KEYNAME') {
                    console.log(`  ⚠️ ${label} already exists, skipping...`);
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
