#!/usr/bin/env node
/**
 * Script de Backup para la Base de Datos PathXpress
 * 
 * Este script exporta toda la base de datos a un archivo SQL.
 * 
 * Uso: node backup-db.mjs
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Cargar variables de entorno
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL no está definida en el archivo .env');
    process.exit(1);
}

// Parsear la URL de conexión
function parseConnectionUrl(url) {
    const regex = /mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/;
    const match = url.match(regex);

    if (!match) {
        throw new Error('URL de base de datos inválida');
    }

    return {
        user: match[1],
        password: match[2],
        host: match[3],
        port: parseInt(match[4]),
        database: match[5]
    };
}

// Escapar valores para SQL
function escapeValue(value) {
    if (value === null) return 'NULL';
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
    if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;

    // Escapar strings
    const escaped = String(value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');

    return `'${escaped}'`;
}

async function backupDatabase() {
    const config = parseConnectionUrl(DATABASE_URL);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFileName = `backup_pathxpress_${timestamp}.sql`;
    const backupPath = path.join(__dirname, backupFileName);

    console.log('🚀 Iniciando backup de la base de datos...');
    console.log(`📍 Host: ${config.host}:${config.port}`);
    console.log(`📦 Base de datos: ${config.database}`);
    console.log('');

    let connection;

    try {
        // Conectar a la base de datos
        connection = await mysql.createConnection({
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            database: config.database,
        });

        console.log('✅ Conectado a la base de datos');

        // Iniciar el archivo de backup
        let backupContent = '';
        backupContent += `-- PathXpress Database Backup\n`;
        backupContent += `-- Fecha: ${new Date().toISOString()}\n`;
        backupContent += `-- Base de datos: ${config.database}\n`;
        backupContent += `-- Host: ${config.host}\n`;
        backupContent += `\n`;
        backupContent += `SET FOREIGN_KEY_CHECKS = 0;\n`;
        backupContent += `SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n`;
        backupContent += `SET AUTOCOMMIT = 0;\n`;
        backupContent += `START TRANSACTION;\n\n`;

        // Obtener todas las tablas
        const [tables] = await connection.query('SHOW TABLES');
        const tableKey = `Tables_in_${config.database}`;

        console.log(`📋 Encontradas ${tables.length} tablas\n`);

        for (const tableRow of tables) {
            const tableName = tableRow[tableKey];
            console.log(`  📁 Exportando: ${tableName}...`);

            // Obtener estructura de la tabla
            const [createTable] = await connection.query(`SHOW CREATE TABLE \`${tableName}\``);
            const createStatement = createTable[0]['Create Table'];

            backupContent += `-- --------------------------------------------------------\n`;
            backupContent += `-- Estructura de tabla: ${tableName}\n`;
            backupContent += `-- --------------------------------------------------------\n\n`;
            backupContent += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
            backupContent += `${createStatement};\n\n`;

            // Obtener datos de la tabla
            const [rows] = await connection.query(`SELECT * FROM \`${tableName}\``);

            if (rows.length > 0) {
                backupContent += `-- Datos de tabla: ${tableName}\n`;

                // Obtener nombres de columnas
                const columns = Object.keys(rows[0]);
                const columnNames = columns.map(c => `\`${c}\``).join(', ');

                // Insertar en lotes de 100 filas
                const batchSize = 100;
                for (let i = 0; i < rows.length; i += batchSize) {
                    const batch = rows.slice(i, i + batchSize);
                    const values = batch.map(row => {
                        const rowValues = columns.map(col => escapeValue(row[col]));
                        return `(${rowValues.join(', ')})`;
                    }).join(',\n');

                    backupContent += `INSERT INTO \`${tableName}\` (${columnNames}) VALUES\n${values};\n`;
                }

                console.log(`     ✓ ${rows.length} registros exportados`);
            } else {
                console.log(`     ✓ Tabla vacía`);
            }

            backupContent += `\n`;
        }

        backupContent += `\nSET FOREIGN_KEY_CHECKS = 1;\n`;
        backupContent += `COMMIT;\n`;

        // Guardar el archivo
        fs.writeFileSync(backupPath, backupContent, 'utf8');

        const fileSize = (fs.statSync(backupPath).size / 1024).toFixed(2);

        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log('✅ BACKUP COMPLETADO EXITOSAMENTE');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`📁 Archivo: ${backupFileName}`);
        console.log(`📍 Ubicación: ${backupPath}`);
        console.log(`💾 Tamaño: ${fileSize} KB`);
        console.log('═══════════════════════════════════════════════════════');

    } catch (error) {
        console.error('❌ Error durante el backup:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Ejecutar
backupDatabase();
