import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { orders, trackingEvents, routeOrders, codRecords } from "../drizzle/schema";

const WAYBILL = "PX202601433-635";

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const [order] = await db.select().from(orders).where(eq(orders.waybillNumber, WAYBILL)).limit(1);
  console.log("=== order ===");
  console.log(order);

  if (order) {
    const events = await db.select().from(trackingEvents).where(eq(trackingEvents.shipmentId, order.id));
    console.log("\n=== trackingEvents ===");
    console.log(events);

    const stops = await db.select().from(routeOrders).where(eq(routeOrders.orderId, order.id));
    console.log("\n=== routeOrders ===");
    console.log(stops);

    const cods = await db.select().from(codRecords).where(eq(codRecords.shipmentId, order.id));
    console.log("\n=== codRecords ===");
    console.log(cods);
  }

  await pool.promise().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
