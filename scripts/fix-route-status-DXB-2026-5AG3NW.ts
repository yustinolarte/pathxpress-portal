import "dotenv/config";
import fs from "fs";
import path from "path";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { orders, driverRoutes, routeOrders, trackingEvents } from "../drizzle/schema";

const ROUTE_ID = "DXB-2026-5AG3NW";

// Orders wrongly reverted to out_for_delivery by a duplicate driver-app event
// after they were already delivered. routeOrders.status is already correct
// ("delivered") for all of these — only orders.status/lastStatusUpdate and the
// stray tracking event need correcting.
const FIXES: { orderId: number; deliveredAt: string; badEventId: number }[] = [
  { orderId: 1172, deliveredAt: "2026-07-01T08:14:06.000Z", badEventId: 3842 },
  { orderId: 1173, deliveredAt: "2026-07-01T08:14:26.000Z", badEventId: 3843 },
  { orderId: 1174, deliveredAt: "2026-07-01T08:14:39.000Z", badEventId: 3844 },
  { orderId: 1175, deliveredAt: "2026-07-01T08:35:54.000Z", badEventId: 3845 },
  { orderId: 1179, deliveredAt: "2026-07-01T08:24:14.000Z", badEventId: 3848 },
];

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const orderIds = FIXES.map(f => f.orderId);

  // 1. Backup snapshot before touching anything
  const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, ROUTE_ID)).limit(1);
  const stops = await db.select().from(routeOrders).where(eq(routeOrders.routeId, ROUTE_ID));
  const affectedOrders = await db.select().from(orders).where(inArray(orders.id, orderIds));
  const affectedEvents = await db.select().from(trackingEvents).where(inArray(trackingEvents.shipmentId, orderIds));

  const backup = {
    routeId: ROUTE_ID,
    takenAt: new Date().toISOString(),
    fixes: FIXES,
    driverRoutes: route ? [route] : [],
    routeOrders: stops,
    orders: affectedOrders,
    trackingEvents: affectedEvents,
  };
  const scriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
  const backupPath = path.join(
    scriptDir,
    "..",
    "backups",
    `route-fix-${ROUTE_ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(backupPath, JSON.stringify(backup, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  console.log(`Backup written to ${backupPath}`);

  // 2. Verify current state matches expectations before mutating
  for (const fix of FIXES) {
    const order = affectedOrders.find(o => o.id === fix.orderId);
    if (!order) throw new Error(`Order ${fix.orderId} not found, aborting`);
    if (order.status !== "out_for_delivery") {
      throw new Error(`Order ${fix.orderId} expected status out_for_delivery but found ${order.status}, aborting`);
    }
    const badEvent = affectedEvents.find(e => e.id === fix.badEventId);
    if (!badEvent || badEvent.statusCode !== "out_for_delivery" || badEvent.shipmentId !== fix.orderId) {
      throw new Error(`Tracking event ${fix.badEventId} for order ${fix.orderId} doesn't match expectations, aborting`);
    }
  }

  // 3. Apply fixes
  for (const fix of FIXES) {
    await db.update(orders)
      .set({ status: "delivered", lastStatusUpdate: new Date(fix.deliveredAt) })
      .where(eq(orders.id, fix.orderId));
    console.log(`Order ${fix.orderId}: status -> delivered, lastStatusUpdate -> ${fix.deliveredAt}`);
  }

  const badEventIds = FIXES.map(f => f.badEventId);
  await db.delete(trackingEvents).where(inArray(trackingEvents.id, badEventIds));
  console.log(`Deleted stray tracking events: ${badEventIds.join(", ")}`);

  // 4. Verify final state
  const finalOrders = await db.select().from(orders).where(inArray(orders.id, orderIds));
  console.log("\n=== Final state ===");
  for (const o of finalOrders) {
    console.log(`order ${o.id} (${o.waybillNumber}): status=${o.status} lastStatusUpdate=${o.lastStatusUpdate}`);
  }

  await pool.promise().end();
}

main().catch(e => { console.error(e); process.exit(1); });
