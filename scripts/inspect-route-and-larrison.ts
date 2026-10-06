import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { driverRoutes, driverShifts, drivers } from "../drizzle/schema";

const ROUTE_ID = "DXB-2026-2H3B7V";

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, ROUTE_ID)).limit(1);
  console.log("=== Route now ===");
  console.log(route);

  const openShiftsLarrison = await db.select().from(driverShifts).where(eq(driverShifts.driverId, 5));
  console.log("\n=== All shifts for driver 5 (Larrison) ===");
  for (const s of openShiftsLarrison) console.log(s.id, s.startTime, s.endTime, s.createdAt);

  const otherRoutesToday = await db.select().from(driverRoutes).where(eq(driverRoutes.driverId, 5));
  console.log("\n=== Other routes currently assigned to driver 5 ===");
  for (const r of otherRoutesToday) console.log(r.id, r.status, r.date, r.startedAt, r.finishedAt);

  const [larrison] = await db.select().from(drivers).where(eq(drivers.id, 5)).limit(1);
  console.log("\n=== Driver 5 record ===");
  console.log(larrison);

  await pool.promise().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
