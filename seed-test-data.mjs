import mysql from 'mysql2/promise';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

async function seedTestData() {
    try {
        if (!DATABASE_URL) {
            console.error('❌ No hay DATABASE_URL en el .env');
            process.exit(1);
        }

        console.log('🔌 Conectando a la base de datos...');
        const connection = await mysql.createConnection(DATABASE_URL);

        // Get the client ID (assuming client1@pathxpress.net exists)
        const [users] = await connection.execute(
            'SELECT * FROM portalUsers WHERE email = ?',
            ['client1@pathxpress.net']
        );

        if (!users || users.length === 0) {
            console.error('❌ Usuario cliente no encontrado. Ejecuta create-client-user.mjs primero');
            process.exit(1);
        }

        const clientId = users[0].clientId;

        if (!clientId) {
            console.error('❌ El usuario no tiene clientId asignado');
            process.exit(1);
        }

        console.log(`✅ Usuario encontrado con clientId: ${clientId}`);
        console.log('📦 Creando datos de prueba...');

        // Get current year for waybill numbers
        const year = new Date().getFullYear().toString().slice(-2);

        // Sample shipments data
        const shipments = [
            {
                waybillNumber: `PX${year}0001`,
                shipperCity: 'Dubai',
                city: 'Abu Dhabi',
                serviceType: 'DOM',
                status: 'delivered',
                weight: 2.5,
                createdDaysAgo: 25,
                deliveredDaysAgo: 24,
                estimatedDays: 1,
                codAmount: '150.00'
            },
            {
                waybillNumber: `PX${year}0002`,
                shipperCity: 'Dubai',
                city: 'Sharjah',
                serviceType: 'SDD',
                status: 'delivered',
                weight: 1.2,
                createdDaysAgo: 20,
                deliveredDaysAgo: 20,
                estimatedDays: 0,
                codAmount: null
            },
            {
                waybillNumber: `PX${year}0003`,
                shipperCity: 'Dubai',
                city: 'Abu Dhabi',
                serviceType: 'DOM',
                status: 'delivered',
                weight: 3.5,
                createdDaysAgo: 18,
                deliveredDaysAgo: 17,
                estimatedDays: 1,
                codAmount: '250.00'
            },
            {
                waybillNumber: `PX${year}0004`,
                shipperCity: 'Sharjah',
                city: 'Dubai',
                serviceType: 'DOM',
                status: 'delivered',
                weight: 5.0,
                createdDaysAgo: 15,
                deliveredDaysAgo: 14,
                estimatedDays: 1,
                codAmount: null
            },
            {
                waybillNumber: `PX${year}0005`,
                shipperCity: 'Dubai',
                city: 'Al Ain',
                serviceType: 'DOM',
                status: 'delivered',
                weight: 2.0,
                createdDaysAgo: 12,
                deliveredDaysAgo: 11,
                estimatedDays: 1,
                codAmount: '100.00'
            },
            {
                waybillNumber: `PX${year}0006`,
                shipperCity: 'Dubai',
                city: 'Sharjah',
                serviceType: 'SDD',
                status: 'in_transit',
                weight: 1.5,
                createdDaysAgo: 5,
                deliveredDaysAgo: null,
                estimatedDays: 0,
                codAmount: null
            },
            {
                waybillNumber: `PX${year}0007`,
                shipperCity: 'Dubai',
                city: 'Abu Dhabi',
                serviceType: 'DOM',
                status: 'out_for_delivery',
                weight: 4.0,
                createdDaysAgo: 3,
                deliveredDaysAgo: null,
                estimatedDays: 1,
                codAmount: '300.00'
            },
            {
                waybillNumber: `PX${year}0008`,
                shipperCity: 'Abu Dhabi',
                city: 'Dubai',
                serviceType: 'DOM',
                status: 'pending_pickup',
                weight: 2.8,
                createdDaysAgo: 1,
                deliveredDaysAgo: null,
                estimatedDays: 1,
                codAmount: null
            }
        ];

        // Insert shipments
        for (const shipment of shipments) {
            const createdAt = new Date();
            createdAt.setDate(createdAt.getDate() - shipment.createdDaysAgo);

            const deliveryDateEstimated = new Date(createdAt);
            deliveryDateEstimated.setDate(deliveryDateEstimated.getDate() + shipment.estimatedDays);

            let deliveryDateReal = null;
            if (shipment.deliveredDaysAgo !== null) {
                deliveryDateReal = new Date();
                deliveryDateReal.setDate(deliveryDateReal.getDate() - shipment.deliveredDaysAgo);
            }

            const sql = `
        INSERT INTO orders (
          clientId, waybillNumber, shipperName, shipperAddress, shipperCity, shipperCountry, shipperPhone,
          customerName, customerPhone, address, city, destinationCountry, pieces, weight, serviceType,
          status, createdAt, deliveryDateEstimated, deliveryDateReal, lastStatusUpdate, codRequired
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

            await connection.execute(sql, [
                clientId,
                shipment.waybillNumber,
                'Test Shipper Co.',
                '123 Test Street',
                shipment.shipperCity,
                'UAE',
                '+971501234567',
                'Test Customer',
                '+971509876543',
                '456 Delivery Avenue',
                shipment.city,
                'UAE',
                1,
                shipment.weight,
                shipment.serviceType,
                shipment.status,
                createdAt,
                deliveryDateEstimated,
                deliveryDateReal,
                deliveryDateReal || createdAt,
                shipment.codAmount ? 1 : 0
            ]);

            // Get the inserted order ID
            const [result] = await connection.execute('SELECT LAST_INSERT_ID() as id');
            const orderId = result[0].id;

            console.log(`  ✓ Creado envío: ${shipment.waybillNumber} (${shipment.status})`);

            // Create COD record if needed
            if (shipment.codAmount) {
                await connection.execute(`
          INSERT INTO codRecords (shipmentId, codAmount, codCurrency, status, createdAt, updatedAt)
          VALUES (?, ?, 'AED', 'pending_collection', NOW(), NOW())
        `, [orderId, shipment.codAmount]);

                console.log(`    + COD: ${shipment.codAmount} AED`);
            }

            // Create tracking events
            await connection.execute(`
        INSERT INTO trackingEvents (shipmentId, eventDatetime, statusCode, statusLabel, description, createdAt)
        VALUES (?, ?, 'pending_pickup', 'PENDING PICKUP', 'Shipment created', NOW())
      `, [orderId, createdAt]);

            if (shipment.status === 'delivered' && deliveryDateReal) {
                await connection.execute(`
          INSERT INTO trackingEvents (shipmentId, eventDatetime, statusCode, statusLabel, description, createdAt)
          VALUES (?, ?, 'delivered', 'DELIVERED', 'Package delivered successfully', NOW())
        `, [orderId, deliveryDateReal]);
            } else if (shipment.status === 'in_transit') {
                await connection.execute(`
          INSERT INTO trackingEvents (shipmentId, eventDatetime, statusCode, statusLabel, description, createdAt)
          VALUES (?, ?, 'in_transit', 'IN TRANSIT', 'Package in transit', NOW())
        `, [orderId, createdAt]);
            } else if (shipment.status === 'out_for_delivery') {
                await connection.execute(`
          INSERT INTO trackingEvents (shipmentId, eventDatetime, statusCode, statusLabel, description, createdAt)
          VALUES (?, ?, 'out_for_delivery', 'OUT FOR DELIVERY', 'Package out for delivery', NOW())
        `, [orderId, new Date()]);
            }
        }

        console.log('\n✅ Datos de prueba creados exitosamente!');
        console.log('\n📊 Resumen:');
        console.log(`   - ${shipments.length} envíos creados`);
        console.log(`   - ${shipments.filter(s => s.codAmount).length} envíos con COD`);
        console.log(`   - ${shipments.filter(s => s.status === 'delivered').length} envíos entregados`);
        console.log(`   - ${shipments.filter(s => s.status !== 'delivered').length} envíos activos`);
        console.log('\n🚀 Ahora puedes iniciar sesión con:');
        console.log('   Email: client1@pathxpress.net');
        console.log('   Password: client123');

        await connection.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error creando datos de prueba:');
        console.error(err);
        process.exit(1);
    }
}

seedTestData();
