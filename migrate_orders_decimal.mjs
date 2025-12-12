
import mysql from 'mysql2/promise';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

async function runMigration() {
    try {
        if (!DATABASE_URL) {
            console.error('❌ No DATABASE_URL found.');
            process.exit(1);
        }

        const connection = await mysql.createConnection(DATABASE_URL);
        console.log('Connected to DB. Running migrations...');

        // 1. Modify weight
        console.log('Modifying weight column...');
        await connection.execute('ALTER TABLE orders MODIFY COLUMN weight DECIMAL(10, 2) NOT NULL');

        // 2. Modify volumetricWeight
        console.log('Modifying volumetricWeight column...');
        await connection.execute('ALTER TABLE orders MODIFY COLUMN volumetricWeight DECIMAL(10, 2) NULL');

        // 3. Modify dimensions
        console.log('Modifying length, width, height columns...');
        await connection.execute('ALTER TABLE orders MODIFY COLUMN length DECIMAL(10, 2) NULL');
        await connection.execute('ALTER TABLE orders MODIFY COLUMN width DECIMAL(10, 2) NULL');
        await connection.execute('ALTER TABLE orders MODIFY COLUMN height DECIMAL(10, 2) NULL');

        console.log('✅ Migration complete. Columns updated to DECIMAL(10, 2).');
        await connection.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error during migration:', err);
        process.exit(1);
    }
}

runMigration();
