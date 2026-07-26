import "dotenv/config";
import fs from "fs";
import path from "path";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { orders, driverRoutes, routeOrders, trackingEvents } from "../drizzle/schema";

const ROUTE_ID = "DXB-2026-9PR9A2";

// Orders wrongly reverted to out_for_delivery by duplicate driver-app scan
// events after they were already delivered. The route was scanned twice
// (bulk out_for_delivery batches at 09:21:43-44 and again at 12:52:35-36);
// order 1549 additionally caught a stray revert from the first scan on top
// of the second. routeOrders.status is already correct ("delivered") for
// all of these — only orders.status/lastStatusUpdate and the stray tracking
// events need correcting.
const FIXES: { orderId: number; deliveredAt: string; badEventIds: number[] }[] = [
  { orderId: 1549, deliveredAt: "2026-07-25T08:42:00.000Z", badEventIds: [5206, 5235] },
  { orderId: 1554, deliveredAt: "2026-07-25T12:00:22.000Z", badEventIds: [5236] },
  { orderId: 1556, deliveredAt: "2026-07-25T11:13:09.000Z", badEventIds: [5234] },
  { orderId: 1571, deliveredAt: "2026-07-25T11:30:29.000Z", badEventIds: [5233] },
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
  const allBadEventIds = FIXES.flatMap(f => f.badEventIds);
  for (const fix of FIXES) {
    const order = affectedOrders.find(o => o.id === fix.orderId);
    if (!order) throw new Error(`Order ${fix.orderId} not found, aborting`);
    if (order.status !== "out_for_delivery") {
      throw new Error(`Order ${fix.orderId} expected status out_for_delivery but found ${order.status}, aborting`);
    }
    for (const badEventId of fix.badEventIds) {
      const badEvent = affectedEvents.find(e => e.id === badEventId);
      if (!badEvent || badEvent.statusCode !== "out_for_delivery" || badEvent.shipmentId !== fix.orderId) {
        throw new Error(`Tracking event ${badEventId} for order ${fix.orderId} doesn't match expectations, aborting`);
      }
    }
  }

  // 3. Apply fixes
  for (const fix of FIXES) {
    await db.update(orders)
      .set({ status: "delivered", lastStatusUpdate: new Date(fix.deliveredAt) })
      .where(eq(orders.id, fix.orderId));
    console.log(`Order ${fix.orderId}: status -> delivered, lastStatusUpdate -> ${fix.deliveredAt}`);
  }

  await db.delete(trackingEvents).where(inArray(trackingEvents.id, allBadEventIds));
  console.log(`Deleted stray tracking events: ${allBadEventIds.join(", ")}`);

  // 4. Verify final state
  const finalOrders = await db.select().from(orders).where(inArray(orders.id, orderIds));
  console.log("\n=== Final state ===");
  for (const o of finalOrders) {
    console.log(`order ${o.id} (${o.waybillNumber}): status=${o.status} lastStatusUpdate=${o.lastStatusUpdate}`);
  }

  await pool.promise().end();
}

main().catch(e => { console.error(e); process.exit(1); });
