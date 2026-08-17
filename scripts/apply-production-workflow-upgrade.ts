import 'dotenv/config';
import mysql from 'mysql2/promise';

const productionUrl = process.env.DATABASE_URL?.trim();
const testUrl = process.env.TEST_DATABASE_URL?.trim();
const shouldApply = process.argv.includes('--apply');

if (!productionUrl) throw new Error('DATABASE_URL is required.');
if (testUrl && productionUrl === testUrl) {
  throw new Error('Refusing production upgrade: DATABASE_URL matches TEST_DATABASE_URL.');
}

const parsed = new URL(productionUrl);
const databaseName = parsed.pathname.replace(/^\//, '');
if (!databaseName) throw new Error('DATABASE_URL does not include a database name.');
if (/(test|testing|qa|sandbox)/i.test(databaseName)) {
  throw new Error('Refusing production upgrade: DATABASE_URL appears to target test/QA.');
}
if (shouldApply && process.env.ALLOW_PRODUCTION_WORKFLOW_UPGRADE !== 'additive-only') {
  throw new Error('Set ALLOW_PRODUCTION_WORKFLOW_UPGRADE=additive-only to apply.');
}

const connection = await mysql.createConnection(productionUrl);

async function tableExists(table: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = ? AND LOWER(table_name) = LOWER(?) LIMIT 1`,
    [databaseName, table],
  );
  return rows.length > 0;
}

async function column(table: string, name: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType,
            IS_NULLABLE AS isNullable, COLUMN_DEFAULT AS columnDefault
     FROM information_schema.columns
     WHERE table_schema = ? AND LOWER(table_name) = LOWER(?) AND LOWER(column_name) = LOWER(?)
     LIMIT 1`,
    [databaseName, table, name],
  );
  return rows[0] ?? null;
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
  const [versionRows] = await connection.query<mysql.RowDataPacket[]>('SELECT VERSION() AS version');
  const [countRows] = await connection.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS count FROM `quoteRequests`');
  const status = await column('quoteRequests', 'status');
  const updatedAt = await column('quoteRequests', 'updatedAt');
  const workflowIndex = await indexExists('quoteRequests', 'quoteRequests_status_createdAt_idx');
  const resetTable = await tableExists('passwordResetTokens');

  console.log(JSON.stringify({
    mode: shouldApply ? 'apply' : 'check',
    database: databaseName,
    databaseVersion: versionRows[0]?.version,
    quoteRequestRows: Number(countRows[0]?.count ?? 0),
    statusColumnExists: Boolean(status),
    updatedAtColumnExists: Boolean(updatedAt),
    workflowIndexExists: workflowIndex,
    passwordResetTokensExists: resetTable,
  }, null, 2));

  if (status && !String(status.columnType).toLowerCase().includes("enum('new','contacted','scheduled','completed')")) {
    throw new Error(`Existing quoteRequests.status has an unexpected type: ${status.columnType}`);
  }
  if (!shouldApply) process.exitCode = 0;
  else {
    if (!status) {
      await connection.execute("ALTER TABLE `quoteRequests` ADD COLUMN `status` enum('new','contacted','scheduled','completed') NOT NULL DEFAULT 'new'");
      console.log('Added quoteRequests.status.');
    }
    if (!updatedAt) {
      await connection.execute('ALTER TABLE `quoteRequests` ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
      console.log('Added quoteRequests.updatedAt.');
    }
    if (!workflowIndex) {
      await connection.execute('CREATE INDEX `quoteRequests_status_createdAt_idx` ON `quoteRequests` (`status`, `createdAt`)');
      console.log('Added quoteRequests_status_createdAt_idx.');
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
    console.log('Ensured passwordResetTokens exists.');
    console.log(`Production workflow upgrade completed on ${databaseName}.`);
  }
} finally {
  await connection.end();
}
