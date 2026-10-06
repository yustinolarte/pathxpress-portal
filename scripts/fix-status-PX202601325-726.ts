import "dotenv/config";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { orders, trackingEvents, routeOrders } from "../drizzle/schema";

// Driver SHJ 4 marked this stop "returned" by mistake on 2026-09-12; the
// customer confirmed it was actually delivered. Correct the order status,
// the stray "returned" tracking event, and the route stop status.
const ORDER_ID = 2433;
const WAYBILL = "PX202601325-726";
const ROUTE_ORDER_ID = 1871;
const RETURNED_EVENT_ID = 7344;
const EVENT_TIME = new Date("2026-09-12T08:42:39.000Z");

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const [order] = await db.select().from(orders).where(eq(orders.id, ORDER_ID)).limit(1);
  const [event] = await db.select().from(trackingEvents).where(eq(trackingEvents.id, RETURNED_EVENT_ID)).limit(1);
  const [stop] = await db.select().from(routeOrders).where(eq(routeOrders.id, ROUTE_ORDER_ID)).limit(1);

  const backup = { takenAt: new Date().toISOString(), order, event, stop };
  const scriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
  const backupPath = path.join(
    scriptDir,
    "..",
    "backups",
    `status-fix-${WAYBILL}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(backupPath, JSON.stringify(backup, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  console.log(`Backup written to ${backupPath}`);

  if (!order) throw new Error(`Order ${ORDER_ID} not found, aborting`);
  if (order.waybillNumber !== WAYBILL) throw new Error(`Order ${ORDER_ID} waybill mismatch, aborting`);
  if (order.status !== "returned") throw new Error(`Order ${ORDER_ID} expected status returned but found ${order.status}, aborting`);

  if (!event) throw new Error(`Tracking event ${RETURNED_EVENT_ID} not found, aborting`);
  if (event.shipmentId !== ORDER_ID || event.statusCode !== "returned") {
    throw new Error(`Tracking event ${RETURNED_EVENT_ID} doesn't match expectations, aborting`);
  }

  if (!stop) throw new Error(`Route stop ${ROUTE_ORDER_ID} not found, aborting`);
  if (stop.orderId !== ORDER_ID || stop.status !== "returned") {
    throw new Error(`Route stop ${ROUTE_ORDER_ID} doesn't match expectations, aborting`);
  }

  await db.update(orders)
    .set({ status: "delivered", deliveryDateReal: EVENT_TIME, lastStatusUpdate: EVENT_TIME })
    .where(eq(orders.id, ORDER_ID));
  console.log(`Order ${ORDER_ID}: status -> delivered`);

  await db.update(trackingEvents)
    .set({
      statusCode: "delivered",
      statusLabel: "DELIVERED",
      description: "Delivered (corrected from mistaken 'returned' entry by driver SHJ 4)",
    })
    .where(eq(trackingEvents.id, RETURNED_EVENT_ID));
  console.log(`Tracking event ${RETURNED_EVENT_ID}: statusCode -> delivered`);

  await db.update(routeOrders)
    .set({ status: "delivered", deliveredAt: EVENT_TIME })
    .where(eq(routeOrders.id, ROUTE_ORDER_ID));
  console.log(`Route stop ${ROUTE_ORDER_ID}: status -> delivered`);

  const [finalOrder] = await db.select().from(orders).where(eq(orders.id, ORDER_ID)).limit(1);
  const [finalEvent] = await db.select().from(trackingEvents).where(eq(trackingEvents.id, RETURNED_EVENT_ID)).limit(1);
  const [finalStop] = await db.select().from(routeOrders).where(eq(routeOrders.id, ROUTE_ORDER_ID)).limit(1);

  console.log("\n=== Final state ===");
  console.log("order:", finalOrder?.status, finalOrder?.deliveryDateReal);
  console.log("event:", finalEvent?.statusCode, finalEvent?.statusLabel);
  console.log("stop:", finalStop?.status, finalStop?.deliveredAt);

  await pool.promise().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
