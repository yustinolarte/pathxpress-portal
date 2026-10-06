import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  calculateCODFeeByMethod,
  extendPeriodToLastClosed,
  getAddressIssueFees,
  getDb,
  getLastCardCutoff,
  getReadyToRemitRecordsByClient,
  markCODCollectedOnDelivery,
} from "./db";
import {
  approveDraftRemittance,
  createDraftRemittances,
  discardDraftRemittance,
  getAutomationRunAt,
  getDraftRemittances,
  getNextAutomationRunAt,
  isAutomationDue,
  selectInvoiceOffsets,
} from "./billingAutomation";
import {
  clientAccounts,
  codRecords,
  codRemittanceItems,
  codRemittanceOffsets,
  codRemittances,
  invoices,
  orders,
  serviceConfig,
  trackingEvents,
} from "../drizzle/schema";

describe("getLastCardCutoff (bi-weekly card remittances, anchor Fri 2026-10-16)", () => {
  const ANCHOR = "2026-10-16";
  const OCT_2 = new Date("2026-10-02T14:00:00Z").getTime(); // Fri 18:00 Dubai
  const OCT_16 = new Date("2026-10-16T14:00:00Z").getTime();
  const OCT_30 = new Date("2026-10-30T14:00:00Z").getTime();

  it("on an off week, the card cutoff stays on the previous card Friday", () => {
    expect(getLastCardCutoff(new Date("2026-10-10T03:00:00Z"), ANCHOR).getTime()).toBe(OCT_2);
  });
  it("on the anchor Friday after 18:00 Dubai, it is the anchor itself", () => {
    expect(getLastCardCutoff(new Date("2026-10-16T14:00:00Z"), ANCHOR).getTime()).toBe(OCT_16);
  });
  it("just before the anchor cutoff, it is still two weeks earlier", () => {
    expect(getLastCardCutoff(new Date("2026-10-16T13:59:00Z"), ANCHOR).getTime()).toBe(OCT_2);
  });
  it("the week after the anchor is an off week", () => {
    expect(getLastCardCutoff(new Date("2026-10-24T03:00:00Z"), ANCHOR).getTime()).toBe(OCT_16);
  });
  it("two weeks after the anchor is the next card cutoff", () => {
    expect(getLastCardCutoff(new Date("2026-10-31T03:00:00Z"), ANCHOR).getTime()).toBe(OCT_30);
  });
});

describe("Weekly automation schedule (Friday 19:00 Dubai)", () => {
  const CUTOFF = new Date("2026-10-09T14:00:00Z"); // Fri 18:00 Dubai

  it("runs 1h after the Friday 18:00 cutoff", () => {
    expect(getAutomationRunAt(CUTOFF).toISOString()).toBe("2026-10-09T15:00:00.000Z");
  });
  it("is not due between the cutoff and 19:00", () => {
    expect(isAutomationDue(new Date("2026-10-09T14:30:00Z"), "2026-10-02T14:00:00.000Z").due).toBe(false);
  });
  it("is due from 19:00 when this cutoff hasn't run", () => {
    expect(isAutomationDue(new Date("2026-10-09T15:00:00Z"), "2026-10-02T14:00:00.000Z").due).toBe(true);
  });
  it("before 18:00 on Friday it belongs to last week's (already run) cutoff", () => {
    expect(isAutomationDue(new Date("2026-10-09T13:00:00Z"), "2026-10-02T14:00:00.000Z").due).toBe(false);
  });
  it("is not due again once this cutoff has run", () => {
    expect(isAutomationDue(new Date("2026-10-12T10:00:00Z"), CUTOFF.toISOString()).due).toBe(false);
  });
  it("next run is next Friday 19:00 once this week's has run", () => {
    expect(getNextAutomationRunAt(new Date("2026-10-12T10:00:00Z"), CUTOFF.toISOString()).toISOString())
      .toBe("2026-10-16T15:00:00.000Z");
  });
});

describe("extendPeriodToLastClosed (catch-up after empty weeks)", () => {
  const start = new Date("2026-09-18T00:00:00Z"); // Friday, last invoice ended here
  const firstEnd = new Date("2026-09-25T00:00:00Z");

  it("covers every closed week since the last invoice", () => {
    const now = new Date("2026-10-10T03:00:00Z"); // after Fri Oct 9 18:00 Dubai
    expect(extendPeriodToLastClosed(start, firstEnd, 7, now).toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });
  it("doesn't reach into a week whose cutoff hasn't passed", () => {
    const now = new Date("2026-10-09T13:59:00Z"); // 17:59 Dubai, Friday
    expect(extendPeriodToLastClosed(start, firstEnd, 7, now).toISOString()).toBe("2026-10-02T00:00:00.000Z");
  });
  it("leaves a normal weekly period alone", () => {
    const now = new Date("2026-09-26T03:00:00Z");
    expect(extendPeriodToLastClosed(start, firstEnd, 7, now).toISOString()).toBe(firstEnd.toISOString());
  });
});

describe("selectInvoiceOffsets", () => {
  it("takes oldest invoices first while they fit, whole invoices only", () => {
    expect(selectInvoiceOffsets([{ id: 1, balance: 50 }, { id: 2, balance: 60 }, { id: 3, balance: 10 }], 115))
      .toEqual([{ invoiceId: 1, amount: 50 }, { invoiceId: 2, amount: 60 }]);
  });
  it("stops at the first invoice that doesn't fit instead of paying a newer one", () => {
    expect(selectInvoiceOffsets([{ id: 1, balance: 500 }, { id: 2, balance: 10 }], 200)).toEqual([]);
  });
  it("ignores zero balances", () => {
    expect(selectInvoiceOffsets([{ id: 1, balance: 0 }, { id: 2, balance: 20 }], 20)).toEqual([{ invoiceId: 2, amount: 20 }]);
  });
});

// ─── Integration (TEST_DATABASE_URL) ──────────────────────────────────────────
// Uses its own throwaway client so it can't sweep other tests' COD records into
// a draft, and removes everything it created afterwards.

const created = { clientId: 0, orderIds: [] as number[], invoiceIds: [] as number[], remittanceIds: [] as number[] };
const TAG = `BA${Date.now().toString(36).toUpperCase()}`;

async function insertOrder(db: any, n: number, cod: { amount: string; allowed: string }) {
  const [res] = await db.insert(orders).values({
    clientId: created.clientId,
    waybillNumber: `${TAG}-${n}`,
    shipperName: "Automation Test Shipper",
    shipperAddress: "1 Test St",
    shipperCity: "Dubai",
    shipperCountry: "UAE",
    shipperPhone: "+971500000000",
    customerName: `Automation Test Customer ${n}`,
    customerPhone: "+971500000001",
    address: "1 Customer Ave",
    city: "Dubai",
    destinationCountry: "UAE",
    pieces: 1,
    weight: "1.00",
    serviceType: "DOM",
    status: "delivered",
    codRequired: 1,
    codAmount: cod.amount,
    codCurrency: "AED",
  } as any);
  created.orderIds.push(res.insertId);
  return res.insertId as number;
}

async function insertCod(db: any, shipmentId: number, data: Partial<typeof codRecords.$inferInsert>) {
  await db.insert(codRecords).values({ shipmentId, codCurrency: "AED", codAmount: "0", ...data } as any);
  const [row] = await db.select().from(codRecords).where(eq(codRecords.shipmentId, shipmentId)).limit(1);
  return row;
}

async function insertInvoice(db: any, suffix: string, total: string, issueDate: Date, sentToClient: number) {
  const [res] = await db.insert(invoices).values({
    clientId: created.clientId,
    invoiceNumber: `TEST-${TAG}-${suffix}`,
    periodFrom: issueDate,
    periodTo: issueDate,
    issueDate,
    dueDate: issueDate,
    subtotal: total,
    total,
    balance: total,
    amountPaid: "0",
    status: "pending",
    sentToClient,
  } as any);
  created.invoiceIds.push(res.insertId);
  return res.insertId as number;
}

describe("Draft COD remittances (integration)", () => {
  afterAll(async () => {
    const db = await getDb();
    if (!db || !created.clientId) return;
    const rems = await db.select({ id: codRemittances.id }).from(codRemittances).where(eq(codRemittances.clientId, created.clientId));
    const remIds = rems.map(r => r.id);
    if (remIds.length) {
      await db.delete(codRemittanceOffsets).where(inArray(codRemittanceOffsets.remittanceId, remIds));
      await db.delete(codRemittanceItems).where(inArray(codRemittanceItems.remittanceId, remIds));
      await db.delete(codRemittances).where(inArray(codRemittances.id, remIds));
    }
    if (created.orderIds.length) {
      await db.delete(trackingEvents).where(inArray(trackingEvents.shipmentId, created.orderIds));
      await db.delete(codRecords).where(inArray(codRecords.shipmentId, created.orderIds));
      await db.delete(orders).where(inArray(orders.id, created.orderIds));
    }
    if (created.invoiceIds.length) await db.delete(invoices).where(inArray(invoices.id, created.invoiceIds));
    await db.delete(clientAccounts).where(eq(clientAccounts.id, created.clientId));
    await db.delete(serviceConfig).where(inArray(serviceConfig.configKey, ['ADDRESS_ISSUE_FEE', 'ADDRESS_ISSUE_FEE_FROM']));
  }, 30000);

  it("drafts cash weekly and card bi-weekly, nets open invoices, and approval settles everything", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [client] = await db.insert(clientAccounts).values({
      companyName: `__TEST FIXTURE__ billing automation ${TAG}`,
      contactName: "Test",
      phone: "+971500000000",
      billingEmail: "billing-automation@pathxpress.internal",
      billingAddress: "Test",
      country: "UAE",
      city: "Dubai",
      codAllowed: 1,
      codFeePercent: "0",
      codMinFee: "0",
      cardFeePercent: "1.5",
      cardMinFee: "1",
      codOffsetInvoices: 1,
    } as any);
    created.clientId = client.insertId;

    // Friday 2026-10-09 19:30 Dubai: cash cutoff Fri Oct 9, card cutoff Fri Oct 2 (off week).
    const NOW = new Date("2026-10-09T15:30:00Z");

    const cashReady = await insertCod(db, await insertOrder(db, 1, { amount: "200", allowed: "cash" }), {
      codAmount: "200", status: "collected", collectedMethod: "cash", feeAmount: "0.00", collectedDate: new Date("2026-10-08T10:00:00Z"),
    });
    const cashLate = await insertCod(db, await insertOrder(db, 2, { amount: "100", allowed: "cash" }), {
      codAmount: "100", status: "collected", collectedMethod: "cash", feeAmount: "0.00", collectedDate: new Date("2026-10-09T15:00:00Z"),
    });
    const cardOffWeek = await insertCod(db, await insertOrder(db, 3, { amount: "300", allowed: "card" }), {
      codAmount: "300", allowedMethods: "card", status: "collected", collectedMethod: "card", paymentReference: "T1", feeAmount: "4.50", collectedDate: new Date("2026-10-05T10:00:00Z"),
    });
    const cardReady = await insertCod(db, await insertOrder(db, 4, { amount: "400", allowed: "card" }), {
      codAmount: "400", allowedMethods: "card", status: "collected", collectedMethod: "card", paymentReference: "T2", feeAmount: "6.00", collectedDate: new Date("2026-10-01T10:00:00Z"),
    });

    const invOld = await insertInvoice(db, "A", "50.00", new Date("2026-09-26T06:00:00Z"), 1);
    const invTooBig = await insertInvoice(db, "B", "500.00", new Date("2026-10-03T06:00:00Z"), 1);
    const invDraft = await insertInvoice(db, "C", "10.00", new Date("2026-09-20T06:00:00Z"), 0);

    const results = await createDraftRemittances({ now: NOW, clientId: created.clientId });
    expect(results.map(r => r.kind).sort()).toEqual(["card", "cash"]);
    created.remittanceIds = results.map(r => r.remittanceId);

    const drafts = (await getDraftRemittances()).filter(d => d.clientId === created.clientId);
    const cash = drafts.find(d => d.kind === "cash")!;
    const card = drafts.find(d => d.kind === "card")!;

    expect(cash.items.map(i => i.codRecordId)).toEqual([cashReady.id]);
    expect(cash.grossAmount).toBe("200.00");
    expect(cash.offsets.map(o => o.invoiceId)).toEqual([invOld]); // draft invoice C excluded, B doesn't fit
    expect(cash.payoutAmount).toBe("150.00");
    expect(cash.remittanceNumber.startsWith("DRAFT-")).toBe(true);

    expect(card.items.map(i => i.codRecordId)).toEqual([cardReady.id]); // Oct 5 card waits for the Oct 16 cutoff
    expect(card.feeAmount).toBe("6.00");
    expect(card.payoutAmount).toBe("394.00");

    // Reserved records are no longer "ready", and re-running creates nothing new.
    const ready = await getReadyToRemitRecordsByClient(created.clientId, NOW);
    expect(ready.map(r => r.id)).not.toContain(cashReady.id);
    expect(await createDraftRemittances({ now: NOW, clientId: created.clientId })).toEqual([]);

    // Approve cash: REM number, records remitted, netted invoice paid with the REM reference.
    const approved = await approveDraftRemittance(cash.id, { paymentReference: "DOM-TEST-REF", approvedBy: 1 });
    expect(approved.remittanceNumber).toMatch(/^REM-\d{4}-\d{6}$/);
    expect(approved.payout).toBe("150.00");

    const [remRow] = await db.select().from(codRemittances).where(eq(codRemittances.id, cash.id));
    expect(remRow.status).toBe("completed");
    expect(remRow.paymentReference).toBe("DOM-TEST-REF");
    const [recRow] = await db.select().from(codRecords).where(eq(codRecords.id, cashReady.id));
    expect(recRow.status).toBe("remitted");
    const [invOldRow] = await db.select().from(invoices).where(eq(invoices.id, invOld));
    expect(invOldRow.status).toBe("paid");
    expect(invOldRow.balance).toBe("0.00");
    expect(invOldRow.paymentReference).toBe(approved.remittanceNumber);
    const [invBigRow] = await db.select().from(invoices).where(eq(invoices.id, invTooBig));
    expect(invBigRow.status).toBe("pending");

    // Discarding the card draft releases its record back to "ready".
    await discardDraftRemittance(card.id);
    const readyAfter = await getReadyToRemitRecordsByClient(created.clientId, NOW);
    expect(readyAfter.map(r => r.id)).toContain(cardReady.id);
    expect(readyAfter.map(r => r.id)).not.toContain(cardOffWeek.id);
    expect(readyAfter.map(r => r.id)).not.toContain(cashLate.id);
    expect(invDraft).toBeGreaterThan(0);
  }, 60000);

  it("closing a COD delivery from the admin records the collection at the delivery time", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    if (!created.clientId) throw new Error("previous test must create the client");

    const orderId = await insertOrder(db, 5, { amount: "300", allowed: "card" });
    await insertCod(db, orderId, { codAmount: "300", allowedMethods: "card", status: "pending_collection" });

    const DELIVERED_AT = new Date("2026-10-08T12:34:00Z");
    const res = await markCODCollectedOnDelivery(orderId, DELIVERED_AT);
    expect(res).toEqual({ updated: true, method: "card" });

    const [row] = await db.select().from(codRecords).where(eq(codRecords.shipmentId, orderId));
    expect(row.status).toBe("collected");
    expect(row.collectedMethod).toBe("card");
    expect(new Date(row.collectedDate!).getTime()).toBe(DELIVERED_AT.getTime());
    const expectedFee = await calculateCODFeeByMethod(300, created.clientId, "card");
    expect(row.feeAmount).toBe(expectedFee.toFixed(2));

    // Second call is a no-op: nothing pending anymore.
    expect((await markCODCollectedOnDelivery(orderId, new Date())).updated).toBe(false);
  }, 30000);

  it("charges the address-issue fee only for events on/after ADDRESS_ISSUE_FEE_FROM", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    if (!created.clientId) throw new Error("previous test must create the client");

    const before = await insertOrder(db, 6, { amount: "0", allowed: "cash" });
    const after = await insertOrder(db, 7, { amount: "0", allowed: "cash" });
    await db.insert(trackingEvents).values([
      { shipmentId: before, eventDatetime: new Date("2026-10-01T08:00:00Z"), statusCode: "address_issue", statusLabel: "ADDRESS ISSUE", createdBy: "test" },
      { shipmentId: after, eventDatetime: new Date("2026-10-07T08:00:00Z"), statusCode: "address_issue", statusLabel: "ADDRESS ISSUE", createdBy: "test" },
      { shipmentId: after, eventDatetime: new Date("2026-10-08T08:00:00Z"), statusCode: "address_issue", statusLabel: "ADDRESS ISSUE", createdBy: "test" },
    ] as any);

    // Off when not configured
    await db.delete(serviceConfig).where(inArray(serviceConfig.configKey, ['ADDRESS_ISSUE_FEE', 'ADDRESS_ISSUE_FEE_FROM']));
    expect((await getAddressIssueFees([before, after])).size).toBe(0);

    await db.insert(serviceConfig).values([
      { configKey: 'ADDRESS_ISSUE_FEE', configValue: '5' },
      { configKey: 'ADDRESS_ISSUE_FEE_FROM', configValue: '2026-10-06' },
    ]);
    const fees = await getAddressIssueFees([before, after]);
    expect(fees.get(after)).toBe(5); // once, despite two events
    expect(fees.has(before)).toBe(false);
  }, 30000);
});

