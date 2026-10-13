/**
 * Driver live location + end-of-shift reconciliation (migration 0044), idempotent.
 *
 *  - driverLocations table: latest GPS fix per on-duty driver (dispatch live map)
 *  - driverShifts: clientRef + reconciliation snapshot columns
 *    (reconciledAt, expectedCash, collectedCash, cardCollected, declaredCash,
 *     cashDiscrepancy, declaredVariance, reconciliationNote)
 *  - driverShifts_driverId_clientRef_idx
 *
 * Usage:
 *   npx tsx scripts/add-driver-location-reconciliation.ts --dry-run
 *   npx tsx scripts/add-driver-location-reconciliation.ts
 *   npx tsx scripts/add-driver-location-reconciliation.ts --test     (TEST_DATABASE_URL)
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { URL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const TEST_TARGET = process.argv.includes('--test');

const rawUrl = TEST_TARGET ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
if (!rawUrl) {
    console.error(`❌ ${TEST_TARGET ? 'TEST_DATABASE_URL' : 'DATABASE_URL'} not set`);
    process.exit(1);
}
const parsedUrl = new URL(rawUrl);
const database = parsedUrl.pathname.slice(1);

const SHIFT_COLUMNS: Array<[string, string]> = [
    ['clientRef', 'ALTER TABLE `driverShifts` ADD `clientRef` varchar(64)'],
    ['reconciledAt', 'ALTER TABLE `driverShifts` ADD `reconciledAt` timestamp NULL'],
    ['expectedCash', 'ALTER TABLE `driverShifts` ADD `expectedCash` decimal(10,2)'],
    ['collectedCash', 'ALTER TABLE `driverShifts` ADD `collectedCash` decimal(10,2)'],
    ['cardCollected', 'ALTER TABLE `driverShifts` ADD `cardCollected` decimal(10,2)'],
    ['declaredCash', 'ALTER TABLE `driverShifts` ADD `declaredCash` decimal(10,2)'],
    ['cashDiscrepancy', 'ALTER TABLE `driverShifts` ADD `cashDiscrepancy` decimal(10,2)'],
    ['declaredVariance', 'ALTER TABLE `driverShifts` ADD `declaredVariance` decimal(10,2)'],
    ['reconciliationNote', 'ALTER TABLE `driverShifts` ADD `reconciliationNote` text'],
];

async function main() {
    console.log(`🔌 ${TEST_TARGET ? 'TEST' : 'PRODUCTION'} database "${database}"${DRY_RUN ? ' (dry run)' : ''}`);
    const connection = await mysql.createConnection({
        host: parsedUrl.hostname,
        port: Number(parsedUrl.port) || 3306,
        user: parsedUrl.username,
        password: parsedUrl.password,
        database,
        ssl: { rejectUnauthorized: false },
    });

    const run = async (label: string, sql: string) => {
        if (DRY_RUN) { console.log(`  [dry-run] ${label}`); return; }
        await connection.query(sql);
        console.log(`  ✅ ${label}`);
    };
    const columnExists = async (table: string, column: string) => {
        const [rows] = await connection.query<mysql.RowDataPacket[]>(
            'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
            [database, table, column],
        );
        return rows.length > 0;
    };
    const tableExists = async (table: string) => {
        const [rows] = await connection.query<mysql.RowDataPacket[]>(
            'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1',
            [database, table],
        );
        return rows.length > 0;
    };
    const indexExists = async (table: string, index: string) => {
        const [rows] = await connection.query<mysql.RowDataPacket[]>(
            'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
            [database, table, index],
        );
        return rows.length > 0;
    };

    try {
        if (!(await tableExists('driverLocations'))) {
            await run('driverLocations created', `CREATE TABLE \`driverLocations\` (
                \`driverId\` int NOT NULL,
                \`lat\` double NOT NULL,
                \`lng\` double NOT NULL,
                \`accuracy\` double,
                \`heading\` double,
                \`speed\` double,
                \`routeId\` varchar(50),
                \`recordedAt\` timestamp NOT NULL,
                \`receivedAt\` timestamp NOT NULL DEFAULT (now()),
                CONSTRAINT \`driverLocations_driverId\` PRIMARY KEY(\`driverId\`)
            )`);
        } else console.log('  ⚠️ driverLocations already exists');

        for (const [column, sql] of SHIFT_COLUMNS) {
            if (!(await columnExists('driverShifts', column))) await run(`driverShifts.${column} added`, sql);
            else console.log(`  ⚠️ driverShifts.${column} already exists`);
        }

        if (!(await indexExists('driverShifts', 'driverShifts_driverId_clientRef_idx'))) {
            await run('driverShifts_driverId_clientRef_idx created',
                'CREATE INDEX `driverShifts_driverId_clientRef_idx` ON `driverShifts` (`driverId`,`clientRef`)');
        } else console.log('  ⚠️ driverShifts_driverId_clientRef_idx already exists');

        console.log(DRY_RUN ? '\nℹ️  Dry run only — re-run without --dry-run to apply.' : '\n✅ Done');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exitCode = 1;
    } finally {
        await connection.end();
    }
}

main();
