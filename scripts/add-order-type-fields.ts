/**
 * Migration script to add orderType and exchangeOrderId fields
 * Run with: npx tsx scripts/add-order-type-fields.ts
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';

async function migrate() {
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
        throw new Error('DATABASE_URL environment variable is not set');
    }

    console.log('Connecting to database...');

    const connection = await mysql.createConnection(dbUrl);

    console.log('Connected to database!');

    try {
        // Add orderType to orders
        const [orderTypeCol] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'orders' 
      AND COLUMN_NAME = 'orderType'
    `) as any;

        if (Array.isArray(orderTypeCol) && orderTypeCol.length === 0) {
            await connection.query(`
        ALTER TABLE orders 
        ADD COLUMN orderType VARCHAR(20) NOT NULL DEFAULT 'standard'
      `);
            console.log('✅ Added orderType column to orders');
        } else {
            console.log('⏭️ orderType column already exists in orders');
        }

        // Add exchangeOrderId to orders
        const [exchangeOrderIdCol] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'orders' 
      AND COLUMN_NAME = 'exchangeOrderId'
    `) as any;

        if (Array.isArray(exchangeOrderIdCol) && exchangeOrderIdCol.length === 0) {
            await connection.query(`
        ALTER TABLE orders 
        ADD COLUMN exchangeOrderId INT NULL
      `);
            console.log('✅ Added exchangeOrderId column to orders');
        } else {
            console.log('⏭️ exchangeOrderId column already exists in orders');
        }

        console.log('\n🎉 Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await connection.end();
    }
}

migrate()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
