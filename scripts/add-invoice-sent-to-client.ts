/**
 * Adds invoices.sentToClient / invoices.sentAt — the draft/review gate: a newly
 * generated invoice is hidden from the customer portal and sends no notification
 * until staff explicitly send it, so pricing can be corrected before the client
 * sees anything. Backfills existing invoices as already sent (they were already
 * visible/notified under the old behavior).
 *
 * Usage: npx tsx scripts/add-invoice-sent-to-client.ts
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

async function columnExists(connection: mysql.Connection, table: string, column: string) {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
        [dbConfig.database, table, column],
    );
    return rows.length > 0;
}

async function migrate() {
    console.log('🔌 Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);

    try {
        if (!(await columnExists(connection, 'invoices', 'sentToClient'))) {
            await connection.query('ALTER TABLE `invoices` ADD COLUMN `sentToClient` int NOT NULL DEFAULT 0');
            console.log('  ✅ invoices.sentToClient added');
        } else {
            console.log('  ⚠️ invoices.sentToClient already exists, skipping...');
        }

        if (!(await columnExists(connection, 'invoices', 'sentAt'))) {
            await connection.query('ALTER TABLE `invoices` ADD COLUMN `sentAt` timestamp NULL');
            console.log('  ✅ invoices.sentAt added');
        } else {
            console.log('  ⚠️ invoices.sentAt already exists, skipping...');
        }

        const [result] = await connection.query<mysql.ResultSetHeader>(
            'UPDATE `invoices` SET `sentToClient` = 1, `sentAt` = `issueDate` WHERE `sentToClient` = 0',
        );
        console.log(`  ✅ Backfilled ${result.affectedRows} pre-existing invoice(s) as already sent`);

        console.log('\n✅ Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

migrate();
