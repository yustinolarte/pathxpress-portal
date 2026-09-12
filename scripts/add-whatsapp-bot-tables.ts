/**
 * Creates the WhatsApp location bot's state tables (bot_sessions, bot_orders,
 * bot_messages, bot_runtime) — the hand-applied equivalent of
 * drizzle/0042_whatsapp_bot_state.sql, per drizzle/MIGRATIONS_NOTES.md (never
 * run drizzle-kit migrate against the live database). Idempotent: every
 * statement is CREATE ... IF NOT EXISTS, so re-running is safe.
 *
 * Usage: npx tsx scripts/add-whatsapp-bot-tables.ts
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { URL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const parsedUrl = new URL(process.env.DATABASE_URL || '');

const dbConfig = {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port) || 3306,
    user: parsedUrl.username,
    password: parsedUrl.password,
    database: parsedUrl.pathname.slice(1),
};

const STATEMENTS: { label: string; sql: string }[] = [
    {
        label: 'bot_sessions',
        sql: `CREATE TABLE IF NOT EXISTS \`bot_sessions\` (
  \`jid\` varchar(64) NOT NULL,
  \`phone\` varchar(32) NOT NULL,
  \`botActive\` int NOT NULL DEFAULT 1,
  \`lastInteractionAt\` timestamp NOT NULL DEFAULT (now()),
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`bot_sessions_jid\` PRIMARY KEY(\`jid\`)
)`,
    },
    {
        label: 'bot_orders',
        sql: `CREATE TABLE IF NOT EXISTS \`bot_orders\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`jid\` varchar(64) NOT NULL,
  \`waybillNumber\` varchar(50) NOT NULL,
  \`storeName\` varchar(255),
  \`isReturn\` int NOT NULL DEFAULT 0,
  \`status\` enum('awaiting_location','location_received','reused','expired') NOT NULL,
  \`deliveryStatus\` enum('queued','sent','failed') NOT NULL DEFAULT 'queued',
  \`sendAttempts\` int NOT NULL DEFAULT 0,
  \`lastError\` text,
  \`requestedAt\` timestamp NOT NULL,
  \`sentAt\` timestamp NULL,
  \`expiresAt\` timestamp NULL,
  \`expiredReason\` varchar(64),
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`bot_orders_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`bot_orders_waybillNumber_unique\` UNIQUE(\`waybillNumber\`),
  INDEX \`bot_orders_jid_idx\` (\`jid\`),
  INDEX \`bot_orders_status_idx\` (\`status\`)
)`,
    },
    {
        label: 'bot_messages',
        sql: `CREATE TABLE IF NOT EXISTS \`bot_messages\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`jid\` varchar(64) NOT NULL,
  \`direction\` enum('in','out','system') NOT NULL,
  \`text\` text NOT NULL,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`bot_messages_id\` PRIMARY KEY(\`id\`),
  INDEX \`bot_messages_jid_createdAt_idx\` (\`jid\`,\`createdAt\`)
)`,
    },
    {
        label: 'bot_runtime',
        sql: `CREATE TABLE IF NOT EXISTS \`bot_runtime\` (
  \`id\` int NOT NULL,
  \`whatsappConnected\` int NOT NULL DEFAULT 0,
  \`connectedSince\` timestamp NULL,
  \`lastHeartbeatAt\` timestamp NOT NULL DEFAULT (now()),
  \`version\` varchar(32),
  CONSTRAINT \`bot_runtime_id\` PRIMARY KEY(\`id\`)
)`,
    },
];

async function migrate() {
    console.log('🔌 Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);

    try {
        for (const { label, sql } of STATEMENTS) {
            const [rows] = await connection.query<mysql.RowDataPacket[]>(
                'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1',
                [dbConfig.database, label],
            );
            if (rows.length > 0) {
                console.log(`  ⚠️ ${label} already exists, skipping...`);
                continue;
            }
            await connection.query(sql);
            console.log(`  ✅ ${label} created`);
        }
        console.log('\n✅ Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

migrate();
