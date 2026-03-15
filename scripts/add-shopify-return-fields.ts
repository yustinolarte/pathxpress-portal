/**
 * Migration script to add Shopify Returns integration fields
 * Run with: npx tsx scripts/add-shopify-return-fields.ts
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
        // Add shopifyReturnId to orders
        const [shopifyReturnIdCol] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'orders' 
      AND COLUMN_NAME = 'shopifyReturnId'
    `) as any;

        if (Array.isArray(shopifyReturnIdCol) && shopifyReturnIdCol.length === 0) {
            await connection.query(`
        ALTER TABLE orders 
        ADD COLUMN shopifyReturnId VARCHAR(100) DEFAULT NULL
      `);
            console.log('✅ Added shopifyReturnId column to orders');
        } else {
            console.log('⏭️ shopifyReturnId column already exists in orders');
        }

        // Add source to orders
        const [sourceCol] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'orders' 
      AND COLUMN_NAME = 'source'
    `) as any;

        if (Array.isArray(sourceCol) && sourceCol.length === 0) {
            await connection.query(`
        ALTER TABLE orders 
        ADD COLUMN source VARCHAR(20) DEFAULT 'manual'
      `);
            console.log('✅ Added source column to orders');
        } else {
            console.log('⏭️ source column already exists in orders');
        }

        // Add index on shopifyReturnId for fast lookups (idempotency checks)
        const [existingIndex] = await connection.query(`
      SELECT INDEX_NAME 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_NAME = 'orders' 
      AND INDEX_NAME = 'idx_shopifyReturnId'
    `) as any;

        if (Array.isArray(existingIndex) && existingIndex.length === 0) {
            await connection.query(`
        CREATE INDEX idx_shopifyReturnId ON orders(shopifyReturnId)
      `);
            console.log('✅ Added index idx_shopifyReturnId on orders');
        } else {
            console.log('⏭️ Index idx_shopifyReturnId already exists');
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
