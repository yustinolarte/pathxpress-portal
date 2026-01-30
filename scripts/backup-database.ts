/**
 * Database Backup Script
 * Creates a full backup of the PathXpress database before making schema changes.
 * 
 * Usage: npx tsx scripts/backup-database.ts
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
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
    database: parsedUrl.pathname.slice(1),
};

async function backup() {
    console.log('🔌 Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.resolve(process.cwd(), 'backups');

        // Create backups directory if it doesn't exist
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);
        let sqlDump = '';

        console.log('📦 Fetching table list...');
        const [tables] = await connection.query('SHOW TABLES');
        const tableNames = (tables as any[]).map((t: any) => Object.values(t)[0] as string);

        console.log(`📋 Found ${tableNames.length} tables: ${tableNames.join(', ')}`);

        for (const tableName of tableNames) {
            console.log(`  📄 Backing up table: ${tableName}`);

            // Get CREATE TABLE statement
            const [createResult] = await connection.query(`SHOW CREATE TABLE \`${tableName}\``);
            const createStatement = (createResult as any[])[0]['Create Table'];
            sqlDump += `-- Table: ${tableName}\n`;
            sqlDump += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
            sqlDump += createStatement + ';\n\n';

            // Get table data
            const [rows] = await connection.query(`SELECT * FROM \`${tableName}\``);
            if ((rows as any[]).length > 0) {
                const columns = Object.keys((rows as any[])[0]);
                for (const row of rows as any[]) {
                    const values = columns.map(col => {
                        const val = row[col];
                        if (val === null) return 'NULL';
                        if (typeof val === 'number') return val;
                        if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
                        return `'${String(val).replace(/'/g, "''")}'`;
                    });
                    sqlDump += `INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`) VALUES (${values.join(', ')});\n`;
                }
                sqlDump += '\n';
            }
        }

        // Write to file
        fs.writeFileSync(backupFile, sqlDump, 'utf8');

        const fileSizeKB = (fs.statSync(backupFile).size / 1024).toFixed(2);
        console.log(`\n✅ Backup completed successfully!`);
        console.log(`📁 File: ${backupFile}`);
        console.log(`📊 Size: ${fileSizeKB} KB`);
        console.log(`📅 Timestamp: ${timestamp}`);

    } catch (error) {
        console.error('❌ Backup failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

backup();
