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

const connection = await mysql.createConnection(testUrl);

async function columnExists(table: string, column: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ? AND LOWER(table_name) = LOWER(?) AND LOWER(column_name) = LOWER(?)
     LIMIT 1`,
    [databaseName, table, column],
  );
  return rows.length > 0;
}

async function indexExists(table: string, index: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = ? AND LOWER(table_name) = LOWER(?) AND LOWER(index_name) = LOWER(?)
     LIMIT 1`,
    [databaseName, table, index],
  );
  return rows.length > 0;
}

try {
  if (!(await columnExists('quoteRequests', 'status'))) {
    await connection.execute("ALTER TABLE `quoteRequests` ADD COLUMN `status` enum('new','contacted','scheduled','completed') NOT NULL DEFAULT 'new'");
  }
  if (!(await columnExists('quoteRequests', 'updatedAt'))) {
    await connection.execute('ALTER TABLE `quoteRequests` ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  }
  if (!(await indexExists('quoteRequests', 'quoteRequests_status_createdAt_idx'))) {
    await connection.execute('CREATE INDEX `quoteRequests_status_createdAt_idx` ON `quoteRequests` (`status`, `createdAt`)');
  }

  await connection.execute(`CREATE TABLE IF NOT EXISTS \`passwordResetTokens\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`portalUserId\` int NOT NULL,
    \`tokenHash\` varchar(64) NOT NULL,
    \`expiresAt\` timestamp NOT NULL,
    \`usedAt\` timestamp NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`passwordResetTokens_tokenHash_unique\` (\`tokenHash\`),
    KEY \`passwordResetTokens_user_idx\` (\`portalUserId\`),
    KEY \`passwordResetTokens_expiry_idx\` (\`expiresAt\`)
  )`);

  console.log(`Test-only workflow upgrade applied to ${databaseName}.`);
} finally {
  await connection.end();
}
