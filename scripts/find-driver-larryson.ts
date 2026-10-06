import "dotenv/config";
import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { drivers } from "../drizzle/schema";

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const [d142] = await db.select().from(drivers).where(eq(drivers.id, 142)).limit(1);
  console.log("=== Driver 142 (currently assigned to route) ===");
  console.log(d142);

  const candidates = await db.select().from(drivers).where(like(drivers.fullName, "%arr%"));
  console.log("\n=== Drivers with 'arr' in fullName (larrison/larryson candidates) ===");
  for (const d of candidates) console.log(d.id, d.username, d.fullName, d.status);

  const candidates2 = await db.select().from(drivers).where(like(drivers.username, "%arr%"));
  console.log("\n=== Drivers with 'arr' in username ===");
  for (const d of candidates2) console.log(d.id, d.username, d.fullName, d.status);

  await pool.promise().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
