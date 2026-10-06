import "dotenv/config";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { orders, trackingEvents, routeOrders } from "../drizzle/schema";

// Admin mistakenly logged a "delivered" status with a POD photo on this
// return-pickup order via the dashboard on 2026-09-23. Someone already added
// a corrective "pending_pickup" tracking event (which flipped orders.status
// back), but the erroneous delivered event + POD is still in trackingEvents,
// and the route stop is still stuck at status "delivered".
const ORDER_ID = 2548;
const WAYBILL = "PX202601433-635";
const ROUTE_ORDER_ID = 2040;
const WRONG_DELIVERED_EVENT_ID = 7798;

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const [order] = await db.select().from(orders).where(eq(orders.id, ORDER_ID)).limit(1);
  const [event] = await db.select().from(trackingEvents).where(eq(trackingEvents.id, WRONG_DELIVERED_EVENT_ID)).limit(1);
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
  if (order.status !== "pending_pickup") {
    throw new Error(`Order ${ORDER_ID} expected status pending_pickup but found ${order.status}, aborting`);
  }

  if (!event) throw new Error(`Tracking event ${WRONG_DELIVERED_EVENT_ID} not found, aborting`);
  if (event.shipmentId !== ORDER_ID || event.statusCode !== "delivered") {
    throw new Error(`Tracking event ${WRONG_DELIVERED_EVENT_ID} doesn't match expectations, aborting`);
  }

  if (!stop) throw new Error(`Route stop ${ROUTE_ORDER_ID} not found, aborting`);
  if (stop.orderId !== ORDER_ID || stop.status !== "delivered") {
    throw new Error(`Route stop ${ROUTE_ORDER_ID} doesn't match expectations, aborting`);
  }

  await db.delete(trackingEvents).where(eq(trackingEvents.id, WRONG_DELIVERED_EVENT_ID));
  console.log(`Tracking event ${WRONG_DELIVERED_EVENT_ID} (delivered + POD): deleted`);

  await db.update(routeOrders)
    .set({ status: "pending", deliveredAt: null, proofPhotoUrl: null, proofPhotoUrl2: null })
    .where(eq(routeOrders.id, ROUTE_ORDER_ID));
  console.log(`Route stop ${ROUTE_ORDER_ID}: status -> pending`);

  const [finalOrder] = await db.select().from(orders).where(eq(orders.id, ORDER_ID)).limit(1);
  const finalEvents = await db.select().from(trackingEvents).where(eq(trackingEvents.shipmentId, ORDER_ID));
  const [finalStop] = await db.select().from(routeOrders).where(eq(routeOrders.id, ROUTE_ORDER_ID)).limit(1);

  console.log("\n=== Final state ===");
  console.log("order:", finalOrder?.status, finalOrder?.deliveryDateReal);
  console.log("events:", finalEvents.map((e) => ({ id: e.id, statusCode: e.statusCode, podFileUrl: e.podFileUrl })));
  console.log("stop:", finalStop?.status, finalStop?.deliveredAt, finalStop?.proofPhotoUrl);

  await pool.promise().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
