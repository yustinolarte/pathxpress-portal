/**
 * One-off reconciliation of the international book against the EMX cost
 * spreadsheet (audit run 2026-08-07). Idempotent — safe to re-run.
 *
 *   1. Backfills costAmount (our EMX cost) on every international order.
 *   2. Fixes serviceType 'DOM' on a France shipment (domestic code, intl destination).
 *   3. Marks the Russia shipment as deliberately non-billable.
 *   4. Enables intlAllowed on the clients that already ship international.
 *   5. Repairs invoices left at status='paid' with amountPaid=0 / balance=total.
 *   6. Invoices the Colombia shipment that was never billed.
 *   7. Creates + invoices the Australia shipment that only existed on the EMX invoice.
 *
 * Usage:
 *   npx tsx scripts/fix-intl-reconciliation-2026-08.ts --dry-run
 *   npx tsx scripts/fix-intl-reconciliation-2026-08.ts
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { URL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const parsedUrl = new URL(process.env.DATABASE_URL || '');

const dbConfig = {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port) || 3306,
    user: parsedUrl.username,
    password: parsedUrl.password,
    database: parsedUrl.pathname.slice(1),
};

/** EMX cost per waybill, transcribed from the reconciliation spreadsheet. */
const EMX_COSTS: Record<string, string> = {
    'PXI202600003-JEQ': '41.00',    // Germany
    'PXI202600002-WEH': '74.59',    // Saudi Arabia (Jul)
    'PX202600709-VT9': '184.54',    // United States (Jul)
    'PX202600443-NKG': '48.00',     // Sweden
    'PX202600482-8HA': '46.41',     // Saudi Arabia (May)
    'PX202600481-DGD': '31.00',     // China
    'PX202600420-XTN': '207.74',    // Saipan (Mariana Islands)
    'PX202601100-6TK': '146.97',    // Colombia
    'PX202600259-J53': '56.00',     // Canada
    'PXI202600001-JE5': '28.00',    // Malaysia
    'PX202500038': '112.76',        // Australia (Feb)
    'PX202500030': '88.00',         // France 2
    'PX202500010': '235.45',        // United States (Feb)
    'PX202500001': '107.22',        // France (Feb)
};

const RUSSIA_WAYBILL = 'PX202500066';
const COLOMBIA_WAYBILL = 'PX202601100-6TK';
const AUSTRALIA_MARKER = 'EMX invoice 30101021';

const log = (msg: string) => console.log(msg);
const wouldBe = (msg: string) => console.log(`   ${DRY_RUN ? '[dry-run] would' : '→'} ${msg}`);

/** Numbers handed out this run — a dry run writes nothing, so the DB max
 *  would otherwise repeat itself for every invoice we report. */
const reserved = new Set<string>();

async function nextIntlInvoiceNumber(c: mysql.Connection): Promise<string> {
    const prefix = 'INTLINV-2026-08-';
    const [rows] = await c.query<any[]>(
        `SELECT invoiceNumber FROM invoices WHERE invoiceNumber LIKE ? ORDER BY invoiceNumber DESC LIMIT 1`,
        [prefix + '%']
    );
    let next = 1;
    if (rows.length) {
        const seq = parseInt(rows[0].invoiceNumber.split('-').pop(), 10);
        if (!isNaN(seq)) next = seq + 1;
    }
    let candidate = `${prefix}${String(next).padStart(3, '0')}`;
    while (reserved.has(candidate)) {
        next++;
        candidate = `${prefix}${String(next).padStart(3, '0')}`;
    }
    reserved.add(candidate);
    return candidate;
}

/** Creates an invoice with a single shipment line. Returns the invoice number. */
async function createSingleShipmentInvoice(
    c: mysql.Connection,
    opts: {
        clientId: number; orderId: number; amount: string; description: string;
        periodDate: Date; notes: string;
    }
): Promise<string> {
    const invoiceNumber = await nextIntlInvoiceNumber(c);
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 30);

    if (DRY_RUN) return invoiceNumber;

    const [res] = await c.query<any>(
        `INSERT INTO invoices
           (clientId, invoiceNumber, periodFrom, periodTo, issueDate, dueDate, currency,
            subtotal, taxes, total, amountPaid, balance, status, settlementPeriod, notes)
         VALUES (?, ?, ?, ?, ?, ?, 'AED', ?, '0.00', ?, '0.00', ?, 'pending', 'custom', ?)`,
        [opts.clientId, invoiceNumber, opts.periodDate, opts.periodDate, now, dueDate,
        opts.amount, opts.amount, opts.amount, opts.notes]
    );
    await c.query(
        `INSERT INTO invoiceItems (invoiceId, shipmentId, description, quantity, unitPrice, total)
         VALUES (?, ?, ?, 1, ?, ?)`,
        [res.insertId, opts.orderId, opts.description, opts.amount, opts.amount]
    );
    return invoiceNumber;
}

async function main() {
    log(`\n${'='.repeat(70)}`);
    log(`  International reconciliation — EMX spreadsheet vs portal`);
    log(`  Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
    log(`${'='.repeat(70)}\n`);

    const c = await mysql.createConnection(dbConfig);

    try {
        // ── 1. Backfill EMX costs ────────────────────────────────────────────
        log('1) Backfilling costAmount from the EMX spreadsheet');
        let costUpdated = 0, costAlready = 0, costMissing = 0;
        for (const [waybill, cost] of Object.entries(EMX_COSTS)) {
            const [rows] = await c.query<any[]>(
                `SELECT id, costAmount FROM orders WHERE waybillNumber = ?`, [waybill]
            );
            if (!rows.length) { log(`   ⚠️  ${waybill} not found — skipped`); costMissing++; continue; }
            const current = rows[0].costAmount;
            if (current !== null && parseFloat(current).toFixed(2) === cost) { costAlready++; continue; }
            wouldBe(`${waybill}: costAmount ${current ?? 'NULL'} → ${cost}`);
            if (!DRY_RUN) await c.query(`UPDATE orders SET costAmount = ? WHERE id = ?`, [cost, rows[0].id]);
            costUpdated++;
        }
        log(`   ${costUpdated} updated, ${costAlready} already correct, ${costMissing} missing\n`);

        // ── 2. serviceType DOM on an international destination ───────────────
        log('2) Fixing serviceType DOM on the France shipment');
        const [fr] = await c.query<any[]>(
            `SELECT id, serviceType FROM orders WHERE waybillNumber = 'PX202500001'`
        );
        if (fr.length && fr[0].serviceType === 'DOM') {
            wouldBe(`PX202500001 (France): serviceType DOM → PREMIUM_EXPORT`);
            if (!DRY_RUN) await c.query(`UPDATE orders SET serviceType = 'PREMIUM_EXPORT' WHERE id = ?`, [fr[0].id]);
        } else {
            log(`   already ${fr[0]?.serviceType ?? 'missing'} — nothing to do`);
        }
        log('');

        // ── 3. Russia: deliberately non-billable ─────────────────────────────
        log('3) Marking the Russia shipment as non-billable');
        const reason = 'Not billed — no EMX cost on record; closed in the Aug-2026 intl reconciliation';
        const [ru] = await c.query<any[]>(
            `SELECT id, billingExcluded FROM orders WHERE waybillNumber = ?`, [RUSSIA_WAYBILL]
        );
        if (ru.length && ru[0].billingExcluded !== 1) {
            wouldBe(`${RUSSIA_WAYBILL}: billingExcluded 0 → 1`);
            if (!DRY_RUN) {
                await c.query(
                    `UPDATE orders SET billingExcluded = 1, billingExcludedReason = ? WHERE id = ?`,
                    [reason, ru[0].id]
                );
            }
        } else {
            log(`   already excluded — nothing to do`);
        }
        log('');

        // ── 4. intlAllowed on clients that already ship international ────────
        log('4) Enabling intlAllowed on clients with international shipments');
        const [needIntl] = await c.query<any[]>(`
            SELECT DISTINCT ca.id, ca.companyName
            FROM clientAccounts ca
            JOIN orders o ON o.clientId = ca.id
            WHERE ca.intlAllowed = 0
              AND UPPER(TRIM(o.destinationCountry)) NOT IN ('UAE','UNITED ARAB EMIRATES','AE')`);
        if (!needIntl.length) log('   all up to date');
        for (const row of needIntl) {
            wouldBe(`client ${row.id} "${row.companyName.trim()}": intlAllowed 0 → 1`);
            if (!DRY_RUN) await c.query(`UPDATE clientAccounts SET intlAllowed = 1 WHERE id = ?`, [row.id]);
        }
        log('');

        // ── 5. Repair paid invoices left with amountPaid = 0 ─────────────────
        log('5) Repairing invoices marked paid but never settled');
        const [broken] = await c.query<any[]>(`
            SELECT id, invoiceNumber, total FROM invoices
            WHERE status = 'paid' AND CAST(amountPaid AS DECIMAL(12,2)) = 0`);
        log(`   ${broken.length} invoice(s) with status=paid, amountPaid=0, balance=total`);
        if (broken.length) {
            const sum = broken.reduce((a, r) => a + parseFloat(r.total || '0'), 0);
            wouldBe(`set amountPaid = total and balance = 0.00 (AED ${sum.toFixed(2)} total)`);
            if (!DRY_RUN) {
                await c.query(`
                    UPDATE invoices
                    SET amountPaid = CAST(total AS DECIMAL(12,2)), balance = '0.00'
                    WHERE status = 'paid' AND CAST(amountPaid AS DECIMAL(12,2)) = 0`);
            }
        }
        log('');

        // ── 6. Colombia: shipment delivered but never invoiced ───────────────
        log('6) Invoicing the Colombia shipment');
        const [col] = await c.query<any[]>(`
            SELECT o.id, o.clientId, o.waybillNumber, o.serviceType, o.weight,
                   o.destinationCountry, o.createdAt, ii.id AS itemId
            FROM orders o
            LEFT JOIN invoiceItems ii ON ii.shipmentId = o.id
            WHERE o.waybillNumber = ?`, [COLOMBIA_WAYBILL]);
        if (!col.length) {
            log(`   ⚠️  ${COLOMBIA_WAYBILL} not found`);
        } else if (col[0].itemId) {
            log(`   already invoiced — nothing to do`);
        } else {
            const o = col[0];
            const desc = `${o.waybillNumber} - ${o.serviceType} - ${parseFloat(o.weight)}kg - ${o.destinationCountry}`;
            const num = await createSingleShipmentInvoice(c, {
                clientId: o.clientId,
                orderId: o.id,
                amount: '169.00',
                description: desc,
                periodDate: new Date(o.createdAt),
                notes: 'Billed retroactively in the Aug-2026 international reconciliation. '
                    + 'Originally skipped because the Walk-in account was not flagged intlAllowed.',
            });
            wouldBe(`create ${num} for client ${o.clientId} — AED 169.00 (${desc})`);
        }
        log('');

        // ── 7. Australia: on the EMX invoice, absent from the portal ─────────
        log('7) Reconstructing the missing Australia shipment');
        const [existing] = await c.query<any[]>(
            `SELECT id, waybillNumber FROM orders WHERE specialInstructions LIKE ?`, [`%${AUSTRALIA_MARKER}%`]
        );
        if (existing.length) {
            log(`   already reconstructed as ${existing[0].waybillNumber} — nothing to do`);
        } else {
            // Copy the shipper block from its sibling on the same EMX invoice
            const [sib] = await c.query<any[]>(
                `SELECT * FROM orders WHERE waybillNumber = 'PX202500030'`);
            if (!sib.length) throw new Error('Sibling order PX202500030 not found — cannot build shipper block');
            const s = sib[0];

            // Waybill: take the highest PX2026 number in use so we cannot collide
            const [maxRow] = await c.query<any[]>(`
                SELECT MAX(CAST(SUBSTRING(waybillNumber, 7, 5) AS UNSIGNED)) AS maxSeq
                FROM orders WHERE waybillNumber REGEXP '^PX2026[0-9]{5}'`);
            const nextSeq = (Number(maxRow[0]?.maxSeq) || 0) + 1;
            const waybill = `PX2026${String(nextSeq).padStart(5, '0')}-REC`;
            const shipDate = new Date('2026-02-18T12:00:00Z');
            const note = `Reconstructed from ${AUSTRALIA_MARKER} during the Aug-2026 reconciliation. `
                + `Consignee details and weight were not recoverable — please complete them in the portal.`;

            wouldBe(`create order ${waybill} — Australia, PRIME_REGISTERED_POD, cost 90.00, client ${s.clientId}`);

            let orderId = 0;
            if (!DRY_RUN) {
                const [ins] = await c.query<any>(`
                    INSERT INTO orders
                      (clientId, orderNumber, waybillNumber,
                       shipperName, shipperAddress, shipperCity, shipperCountry, shipperPhone,
                       customerName, customerPhone, address, city, destinationCountry,
                       pieces, weight, serviceType, specialInstructions,
                       codRequired, status, lastStatusUpdate, pickupDate,
                       costAmount, source, createdAt, updatedAt)
                    VALUES (?, NULL, ?,
                            ?, ?, ?, ?, ?,
                            ?, '-', ?, 'Unknown', 'Australia',
                            1, '0.50', 'PRIME_REGISTERED_POD', ?,
                            0, 'delivered', ?, ?,
                            '90.00', 'manual', ?, ?)`,
                    [s.clientId, waybill,
                    s.shipperName, s.shipperAddress, s.shipperCity, s.shipperCountry, s.shipperPhone,
                    'Consignee pending — historical entry', 'Pending — reconstructed record', note,
                        shipDate, shipDate, shipDate, shipDate]);
                orderId = ins.insertId;

                // Keep the app's waybill counter ahead of what we just used
                await c.query(
                    `UPDATE waybill_sequences SET last_seq = GREATEST(last_seq, ?) WHERE prefix = 'PX2026'`,
                    [nextSeq]);
            }

            const desc = `${waybill} - PRIME_REGISTERED_POD - 0.5kg - Australia`;
            const num = await createSingleShipmentInvoice(c, {
                clientId: s.clientId,
                orderId,
                amount: '102.00',
                description: desc,
                periodDate: shipDate,
                notes: `Billed retroactively in the Aug-2026 international reconciliation. `
                    + `Shipment existed only on ${AUSTRALIA_MARKER} (EMX cost AED 90.00); `
                    + `priced at the same markup as its sibling PX202500030.`,
            });
            wouldBe(`create ${num} — AED 102.00 (${desc})`);
        }

        log(`\n${'='.repeat(70)}`);
        log(DRY_RUN ? '  DRY RUN complete — no changes were written.' : '  ✅ Reconciliation applied.');
        log(`${'='.repeat(70)}\n`);
    } catch (error) {
        console.error('❌ Failed:', error);
        process.exit(1);
    } finally {
        await c.end();
    }
}

main();
