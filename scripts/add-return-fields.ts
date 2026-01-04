/**
 * Migration script to add return shipment fields
 * Run with: npx tsx scripts/add-return-fields.ts
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
        // Add returnFee to clientAccounts
        const [clientColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'clientAccounts' 
      AND COLUMN_NAME = 'returnFee'
    `) as any;

        if (Array.isArray(clientColumns) && clientColumns.length === 0) {
            await connection.query(`
        ALTER TABLE clientAccounts 
        ADD COLUMN returnFee VARCHAR(20) NULL
      `);
            console.log('✅ Added returnFee column to clientAccounts');
        } else {
            console.log('⏭️ returnFee column already exists in clientAccounts');
        }

        // Add isReturn to orders
        const [isReturnCol] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'orders' 
      AND COLUMN_NAME = 'isReturn'
    `) as any;

        if (Array.isArray(isReturnCol) && isReturnCol.length === 0) {
            await connection.query(`
        ALTER TABLE orders 
        ADD COLUMN isReturn INT NOT NULL DEFAULT 0
      `);
            console.log('✅ Added isReturn column to orders');
        } else {
            console.log('⏭️ isReturn column already exists in orders');
        }

        // Add originalOrderId to orders
        const [originalOrderCol] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'orders' 
      AND COLUMN_NAME = 'originalOrderId'
    `) as any;

        if (Array.isArray(originalOrderCol) && originalOrderCol.length === 0) {
            await connection.query(`
        ALTER TABLE orders 
        ADD COLUMN originalOrderId INT NULL
      `);
            console.log('✅ Added originalOrderId column to orders');
        } else {
            console.log('⏭️ originalOrderId column already exists in orders');
        }

        // Add returnCharged to orders
        const [returnChargedCol] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'orders' 
      AND COLUMN_NAME = 'returnCharged'
    `) as any;

        if (Array.isArray(returnChargedCol) && returnChargedCol.length === 0) {
            await connection.query(`
        ALTER TABLE orders 
        ADD COLUMN returnCharged INT NOT NULL DEFAULT 1
      `);
            console.log('✅ Added returnCharged column to orders');
        } else {
            console.log('⏭️ returnCharged column already exists in orders');
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
