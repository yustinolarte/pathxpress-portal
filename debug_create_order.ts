
import 'dotenv/config'; // Load env vars
import { createOrder, getDb } from './server/db';
import { orders } from './drizzle/schema';
import { generateWaybillNumber } from './server/db';

async function testCreateOrder() {
    try {
        // Force wait for DB init
        const db = await getDb();
        if (!db) {
            console.log('No DB connection (check DATABASE_URL)');
            return;
        }

        const waybill = await generateWaybillNumber();
        console.log('Generated Waybill:', waybill);

        // Mock order data similar to what frontend sends
        const orderData = {
            clientId: 1, // Assuming client ID 1 exists
            waybillNumber: waybill,
            orderNumber: 'TEST-ORDER-1',
            shipperName: 'Test Shipper',
            shipperAddress: '123 Shipper St',
            shipperCity: 'Dubai',
            shipperCountry: 'UAE',
            shipperPhone: '1234567890',
            customerName: 'Test Customer',
            customerPhone: '0987654321',
            address: '456 Customer Ave',
            city: 'Abu Dhabi',
            destinationCountry: 'UAE',
            pieces: 1,
            weight: 0.5, // Float value!
            serviceType: 'DOM',
            codRequired: 0,
            status: 'pending_pickup',
        };

        console.log('Attempting to create order with weight 0.5...');
        try {
            await db.insert(orders).values(orderData);
            console.log('Order created successfully!');
        } catch (e) {
            console.error('Insert failed:', e);
        }

        process.exit(0);

    } catch (error) {
        console.error('Test script failed:', error);
        process.exit(1);
    }
}

testCreateOrder();
