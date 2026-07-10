/**
 * CCOD (Card on Delivery) Migration Script — applies drizzle/0026_low_dorian_gray.sql
 *
 * Adds:
 *  - clientAccounts: cardOnDeliveryAllowed, cardFeePercent, cardMinFee, cardMaxFee
 *  - codRecords: allowedMethods, collectedMethod, paymentReference, feeAmount
 *  - orders: codPaymentMethod
 * Backfills codPaymentMethod = 'cash' for existing COD orders.
 *
 * Usage: npx tsx scripts/add-ccod-fields.ts
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
    { label: 'clientAccounts.cardOnDeliveryAllowed', sql: "ALTER TABLE clientAccounts ADD COLUMN cardOnDeliveryAllowed INT NOT NULL DEFAULT 0" },
    { label: 'clientAccounts.cardFeePercent', sql: "ALTER TABLE clientAccounts ADD COLUMN cardFeePercent VARCHAR(50) DEFAULT NULL" },
    { label: 'clientAccounts.cardMinFee', sql: "ALTER TABLE clientAccounts ADD COLUMN cardMinFee VARCHAR(50) DEFAULT NULL" },
    { label: 'clientAccounts.cardMaxFee', sql: "ALTER TABLE clientAccounts ADD COLUMN cardMaxFee VARCHAR(50) DEFAULT NULL" },
    { label: 'codRecords.allowedMethods', sql: "ALTER TABLE codRecords ADD COLUMN allowedMethods VARCHAR(10) NOT NULL DEFAULT 'cash'" },
    { label: 'codRecords.collectedMethod', sql: "ALTER TABLE codRecords ADD COLUMN collectedMethod VARCHAR(10) DEFAULT NULL" },
    { label: 'codRecords.paymentReference', sql: "ALTER TABLE codRecords ADD COLUMN paymentReference VARCHAR(100) DEFAULT NULL" },
    { label: 'codRecords.feeAmount', sql: "ALTER TABLE codRecords ADD COLUMN feeAmount VARCHAR(50) DEFAULT NULL" },
    { label: 'orders.codPaymentMethod', sql: "ALTER TABLE orders ADD COLUMN codPaymentMethod VARCHAR(10) DEFAULT NULL" },
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

        // Backfill: existing COD orders accepted cash only
        const [res] = await connection.query(
            "UPDATE orders SET codPaymentMethod = 'cash' WHERE codRequired = 1 AND codPaymentMethod IS NULL"
        );
        console.log(`  ✅ Backfilled codPaymentMethod='cash' on ${(res as any).affectedRows} existing COD orders`);

        console.log('\n✅ CCOD migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

migrate();
