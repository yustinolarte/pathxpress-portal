/**
 * Seeds the shared test fixtures that server/*.test.ts files expect to already
 * exist: clientAccounts id=28 ("PathXpress QA" test client) and portalUsers
 * id=1 (test-admin@pathxpress.internal) / id=2 (test-customer@pathxpress.internal,
 * clientId=28). Several test files hardcode these exact IDs in mocked
 * TrpcContext objects instead of looking them up, so the IDs must match.
 *
 * Idempotent — safe to run more than once, skips rows that already exist.
 * Intended for a fresh TEST_DATABASE_URL, never production.
 *
 * Usage: TEST_DATABASE_URL=<test db url> npx tsx scripts/seed-test-fixtures.ts
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import { clientAccounts, portalUsers } from '../drizzle/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const productionDatabaseUrl = process.env.DATABASE_URL?.trim();

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required. Production DATABASE_URL is never used.');
}
if (testDatabaseUrl === productionDatabaseUrl) {
  throw new Error('Refusing to seed: TEST_DATABASE_URL is identical to DATABASE_URL.');
}

const testDatabaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
if (!/(test|testing|qa|sandbox)/i.test(testDatabaseName)) {
  throw new Error('Refusing to seed: target database name does not look like a test/QA database.');
}

const connection = await mysql.createConnection(testDatabaseUrl);
const db = drizzle(connection);

const FIXTURE_ADMIN_EMAIL = 'test-admin@pathxpress.internal';
// Matches the fixture password hardcoded in server/portal.auth.test.ts.
const FIXTURE_ADMIN_PASSWORD_HASH = '$2b$10$RzJMpreM7CPJb4lxH8JtyeeCYtp2wRt/vfAOGtkyqQPWGhTCRheTe';
const FIXTURE_CUSTOMER_EMAIL = 'test-customer@pathxpress.internal';
const FIXTURE_CUSTOMER_PASSWORD = 'TestFixtureCustomer!2026';

async function main() {
  const [existingClient] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, 28));
  if (!existingClient) {
    await db.insert(clientAccounts).values({
      id: 28,
      companyName: 'PathXpress QA (internal test account)',
      contactName: 'Test Fixture',
      phone: '+971500000000',
      billingEmail: 'test-fixture@pathxpress.internal',
      billingAddress: 'N/A - synthetic test fixture, not a real client',
      country: 'UAE',
      city: 'Dubai',
      codAllowed: 1,
      cardOnDeliveryAllowed: 1,
      fodAllowed: 1,
      status: 'active',
    });
    console.log('✅ Created clientAccounts id=28 (test fixture client)');
  } else {
    console.log('↷ clientAccounts id=28 already exists, skipping');
  }

  const [existingAdmin] = await db.select().from(portalUsers).where(eq(portalUsers.id, 1));
  if (!existingAdmin) {
    await db.insert(portalUsers).values({
      id: 1,
      email: FIXTURE_ADMIN_EMAIL,
      passwordHash: FIXTURE_ADMIN_PASSWORD_HASH,
      role: 'admin',
      clientId: null,
      status: 'active',
    });
    console.log('✅ Created portalUsers id=1 (test-admin)');
  } else {
    console.log('↷ portalUsers id=1 already exists, skipping');
  }

  const [existingCustomer] = await db.select().from(portalUsers).where(eq(portalUsers.id, 2));
  if (!existingCustomer) {
    await db.insert(portalUsers).values({
      id: 2,
      email: FIXTURE_CUSTOMER_EMAIL,
      passwordHash: await bcrypt.hash(FIXTURE_CUSTOMER_PASSWORD, 10),
      role: 'customer',
      clientId: 28,
      status: 'active',
    });
    console.log('✅ Created portalUsers id=2 (test-customer, clientId=28)');
  } else {
    console.log('↷ portalUsers id=2 already exists, skipping');
  }

  console.log('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error seeding test fixtures:', error);
    process.exit(1);
  });
