import "dotenv/config";
import { like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { orders } from "../drizzle/schema";

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const rows = await db
    .select()
    .from(orders)
    .where(
      or(
        like(orders.orderNumber, "%ZH4%"),
        like(orders.waybillNumber, "%ZH4%"),
        like(orders.orderNumber, "%1236%"),
        like(orders.waybillNumber, "%1236%"),
        like(orders.orderNumber, "%1237%"),
        like(orders.waybillNumber, "%1237%")
      )
    );

  for (const o of rows) {
    console.log("=====", o.waybillNumber, "/", o.orderNumber, "=====");
    console.log({
      id: o.id,
      orderType: o.orderType,
      isReturn: o.isReturn,
      originalOrderId: o.originalOrderId,
      exchangeOrderId: o.exchangeOrderId,
      shipperName: o.shipperName,
      shipperAddress: o.shipperAddress,
      shipperLat: o.shipperLat,
      shipperLng: o.shipperLng,
      customerName: o.customerName,
      address: o.address,
      latitude: o.latitude,
      longitude: o.longitude,
      locationAccuracy: o.locationAccuracy,
      status: o.status,
    });
    console.log("");
  }

  await pool.promise().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
