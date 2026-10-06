import "dotenv/config";
import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { clientAccounts, savedShippers } from "../drizzle/schema";

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const clients = await db.select().from(clientAccounts).where(like(clientAccounts.companyName, "%Bagonista%"));
  for (const c of clients) {
    console.log("=== Client", c.id, c.companyName, "===");
    const shippers = await db.select().from(savedShippers).where(eq(savedShippers.clientId, c.id));
    for (const s of shippers) {
      console.log({
        id: s.id, nickname: s.nickname, isDefault: s.isDefault,
        shipperName: s.shipperName, shipperAddress: s.shipperAddress, shipperCity: s.shipperCity,
        latitude: s.latitude, longitude: s.longitude,
      });
    }
  }

  await pool.promise().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
