import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { portalAdminProcedure, router } from './_core/trpc';
import { getDb } from './db';
import { botFetch } from './_core/botClient';
import { ENV } from './_core/env';
import { orders, clientAccounts, botOrders, botSessions, botMessages, botRuntime } from '../drizzle/schema';

/**
 * WhatsApp location bot — admin section. Reads come straight from the bot_*
 * tables the bot service maintains; anything that needs the live WhatsApp
 * socket (send, pause, re-request) is delegated to the bot's admin API.
 */

const BOT_STATUSES = ['not_tracked', 'queued', 'waiting', 'failed', 'received', 'reused', 'expired', 'paused'] as const;
export type BotOrderStatusFilter = (typeof BOT_STATUSES)[number];

// Statuses the bot itself considers "still open" — mirrors TRIGGERABLE_STATUSES in the bot.
const OPEN_ORDER_STATUSES = ['pending_pickup', 'picked_up'];

// A heartbeat older than this means the bot process is down (it writes every ~30s).
const HEARTBEAT_STALE_MS = 90_000;

const botStatusExpr = sql<string>`CASE
  WHEN ${botOrders.id} IS NULL THEN 'not_tracked'
  WHEN ${botOrders.status} = 'awaiting_location' AND ${botOrders.deliveryStatus} = 'failed' THEN 'failed'
  WHEN ${botOrders.status} = 'awaiting_location' AND ${botOrders.deliveryStatus} = 'queued' THEN 'queued'
  WHEN ${botOrders.status} = 'awaiting_location' THEN 'waiting'
  WHEN ${botOrders.status} = 'location_received' THEN 'received'
  WHEN ${botOrders.status} = 'reused' THEN 'reused'
  WHEN ${botOrders.status} = 'expired' THEN 'expired'
  ELSE 'not_tracked' END`;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
  return db;
}

export const whatsappBotRouter = router({
  getStatus: portalAdminProcedure.query(async () => {
    const db = await requireDb();
    // Age computed in SQL so it doesn't depend on the portal server's timezone matching the DB's.
    const [runtime] = await db
      .select({
        whatsappConnected: botRuntime.whatsappConnected,
        connectedSince: botRuntime.connectedSince,
        lastHeartbeatAt: botRuntime.lastHeartbeatAt,
        version: botRuntime.version,
        ageSeconds: sql<number>`TIMESTAMPDIFF(SECOND, ${botRuntime.lastHeartbeatAt}, NOW())`,
      })
      .from(botRuntime)
      .where(eq(botRuntime.id, 1))
      .limit(1);
    const lastHeartbeatAt = runtime?.lastHeartbeatAt ?? null;
    const online = runtime !== undefined && Number(runtime.ageSeconds) * 1000 < HEARTBEAT_STALE_MS;
    return {
      configured: Boolean(ENV.botBaseUrl),
      online,
      whatsappConnected: online && runtime?.whatsappConnected === 1,
      connectedSince: online ? runtime?.connectedSince ?? null : null,
      lastHeartbeatAt,
      version: runtime?.version ?? null,
    };
  }),

  listOrders: portalAdminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
        botStatus: z.enum(BOT_STATUSES).optional(),
        search: z.string().trim().max(100).optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await requireDb();

      const conditions = [inArray(orders.status, OPEN_ORDER_STATUSES)];
      if (input.search) {
        const term = `%${input.search}%`;
        conditions.push(
          or(
            like(orders.waybillNumber, term),
            like(orders.customerPhone, term),
            like(orders.shipperPhone, term),
            like(orders.customerName, term),
            like(orders.shipperName, term),
          )!,
        );
      }
      const baseWhere = and(...conditions);

      const filterWhere =
        input.botStatus === 'paused'
          ? and(baseWhere, eq(botSessions.botActive, 0))
          : input.botStatus
            ? and(baseWhere, sql`${botStatusExpr} = ${input.botStatus}`)
            : baseWhere;

      const rows = await db
        .select({
          waybillNumber: orders.waybillNumber,
          isReturn: orders.isReturn,
          orderStatus: orders.status,
          storeName: clientAccounts.companyName,
          customerName: orders.customerName,
          customerPhone: orders.customerPhone,
          shipperName: orders.shipperName,
          shipperPhone: orders.shipperPhone,
          locationAccuracy: orders.locationAccuracy,
          latitude: orders.latitude,
          longitude: orders.longitude,
          createdAt: orders.createdAt,
          botStatus: botStatusExpr,
          deliveryStatus: botOrders.deliveryStatus,
          sendAttempts: botOrders.sendAttempts,
          lastError: botOrders.lastError,
          requestedAt: botOrders.requestedAt,
          sentAt: botOrders.sentAt,
          expiresAt: botOrders.expiresAt,
          expiredReason: botOrders.expiredReason,
          botUpdatedAt: botOrders.updatedAt,
          botActive: botSessions.botActive,
          lastInteractionAt: botSessions.lastInteractionAt,
        })
        .from(orders)
        .leftJoin(botOrders, eq(botOrders.waybillNumber, orders.waybillNumber))
        .leftJoin(botSessions, eq(botSessions.jid, botOrders.jid))
        .leftJoin(clientAccounts, eq(clientAccounts.id, orders.clientId))
        .where(filterWhere)
        .orderBy(desc(orders.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      const [totalRow] = await db
        .select({ total: sql<number>`COUNT(*)` })
        .from(orders)
        .leftJoin(botOrders, eq(botOrders.waybillNumber, orders.waybillNumber))
        .leftJoin(botSessions, eq(botSessions.jid, botOrders.jid))
        .where(filterWhere);

      // One grouped pass gives both the per-status chips and the paused count.
      const countRows = await db
        .select({ status: botStatusExpr, botActive: botSessions.botActive, n: sql<number>`COUNT(*)` })
        .from(orders)
        .leftJoin(botOrders, eq(botOrders.waybillNumber, orders.waybillNumber))
        .leftJoin(botSessions, eq(botSessions.jid, botOrders.jid))
        .where(baseWhere)
        .groupBy(botStatusExpr, botSessions.botActive);

      const counts: Record<BotOrderStatusFilter, number> = {
        not_tracked: 0, queued: 0, waiting: 0, failed: 0, received: 0, reused: 0, expired: 0, paused: 0,
      };
      let all = 0;
      for (const row of countRows) {
        const n = Number(row.n);
        const key = row.status as BotOrderStatusFilter;
        if (key in counts) counts[key] += n;
        if (row.botActive === 0) counts.paused += n;
        all += n;
      }

      return {
        rows: rows.map((r) => ({
          waybillNumber: r.waybillNumber,
          isReturn: r.isReturn === 1,
          orderStatus: r.orderStatus,
          storeName: r.storeName,
          contactName: r.isReturn === 1 ? r.shipperName : r.customerName,
          contactPhone: r.isReturn === 1 ? r.shipperPhone : r.customerPhone,
          locationAccuracy: r.locationAccuracy,
          latitude: r.latitude,
          longitude: r.longitude,
          createdAt: r.createdAt,
          botStatus: r.botStatus as BotOrderStatusFilter,
          deliveryStatus: r.deliveryStatus,
          sendAttempts: r.sendAttempts ?? 0,
          lastError: r.lastError,
          requestedAt: r.requestedAt,
          sentAt: r.sentAt,
          expiresAt: r.expiresAt,
          expiredReason: r.expiredReason,
          botUpdatedAt: r.botUpdatedAt,
          paused: r.botActive === 0,
          lastInteractionAt: r.lastInteractionAt,
        })),
        total: Number(totalRow?.total ?? 0),
        counts: { ...counts, all },
      };
    }),

  getConversation: portalAdminProcedure
    .input(z.object({ waybillNumber: z.string().trim().min(1) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [tracked] = await db
        .select({ jid: botOrders.jid, botActive: botSessions.botActive, phone: botSessions.phone })
        .from(botOrders)
        .leftJoin(botSessions, eq(botSessions.jid, botOrders.jid))
        .where(eq(botOrders.waybillNumber, input.waybillNumber))
        .limit(1);
      if (!tracked) return { tracked: false as const, messages: [], paused: false, phone: null };

      const messages = await db
        .select({ id: botMessages.id, direction: botMessages.direction, text: botMessages.text, createdAt: botMessages.createdAt })
        .from(botMessages)
        .where(eq(botMessages.jid, tracked.jid))
        .orderBy(desc(botMessages.createdAt), desc(botMessages.id))
        .limit(100);

      return { tracked: true as const, messages: messages.reverse(), paused: tracked.botActive === 0, phone: tracked.phone };
    }),

  requestLocation: portalAdminProcedure
    .input(z.object({ waybillNumber: z.string().trim().min(1), force: z.boolean().default(false) }))
    .mutation(async ({ input }) =>
      botFetch<{ success: boolean; reused?: boolean; skipped?: boolean; reason?: string }>(
        `/api/admin/orders/${encodeURIComponent(input.waybillNumber)}/request-location`,
        { force: input.force },
      ),
    ),

  sendMessage: portalAdminProcedure
    .input(z.object({ waybillNumber: z.string().trim().min(1), message: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ input }) =>
      botFetch<{ success: boolean }>(`/api/admin/orders/${encodeURIComponent(input.waybillNumber)}/send`, { message: input.message }),
    ),

  setPaused: portalAdminProcedure
    .input(z.object({ waybillNumber: z.string().trim().min(1), paused: z.boolean() }))
    .mutation(async ({ input }) =>
      botFetch<{ success: boolean; botActive: boolean }>(
        `/api/admin/orders/${encodeURIComponent(input.waybillNumber)}/${input.paused ? 'pause' : 'resume'}`,
      ),
    ),

  backfill: portalAdminProcedure.mutation(async () => botFetch<{ total: number; queued: number }>('/api/admin/backfill')),
});
