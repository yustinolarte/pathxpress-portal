/**
 * Weekly billing automation.
 *
 * Every Friday 19:00 Dubai (1h after the 18:00 cutoff) it:
 *  1. generates the week's invoices for every client whose settlement period
 *     closed — as drafts (sentToClient = 0), exactly like "Generate Pending";
 *  2. builds one draft COD remittance per client and kind — cash every week,
 *     card every other week (see getLastCardCutoff) — netting the client's open
 *     invoices when it's set to (clientAccounts.codOffsetInvoices);
 *  3. emails the admin a summary.
 *
 * Nothing reaches a client until an admin acts: invoices via "Send to Client",
 * remittances via approveDraftRemittance (with the bank transfer reference).
 * Every step is idempotent — re-running it (or two instances racing) can't
 * double-bill or double-remit — so the scheduler can simply retry on boot.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  clientAccounts,
  codRecords,
  codRemittanceItems,
  codRemittanceOffsets,
  codRemittances,
  invoices,
  orders,
  serviceConfig,
} from '../drizzle/schema';
import {
  calculateCODFeeByMethod,
  codRemittableCondition,
  createNotification,
  generateBatchInvoices,
  generateRemittanceNumberTx,
  getCardRemitAnchor,
  getClientsDueForBilling,
  getDb,
  getLastCardCutoff,
  getLastWeeklyCutoff,
  getRemittanceCutoffs,
  getServiceConfig,
} from './db';
import { cacheInvalidate } from './_core/queryCache';
import { notifyAdmin } from './_core/mailer';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
/**
 * Friday 18:00 Dubai cutoff + 1h = Friday 19:00 Dubai. The hour of slack lets a
 * delivery closed from the admin right after 18:00 (dated at its real delivery
 * time, before the cutoff) still land in this week's COD draft.
 */
const RUN_AFTER_CUTOFF_MS = 1 * 60 * 60 * 1000;
const LAST_RUN_KEY = 'BILLING_AUTOMATION_LAST_RUN';

export type RemittanceKind = 'cash' | 'card';

// ─── Pure helpers (unit-tested) ───────────────────────────────────────────────

export function getAutomationRunAt(cutoff: Date): Date {
  return new Date(cutoff.getTime() + RUN_AFTER_CUTOFF_MS);
}

/** The run for the latest cutoff is due once its Friday 19:00 slot has passed and it hasn't run yet. */
export function isAutomationDue(now: Date, lastRunCutoffIso: string | null): { due: boolean; cutoff: Date } {
  const cutoff = getLastWeeklyCutoff(now);
  const due = now.getTime() >= getAutomationRunAt(cutoff).getTime() && lastRunCutoffIso !== cutoff.toISOString();
  return { due, cutoff };
}

export function getNextAutomationRunAt(now: Date, lastRunCutoffIso: string | null): Date {
  const { due, cutoff } = isAutomationDue(now, lastRunCutoffIso);
  if (due) return now;
  const thisWeek = getAutomationRunAt(cutoff);
  return now.getTime() < thisWeek.getTime() ? thisWeek : getAutomationRunAt(new Date(cutoff.getTime() + WEEK_MS));
}

/**
 * Which of a client's open invoices fit in a payout: oldest first, whole
 * invoices only, stopping at the first one that no longer fits (no partial
 * payments, and never paying a newer invoice before an older one).
 */
export function selectInvoiceOffsets(
  openInvoices: Array<{ id: number; balance: number }>,
  available: number,
): Array<{ invoiceId: number; amount: number }> {
  const selected: Array<{ invoiceId: number; amount: number }> = [];
  let used = 0;
  for (const inv of openInvoices) {
    if (inv.balance <= 0) continue;
    if (used + inv.balance > available + 0.0001) break;
    selected.push({ invoiceId: inv.id, amount: Math.round(inv.balance * 100) / 100 });
    used += inv.balance;
  }
  return selected;
}

export function kindOfRecord(collectedMethod: string | null | undefined): RemittanceKind {
  return collectedMethod === 'card' ? 'card' : 'cash';
}

// ─── Config ───────────────────────────────────────────────────────────────────

async function getExcludedClientIds(): Promise<Set<number>> {
  const raw = await getServiceConfig('BILLING_AUTOMATION_EXCLUDED_CLIENTS');
  return new Set((raw || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n)));
}

async function upsertConfig(key: string, value: string, description: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(serviceConfig)
    .values({ configKey: key, configValue: value, description })
    .onDuplicateKeyUpdate({ set: { configValue: value } });
}

export interface AutomationRunSummary {
  cutoff: string;
  ranAt: string;
  trigger: 'schedule' | 'manual';
  invoices: Array<{ clientId: number; companyName: string; success: boolean; invoiceId?: number; error?: string }>;
  remittances: Array<{ remittanceId: number; clientId: number; companyName: string; kind: RemittanceKind; shipments: number; payout: string; created: boolean }>;
  errors: string[];
}

async function readLastRun(): Promise<AutomationRunSummary | null> {
  const raw = await getServiceConfig(LAST_RUN_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AutomationRunSummary; } catch { return null; }
}

// ─── Draft remittances ────────────────────────────────────────────────────────

async function feeForRecord(record: typeof codRecords.$inferSelect, clientId: number): Promise<number> {
  const frozen = record.feeAmount != null ? parseFloat(record.feeAmount) : NaN;
  if (!Number.isNaN(frozen)) return frozen;
  return calculateCODFeeByMethod(parseFloat(record.codAmount) || 0, clientId, kindOfRecord(record.collectedMethod));
}

/**
 * Recomputes a draft's totals from its items and offsets. If removing items
 * shrank the payout below the invoices being netted, the newest offsets are
 * dropped until it fits again. Must run inside the caller's transaction.
 */
async function recalcDraftTx(tx: any, remittanceId: number) {
  const [rem] = await tx.select().from(codRemittances).where(eq(codRemittances.id, remittanceId)).limit(1);
  if (!rem) return;

  const items = await tx
    .select({ item: codRemittanceItems, record: codRecords })
    .from(codRemittanceItems)
    .innerJoin(codRecords, eq(codRemittanceItems.codRecordId, codRecords.id))
    .where(eq(codRemittanceItems.remittanceId, remittanceId));

  let gross = 0;
  let fee = 0;
  for (const { item, record } of items) {
    gross += parseFloat(item.amount) || 0;
    fee += await feeForRecord(record, rem.clientId);
  }
  const net = gross - fee;

  const offsets = await tx.select().from(codRemittanceOffsets)
    .where(eq(codRemittanceOffsets.remittanceId, remittanceId))
    .orderBy(asc(codRemittanceOffsets.id));
  let offsetTotal = offsets.reduce((s: number, o: any) => s + (parseFloat(o.amount) || 0), 0);
  for (let i = offsets.length - 1; i >= 0 && offsetTotal > net + 0.0001; i--) {
    await tx.delete(codRemittanceOffsets).where(eq(codRemittanceOffsets.id, offsets[i].id));
    offsetTotal -= parseFloat(offsets[i].amount) || 0;
  }

  const [client] = await tx.select().from(clientAccounts).where(eq(clientAccounts.id, rem.clientId)).limit(1);
  const feePercentage = rem.kind === 'card' ? (client?.cardFeePercent ?? '0') : (client?.codFeePercent ?? '0');

  await tx.update(codRemittances).set({
    grossAmount: gross.toFixed(2),
    feeAmount: fee.toFixed(2),
    feePercentage,
    totalAmount: net.toFixed(2),
    offsetAmount: Math.max(0, offsetTotal).toFixed(2),
    shipmentCount: items.length,
  }).where(eq(codRemittances.id, remittanceId));
}

/** The client's sent, unpaid invoices that aren't already being netted by another draft. */
async function getOffsettableInvoicesTx(tx: any, clientId: number) {
  return tx
    .select({ id: invoices.id, balance: invoices.balance, total: invoices.total })
    .from(invoices)
    .where(and(
      eq(invoices.clientId, clientId),
      eq(invoices.sentToClient, 1),
      inArray(invoices.status, ['pending', 'overdue']),
      sql`CAST(${invoices.balance} AS DECIMAL(15,2)) > 0`,
      sql`NOT EXISTS (
        SELECT 1 FROM codRemittanceOffsets o
        JOIN codRemittances r ON r.id = o.remittanceId
        WHERE o.invoiceId = ${invoices.id} AND r.status = 'draft'
      )`,
    ))
    .orderBy(asc(invoices.issueDate), asc(invoices.id));
}

/**
 * Builds/extends one draft remittance per client × kind × currency from every
 * COD record that's remittable right now. A client with an unapproved draft of
 * the same kind gets the new records appended to it rather than a second draft.
 */
export async function createDraftRemittances(opts: { now?: Date; clientId?: number } = {}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const now = opts.now ?? new Date();

  const cutoffs = await getRemittanceCutoffs(now);
  const excluded = await getExcludedClientIds();

  const rows = await db
    .select({ record: codRecords, clientId: orders.clientId })
    .from(codRecords)
    .innerJoin(orders, eq(codRecords.shipmentId, orders.id))
    .where(and(
      codRemittableCondition(cutoffs),
      opts.clientId ? eq(orders.clientId, opts.clientId) : undefined,
    ))
    .orderBy(asc(codRecords.collectedDate));

  // client → kind → currency → record ids; cash before card so offsets prefer the weekly payout
  const groups = new Map<string, { clientId: number; kind: RemittanceKind; currency: string; recordIds: number[] }>();
  for (const { record, clientId } of rows) {
    if (excluded.has(clientId)) continue;
    const kind = kindOfRecord(record.collectedMethod);
    const currency = record.codCurrency || 'AED';
    const key = `${clientId}|${kind === 'cash' ? 0 : 1}|${currency}`;
    const g = groups.get(key) ?? { clientId, kind, currency, recordIds: [] };
    g.recordIds.push(record.id);
    groups.set(key, g);
  }

  const results: AutomationRunSummary['remittances'] = [];
  const offsetsDone = new Set<number>();

  for (const key of Array.from(groups.keys()).sort()) {
    const g = groups.get(key)!;
    const kindCutoff = g.kind === 'card' ? cutoffs.card : cutoffs.cash;

    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT GET_LOCK('cod_remittance_number', 10)`);
      try {
        // Re-check under the lock: still collected and not grabbed by another draft.
        const fresh = await tx.select({ id: codRecords.id, shipmentId: codRecords.shipmentId, codAmount: codRecords.codAmount, codCurrency: codRecords.codCurrency })
          .from(codRecords)
          .where(and(inArray(codRecords.id, g.recordIds), codRemittableCondition(cutoffs)))
          .for('update');
        if (fresh.length === 0) return null;

        const [existing] = await tx.select().from(codRemittances)
          .where(and(
            eq(codRemittances.clientId, g.clientId),
            eq(codRemittances.status, 'draft'),
            eq(codRemittances.kind, g.kind),
            eq(codRemittances.currency, g.currency),
          ))
          .limit(1);

        let remittanceId: number;
        let created = false;
        if (existing) {
          remittanceId = existing.id;
          await tx.update(codRemittances).set({ periodCutoff: kindCutoff }).where(eq(codRemittances.id, remittanceId));
        } else {
          const [ins] = await tx.insert(codRemittances).values({
            clientId: g.clientId,
            // Real REM number is assigned on approval, so discarded drafts never leave gaps.
            remittanceNumber: `DRAFT-${Date.now()}-${g.clientId}-${g.kind}-${g.currency}`,
            grossAmount: '0',
            feeAmount: '0',
            feePercentage: '0',
            totalAmount: '0',
            currency: g.currency,
            shipmentCount: 0,
            status: 'draft',
            kind: g.kind,
            periodCutoff: kindCutoff,
            autoGenerated: 1,
            createdBy: 0,
          });
          remittanceId = ins.insertId;
          created = true;
        }

        await tx.insert(codRemittanceItems).values(fresh.map(r => ({
          remittanceId,
          codRecordId: r.id,
          shipmentId: r.shipmentId,
          amount: r.codAmount,
          currency: r.codCurrency || g.currency,
        })));
        await recalcDraftTx(tx, remittanceId);

        // Net the client's open invoices once per run, against its first draft.
        if (!offsetsDone.has(g.clientId)) {
          const [client] = await tx.select({ codOffsetInvoices: clientAccounts.codOffsetInvoices })
            .from(clientAccounts).where(eq(clientAccounts.id, g.clientId)).limit(1);
          if (client?.codOffsetInvoices) {
            const [rem] = await tx.select().from(codRemittances).where(eq(codRemittances.id, remittanceId)).limit(1);
            const available = parseFloat(rem.totalAmount) - parseFloat(rem.offsetAmount || '0');
            const open = await getOffsettableInvoicesTx(tx, g.clientId);
            const picks = selectInvoiceOffsets(open.map((i: any) => ({ id: i.id, balance: parseFloat(i.balance) || 0 })), available);
            if (picks.length > 0) {
              await tx.insert(codRemittanceOffsets).values(picks.map(p => ({ remittanceId, invoiceId: p.invoiceId, amount: p.amount.toFixed(2) })));
              await recalcDraftTx(tx, remittanceId);
            }
          }
        }

        const [final] = await tx.select().from(codRemittances).where(eq(codRemittances.id, remittanceId)).limit(1);
        return { remittanceId, created, final };
      } finally {
        await tx.execute(sql`SELECT RELEASE_LOCK('cod_remittance_number')`);
      }
    });

    offsetsDone.add(g.clientId);
    if (!outcome) continue;
    const [client] = await db.select({ companyName: clientAccounts.companyName }).from(clientAccounts).where(eq(clientAccounts.id, g.clientId)).limit(1);
    results.push({
      remittanceId: outcome.remittanceId,
      clientId: g.clientId,
      companyName: client?.companyName || `#${g.clientId}`,
      kind: g.kind,
      shipments: outcome.final.shipmentCount,
      payout: (parseFloat(outcome.final.totalAmount) - parseFloat(outcome.final.offsetAmount || '0')).toFixed(2),
      created: outcome.created,
    });
  }

  cacheInvalidate('admin:allRemittances');
  cacheInvalidate('admin:allCODRecords');
  return results;
}

/** Drafts awaiting approval, with their shipments and netted invoices. */
export async function getDraftRemittances() {
  const db = await getDb();
  if (!db) return [];

  const drafts = await db
    .select({ remittance: codRemittances, companyName: clientAccounts.companyName })
    .from(codRemittances)
    .leftJoin(clientAccounts, eq(codRemittances.clientId, clientAccounts.id))
    .where(eq(codRemittances.status, 'draft'))
    .orderBy(asc(clientAccounts.companyName), asc(codRemittances.kind));
  if (drafts.length === 0) return [];

  const ids = drafts.map(d => d.remittance.id);
  const items = await db
    .select({
      remittanceId: codRemittanceItems.remittanceId,
      codRecordId: codRemittanceItems.codRecordId,
      amount: codRemittanceItems.amount,
      currency: codRemittanceItems.currency,
      waybillNumber: orders.waybillNumber,
      customerName: orders.customerName,
      collectedMethod: codRecords.collectedMethod,
      paymentReference: codRecords.paymentReference,
      feeAmount: codRecords.feeAmount,
      collectedDate: codRecords.collectedDate,
    })
    .from(codRemittanceItems)
    .innerJoin(codRecords, eq(codRemittanceItems.codRecordId, codRecords.id))
    .innerJoin(orders, eq(codRemittanceItems.shipmentId, orders.id))
    .where(inArray(codRemittanceItems.remittanceId, ids))
    .orderBy(asc(codRecords.collectedDate));
  const offsets = await db
    .select({
      remittanceId: codRemittanceOffsets.remittanceId,
      invoiceId: codRemittanceOffsets.invoiceId,
      amount: codRemittanceOffsets.amount,
      invoiceNumber: invoices.invoiceNumber,
      issueDate: invoices.issueDate,
      invoiceStatus: invoices.status,
    })
    .from(codRemittanceOffsets)
    .innerJoin(invoices, eq(codRemittanceOffsets.invoiceId, invoices.id))
    .where(inArray(codRemittanceOffsets.remittanceId, ids))
    .orderBy(asc(invoices.issueDate));

  return drafts.map(({ remittance, companyName }) => {
    const offsetAmount = parseFloat(remittance.offsetAmount || '0');
    return {
      ...remittance,
      companyName: companyName || `#${remittance.clientId}`,
      payoutAmount: (parseFloat(remittance.totalAmount) - offsetAmount).toFixed(2),
      items: items.filter(i => i.remittanceId === remittance.id),
      offsets: offsets.filter(o => o.remittanceId === remittance.id),
    };
  });
}

/** Offsets (netted invoices) of any remittance — shown in its details dialog. */
export async function getRemittanceOffsets(remittanceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      invoiceId: codRemittanceOffsets.invoiceId,
      amount: codRemittanceOffsets.amount,
      invoiceNumber: invoices.invoiceNumber,
    })
    .from(codRemittanceOffsets)
    .innerJoin(invoices, eq(codRemittanceOffsets.invoiceId, invoices.id))
    .where(eq(codRemittanceOffsets.remittanceId, remittanceId))
    .orderBy(asc(invoices.issueDate));
}

/**
 * The admin confirms the money went out: the draft gets its REM number, becomes
 * 'completed' with the bank reference, its COD records become 'remitted', the
 * netted invoices are marked paid (reference = the REM number), and the client
 * is notified. All or nothing.
 */
export async function approveDraftRemittance(
  remittanceId: number,
  input: { paymentReference: string; paymentMethod?: string; notes?: string; approvedBy: number },
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const reference = input.paymentReference.trim();
  if (!reference) throw new Error('A payment reference is required to approve a remittance');

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT GET_LOCK('cod_remittance_number', 10)`);
    try {
      const [rem] = await tx.select().from(codRemittances).where(eq(codRemittances.id, remittanceId)).for('update').limit(1);
      if (!rem) throw new Error('Remittance not found');
      if (rem.status !== 'draft') throw new Error('This remittance is no longer a draft');

      const items = await tx.select({ codRecordId: codRemittanceItems.codRecordId })
        .from(codRemittanceItems).where(eq(codRemittanceItems.remittanceId, remittanceId));
      if (items.length === 0) throw new Error('This draft has no shipments — discard it instead');
      const recordIds = items.map(i => i.codRecordId);
      const stillCollected = await tx.select({ id: codRecords.id }).from(codRecords)
        .where(and(inArray(codRecords.id, recordIds), eq(codRecords.status, 'collected')))
        .for('update');
      if (stillCollected.length !== recordIds.length) {
        throw new Error('Some shipments in this draft changed status (disputed, cancelled…) — rebuild the draft first');
      }

      const offsets = await tx.select({ offset: codRemittanceOffsets, invoice: invoices })
        .from(codRemittanceOffsets)
        .innerJoin(invoices, eq(codRemittanceOffsets.invoiceId, invoices.id))
        .where(eq(codRemittanceOffsets.remittanceId, remittanceId));
      const alreadyPaid = offsets.filter(o => o.invoice.status === 'paid');
      if (alreadyPaid.length > 0) {
        throw new Error(`${alreadyPaid.map(o => o.invoice.invoiceNumber).join(', ')} is already paid — remove it from the draft first`);
      }

      const remittanceNumber = await generateRemittanceNumberTx(tx);
      const now = new Date();
      const offsetNote = offsets.length > 0
        ? `Invoices deducted: ${offsets.map(o => `${o.invoice.invoiceNumber} (${parseFloat(o.offset.amount).toFixed(2)})`).join(', ')}.`
        : '';
      const notes = [input.notes?.trim(), offsetNote].filter(Boolean).join(' ') || null;

      await tx.update(codRemittances).set({
        remittanceNumber,
        status: 'completed',
        processedDate: now,
        paymentMethod: input.paymentMethod || 'bank_transfer',
        paymentReference: reference,
        notes,
        createdBy: input.approvedBy,
      }).where(eq(codRemittances.id, remittanceId));

      await tx.update(codRecords)
        .set({ status: 'remitted', remittedToClientDate: now })
        .where(inArray(codRecords.id, recordIds));

      for (const { offset, invoice } of offsets) {
        const total = parseFloat(invoice.total) || 0;
        await tx.update(invoices).set({
          status: 'paid',
          amountPaid: total.toFixed(2),
          balance: '0.00',
          paymentDate: now,
          paymentReference: remittanceNumber,
        }).where(eq(invoices.id, offset.invoiceId));
      }

      const [final] = await tx.select().from(codRemittances).where(eq(codRemittances.id, remittanceId)).limit(1);
      return { remittance: final, offsets };
    } finally {
      await tx.execute(sql`SELECT RELEASE_LOCK('cod_remittance_number')`);
    }
  });

  const rem = result.remittance;
  const payout = (parseFloat(rem.totalAmount) - parseFloat(rem.offsetAmount || '0')).toFixed(2);
  const deducted = result.offsets.length > 0
    ? ` after deducting invoice${result.offsets.length > 1 ? 's' : ''} ${result.offsets.map(o => o.invoice.invoiceNumber).join(', ')}`
    : '';
  await createNotification(
    rem.clientId,
    'COD_UPDATE',
    'COD Remittance Paid',
    `Remittance ${rem.remittanceNumber}: ${payout} ${rem.currency} has been transferred to your account${deducted}.`,
    'cod',
  );

  cacheInvalidate('admin:allRemittances');
  cacheInvalidate('admin:allCODRecords');
  cacheInvalidate('admin:allInvoices');
  return { remittanceNumber: rem.remittanceNumber, payout };
}

/** Deletes a draft; its COD records go back to "ready to remit", its invoices back to open. */
export async function discardDraftRemittance(remittanceId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [rem] = await db.select({ status: codRemittances.status, clientId: codRemittances.clientId })
    .from(codRemittances).where(eq(codRemittances.id, remittanceId)).limit(1);
  if (!rem) throw new Error('Remittance not found');
  if (rem.status !== 'draft') throw new Error('Only draft remittances can be discarded');

  await db.transaction(async (tx) => {
    await tx.delete(codRemittanceOffsets).where(eq(codRemittanceOffsets.remittanceId, remittanceId));
    await tx.delete(codRemittanceItems).where(eq(codRemittanceItems.remittanceId, remittanceId));
    await tx.delete(codRemittances).where(and(eq(codRemittances.id, remittanceId), eq(codRemittances.status, 'draft')));
  });
  cacheInvalidate('admin:allRemittances');
  return { clientId: rem.clientId };
}

/** Takes one shipment out of a draft — it stays collected and comes back in the next batch. */
export async function removeDraftRemittanceItem(remittanceId: number, codRecordId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [rem] = await db.select({ status: codRemittances.status }).from(codRemittances).where(eq(codRemittances.id, remittanceId)).limit(1);
  if (rem?.status !== 'draft') throw new Error('Only draft remittances can be edited');

  const remaining = await db.transaction(async (tx) => {
    await tx.delete(codRemittanceItems).where(and(
      eq(codRemittanceItems.remittanceId, remittanceId),
      eq(codRemittanceItems.codRecordId, codRecordId),
    ));
    const [{ n }] = await tx.select({ n: sql<number>`COUNT(*)` }).from(codRemittanceItems).where(eq(codRemittanceItems.remittanceId, remittanceId));
    if (Number(n) > 0) await recalcDraftTx(tx, remittanceId);
    return Number(n);
  });
  if (remaining === 0) await discardDraftRemittance(remittanceId);
  return { remaining };
}

/** Stops netting one invoice against this draft — the invoice stays open. */
export async function removeDraftRemittanceOffset(remittanceId: number, invoiceId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [rem] = await db.select({ status: codRemittances.status }).from(codRemittances).where(eq(codRemittances.id, remittanceId)).limit(1);
  if (rem?.status !== 'draft') throw new Error('Only draft remittances can be edited');
  await db.transaction(async (tx) => {
    await tx.delete(codRemittanceOffsets).where(and(
      eq(codRemittanceOffsets.remittanceId, remittanceId),
      eq(codRemittanceOffsets.invoiceId, invoiceId),
    ));
    await recalcDraftTx(tx, remittanceId);
  });
}

/**
 * Throws the client's draft away and builds it again from scratch — picks up
 * late collections, invoices sent since, and shipments removed earlier.
 */
export async function rebuildDraftRemittance(remittanceId: number) {
  const { clientId } = await discardDraftRemittance(remittanceId);
  return createDraftRemittances({ clientId });
}

// ─── Weekly run ───────────────────────────────────────────────────────────────

let running = false;

export async function runWeeklyBillingAutomation(opts: { now?: Date; trigger?: 'schedule' | 'manual' } = {}): Promise<AutomationRunSummary> {
  if (running) throw new Error('The billing automation is already running');
  running = true;
  const now = opts.now ?? new Date();
  const trigger = opts.trigger ?? 'manual';
  const summary: AutomationRunSummary = {
    cutoff: getLastWeeklyCutoff(now).toISOString(),
    ranAt: new Date().toISOString(),
    trigger,
    invoices: [],
    remittances: [],
    errors: [],
  };

  try {
    // 1. Invoices — same due-list and generator as the "Generate Pending" button.
    try {
      const excluded = await getExcludedClientIds();
      const due = (await getClientsDueForBilling(false)).filter(c => !excluded.has(c.clientId));
      if (due.length > 0) {
        const results = await generateBatchInvoices(false, due.map(c => c.clientId));
        summary.invoices = results.map(r => ({ clientId: r.clientId, companyName: r.companyName, success: r.success, invoiceId: r.invoiceId, error: r.error }));
      }
    } catch (err: any) {
      summary.errors.push(`Invoices: ${err?.message || err}`);
    }

    // 2. COD remittance drafts.
    try {
      summary.remittances = await createDraftRemittances({ now });
    } catch (err: any) {
      summary.errors.push(`Remittances: ${err?.message || err}`);
    }

    await upsertConfig(LAST_RUN_KEY, JSON.stringify(summary), 'Last weekly billing automation run (JSON)');
    await emailSummary(summary);
    return summary;
  } finally {
    running = false;
  }
}

async function emailSummary(summary: AutomationRunSummary) {
  const okInvoices = summary.invoices.filter(i => i.success);
  const failedInvoices = summary.invoices.filter(i => !i.success);
  if (okInvoices.length === 0 && summary.remittances.length === 0 && failedInvoices.length === 0 && summary.errors.length === 0) return;

  const rows: Array<[string, unknown]> = [
    ['Week closed', new Date(summary.cutoff).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })],
    ['Draft invoices', okInvoices.length > 0 ? okInvoices.map(i => i.companyName).join('\n') : 'None'],
    ['Draft remittances', summary.remittances.length > 0
      ? summary.remittances.map(r => `${r.companyName} — ${r.kind === 'card' ? 'Card' : 'Cash'}, ${r.shipments} shipment(s), transfer AED ${r.payout}`).join('\n')
      : 'None'],
  ];
  if (failedInvoices.length > 0) rows.push(['Invoices that failed', failedInvoices.map(i => `${i.companyName}: ${i.error}`).join('\n')]);
  if (summary.errors.length > 0) rows.push(['Errors', summary.errors.join('\n')]);
  rows.push(['Next step', 'Review and send the invoices (Billing) and approve the remittances (COD) in the admin portal.']);

  await notifyAdmin('Weekly billing drafts ready for review', 'Weekly billing drafts ready', rows);
}

/** Invoices still in draft (not yet visible to the client), oldest first. */
export async function getDraftInvoices() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      clientId: invoices.clientId,
      companyName: clientAccounts.companyName,
      total: invoices.total,
      currency: invoices.currency,
      periodFrom: invoices.periodFrom,
      periodTo: invoices.periodTo,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .leftJoin(clientAccounts, eq(invoices.clientId, clientAccounts.id))
    .where(eq(invoices.sentToClient, 0))
    .orderBy(asc(invoices.createdAt));
}

export async function getBillingAutomationStatus() {
  const db = await getDb();
  const now = new Date();
  const lastRun = await readLastRun();
  const anchor = await getCardRemitAnchor();
  const weekly = getLastWeeklyCutoff(now);
  const lastCard = getLastCardCutoff(now, anchor);

  let draftInvoices = 0;
  let draftRemittances = 0;
  if (db) {
    const [inv] = await db.select({ n: sql<number>`COUNT(*)` }).from(invoices).where(eq(invoices.sentToClient, 0));
    const [rem] = await db.select({ n: sql<number>`COUNT(*)` }).from(codRemittances).where(eq(codRemittances.status, 'draft'));
    draftInvoices = Number(inv?.n ?? 0);
    draftRemittances = Number(rem?.n ?? 0);
  }

  return {
    schedulerEnabled: isBillingSchedulerEnabled(),
    nextRunAt: getNextAutomationRunAt(now, lastRun?.cutoff ?? null).toISOString(),
    lastRun,
    cashCutoff: weekly.toISOString(),
    cardCutoff: lastCard.toISOString(),
    nextCardCutoff: new Date(lastCard.getTime() + 2 * WEEK_MS).toISOString(),
    draftInvoices,
    draftRemittances,
  };
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export function isBillingSchedulerEnabled() {
  return process.env.NODE_ENV === 'production'
    && !process.env.VITEST
    && (process.env.BILLING_AUTOMATION ?? 'on').toLowerCase() !== 'off';
}

/**
 * Checks every 15 minutes whether this week's run is due; also checks shortly
 * after boot, so a deploy or restart over the Friday slot just runs it late.
 * Only in production (dev points at the same database) unless explicitly off.
 */
export function startBillingScheduler() {
  if (!isBillingSchedulerEnabled()) {
    console.log('[billing-automation] scheduler disabled (not production, or BILLING_AUTOMATION=off)');
    return;
  }
  const tick = async () => {
    try {
      const lastRun = await readLastRun();
      if (isAutomationDue(new Date(), lastRun?.cutoff ?? null).due && !running) {
        const summary = await runWeeklyBillingAutomation({ trigger: 'schedule' });
        console.log(`[billing-automation] ran for cutoff ${summary.cutoff}: ${summary.invoices.filter(i => i.success).length} invoice draft(s), ${summary.remittances.length} remittance draft(s)`);
      }
    } catch (err) {
      console.error('[billing-automation] run failed:', err);
    }
  };
  setTimeout(tick, 60 * 1000).unref?.();
  setInterval(tick, 15 * 60 * 1000).unref?.();
  console.log('[billing-automation] scheduler started (Friday 19:00 Dubai)');
}

