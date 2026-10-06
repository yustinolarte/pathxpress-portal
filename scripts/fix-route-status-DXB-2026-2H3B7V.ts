import "dotenv/config";
import fs from "fs";
import path from "path";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { orders, driverRoutes, routeOrders, trackingEvents, driverShifts } from "../drizzle/schema";

const ROUTE_ID = "DXB-2026-2H3B7V";
const SHIFT_ID = 628;

// Route was created by dispatch at 2026-08-17T20:31:46Z for driver 142, still
// 'pending'. A few minutes later someone opened/scanned it from the wrong
// account, which (a) flipped the route + its 9 delivery stops to in_progress,
// (b) auto-opened a shift for driver 142 (since none was open) and closed it
// 84s later with zero real activity, and (c) auto-advanced all 9 orders from
// picked_up (legitimate — they really were picked up earlier that day) to
// out_for_delivery, logging a stray tracking event for each. Undo exactly
// that: restore the pre-scan status on route/stops/orders, delete the stray
// events, and remove the phantom shift.
const FIXES: { orderId: number; routeOrderId: number; pickedUpAt: string; badEventId: number }[] = [
  { orderId: 2279, routeOrderId: 1623, pickedUpAt: "2026-08-17T14:57:22.000Z", badEventId: 6534 },
  { orderId: 2264, routeOrderId: 1624, pickedUpAt: "2026-08-17T14:43:08.000Z", badEventId: 6535 },
  { orderId: 2265, routeOrderId: 1625, pickedUpAt: "2026-08-17T14:43:27.000Z", badEventId: 6536 },
  { orderId: 2270, routeOrderId: 1626, pickedUpAt: "2026-08-17T14:44:42.000Z", badEventId: 6537 },
  { orderId: 2269, routeOrderId: 1627, pickedUpAt: "2026-08-17T14:53:10.000Z", badEventId: 6538 },
  { orderId: 2268, routeOrderId: 1628, pickedUpAt: "2026-08-17T14:54:42.000Z", badEventId: 6539 },
  { orderId: 2276, routeOrderId: 1629, pickedUpAt: "2026-08-17T14:57:00.000Z", badEventId: 6540 },
  { orderId: 2278, routeOrderId: 1630, pickedUpAt: "2026-08-17T14:55:57.000Z", badEventId: 6541 },
  { orderId: 2280, routeOrderId: 1631, pickedUpAt: "2026-08-17T14:56:39.000Z", badEventId: 6542 },
];

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const orderIds = FIXES.map((f) => f.orderId);
  const routeOrderIds = FIXES.map((f) => f.routeOrderId);
  const badEventIds = FIXES.map((f) => f.badEventId);

  // 1. Backup snapshot before touching anything
  const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, ROUTE_ID)).limit(1);
  const [shift] = await db.select().from(driverShifts).where(eq(driverShifts.id, SHIFT_ID)).limit(1);
  const stops = await db.select().from(routeOrders).where(eq(routeOrders.routeId, ROUTE_ID));
  const affectedOrders = await db.select().from(orders).where(inArray(orders.id, orderIds));
  const affectedEvents = await db.select().from(trackingEvents).where(inArray(trackingEvents.shipmentId, orderIds));

  const backup = {
    routeId: ROUTE_ID,
    shiftId: SHIFT_ID,
    takenAt: new Date().toISOString(),
    fixes: FIXES,
    driverRoutes: route ? [route] : [],
    driverShifts: shift ? [shift] : [],
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
  if (!route) throw new Error(`Route ${ROUTE_ID} not found, aborting`);
  if (route.status !== "in_progress") throw new Error(`Route ${ROUTE_ID} expected status in_progress but found ${route.status}, aborting`);
  if (route.shiftId !== SHIFT_ID) throw new Error(`Route ${ROUTE_ID} expected shiftId ${SHIFT_ID} but found ${route.shiftId}, aborting`);

  if (!shift) throw new Error(`Shift ${SHIFT_ID} not found, aborting`);
  if (shift.driverId !== route.driverId) throw new Error(`Shift ${SHIFT_ID} driverId mismatch with route, aborting`);
  const otherRoutesOnShift = await db.select().from(driverRoutes).where(eq(driverRoutes.shiftId, SHIFT_ID));
  if (otherRoutesOnShift.length !== 1 || otherRoutesOnShift[0].id !== ROUTE_ID) {
    throw new Error(`Shift ${SHIFT_ID} is linked to more than just route ${ROUTE_ID}, aborting (would orphan other routes)`);
  }

  for (const fix of FIXES) {
    const order = affectedOrders.find((o) => o.id === fix.orderId);
    if (!order) throw new Error(`Order ${fix.orderId} not found, aborting`);
    if (order.status !== "out_for_delivery") {
      throw new Error(`Order ${fix.orderId} expected status out_for_delivery but found ${order.status}, aborting`);
    }
    const badEvent = affectedEvents.find((e) => e.id === fix.badEventId);
    if (!badEvent || badEvent.statusCode !== "out_for_delivery" || badEvent.shipmentId !== fix.orderId) {
      throw new Error(`Tracking event ${fix.badEventId} for order ${fix.orderId} doesn't match expectations, aborting`);
    }
    const stop = stops.find((s) => s.id === fix.routeOrderId);
    if (!stop || stop.orderId !== fix.orderId || stop.status !== "in_progress") {
      throw new Error(`Route stop ${fix.routeOrderId} for order ${fix.orderId} doesn't match expectations, aborting`);
    }
  }

  // 3. Apply fixes
  for (const fix of FIXES) {
    await db.update(orders)
      .set({ status: "picked_up", lastStatusUpdate: new Date(fix.pickedUpAt) })
      .where(eq(orders.id, fix.orderId));
    console.log(`Order ${fix.orderId}: status -> picked_up, lastStatusUpdate -> ${fix.pickedUpAt}`);
  }

  await db.delete(trackingEvents).where(inArray(trackingEvents.id, badEventIds));
  console.log(`Deleted stray tracking events: ${badEventIds.join(", ")}`);

  await db.update(routeOrders)
    .set({ status: "pending" })
    .where(inArray(routeOrders.id, routeOrderIds));
  console.log(`Route stops ${routeOrderIds.join(", ")}: status -> pending`);

  await db.update(driverRoutes)
    .set({ status: "pending", startedAt: null, shiftId: null })
    .where(eq(driverRoutes.id, ROUTE_ID));
  console.log(`Route ${ROUTE_ID}: status -> pending, startedAt -> null, shiftId -> null`);

  await db.delete(driverShifts).where(eq(driverShifts.id, SHIFT_ID));
  console.log(`Deleted phantom shift ${SHIFT_ID}`);

  // 4. Verify final state
  const [finalRoute] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, ROUTE_ID)).limit(1);
  const finalStops = await db.select().from(routeOrders).where(eq(routeOrders.routeId, ROUTE_ID));
  const finalOrders = await db.select().from(orders).where(inArray(orders.id, orderIds));

  console.log("\n=== Final state ===");
  console.log("route:", finalRoute);
  for (const s of finalStops) console.log(`stop ${s.id} orderId=${s.orderId} status=${s.status}`);
  for (const o of finalOrders) console.log(`order ${o.id} (${o.waybillNumber}): status=${o.status} lastStatusUpdate=${o.lastStatusUpdate}`);

  await pool.promise().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
