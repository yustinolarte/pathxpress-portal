/**
 * Adds routeOrders_routeId_sequence_idx — every hot read of a route's stops is
 * `WHERE routeId = ? ORDER BY sequence` (driver app route fetch, route claim,
 * admin route detail, reorder, optimize), which until now index-ranged on
 * routeId and then filesorted.
 *
 * Deliberately NOT unique — see the schema comment on routeOrders.
 *
 * Usage: npx tsx scripts/add-route-orders-sequence-index.ts
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
    { label: 'routeOrders_routeId_sequence_idx', sql: "CREATE INDEX `routeOrders_routeId_sequence_idx` ON `routeOrders` (`routeId`, `sequence`)" },
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
