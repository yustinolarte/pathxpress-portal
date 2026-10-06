import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { orders, trackingEvents, routeOrders, driverRoutes } from "../drizzle/schema";

const WAYBILL = "PX202601325-726";

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const [order] = await db.select().from(orders).where(eq(orders.waybillNumber, WAYBILL)).limit(1);
  console.log("=== ORDER ===");
  console.log(order);

  if (order) {
    const events = await db.select().from(trackingEvents).where(eq(trackingEvents.shipmentId, order.id));
    console.log("\n=== TRACKING EVENTS ===");
    for (const e of events) console.log(e);

    const stops = await db.select().from(routeOrders).where(eq(routeOrders.orderId, order.id));
    console.log("\n=== ROUTE STOPS ===");
    for (const s of stops) console.log(s);

    for (const s of stops) {
      const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, s.routeId)).limit(1);
      console.log(`\n=== ROUTE ${s.routeId} ===`);
      console.log(route);
    }
  }

  await pool.promise().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
