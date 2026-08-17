import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const productionDatabaseUrl = process.env.DATABASE_URL?.trim();
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for test database commands");
}
if (testDatabaseUrl === productionDatabaseUrl) {
  throw new Error("Refusing test DB command: TEST_DATABASE_URL equals DATABASE_URL");
}

const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
if (!/(test|testing|qa|sandbox)/i.test(databaseName)) {
  throw new Error(
    "Refusing test DB command: target database name does not look isolated",
  );
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: testDatabaseUrl,
  },
});
