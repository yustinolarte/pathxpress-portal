/**
 * Applies drizzle/0028_cold_leper_queen.sql — indexes needed for the COD
 * remittance cutoff automation (filtering codRecords by collectedDate).
 *
 * Adds:
 *  - codRecords.collectedDate index
 *  - codRecords.remittedToClientDate index
 *  - codRemittanceItems.remittanceId index
 *
 * Usage: npx tsx scripts/add-cod-remittance-indexes.ts
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

const INDEXES: Array<{ label: string; sql: string }> = [
    { label: 'codRecords_collectedDate_idx', sql: "CREATE INDEX `codRecords_collectedDate_idx` ON `codRecords` (`collectedDate`)" },
    { label: 'codRecords_remittedToClientDate_idx', sql: "CREATE INDEX `codRecords_remittedToClientDate_idx` ON `codRecords` (`remittedToClientDate`)" },
    { label: 'codRemittanceItems_remittanceId_idx', sql: "CREATE INDEX `codRemittanceItems_remittanceId_idx` ON `codRemittanceItems` (`remittanceId`)" },
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

        console.log('\n✅ COD remittance index migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

migrate();
