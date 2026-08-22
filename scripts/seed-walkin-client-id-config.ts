/**
 * One-off: stores the Walk-in client's id (17, see
 * scripts/enable-walkin-pay-at-origin.ts) as `WALK_IN_CLIENT_ID` in the
 * serviceConfig table, so the public /pricing quote endpoint can look it up
 * instead of hardcoding the id inline. Idempotent — safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/seed-walkin-client-id-config.ts --dry-run
 *   npx tsx scripts/seed-walkin-client-id-config.ts
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { URL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const WALK_IN_CLIENT_ID = 17;
const CONFIG_KEY = 'WALK_IN_CLIENT_ID';

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
        const [clientRows] = await connection.query<any[]>(
            `SELECT id, companyName FROM clientAccounts WHERE id = ?`,
            [WALK_IN_CLIENT_ID],
        );
        const client = clientRows[0];
        if (!client) {
            console.error(`❌ Client id ${WALK_IN_CLIENT_ID} not found`);
            process.exit(1);
        }
        console.log(`Found client: "${client.companyName}" (id ${WALK_IN_CLIENT_ID})`);

        const [configRows] = await connection.query<any[]>(
            `SELECT configValue FROM serviceConfig WHERE configKey = ?`,
            [CONFIG_KEY],
        );
        const existing = configRows[0]?.configValue;
        if (existing === String(WALK_IN_CLIENT_ID)) {
            console.log('✅ Already configured, nothing to do.');
            return;
        }

        wouldBe(`set serviceConfig.${CONFIG_KEY} = '${WALK_IN_CLIENT_ID}'${existing ? ` (was '${existing}')` : ''}`);
        if (!DRY_RUN) {
            await connection.query(
                `INSERT INTO serviceConfig (configKey, configValue) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE configValue = VALUES(configValue)`,
                [CONFIG_KEY, String(WALK_IN_CLIENT_ID)],
            );
        }

        console.log(`\n${DRY_RUN ? '✅ Dry run complete.' : '✅ WALK_IN_CLIENT_ID config seeded.'}`);
    } finally {
        await connection.end();
    }
}

run();
