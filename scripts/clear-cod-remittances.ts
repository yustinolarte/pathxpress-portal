/**
 * Script to clear all COD Remittances and reset COD Records status
 * 
 * Run with: npx tsx scripts/clear-cod-remittances.ts
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
        console.log('🗑️ Clearing COD remittance items...');
        await connection.query('DELETE FROM codRemittanceItems');
        console.log('   ✅ COD remittance items cleared');

        console.log('🗑️ Clearing COD remittances...');
        await connection.query('DELETE FROM codRemittances');
        console.log('   ✅ COD remittances cleared');

        console.log('🔄 Resetting COD records status from "remitted" to "collected"...');
        // We assume if it was remitted, it was previously collected.
        // Also clearing the remittedToClientDate
        const [result]: any = await connection.query(
            `UPDATE codRecords 
       SET status = 'collected', remittedToClientDate = NULL 
       WHERE status = 'remitted'`
        );
        console.log(`   ✅ Updated ${result.affectedRows} COD records to "collected" status`);

        console.log('\n✨ All COD remittances have been deleted and records reset successfully!');

    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await connection.end();
        console.log('\n👋 Database connection closed');
    }
}

main();
