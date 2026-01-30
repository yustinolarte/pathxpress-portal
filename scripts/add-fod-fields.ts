/**
 * FOD Migration Script - Step 1: Add database fields
 * 
 * This script adds the fitOnDelivery field to orders table
 * and fodFee + fodAllowed fields to clientAccounts table.
 * 
 * Usage: npx tsx scripts/add-fod-fields.ts
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { URL } from 'url';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Parse DATABASE_URL
const dbUrl = process.env.DATABASE_URL || '';
const parsedUrl = new URL(dbUrl);

const dbConfig = {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port) || 3306,
    user: parsedUrl.username,
    password: parsedUrl.password,
    database: parsedUrl.pathname.slice(1),
};

async function migrate() {
    console.log('🔌 Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);

    try {
        // Step 1: Add fitOnDelivery to orders table
        console.log('📦 Adding fitOnDelivery field to orders table...');
        try {
            await connection.query(`
        ALTER TABLE orders 
        ADD COLUMN fitOnDelivery INT NOT NULL DEFAULT 0
      `);
            console.log('  ✅ fitOnDelivery field added to orders');
        } catch (error: any) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('  ⚠️ fitOnDelivery already exists in orders, skipping...');
            } else {
                throw error;
            }
        }

        // Step 2: Add fodAllowed to clientAccounts table
        console.log('📦 Adding fodAllowed field to clientAccounts table...');
        try {
            await connection.query(`
        ALTER TABLE clientAccounts 
        ADD COLUMN fodAllowed INT NOT NULL DEFAULT 0
      `);
            console.log('  ✅ fodAllowed field added to clientAccounts');
        } catch (error: any) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('  ⚠️ fodAllowed already exists in clientAccounts, skipping...');
            } else {
                throw error;
            }
        }

        // Step 3: Add fodFee to clientAccounts table
        console.log('📦 Adding fodFee field to clientAccounts table...');
        try {
            await connection.query(`
        ALTER TABLE clientAccounts 
        ADD COLUMN fodFee VARCHAR(20) DEFAULT NULL
      `);
            console.log('  ✅ fodFee field added to clientAccounts');
        } catch (error: any) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('  ⚠️ fodFee already exists in clientAccounts, skipping...');
            } else {
                throw error;
            }
        }

        console.log('\n✅ FOD migration completed successfully!');
        console.log('Next steps:');
        console.log('  1. Update drizzle/schema.ts to match new fields');
        console.log('  2. Update backend logic in server/db.ts');
        console.log('  3. Update frontend components');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

migrate();
