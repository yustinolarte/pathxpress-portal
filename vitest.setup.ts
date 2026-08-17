// Vitest doesn't load .env the way the app entrypoint does (that only happens via
// `import "dotenv/config"` in server/_core/index.ts, which tests never import) — so
// without this, DATABASE_URL is undefined in every test file and getDb() silently
// returns null, making DB-backed tests fail as if data were missing.
import "dotenv/config";

// Several test files (cod.integration, shipment.creation, billing.pricing, ...)
// insert/update real rows. If TEST_DATABASE_URL is set, redirect every test to
// it instead of the production DATABASE_URL. getDb() (server/db.ts) reads
// process.env.DATABASE_URL lazily on first call, so overriding it here before
// any test file imports db.ts is enough. If TEST_DATABASE_URL isn't set, getDb()
// itself refuses to open a connection while running under Vitest — see the
// VITEST guard there — so pure unit tests that never touch the DB still run.
const productionDatabaseUrl = process.env.DATABASE_URL?.trim();
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (testDatabaseUrl) {
  if (productionDatabaseUrl === testDatabaseUrl) {
    throw new Error(
      "Refusing to run tests: TEST_DATABASE_URL is identical to DATABASE_URL.",
    );
  }

  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
  if (!/(test|testing|qa|sandbox)/i.test(databaseName)) {
    throw new Error(
      "Refusing to run DB-backed tests: the TEST_DATABASE_URL database name " +
        "does not look like an isolated test/QA database.",
    );
  }

  process.env.DATABASE_URL = testDatabaseUrl;
}
