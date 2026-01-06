/**
 * Script to clear all invoices and invoice items
 * 
 * Run with: npx tsx scripts/clear-invoices.ts
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
    if (!DATABASE_URL) {
        console.error('❌ DATABASE_URL not found in environment');
        process.exit(1);
    }

    // Parse DATABASE_URL
    const url = new URL(DATABASE_URL);
    const connection = await mysql.createConnection({
        host: url.hostname,
        port: parseInt(url.port || '3306'),
        user: url.username,
        password: url.password,
        database: url.pathname.slice(1), // Remove leading /
        ssl: { rejectUnauthorized: false }
    });

    console.log('✅ Connected to database');

    try {
        console.log('🗑️ Clearing invoice items...');
        await connection.query('DELETE FROM invoiceItems');
        console.log('   ✅ Invoice items cleared');

        console.log('🗑️ Clearing invoices...');
        await connection.query('DELETE FROM invoices');
        console.log('   ✅ Invoices cleared');

        console.log('\n✨ All invoices have been deleted successfully!');

    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await connection.end();
        console.log('\n👋 Database connection closed');
    }
}

main();
