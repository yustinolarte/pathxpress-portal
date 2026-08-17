/**
 * One-off: flips the Walk-in client (id 17) to pay-per-shipment settlement
 * and enables Card on Delivery, so it stops falling into the invoice queue
 * and both the sender-pays-at-drop-off and recipient-pays-at-delivery flows
 * work for it. Idempotent — safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/enable-walkin-pay-at-origin.ts --dry-run
 *   npx tsx scripts/enable-walkin-pay-at-origin.ts
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { URL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const WALK_IN_CLIENT_ID = 17;

const parsedUrl = new URL(process.env.DATABASE_URL || '');

const dbConfig = {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port) || 3306,
    user: parsedUrl.username,
    password: parsedUrl.password,
    database: parsedUrl.pathname.slice(1),
};

const wouldBe = (msg: string) => console.log(`   ${DRY_RUN ? '[dry-run] would' : '→'} ${msg}`);

async function run() {
    console.log('🔌 Connecting to database...');
    const connection = await mysql.createConnection(dbConfig);

    try {
        const [rows] = await connection.query<any[]>(
            `SELECT id, companyName, payAtOrigin, cardOnDeliveryAllowed FROM clientAccounts WHERE id = ?`,
            [WALK_IN_CLIENT_ID],
        );
        const client = rows[0];
        if (!client) {
            console.error(`❌ Client id ${WALK_IN_CLIENT_ID} not found`);
            process.exit(1);
        }
        console.log(`Found client: "${client.companyName}" (payAtOrigin=${client.payAtOrigin}, cardOnDeliveryAllowed=${client.cardOnDeliveryAllowed})`);

        if (client.payAtOrigin === 1 && client.cardOnDeliveryAllowed === 1) {
            console.log('✅ Already configured, nothing to do.');
            return;
        }

        wouldBe(`set payAtOrigin=1, cardOnDeliveryAllowed=1 on client ${WALK_IN_CLIENT_ID}`);
        if (!DRY_RUN) {
            await connection.query(
                `UPDATE clientAccounts SET payAtOrigin = 1, cardOnDeliveryAllowed = 1 WHERE id = ?`,
                [WALK_IN_CLIENT_ID],
            );
        }

        console.log(`\n${DRY_RUN ? '✅ Dry run complete.' : '✅ Walk-in client updated.'}`);
    } finally {
        await connection.end();
    }
}

run();
