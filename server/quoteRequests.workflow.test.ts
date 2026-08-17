import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { quoteRequests } from '../drizzle/schema';
import { deleteQuoteRequests, getDb, getQuoteRequestsForExport, getQuoteRequestsPaged, updateQuoteRequestStatus } from './db';

describe.skipIf(!process.env.TEST_DATABASE_URL)('pickup request workflow (test database)', () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let requestId = 0;
  let bulkRequestIds: number[] = [];
  const marker = `workflow-${Date.now()}`;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error('Test database is unavailable');
    const insert = await db.insert(quoteRequests).values({
      name: `Test ${marker}`,
      email: `${marker}@pathxpress.internal`,
      phone: '+971 500000000',
      pickupAddress: `Pickup ${marker}`,
      deliveryAddress: 'Dubai',
      serviceType: 'pickup',
      weight: '1 kg',
      comments: 'Workflow integration test',
    });
    requestId = Number((insert as any)[0].insertId);
  });

  afterAll(async () => {
    const ids = [requestId, ...bulkRequestIds].filter(Boolean);
    if (db && ids.length) await db.delete(quoteRequests).where(inArray(quoteRequests.id, ids));
  });

  it('filters, paginates, exports and persists status', async () => {
    const firstPage = await getQuoteRequestsPaged({ page: 0, pageSize: 25, search: marker });
    expect(firstPage.total).toBe(1);
    expect(firstPage.rows[0].status).toBe('new');

    expect(await updateQuoteRequestStatus(requestId, 'scheduled')).toBe(true);
    const scheduled = await getQuoteRequestsPaged({ page: 0, pageSize: 25, status: 'scheduled', search: marker });
    expect(scheduled.rows).toHaveLength(1);
    expect(scheduled.rows[0].id).toBe(requestId);

    const exported = await getQuoteRequestsForExport({ status: 'scheduled', search: marker });
    expect(exported.map((row) => row.id)).toContain(requestId);
  });

  it('deletes only the explicitly selected request IDs', async () => {
    if (!db) throw new Error('Test database is unavailable');
    const bulkMarker = `bulk-${marker}`;
    await db.insert(quoteRequests).values([
      {
        name: `Bulk A ${bulkMarker}`,
        email: `bulk-a-${marker}@pathxpress.internal`,
        phone: '+971 500000001',
        pickupAddress: `Pickup A ${bulkMarker}`,
        deliveryAddress: 'Dubai',
        serviceType: 'pickup',
        weight: '1 kg',
        comments: 'Bulk delete integration test',
      },
      {
        name: `Bulk B ${bulkMarker}`,
        email: `bulk-b-${marker}@pathxpress.internal`,
        phone: '+971 500000002',
        pickupAddress: `Pickup B ${bulkMarker}`,
        deliveryAddress: 'Dubai',
        serviceType: 'pickup',
        weight: '2 kg',
        comments: 'Bulk delete integration test',
      },
    ]);

    const inserted = await getQuoteRequestsForExport({ search: bulkMarker });
    bulkRequestIds = inserted.map((row) => row.id);
    expect(bulkRequestIds).toHaveLength(2);
    expect(await deleteQuoteRequests(bulkRequestIds)).toBe(2);

    const removed = await getQuoteRequestsForExport({ search: bulkMarker });
    expect(removed).toHaveLength(0);
    const original = await getQuoteRequestsPaged({ page: 0, pageSize: 25, search: marker });
    expect(original.rows.map((row) => row.id)).toContain(requestId);
  });
});
