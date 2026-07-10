// Vitest doesn't load .env the way the app entrypoint does (that only happens via
// `import "dotenv/config"` in server/_core/index.ts, which tests never import) — so
// without this, DATABASE_URL is undefined in every test file and getDb() silently
// returns null, making DB-backed tests fail as if data were missing.
import "dotenv/config";
