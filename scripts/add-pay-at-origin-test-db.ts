/**
 * Same columns as scripts/add-pay-at-origin.ts, applied to TEST_DATABASE_URL
 * instead of the production DATABASE_URL — mirrors the safety pattern in
 * scripts/apply-test-workflow-upgrade.ts (refuses to run against prod).
 *
 * Usage: npx tsx scripts/add-pay-at-origin-test-db.ts
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const productionUrl = process.env.DATABASE_URL?.trim();
const testUrl = process.env.TEST_DATABASE_URL?.trim();

if (!testUrl) throw new Error('TEST_DATABASE_URL is required.');
if (productionUrl && productionUrl === testUrl) {
    throw new Error('Refusing schema upgrade: TEST_DATABASE_URL matches DATABASE_URL.');
}

const parsed = new URL(testUrl);
const databaseName = parsed.pathname.replace(/^\//, '');
if (!/(test|testing|qa|sandbox)/i.test(databaseName)) {
    throw new Error('Refusing schema upgrade: target database name is not marked as test/QA.');
}

const COLUMNS: Array<[string, string]> = [
    ['clientAccounts.payAtOrigin', 'ALTER TABLE clientAccounts ADD COLUMN payAtOrigin int NOT NULL DEFAULT 0'],
    ['orders.originPaymentCollected', 'ALTER TABLE orders ADD COLUMN originPaymentCollected int NOT NULL DEFAULT 0'],
    ['orders.originPaymentMethod', 'ALTER TABLE orders ADD COLUMN originPaymentMethod varchar(10) DEFAULT NULL'],
    ['orders.originPaymentAmount', 'ALTER TABLE orders ADD COLUMN originPaymentAmount varchar(50) DEFAULT NULL'],
    ['orders.originPaymentReference', 'ALTER TABLE orders ADD COLUMN originPaymentReference varchar(100) DEFAULT NULL'],
    ['orders.originPaymentCollectedAt', 'ALTER TABLE orders ADD COLUMN originPaymentCollectedAt timestamp DEFAULT NULL'],
];

async function migrate() {
    console.log(`🔌 Connecting to TEST database (${databaseName})...`);
    const connection = await mysql.createConnection(testUrl!);

    try {
        for (const [name, ddl] of COLUMNS) {
            try {
                await connection.query(ddl);
                console.log(`  ✅ ${name} added`);
            } catch (error: any) {
                if (error.code === 'ER_DUP_FIELDNAME') {
                    console.log(`  ⚠️ ${name} already exists, skipping...`);
                } else {
                    throw error;
                }
            }
        }
        console.log('\n✅ Test DB migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

migrate();
