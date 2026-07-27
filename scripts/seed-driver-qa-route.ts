/**
 * Creates a single, comprehensive driver route for client 28 (PathXpress QA —
 * internal test account) covering every stop-level and shipment-type scenario
 * the driver app needs to exercise: COD (cash/card/any), plain prepaid outcomes
 * (delivered/attempted/failed/on_hold/returned), failed/attempted pickup,
 * pickup-only vs delivery-only legs, Fit on Delivery, Preferred Time, a return
 * shipment, and a full exchange (return leg + new leg with its own COD).
 *
 * Run: npx tsx scripts/seed-driver-qa-route.ts
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { drizzle } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import { clientAccounts, orders, driverRoutes, routeOrders, type InsertOrder } from '../drizzle/schema';

const db = drizzle(process.env.DATABASE_URL!);

const CLIENT_ID = 28;
const DRIVER_ID = 4; // Juan andres
const ROUTE_ID = 'DXB-2026-QATEST';
const ROUTE_DATE = new Date('2026-07-27T00:00:00+04:00');

const WAREHOUSE = {
  name: 'PathXpress QA Warehouse',
  address: 'Al Quoz Industrial Area 3, Warehouse 12',
  city: 'Dubai',
  country: 'UAE',
  phone: '+971500000001',
  lat: '25.1372',
  lng: '55.2373',
};

let seq = 0;
function waybill() {
  seq++;
  return `QAROUTE-${String(seq).padStart(2, '0')}`;
}

async function insertOrder(values: InsertOrder): Promise<{ id: number; waybillNumber: string }> {
  const result: any = await db.insert(orders).values(values);
  const id = Number(result[0].insertId);
  return { id, waybillNumber: values.waybillNumber! };
}

// Base shape shared by every "normal" (warehouse -> customer) test stop.
function base(overrides: Partial<InsertOrder> & { label: string; customerName: string; customerPhone: string; address: string; city: string; emirate: string; lat: string; lng: string }): InsertOrder {
  const { label, lat, lng, ...rest } = overrides;
  return {
    clientId: CLIENT_ID,
    orderNumber: label,
    waybillNumber: waybill(),
    shipperName: WAREHOUSE.name,
    shipperAddress: WAREHOUSE.address,
    shipperCity: WAREHOUSE.city,
    shipperCountry: WAREHOUSE.country,
    shipperPhone: WAREHOUSE.phone,
    shipperLat: WAREHOUSE.lat,
    shipperLng: WAREHOUSE.lng,
    destinationCountry: 'UAE',
    pieces: 1,
    weight: '1.50',
    serviceType: 'DOM',
    codRequired: 0,
    codAmount: null,
    codCurrency: null,
    codPaymentMethod: null,
    fitOnDelivery: 0,
    latitude: lat,
    longitude: lng,
    locationAccuracy: 'exact',
    status: 'pending_pickup',
    lastStatusUpdate: new Date(),
    ...rest,
  } as InsertOrder;
}

async function main() {
  console.log('1. Enabling Card-on-Delivery (CCOD) + Fit-on-Delivery (FOD) on client 28 (QA)...');
  await db.update(clientAccounts)
    .set({ cardOnDeliveryAllowed: 1, fodAllowed: 1 })
    .where(eq(clientAccounts.id, CLIENT_ID));

  console.log('2. Creating test orders...');
  const created: { key: string; label: string; id: number; waybillNumber: string; mode: 'both' | 'pickup_only' | 'delivery_only' }[] = [];

  // ---- 01: COD Cash — deliver + collect cash ----
  const o01 = await insertOrder(base({
    label: 'TEST01-COD-CASH', customerName: 'QA01 Dubai Mall (COD Cash)', customerPhone: '+971555000001',
    address: 'Dubai Mall, Financial Center Rd, Ground Floor, Shop G-15', city: 'Dubai', emirate: 'Dubai',
    lat: '25.1972', lng: '55.2744',
    codRequired: 1, codAmount: '250.00', codCurrency: 'AED', codPaymentMethod: 'cash',
  }));
  created.push({ key: '01', label: 'COD Cash — deliver, collect AED 250 cash', ...o01, mode: 'both' });

  // ---- 02: COD Card (CCOD) — Tap to Pay on driver phone ----
  const o02 = await insertOrder(base({
    label: 'TEST02-COD-CARD', customerName: 'QA02 Business Bay (COD Card/CCOD)', customerPhone: '+971555000002',
    address: 'Business Bay, Bay Square, Building 3, Office 401', city: 'Dubai', emirate: 'Dubai',
    lat: '25.1857', lng: '55.2635',
    codRequired: 1, codAmount: '400.00', codCurrency: 'AED', codPaymentMethod: 'card',
  }));
  created.push({ key: '02', label: 'COD Card (CCOD) — Tap to Pay; needs paymentReference (Phase 2 app support pending — good case to confirm the block/flow)', ...o02, mode: 'both' });

  // ---- 03: COD Any — cash or card at the door ----
  const o03 = await insertOrder(base({
    label: 'TEST03-COD-ANY', customerName: 'QA03 JBR Beach (COD Any)', customerPhone: '+971555000003',
    address: 'JBR, The Walk, Bahar 2, Ground Floor', city: 'Dubai', emirate: 'Dubai',
    lat: '25.0805', lng: '55.1403',
    codRequired: 1, codAmount: '180.00', codCurrency: 'AED', codPaymentMethod: 'any',
  }));
  created.push({ key: '03', label: 'COD Any — driver/customer choose cash or card', ...o03, mode: 'both' });

  // ---- 04: Prepaid — happy path, mark DELIVERED ----
  const o04 = await insertOrder(base({
    label: 'TEST04-PREPAID-OK', customerName: 'QA04 Al Barsha (Prepaid, mark DELIVERED)', customerPhone: '+971555000004',
    address: 'Mall of the Emirates, Al Barsha 1, Near Ski Dubai', city: 'Dubai', emirate: 'Dubai',
    lat: '25.1181', lng: '55.2003',
  }));
  created.push({ key: '04', label: 'Prepaid — mark DELIVERED (happy path)', ...o04, mode: 'both' });

  // ---- 05: Prepaid — mark ATTEMPTED (customer not home, will retry) ----
  const o05 = await insertOrder(base({
    label: 'TEST05-ATTEMPTED', customerName: 'QA05 Deira City Centre (mark ATTEMPTED)', customerPhone: '+971555000005',
    address: 'Deira City Centre, Port Saeed, Near Entrance 4', city: 'Dubai', emirate: 'Dubai',
    lat: '25.2532', lng: '55.3323',
  }));
  created.push({ key: '05', label: 'Prepaid — mark delivery ATTEMPTED', ...o05, mode: 'both' });

  // ---- 06: Prepaid — mark FAILED ----
  const o06 = await insertOrder(base({
    label: 'TEST06-FAILED-DELIVERY', customerName: 'QA06 Al Majaz Sharjah (mark FAILED)', customerPhone: '+971555000006',
    address: 'Al Majaz 3, Corniche Street, Tower A, Apartment 1502', city: 'Sharjah', emirate: 'Sharjah',
    lat: '25.3375', lng: '55.3903',
  }));
  created.push({ key: '06', label: 'Prepaid — mark delivery FAILED', ...o06, mode: 'both' });

  // ---- 07: Prepaid — mark ON HOLD ----
  const o07 = await insertOrder(base({
    label: 'TEST07-ON-HOLD', customerName: 'QA07 Mirdif City Centre (mark ON HOLD)', customerPhone: '+971555000007',
    address: 'Mirdif City Centre, Near Carrefour', city: 'Dubai', emirate: 'Dubai',
    lat: '25.2158', lng: '55.4136',
  }));
  created.push({ key: '07', label: 'Prepaid — mark ON HOLD', ...o07, mode: 'both' });

  // ---- 08: Prepaid — mark RETURNED (customer refused at door) ----
  const o08 = await insertOrder(base({
    label: 'TEST08-RETURNED-AT-DOOR', customerName: 'QA08 Motor City (mark RETURNED)', customerPhone: '+971555000008',
    address: 'Motor City, Green Community, Villa 22', city: 'Dubai', emirate: 'Dubai',
    lat: '25.0469', lng: '55.2373',
  }));
  created.push({ key: '08', label: 'Prepaid — mark delivery RETURNED (refused at door)', ...o08, mode: 'both' });

  // ---- 09: Failed PICKUP (shipper/warehouse not available) ----
  const o09 = await insertOrder(base({
    label: 'TEST09-FAILED-PICKUP', customerName: 'QA09 International City (mark PICKUP FAILED)', customerPhone: '+971555000009',
    address: 'International City, France Cluster, Building 11', city: 'Dubai', emirate: 'Dubai',
    lat: '25.1667', lng: '55.4167',
  }));
  created.push({ key: '09', label: 'Mark the PICKUP leg FAILED (delivery leg stays pending, as in real dispatch)', ...o09, mode: 'both' });

  // ---- 10: Pickup ATTEMPTED (retry later) ----
  const o10 = await insertOrder(base({
    label: 'TEST10-PICKUP-ATTEMPTED', customerName: 'QA10 Jumeirah Beach Rd (mark PICKUP ATTEMPTED)', customerPhone: '+971555000010',
    address: 'Jumeirah Beach Road, Jumeirah 1, Villa 9', city: 'Dubai', emirate: 'Dubai',
    lat: '25.2048', lng: '55.2547',
  }));
  created.push({ key: '10', label: 'Mark the PICKUP leg ATTEMPTED', ...o10, mode: 'both' });

  // ---- 11: Fit on Delivery + COD cash (try before buy) ----
  const o11 = await insertOrder(base({
    label: 'TEST11-FOD', customerName: 'QA11 Al Nahda (Fit on Delivery + COD)', customerPhone: '+971555000011',
    address: 'Al Nahda 2, Al Nahda Building, Flat 604', city: 'Dubai', emirate: 'Dubai',
    lat: '25.2887', lng: '55.3729',
    fitOnDelivery: 1, codRequired: 1, codAmount: '220.00', codCurrency: 'AED', codPaymentMethod: 'cash',
  }));
  created.push({ key: '11', label: 'Fit on Delivery — try item at door, then deliver/return + COD cash', ...o11, mode: 'both' });

  // ---- 12: Preferred Time Delivery ----
  const o12 = await insertOrder(base({
    label: 'TEST12-PREFERRED-TIME', customerName: 'QA12 Discovery Gardens (Preferred Time 18:00)', customerPhone: '+971555000012',
    address: 'Discovery Gardens, Street 12, Villa 3', city: 'Dubai', emirate: 'Dubai',
    lat: '25.0430', lng: '55.1420',
    serviceType: 'PREFERRED_TIME', preferredDeliveryDate: '2026-07-27', preferredDeliveryTime: '18:00',
  }));
  created.push({ key: '12', label: 'Preferred Time Delivery — window 18:00', ...o12, mode: 'both' });

  // ---- 13: Delivery ONLY — package already picked up elsewhere ----
  const o13 = await insertOrder(base({
    label: 'TEST13-DELIVERY-ONLY', customerName: 'QA13 Silicon Oasis (Delivery ONLY, skip pickup)', customerPhone: '+971555000013',
    address: 'Silicon Oasis, Cluster F, Building 5', city: 'Dubai', emirate: 'Dubai',
    lat: '25.1231', lng: '55.3803',
    status: 'out_for_delivery', pickupDate: new Date(), pickupDriverId: DRIVER_ID,
  }));
  created.push({ key: '13', label: 'Delivery-ONLY stop (order already out_for_delivery)', ...o13, mode: 'delivery_only' });

  // ---- 14: Pickup ONLY — delivery leg to be assigned separately later ----
  const o14 = await insertOrder(base({
    label: 'TEST14-PICKUP-ONLY', customerName: 'QA14 Al Qusais (Pickup ONLY, split leg)', customerPhone: '+971555000014',
    address: 'Al Qusais Industrial Area 4, Warehouse 8', city: 'Dubai', emirate: 'Dubai',
    lat: '25.2769', lng: '55.3831',
  }));
  created.push({ key: '14', label: 'Pickup-ONLY stop (no delivery leg in this route — split-leg dispatch)', ...o14, mode: 'pickup_only' });

  // ---- Background orders: already "delivered", used as the source shipment for a return / exchange ----
  const origA = await insertOrder(base({
    label: 'ORIG-A-FOR-RETURN', customerName: 'QA15-ORIGINAL Karama (already delivered)', customerPhone: '+971555000015',
    address: 'Karama, Kuwait Street, Building 7, Flat 12', city: 'Dubai', emirate: 'Dubai',
    lat: '25.2455', lng: '55.3033',
    status: 'delivered', deliveryDateReal: new Date(), pickupDate: new Date(),
  }));
  const origB = await insertOrder(base({
    label: 'ORIG-B-FOR-EXCHANGE', customerName: 'QA16-ORIGINAL Bur Dubai (already delivered)', customerPhone: '+971555000016',
    address: 'Bur Dubai, Al Fahidi Street, Building 4, Flat 21', city: 'Dubai', emirate: 'Dubai',
    lat: '25.2582', lng: '55.2969',
    status: 'delivered', deliveryDateReal: new Date(), pickupDate: new Date(),
  }));

  // ---- 15: Return shipment — pick up from the (former) customer, deliver back to warehouse ----
  const [origAFull] = await db.select().from(orders).where(eq(orders.id, origA.id)).limit(1);
  const o15 = await insertOrder({
    clientId: CLIENT_ID,
    orderNumber: `RTN-${origAFull.waybillNumber}`,
    waybillNumber: waybill(),
    // Swap: consignee becomes shipper (customer now hands the package back)
    shipperName: origAFull.customerName,
    shipperAddress: origAFull.address,
    shipperCity: origAFull.city,
    shipperCountry: origAFull.destinationCountry,
    shipperPhone: origAFull.customerPhone,
    shipperLat: origAFull.latitude,
    shipperLng: origAFull.longitude,
    // Swap: original shipper (warehouse) becomes consignee
    customerName: origAFull.shipperName,
    customerPhone: origAFull.shipperPhone,
    address: origAFull.shipperAddress,
    city: origAFull.shipperCity,
    destinationCountry: origAFull.shipperCountry,
    latitude: origAFull.shipperLat,
    longitude: origAFull.shipperLng,
    locationAccuracy: 'exact',
    pieces: origAFull.pieces,
    weight: origAFull.weight,
    serviceType: origAFull.serviceType,
    specialInstructions: `RETURN - Original order: ${origAFull.waybillNumber}`,
    codRequired: 0,
    isReturn: 1,
    originalOrderId: origA.id,
    returnCharged: 1,
    orderType: 'return',
    hideConsigneeAddress: 0,
    status: 'pending_pickup',
    lastStatusUpdate: new Date(),
  });
  created.push({ key: '15', label: `Return shipment — pickup from customer (Karama), deliver to warehouse [original: ${origAFull.waybillNumber}]`, ...o15, mode: 'both' });

  // ---- 16A/16B: Exchange — return leg (customer -> warehouse) + new leg (warehouse -> customer, with COD) ----
  const [origBFull] = await db.select().from(orders).where(eq(orders.id, origB.id)).limit(1);
  const o16a = await insertOrder({
    clientId: CLIENT_ID,
    orderNumber: `EXC-RTN-${origBFull.waybillNumber}`,
    waybillNumber: waybill(),
    shipperName: origBFull.customerName,
    shipperAddress: origBFull.address,
    shipperCity: origBFull.city,
    shipperCountry: origBFull.destinationCountry,
    shipperPhone: origBFull.customerPhone,
    shipperLat: origBFull.latitude,
    shipperLng: origBFull.longitude,
    customerName: origBFull.shipperName,
    customerPhone: origBFull.shipperPhone,
    address: origBFull.shipperAddress,
    city: origBFull.shipperCity,
    destinationCountry: origBFull.shipperCountry,
    latitude: origBFull.shipperLat,
    longitude: origBFull.shipperLng,
    locationAccuracy: 'exact',
    pieces: origBFull.pieces,
    weight: origBFull.weight,
    serviceType: origBFull.serviceType,
    specialInstructions: `EXCHANGE RETURN - Original: ${origBFull.waybillNumber}`,
    codRequired: 0,
    isReturn: 1,
    originalOrderId: origB.id,
    returnCharged: 1,
    orderType: 'exchange',
    hideConsigneeAddress: 0,
    status: 'pending_pickup',
    lastStatusUpdate: new Date(),
  });

  const [clientAccount] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, CLIENT_ID)).limit(1);
  const o16b = await insertOrder({
    clientId: CLIENT_ID,
    orderNumber: `EXC-NEW-${origBFull.waybillNumber}`,
    waybillNumber: waybill(),
    shipperName: clientAccount.companyName,
    shipperAddress: WAREHOUSE.address,
    shipperCity: WAREHOUSE.city,
    shipperCountry: WAREHOUSE.country,
    shipperPhone: clientAccount.phone,
    shipperLat: WAREHOUSE.lat,
    shipperLng: WAREHOUSE.lng,
    customerName: origBFull.customerName,
    customerPhone: origBFull.customerPhone,
    address: origBFull.address,
    city: origBFull.city,
    destinationCountry: 'UAE',
    latitude: origBFull.latitude,
    longitude: origBFull.longitude,
    locationAccuracy: 'exact',
    pieces: 1,
    weight: '1.50',
    serviceType: 'DOM',
    specialInstructions: `EXCHANGE NEW - Original: ${origBFull.waybillNumber}`,
    codRequired: 1,
    codAmount: '50.00',
    codCurrency: 'AED',
    codPaymentMethod: 'cash',
    isReturn: 0,
    originalOrderId: origB.id,
    orderType: 'exchange',
    exchangeOrderId: o16a.id,
    status: 'pending_pickup',
    lastStatusUpdate: new Date(),
  });
  await db.update(orders).set({ exchangeOrderId: o16b.id }).where(eq(orders.id, o16a.id));

  created.push({ key: '16A', label: `Exchange RETURN leg — pickup from customer (Bur Dubai), deliver to warehouse [original: ${origBFull.waybillNumber}]`, ...o16a, mode: 'both' });
  created.push({ key: '16B', label: 'Exchange NEW leg — pickup from warehouse, deliver replacement + collect AED 50 COD cash', ...o16b, mode: 'both' });

  // ---- Route + stops ----
  console.log('3. Creating driver route and assigning driver 4 (Juan andres)...');
  await db.insert(driverRoutes).values({
    id: ROUTE_ID,
    driverId: DRIVER_ID,
    date: ROUTE_DATE,
    zone: 'QA',
    vehicleInfo: 'QA Test Route',
    status: 'pending',
    startAddress: WAREHOUSE.address,
    startLat: WAREHOUSE.lat,
    startLng: WAREHOUSE.lng,
  });

  let sequence = 1;
  const stopsToInsert: { routeId: string; orderId: number; sequence: number; type: 'pickup' | 'delivery'; status: 'pending' }[] = [];
  for (const c of created) {
    if (c.mode === 'both') {
      stopsToInsert.push({ routeId: ROUTE_ID, orderId: c.id, sequence: sequence++, type: 'pickup', status: 'pending' });
      stopsToInsert.push({ routeId: ROUTE_ID, orderId: c.id, sequence: sequence++, type: 'delivery', status: 'pending' });
    } else if (c.mode === 'pickup_only') {
      stopsToInsert.push({ routeId: ROUTE_ID, orderId: c.id, sequence: sequence++, type: 'pickup', status: 'pending' });
    } else {
      stopsToInsert.push({ routeId: ROUTE_ID, orderId: c.id, sequence: sequence++, type: 'delivery', status: 'pending' });
    }
  }
  await db.insert(routeOrders).values(stopsToInsert);

  console.log('');
  console.log(`✅ Route ${ROUTE_ID} created with ${stopsToInsert.length} stops across ${created.length} orders, assigned to driver ${DRIVER_ID}.`);
  console.log('');
  console.log('📋 Test checklist:');
  for (const c of created) {
    console.log(`   [${c.key}] ${c.waybillNumber} — ${c.label}`);
  }
  console.log('');
  console.log('Background orders (already "delivered", not in the route — just the source shipments for #15/#16):');
  console.log(`   ${origAFull.waybillNumber} — source for the return (#15)`);
  console.log(`   ${origBFull.waybillNumber} — source for the exchange (#16A/#16B)`);
}

main()
  .then(() => {
    console.log('\n✅ Done.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
