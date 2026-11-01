/**
 * Return to Origin (RTO) — DB side. The swap rules live in shared/rto.ts.
 */
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { codRecords, orders, type Order } from '../drizzle/schema';
import { buildRtoRevert, buildRtoSwap, canUndoRto, isRtoEligible } from '@shared/rto';
import { cacheInvalidate } from './_core/queryCache';
import { createTrackingEvent, getDb, getOrderById } from './db';
import { geocodeAndStoreOrderLocation } from './geocoding';

async function requireOrder(orderId: number): Promise<Order> {
  const order = await getOrderById(orderId);
  if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
  return order;
}

/** Swap the destination back to the shipper. Conditional on isRto = 0, so a double click can't swap twice. */
export async function initiateReturnToOrigin(orderId: number, actor: string): Promise<Order> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

  const order = await requireOrder(orderId);
  if (!isRtoEligible(order)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Return to Origin isn't available for this order (status: ${order.status.replace(/_/g, ' ')})`,
    });
  }

  const update = buildRtoSwap(order);
  const result = await db.update(orders)
    .set({ ...update, lastStatusUpdate: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.isRto, 0)));
  if (Number((result as any)[0]?.affectedRows ?? 0) !== 1) {
    throw new TRPCError({ code: 'CONFLICT', message: 'This order is already returning to origin' });
  }

  // Nothing is collected from the shipper.
  if (order.codRequired) {
    await db.update(codRecords)
      .set({ status: 'cancelled' })
      .where(and(eq(codRecords.shipmentId, orderId), eq(codRecords.status, 'pending_collection')));
    cacheInvalidate('admin:allCODRecords');
  }

  await createTrackingEvent({
    shipmentId: orderId,
    eventDatetime: new Date(),
    statusCode: update.status,
    statusLabel: 'RETURN TO ORIGIN',
    description: `Returning to sender: ${order.shipperName}, ${order.shipperCity}`,
    createdBy: actor,
  });

  // Shipper saved without a pin → same approximate geocode a new order gets.
  if (!update.latitude) {
    geocodeAndStoreOrderLocation(orderId, { address: update.address, city: update.city, emirate: update.emirate });
  }

  return requireOrder(orderId);
}

/** Put the original shipper/consignee (and COD) back. */
export async function undoReturnToOrigin(orderId: number, actor: string): Promise<Order> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

  const order = await requireOrder(orderId);
  if (!canUndoRto(order)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This Return to Origin can no longer be undone' });
  }
  const revert = buildRtoRevert(order);
  if (!revert) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'The original shipment details are missing' });
  }

  const result = await db.update(orders)
    .set({ ...revert, lastStatusUpdate: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.isRto, 1)));
  if (Number((result as any)[0]?.affectedRows ?? 0) !== 1) {
    throw new TRPCError({ code: 'CONFLICT', message: 'This Return to Origin was already undone' });
  }

  if (revert.codRequired) {
    await db.update(codRecords)
      .set({ status: 'pending_collection' })
      .where(and(eq(codRecords.shipmentId, orderId), eq(codRecords.status, 'cancelled')));
    cacheInvalidate('admin:allCODRecords');
  }

  await createTrackingEvent({
    shipmentId: orderId,
    eventDatetime: new Date(),
    statusCode: revert.status,
    statusLabel: 'RETURN TO ORIGIN CANCELLED',
    description: `Delivering to ${revert.customerName}, ${revert.city} again`,
    createdBy: actor,
  });

  return requireOrder(orderId);
}
