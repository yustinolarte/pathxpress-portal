/**
 * Where an order stands with the WhatsApp location bot, as one SQL expression
 * over a LEFT JOIN of bot_orders. Shared by the WhatsApp bot admin panel and
 * the dispatch views (which show whether a pin was confirmed by the recipient
 * or a request is still waiting).
 */
import { sql } from 'drizzle-orm';
import { botOrders } from '../drizzle/schema';

export const BOT_STATUSES = ['not_tracked', 'queued', 'waiting', 'failed', 'received', 'reused', 'expired', 'paused'] as const;
export type BotOrderStatusFilter = (typeof BOT_STATUSES)[number];

export const botStatusExpr = sql<string>`CASE
  WHEN ${botOrders.id} IS NULL THEN 'not_tracked'
  WHEN ${botOrders.status} = 'awaiting_location' AND ${botOrders.deliveryStatus} = 'failed' THEN 'failed'
  WHEN ${botOrders.status} = 'awaiting_location' AND ${botOrders.deliveryStatus} = 'queued' THEN 'queued'
  WHEN ${botOrders.status} = 'awaiting_location' THEN 'waiting'
  WHEN ${botOrders.status} = 'location_received' THEN 'received'
  WHEN ${botOrders.status} = 'reused' THEN 'reused'
  WHEN ${botOrders.status} = 'expired' THEN 'expired'
  ELSE 'not_tracked' END`;
