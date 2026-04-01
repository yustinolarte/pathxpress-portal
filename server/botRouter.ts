/**
 * REST API endpoints for the Pathx WhatsApp bot
 * Mounted at /api/bot/* in server/_core/index.ts
 *
 * Auth: every request must include header X-Bot-Key matching BOT_API_KEY env var
 */
import { Router, Request, Response, NextFunction } from 'express';
import { eq, and, inArray } from 'drizzle-orm';
import {
  getDb,
  getOrderByWaybill,
  getTrackingEventsByShipmentId,
  updateOrder,
  createTrackingEvent,
} from './db';
import {
  clientAccounts,
  invoices,
  codRecords,
} from '../drizzle/schema';
import { ENV } from './_core/env';

const router = Router();

// ── Auth middleware ───────────────────────────────────────────────────────────
function botAuth(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['x-bot-key'];
  if (!ENV.botApiKey || key !== ENV.botApiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(botAuth);

// ── GET /api/bot/orders/:waybill ─────────────────────────────────────────────
router.get('/orders/:waybill', async (req: Request, res: Response) => {
  try {
    const order = await getOrderByWaybill(req.params.waybill);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const db = await getDb();
    const codRecord = db
      ? await db.select().from(codRecords).where(eq(codRecords.shipmentId, order.id)).limit(1)
      : [];

    res.json({
      id: order.id,
      waybillNumber: order.waybillNumber,
      status: order.status,
      serviceType: order.serviceType,
      cod: {
        required: order.codRequired === 1,
        amount: order.codAmount ?? '0',
        currency: order.codCurrency ?? 'AED',
      },
      customerName: order.customerName,
      city: order.city,
      createdAt: order.createdAt,
    });
  } catch (err) {
    console.error('[BotRouter] GET /orders error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/bot/orders/:waybill/attempts ────────────────────────────────────
router.get('/orders/:waybill/attempts', async (req: Request, res: Response) => {
  try {
    const order = await getOrderByWaybill(req.params.waybill);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const events = await getTrackingEventsByShipmentId(order.id);
    const attempts = events.filter(e =>
      ['attempted', 'failed_delivery', 'attempted_delivery'].includes(e.statusCode ?? '')
    );

    res.json({
      attempts: attempts.map(e => ({
        timestamp: e.eventDatetime,
        statusCode: e.statusCode,
        description: e.description,
        location: e.location,
      })),
    });
  } catch (err) {
    console.error('[BotRouter] GET /attempts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/bot/orders/:waybill/notes ──────────────────────────────────────
router.post('/orders/:waybill/notes', async (req: Request, res: Response) => {
  try {
    const { note } = req.body;
    if (!note || typeof note !== 'string') {
      return res.status(400).json({ error: 'note is required' });
    }

    const order = await getOrderByWaybill(req.params.waybill);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await createTrackingEvent({
      shipmentId: order.id,
      eventDatetime: new Date(),
      statusCode: 'note',
      statusLabel: 'DRIVER NOTE',
      description: note,
      createdBy: 'pathx-bot',
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[BotRouter] POST /notes error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/bot/orders/:waybill/cod ─────────────────────────────────────────
router.put('/orders/:waybill/cod', async (req: Request, res: Response) => {
  try {
    const { codAmount, codCurrency } = req.body;
    if (codAmount === undefined) {
      return res.status(400).json({ error: 'codAmount is required' });
    }

    const order = await getOrderByWaybill(req.params.waybill);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status !== 'pending_pickup') {
      return res.status(409).json({
        error: 'COD can only be changed when order is in pending_pickup status',
        status: order.status,
      });
    }

    const amount = parseFloat(String(codAmount));
    const result = await updateOrder(order.id, {
      codAmount: String(codAmount),
      codCurrency: codCurrency ?? order.codCurrency ?? 'AED',
      codRequired: amount > 0 ? 1 : 0,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, newCod: codAmount });
  } catch (err) {
    console.error('[BotRouter] PUT /cod error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/bot/orders/:waybill/service-type ─────────────────────────────────
router.put('/orders/:waybill/service-type', async (req: Request, res: Response) => {
  try {
    const { serviceType } = req.body;
    if (!serviceType) {
      return res.status(400).json({ error: 'serviceType is required' });
    }

    const order = await getOrderByWaybill(req.params.waybill);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Cut-off and service permission are validated in the bot (logic/orders.js + logic/cutoff.js)
    // Here we just execute the DB update
    const result = await updateOrder(order.id, { serviceType });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, serviceType });
  } catch (err) {
    console.error('[BotRouter] PUT /service-type error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/bot/clients/overdue-all ─────────────────────────────────────────
// Must be defined BEFORE /clients/:id to avoid route conflict
router.get('/clients/overdue-all', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: 'Database not available' });

    // Get all overdue invoices with client info
    const overdueRows = await db
      .select({
        invoiceId: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        amount: invoices.total,
        dueDate: invoices.dueDate,
        clientId: clientAccounts.id,
        companyName: clientAccounts.companyName,
        contactName: clientAccounts.contactName,
        whatsappNumber: clientAccounts.whatsappNumber,
        paymentLink: clientAccounts.paymentLink,
      })
      .from(invoices)
      .innerJoin(clientAccounts, eq(invoices.clientId, clientAccounts.id))
      .where(
        and(
          eq(invoices.status, 'overdue'),
          eq(clientAccounts.status, 'active')
        )
      );

    // Group by client
    const clientMap = new Map<number, {
      id: number; companyName: string; contactName: string;
      whatsappNumber: string | null; paymentLink: string | null;
      invoices: { id: number; invoiceNumber: string; amount: string; dueDate: Date | null }[]
    }>();

    for (const row of overdueRows) {
      if (!clientMap.has(row.clientId)) {
        clientMap.set(row.clientId, {
          id: row.clientId,
          companyName: row.companyName,
          contactName: row.contactName,
          whatsappNumber: row.whatsappNumber ?? null,
          paymentLink: row.paymentLink ?? null,
          invoices: [],
        });
      }
      clientMap.get(row.clientId)!.invoices.push({
        id: row.invoiceId,
        invoiceNumber: row.invoiceNumber,
        amount: row.amount,
        dueDate: row.dueDate,
      });
    }

    res.json({ clients: Array.from(clientMap.values()) });
  } catch (err) {
    console.error('[BotRouter] GET /clients/overdue-all error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/bot/clients/by-phone/:phone ─────────────────────────────────────
router.get('/clients/by-phone/:phone', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: 'Database not available' });

    // Normalize: strip leading + or spaces
    const phone = req.params.phone.replace(/^\+/, '').replace(/\s/g, '');

    const [client] = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.whatsappNumber, phone))
      .limit(1);

    if (!client) return res.status(404).json({ error: 'Client not found for this phone number' });

    res.json({
      id: client.id,
      companyName: client.companyName,
      contactName: client.contactName,
      codAllowed: client.codAllowed === 1,
      bulletAllowed: client.bulletAllowed === 1,
      bulletCutoffTime: client.bulletCutoffTime ?? null,
      sdCutoffTime: client.sdCutoffTime ?? null,
      paymentLink: client.paymentLink ?? null,
    });
  } catch (err) {
    console.error('[BotRouter] GET /clients/by-phone error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/bot/clients/:id/invoices/overdue ─────────────────────────────────
router.get('/clients/:id/invoices/overdue', async (req: Request, res: Response) => {
  try {
    const clientId = parseInt(req.params.id);
    if (isNaN(clientId)) return res.status(400).json({ error: 'Invalid clientId' });

    const db = await getDb();
    if (!db) return res.status(503).json({ error: 'Database not available' });

    const rows = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.clientId, clientId), eq(invoices.status, 'overdue')));

    res.json({
      invoices: rows.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: inv.total,
        dueDate: inv.dueDate,
        status: inv.status,
      })),
    });
  } catch (err) {
    console.error('[BotRouter] GET /clients/:id/invoices/overdue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/bot/invoices/:id ─────────────────────────────────────────────────
router.get('/invoices/:id', async (req: Request, res: Response) => {
  try {
    const invoiceId = parseInt(req.params.id);
    if (isNaN(invoiceId)) return res.status(400).json({ error: 'Invalid invoiceId' });

    const db = await getDb();
    if (!db) return res.status(503).json({ error: 'Database not available' });

    const [inv] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    res.json({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      amount: inv.total,
      amountPaid: inv.amountPaid,
      balance: inv.balance,
      dueDate: inv.dueDate,
      status: inv.status,
    });
  } catch (err) {
    console.error('[BotRouter] GET /invoices/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
