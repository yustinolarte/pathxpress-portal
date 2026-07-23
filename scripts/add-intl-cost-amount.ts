/**
 * Adds the costAmount field to the orders table — tracks our internal
 * courier cost per international shipment for the profit panel.
 *
 * Usage: npx tsx scripts/add-intl-cost-amount.ts
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

async function migrate() {
    console.log('🔌 Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);

    try {
        console.log('📦 Adding costAmount field to orders table...');
        try {
            await connection.query(`
        ALTER TABLE orders
        ADD COLUMN costAmount DECIMAL(10,2) DEFAULT NULL
      `);
            console.log('  ✅ costAmount field added to orders');
        } catch (error: any) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('  ⚠️ costAmount already exists in orders, skipping...');
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
