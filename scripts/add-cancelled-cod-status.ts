
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
    database: parsedUrl.pathname.slice(1), // Remove leading slash
    multipleStatements: true,
};

async function migrate() {
    console.log('🔌 Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);

    try {
        console.log('🛠️ Modifying codRecords table enum...');

        // SQL command to alter the ENUM column and add 'cancelled'
        // We must list ALL existing options plus the new one
        const sql = `
      ALTER TABLE codRecords 
      MODIFY COLUMN status ENUM('pending_collection', 'collected', 'remitted', 'disputed', 'cancelled') 
      NOT NULL DEFAULT 'pending_collection';
    `;

        await connection.query(sql);

        console.log('✅ Success! Added "cancelled" to codRecords status enum.');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await connection.end();
    }
}

migrate();
