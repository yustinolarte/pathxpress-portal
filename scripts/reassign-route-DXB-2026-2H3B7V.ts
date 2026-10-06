import "dotenv/config";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { driverRoutes } from "../drizzle/schema";

const ROUTE_ID = "DXB-2026-2H3B7V";
const NEW_DRIVER_ID = 5; // Larrison — actually picked up all 9 packages on this route

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, ROUTE_ID)).limit(1);
  if (!route) throw new Error(`Route ${ROUTE_ID} not found, aborting`);

  const scriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
  const backupPath = path.join(
    scriptDir,
    "..",
    "backups",
    `route-reassign-${ROUTE_ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(backupPath, JSON.stringify({ takenAt: new Date().toISOString(), driverRoutes: [route] }, null, 2));
  console.log(`Backup written to ${backupPath}`);

  if (route.status !== "pending") {
    throw new Error(`Route ${ROUTE_ID} expected status pending but found ${route.status}, aborting`);
  }
  if (route.startedAt !== null || route.shiftId !== null) {
    throw new Error(`Route ${ROUTE_ID} still has startedAt/shiftId set, aborting (expected fully reset)`);
  }

  await db.update(driverRoutes).set({ driverId: NEW_DRIVER_ID }).where(eq(driverRoutes.id, ROUTE_ID));

  const [finalRoute] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, ROUTE_ID)).limit(1);
  console.log("=== Final state ===");
  console.log(finalRoute);

  await pool.promise().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
