/**
 * REST API for Shopify integration (server-to-server)
 * Mounted at /api/shopify
 * Version: 1.0.1
 * Auth: Bearer token via SHOPIFY_INTEGRATION_SECRET env var
 * This avoids the cookie-based auth used by the tRPC portal endpoints,
 * which is not usable from external servers.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { getDb, generateWaybillNumber, createOrder, createTrackingEvent, getAvailableServicesForClient, getOrderByWaybill, getClientAccountById } from './db';
import { renderWaybillPdf } from './waybillPdf';
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
        const { clientId, shipment, orderNumber = null } = req.body;

        if (!clientId || !shipment) {
            return res.status(400).json({ error: 'Missing clientId or shipment' });
        }

        const {
            shipperName, shipperAddress, shipperCity, shipperCountry, shipperPhone,
            shipperLat, shipperLng,
            customerName, customerPhone, address, city, emirate, postalCode, destinationCountry,
            pieces, weight, length, width, height,
            serviceType, specialInstructions, itemsDescription,
            codRequired, codAmount, codCurrency, codPaymentMethod: rawCodPaymentMethod,
            latitude, longitude,
        } = shipment;

        // Validate required fields
        if (!customerName || !address || !city || !destinationCountry || !weight) {
            return res.status(400).json({ error: 'Missing required shipment fields' });
        }

        // Shipper is optional in the payload — falls back to the client's
        // default saved location (exact pin included), then their billing
        // profile, so a Shopify app integration doesn't have to resend the
        // same shop address on every order.
        let resolvedShipperName = shipperName;
        let resolvedShipperAddress = shipperAddress;
        let resolvedShipperCity = shipperCity;
        let resolvedShipperCountry = shipperCountry;
        let resolvedShipperPhone = shipperPhone;
        let resolvedShipperLat = shipperLat;
        let resolvedShipperLng = shipperLng;
        if (!resolvedShipperName || !resolvedShipperAddress) {
            const { getDefaultSavedShipper } = await import('./db');
            const [defaultLocation, clientAccount] = await Promise.all([
                getDefaultSavedShipper(clientId),
                getClientAccountById(clientId),
            ]);
            resolvedShipperName = resolvedShipperName || defaultLocation?.shipperName || clientAccount?.companyName;
            resolvedShipperAddress = resolvedShipperAddress || defaultLocation?.shipperAddress || clientAccount?.billingAddress;
            resolvedShipperCity = resolvedShipperCity || defaultLocation?.shipperCity || clientAccount?.city;
            resolvedShipperCountry = resolvedShipperCountry || defaultLocation?.shipperCountry || clientAccount?.country;
            resolvedShipperPhone = resolvedShipperPhone || defaultLocation?.shipperPhone || clientAccount?.phone;
            resolvedShipperLat = resolvedShipperLat || defaultLocation?.latitude || undefined;
            resolvedShipperLng = resolvedShipperLng || defaultLocation?.longitude || undefined;
        }
        if (!resolvedShipperName || !resolvedShipperAddress || !resolvedShipperCity || !resolvedShipperCountry || !resolvedShipperPhone) {
            return res.status(400).json({ error: 'Missing shipper details and no default location is set up for this client' });
        }

        const isInternational = destinationCountry.toUpperCase() !== 'UAE'
            && destinationCountry.toUpperCase() !== 'UNITED ARAB EMIRATES';

        // COD cannot be fulfilled on international shipments — there is no
        // PathXpress driver on the ground to collect cash/card at the door once
        // the package leaves UAE for customs/an international carrier.
        if (isInternational && codRequired === 1) {
            return res.status(400).json({ error: 'Cash on Delivery is not available for international shipments' });
        }

        const waybillNumber = await generateWaybillNumber(isInternational);

        // Determine COD payment method: validate against client's CCOD setting
        let codPaymentMethod: string | null = null;
        if (codRequired === 1) {
            const requestedMethod = (['cash', 'card', 'any'].includes(rawCodPaymentMethod)) ? rawCodPaymentMethod : 'cash';
            if (requestedMethod !== 'cash') {
                // 'card' or 'any' require the client to have CCOD enabled
                const clientAccount = await getClientAccountById(clientId);
                codPaymentMethod = clientAccount?.cardOnDeliveryAllowed === 1 ? requestedMethod : 'cash';
            } else {
                codPaymentMethod = 'cash';
            }
        }

        const order = await createOrder({
            clientId,
            waybillNumber,
            orderNumber: orderNumber || undefined,
            shipperName: resolvedShipperName, shipperAddress: resolvedShipperAddress, shipperCity: resolvedShipperCity, shipperCountry: resolvedShipperCountry, shipperPhone: resolvedShipperPhone,
            shipperLat: resolvedShipperLat || null,
            shipperLng: resolvedShipperLng || null,
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
            itemsDescription: itemsDescription || null,
            codRequired: codRequired || 0,
            codAmount: codAmount || null,
            codCurrency: codCurrency || 'AED',
            codPaymentMethod,
            latitude: latitude || null,
            longitude: longitude || null,
            status: 'pending_pickup',
            lastStatusUpdate: new Date(),
            source: 'shopify',
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
                    allowedMethods: codPaymentMethod || 'cash',
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

// ============ GET /api/shopify/services ============
// Returns the delivery services available to a client.
//   - ?clientId=123                                        → enabled-service listing (settings dropdown)
//   - ?clientId=123&emirate=Dubai&weight=2                 → priced/available services (checkout rates)
//   - ?clientId=123&emirate=Dubai&weight=2&lat=..&lng=..    → same, zone resolved from the pin when given
//     (mirrors the latitude/longitude POST /create-shipment already accepts)
router.get('/services', integrationAuth, async (req: Request, res: Response) => {
    try {
        const clientId = parseInt(String(req.query.clientId ?? ''), 10);
        if (!clientId || Number.isNaN(clientId)) {
            return res.status(400).json({ error: 'Missing or invalid clientId' });
        }

        const emirate = req.query.emirate ? String(req.query.emirate) : undefined;
        const weightRaw = req.query.weight ? parseFloat(String(req.query.weight)) : undefined;
        const weight = weightRaw && weightRaw > 0 ? weightRaw : undefined;
        const latRaw = req.query.lat ? parseFloat(String(req.query.lat)) : undefined;
        const lngRaw = req.query.lng ? parseFloat(String(req.query.lng)) : undefined;
        const lat = latRaw !== undefined && Number.isFinite(latRaw) ? latRaw : undefined;
        const lng = lngRaw !== undefined && Number.isFinite(lngRaw) ? lngRaw : undefined;

        const [services, clientAccount] = await Promise.all([
            getAvailableServicesForClient(clientId, { emirate, weight, lat, lng }),
            getClientAccountById(clientId)
        ]);
        
        return res.json({ 
            services,
            clientSettings: {
                cardOnDeliveryAllowed: clientAccount?.cardOnDeliveryAllowed === 1
            }
        });
    } catch (err: any) {
        console.error('⛔ Shopify integration services error:', err);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// ============ GET /api/shopify/waybill/:waybill(.pdf) ============
// Returns the official PathXpress shipping label as a PDF.
// ?clientId=123 is required and must match the waybill's owner — the shared
// integration secret authorizes any clientId, so without this any holder of
// that secret could download any client's waybill (name/address/COD amount)
// by guessing/enumerating waybill numbers.
router.get('/waybill/:waybill', integrationAuth, async (req: Request, res: Response) => {
    try {
        const waybillNumber = String(req.params.waybill || '').replace(/\.pdf$/i, '');
        if (!waybillNumber) {
            return res.status(400).json({ error: 'Missing waybill number' });
        }

        const clientId = req.query.clientId ? parseInt(String(req.query.clientId), 10) : null;
        if (!clientId || Number.isNaN(clientId)) {
            return res.status(400).json({ error: 'Missing required clientId query parameter' });
        }

        const order = await getOrderByWaybill(waybillNumber);
        if (!order) {
            return res.status(404).json({ error: 'Waybill not found' });
        }

        if (order.clientId !== clientId) {
            return res.status(403).json({ error: 'Waybill does not belong to this client' });
        }

        const pdf = await renderWaybillPdf({
            waybillNumber: order.waybillNumber,
            shipperName: order.shipperName,
            shipperAddress: order.shipperAddress,
            shipperCity: order.shipperCity,
            shipperCountry: order.shipperCountry,
            shipperPhone: order.shipperPhone,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            address: order.address,
            city: order.city,
            emirate: order.emirate,
            destinationCountry: order.destinationCountry,
            pieces: order.pieces,
            weight: order.weight,
            serviceType: order.serviceType,
            status: order.status,
            createdAt: order.createdAt,
            codRequired: order.codRequired,
            codAmount: order.codAmount,
            codCurrency: order.codCurrency,
            codPaymentMethod: order.codPaymentMethod,
            specialInstructions: order.specialInstructions,
            hideConsigneeAddress: order.hideConsigneeAddress,
            isReturn: order.isReturn,
            fitOnDelivery: order.fitOnDelivery,
            itemsDescription: order.itemsDescription,
            preferredDeliveryDate: order.preferredDeliveryDate,
            preferredDeliveryTime: order.preferredDeliveryTime,
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="waybill-${waybillNumber}.pdf"`);
        res.setHeader('Cache-Control', 'private, max-age=86400');
        return res.send(pdf);
    } catch (err: any) {
        console.error('⛔ Shopify waybill PDF error:', err);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

export default router;
