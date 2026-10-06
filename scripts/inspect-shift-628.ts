import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { driverShifts, driverRoutes } from "../drizzle/schema";

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const [shift] = await db.select().from(driverShifts).where(eq(driverShifts.id, 628)).limit(1);
  console.log("=== Shift 628 ===");
  console.log(shift);
  const routes = await db.select().from(driverRoutes).where(eq(driverRoutes.shiftId, 628));
  console.log("=== Routes linked to shift 628 ===");
  for (const r of routes) console.log(r.id, r.status, r.startedAt, r.finishedAt);

  // Also look at other shifts for the same driver around this date, for context
  if (shift) {
    const driverShiftsForDriver = await db.select().from(driverShifts).where(eq(driverShifts.driverId, shift.driverId));
    console.log(`\n=== All shifts for driver ${shift.driverId} ===`);
    for (const s of driverShiftsForDriver) console.log(s.id, s.startTime, s.endTime, s.createdAt);
  }

  await pool.promise().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
