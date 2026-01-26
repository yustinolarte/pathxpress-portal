/**
 * Script to add hideConsigneeAddress column to orders table
 * This column is used to hide consignee address on return waybills when the client has privacy enabled
 */

import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Adding hideConsigneeAddress column to orders table...');

    const db = await getDb();
    if (!db) {
        console.error('Failed to connect to database');
        process.exit(1);
    }

    try {
        // Check if column already exists
        const result = await db.execute(sql`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'orders' 
      AND COLUMN_NAME = 'hideConsigneeAddress'
    `);

        if (result.rows && result.rows.length > 0) {
            console.log('Column hideConsigneeAddress already exists');
        } else {
            // Add the column
            await db.execute(sql`
        ALTER TABLE orders 
        ADD COLUMN hideConsigneeAddress int DEFAULT 0 NOT NULL
      `);
            console.log('Column hideConsigneeAddress added successfully!');
        }
    } catch (error: any) {
        if (error.message?.includes('Duplicate column name')) {
            console.log('Column already exists, skipping...');
        } else {
            console.error('Error:', error);
            process.exit(1);
        }
    }

    process.exit(0);
}

main();
