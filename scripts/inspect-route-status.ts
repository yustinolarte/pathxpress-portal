import "dotenv/config";
import { eq, inArray, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { orders, driverRoutes, routeOrders, trackingEvents } from "../drizzle/schema";

const ROUTE_ID = process.argv[2] || "DXB-2026-5AG3NW";

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const [route] = await db.select().from(driverRoutes).where(eq(driverRoutes.id, ROUTE_ID)).limit(1);
  console.log("=== Route ===");
  console.log(route);

  const stops = await db.select().from(routeOrders).where(eq(routeOrders.routeId, ROUTE_ID));
  console.log(`\n=== Route Orders (${stops.length}) ===`);
  for (const s of stops) {
    console.log(`stop id=${s.id} orderId=${s.orderId} type=${s.type} status=${s.status} deliveredAt=${s.deliveredAt} attemptedAt=${s.attemptedAt}`);
  }

  const orderIds = [...new Set(stops.map(s => s.orderId))];
  if (orderIds.length === 0) {
    console.log("No orders found for this route.");
    await pool.promise().end();
    return;
  }

  const ords = await db.select().from(orders).where(inArray(orders.id, orderIds));
  console.log(`\n=== Orders (${ords.length}) ===`);
  for (const o of ords) {
    console.log(`order id=${o.id} waybill=${o.waybillNumber} customer=${o.customerName} status=${o.status} lastStatusUpdate=${o.lastStatusUpdate} deliveryDateReal=${o.deliveryDateReal}`);
  }

  const events = await db.select().from(trackingEvents).where(inArray(trackingEvents.shipmentId, orderIds)).orderBy(asc(trackingEvents.shipmentId), asc(trackingEvents.eventDatetime));
  console.log(`\n=== Tracking Events ===`);
  const byShipment = new Map<number, typeof events>();
  for (const e of events) {
    if (!byShipment.has(e.shipmentId)) byShipment.set(e.shipmentId, [] as any);
    byShipment.get(e.shipmentId)!.push(e);
  }

  console.log(`\n=== SUSPECTED AFFECTED ORDERS (delivered event exists, but later out_for_delivery event exists after it) ===`);
  const affected: number[] = [];
  for (const [shipmentId, evs] of byShipment) {
    let sawDelivered = false;
    let deliveredAt: Date | null = null;
    for (const e of evs) {
      if (e.statusCode === "delivered") {
        sawDelivered = true;
        deliveredAt = e.eventDatetime;
      } else if (sawDelivered && e.statusCode === "out_for_delivery") {
        affected.push(shipmentId);
        const order = ords.find(o => o.id === shipmentId);
        console.log(`\norder id=${shipmentId} waybill=${order?.waybillNumber} customer=${order?.customerName} currentStatus=${order?.status}`);
        console.log(`  delivered at ${deliveredAt?.toISOString()}, then reverted to out_for_delivery at ${e.eventDatetime.toISOString()} (event id=${e.id})`);
        break;
      }
    }
  }

  console.log(`\n=== Full timelines for all route orders ===`);
  for (const [shipmentId, evs] of byShipment) {
    const order = ords.find(o => o.id === shipmentId);
    console.log(`\n--- order ${shipmentId} (${order?.waybillNumber}) current status=${order?.status} ---`);
    for (const e of evs) {
      console.log(`  [${e.id}] ${e.eventDatetime.toISOString()} statusCode=${e.statusCode} createdBy=${e.createdBy} desc=${e.description}`);
    }
  }

  console.log(`\n=== SUMMARY: ${affected.length} affected order id(s): ${affected.join(", ")} ===`);

  await pool.promise().end();
}

main().catch(e => { console.error(e); process.exit(1); });
