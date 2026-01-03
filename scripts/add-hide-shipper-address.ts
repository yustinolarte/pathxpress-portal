/**
 * Migration script to add hideShipperAddress column to clientAccounts table
 * Run with: npx tsx scripts/add-hide-shipper-address.ts
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
        // Check if column already exists
        const [columns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'clientAccounts' 
      AND COLUMN_NAME = 'hideShipperAddress'
    `) as any;

        if (Array.isArray(columns) && columns.length > 0) {
            console.log('✅ Column hideShipperAddress already exists. Skipping migration.');
            return;
        }

        // Add the column
        await connection.query(`
      ALTER TABLE clientAccounts 
      ADD COLUMN hideShipperAddress INT NOT NULL DEFAULT 0
    `);

        console.log('✅ Successfully added hideShipperAddress column to clientAccounts table!');
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
