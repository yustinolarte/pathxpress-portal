/**
 * Saved Locations Migration Script
 *
 * Adds to savedShippers:
 *  - latitude, longitude (exact pin coordinates)
 *  - isDefault (marks the client's default location, used to auto-fill shipper/consignee)
 *
 * Usage: npx tsx scripts/add-saved-locations-fields.ts
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

const ALTERS: Array<{ label: string; sql: string }> = [
    { label: 'savedShippers.latitude', sql: "ALTER TABLE savedShippers ADD COLUMN latitude VARCHAR(50) DEFAULT NULL" },
    { label: 'savedShippers.longitude', sql: "ALTER TABLE savedShippers ADD COLUMN longitude VARCHAR(50) DEFAULT NULL" },
    { label: 'savedShippers.isDefault', sql: "ALTER TABLE savedShippers ADD COLUMN isDefault INT NOT NULL DEFAULT 0" },
];

async function migrate() {
    console.log('🔌 Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);

    try {
        for (const { label, sql } of ALTERS) {
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

        await connection.query(
            "CREATE INDEX savedShippers_client_default_idx ON savedShippers (clientId, isDefault)"
        ).catch((error: any) => {
            if (error.code === 'ER_DUP_KEYNAME') {
                console.log('  ⚠️ savedShippers_client_default_idx already exists, skipping...');
            } else {
                throw error;
            }
        });
        console.log('  ✅ savedShippers_client_default_idx ensured');

        console.log('\n✅ Saved locations migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

migrate();
