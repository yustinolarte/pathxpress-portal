/**
 * REST API for Shopify integration (server-to-server)
 * Mounted at /api/shopify
 *
 * Auth: Bearer token via SHOPIFY_INTEGRATION_SECRET env var
 * This avoids the cookie-based auth used by the tRPC portal endpoints,
 * which is not usable from external servers.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { getDb, generateWaybillNumber, createOrder, createTrackingEvent } from './db';
import { codRecords } from '../drizzle/schema';

const router = Router();

// ============ AUTH MIDDLEWARE ============

const INTEGRATION_SECRET = process.env.SHOPIFY_INTEGRATION_SECRET;

function integrationAuth(req: Request, res: Response, next: NextFunction) {
    if (!INTEGRATION_SECRET) {
        return res.status(500).json({ error: 'Integration not configured' });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing Bearer token' });
    }
    const token = authHeader.substring(7);
    if (token !== INTEGRATION_SECRET) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    next();
}

// ============ POST /api/shopify/create-shipment ============

router.post('/create-shipment', integrationAuth, async (req: Request, res: Response) => {
    try {
        const { clientId, shipment } = req.body;

        if (!clientId || !shipment) {
            return res.status(400).json({ error: 'Missing clientId or shipment' });
        }

        const {
            shipperName, shipperAddress, shipperCity, shipperCountry, shipperPhone,
            customerName, customerPhone, address, city, emirate, postalCode, destinationCountry,
            pieces, weight, length, width, height,
            serviceType, specialInstructions,
            codRequired, codAmount, codCurrency,
            latitude, longitude,
        } = shipment;

        // Validate required fields
        if (!customerName || !address || !city || !destinationCountry || !weight) {
            return res.status(400).json({ error: 'Missing required shipment fields' });
        }

        const isInternational = destinationCountry.toUpperCase() !== 'UAE'
            && destinationCountry.toUpperCase() !== 'UNITED ARAB EMIRATES';

        const waybillNumber = await generateWaybillNumber(isInternational);

        const order = await createOrder({
            clientId,
            waybillNumber,
            shipperName, shipperAddress, shipperCity, shipperCountry, shipperPhone,
            customerName, customerPhone, address, city,
            emirate: emirate || null,
            postalCode: postalCode || null,
            destinationCountry,
            pieces,
            weight: weight.toString(),
            length: length?.toString() || null,
            width: width?.toString() || null,
            height: height?.toString() || null,
            serviceType: serviceType || 'DOM',
            specialInstructions: specialInstructions || '',
            codRequired: codRequired || 0,
            codAmount: codAmount || null,
            codCurrency: codCurrency || 'AED',
            latitude: latitude || null,
            longitude: longitude || null,
            status: 'pending_pickup',
            lastStatusUpdate: new Date(),
        });

        if (!order) {
            return res.status(500).json({ error: 'Failed to create shipment' });
        }

        // Create initial tracking event
        await createTrackingEvent({
            shipmentId: order.id,
            eventDatetime: new Date(),
            statusCode: 'pending_pickup',
            statusLabel: 'PENDING PICKUP',
            description: 'Shipment created via Shopify integration',
            createdBy: 'shopify',
        });

        // Create COD record if needed
        if (codRequired === 1 && codAmount) {
            const db = await getDb();
            if (db) {
                await db.insert(codRecords).values({
                    shipmentId: order.id,
                    codAmount: codAmount.toString(),
                    codCurrency: codCurrency || 'AED',
                    status: 'pending_collection',
                    collectedDate: null,
                    remittedToClientDate: null,
                    notes: null,
                });
            }
        }

        return res.json({ waybillNumber, orderId: order.id });

    } catch (err: any) {
        console.error('⛔ Shopify integration error:', err);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

export default router;
