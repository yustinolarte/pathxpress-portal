import { drizzle } from 'drizzle-orm/mysql2';
import bcrypt from 'bcryptjs';

const db = drizzle(process.env.DATABASE_URL);

async function seed() {
  console.log('🌱 Seeding portal data...');

  try {
    // Hash password for demo users
    const adminPassword = await bcrypt.hash('admin123', 10);
    const customerPassword = await bcrypt.hash('customer123', 10);

    // 1. Create admin user
    console.log('Creating admin user...');
    const adminResult = await db.execute(`
      INSERT INTO portalUsers (email, passwordHash, role, status, createdAt, updatedAt)
      VALUES ('admin@pathxpress.ae', '${adminPassword}', 'admin', 'active', NOW(), NOW())
      ON DUPLICATE KEY UPDATE email=email
    `);
    console.log('✅ Admin user created (email: admin@pathxpress.ae, password: admin123)');

    // 2. Create client account
    console.log('Creating client account...');
    const clientResult = await db.execute(`
      INSERT INTO clientAccounts (
        companyName, contactName, phone, billingEmail, billingAddress,
        country, city, defaultCurrency, codAllowed, status, createdAt, updatedAt
      )
      VALUES (
        'Tech Solutions LLC',
        'Mohammed Ahmed',
        '+971501234567',
        'billing@techsolutions.ae',
        'Office 301, Business Bay Tower, Dubai',
        'UAE',
        'Dubai',
        'AED',
        1,
        'active',
        NOW(),
        NOW()
      )
      ON DUPLICATE KEY UPDATE companyName=companyName
    `);
    
    // Get the client ID
    const clientIdResult = await db.execute(`
      SELECT id FROM clientAccounts WHERE billingEmail = 'billing@techsolutions.ae' LIMIT 1
    `);
    const clientId = clientIdResult[0]?.[0]?.id;
    console.log(`✅ Client account created (ID: ${clientId})`);

    // 3. Create customer user linked to client
    console.log('Creating customer user...');
    await db.execute(`
      INSERT INTO portalUsers (email, passwordHash, role, clientId, status, createdAt, updatedAt)
      VALUES ('customer@techsolutions.ae', '${customerPassword}', 'customer', ${clientId}, 'active', NOW(), NOW())
      ON DUPLICATE KEY UPDATE email=email
    `);
    console.log('✅ Customer user created (email: customer@techsolutions.ae, password: customer123)');

    // 4. Create sample orders
    console.log('Creating sample orders...');
    
    const orders = [
      {
        waybill: 'PX202500001',
        customerName: 'Ali Hassan',
        customerPhone: '+971509876543',
        address: 'Villa 123, Al Barsha, Dubai',
        city: 'Dubai',
        emirate: 'Dubai',
        country: 'UAE',
        serviceType: 'standard',
        status: 'delivered',
        weight: '2.5',
      },
      {
        waybill: 'PX202500002',
        customerName: 'Sara Ahmed',
        customerPhone: '+971501111222',
        address: 'Apartment 45, Marina Heights, Dubai',
        city: 'Dubai',
        emirate: 'Dubai',
        country: 'UAE',
        serviceType: 'express',
        status: 'in_transit',
        weight: '1.2',
      },
      {
        waybill: 'PX202500003',
        customerName: 'Fatima Al Mansoori',
        customerPhone: '+971502223333',
        address: 'Office 12, Khalifa City, Abu Dhabi',
        city: 'Abu Dhabi',
        emirate: 'Abu Dhabi',
        country: 'UAE',
        serviceType: 'same-day',
        status: 'out_for_delivery',
        weight: '0.8',
      },
      {
        waybill: 'PX202500004',
        customerName: 'Omar Abdullah',
        customerPhone: '+971503334444',
        address: 'Building 7, Al Nahda, Sharjah',
        city: 'Sharjah',
        emirate: 'Sharjah',
        country: 'UAE',
        serviceType: 'standard',
        status: 'pending_pickup',
        weight: '3.5',
      },
    ];

    for (const order of orders) {
      await db.execute(`
        INSERT INTO orders (
          clientId, waybillNumber, shipperName, shipperAddress, shipperCity, shipperCountry, shipperPhone,
          customerName, customerPhone, address, city, emirate, destinationCountry,
          pieces, weight, serviceType, status, lastStatusUpdate, createdAt, updatedAt
        )
        VALUES (
          ${clientId},
          '${order.waybill}',
          'Tech Solutions LLC',
          'Office 301, Business Bay Tower, Dubai',
          'Dubai',
          'UAE',
          '+971501234567',
          '${order.customerName}',
          '${order.customerPhone}',
          '${order.address}',
          '${order.city}',
          '${order.emirate}',
          '${order.country}',
          1,
          '${order.weight}',
          '${order.serviceType}',
          '${order.status}',
          NOW(),
          NOW(),
          NOW()
        )
        ON DUPLICATE KEY UPDATE waybillNumber=waybillNumber
      `);
      console.log(`✅ Order ${order.waybill} created`);
    }

    // 5. Create tracking events for orders
    console.log('Creating tracking events...');
    
    // Get order IDs
    const ordersResult = await db.execute(`
      SELECT id, waybillNumber, status FROM orders WHERE clientId = ${clientId}
    `);

    for (const order of ordersResult[0]) {
      // Create initial event
      await db.execute(`
        INSERT INTO trackingEvents (shipmentId, eventDatetime, statusCode, statusLabel, description, createdBy, createdAt)
        VALUES (
          ${order.id},
          DATE_SUB(NOW(), INTERVAL 2 DAY),
          'pending_pickup',
          'PENDING PICKUP',
          'Shipment created and awaiting pickup',
          'system',
          NOW()
        )
      `);

      // Add more events based on status
      if (order.status !== 'pending_pickup') {
        await db.execute(`
          INSERT INTO trackingEvents (shipmentId, eventDatetime, statusCode, statusLabel, description, createdBy, createdAt)
          VALUES (
            ${order.id},
            DATE_SUB(NOW(), INTERVAL 1 DAY),
            'picked_up',
            'PICKED UP',
            'Package picked up from sender',
            'system',
            NOW()
          )
        `);
      }

      if (order.status === 'in_transit' || order.status === 'out_for_delivery' || order.status === 'delivered') {
        await db.execute(`
          INSERT INTO trackingEvents (shipmentId, eventDatetime, statusCode, statusLabel, description, createdBy, createdAt)
          VALUES (
            ${order.id},
            DATE_SUB(NOW(), INTERVAL 12 HOUR),
            'in_transit',
            'IN TRANSIT',
            'Package in transit to destination',
            'system',
            NOW()
          )
        `);
      }

      if (order.status === 'out_for_delivery' || order.status === 'delivered') {
        await db.execute(`
          INSERT INTO trackingEvents (shipmentId, eventDatetime, statusCode, statusLabel, description, createdBy, createdAt)
          VALUES (
            ${order.id},
            DATE_SUB(NOW(), INTERVAL 2 HOUR),
            'out_for_delivery',
            'OUT FOR DELIVERY',
            'Package out for delivery',
            'system',
            NOW()
          )
        `);
      }

      if (order.status === 'delivered') {
        await db.execute(`
          INSERT INTO trackingEvents (shipmentId, eventDatetime, statusCode, statusLabel, description, createdBy, createdAt)
          VALUES (
            ${order.id},
            NOW(),
            'delivered',
            'DELIVERED',
            'Package delivered successfully',
            'system',
            NOW()
          )
        `);
      }
    }
    console.log('✅ Tracking events created');

    console.log('\n🎉 Seed data created successfully!');
    console.log('\n📝 Login credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👨‍💼 Admin Portal:');
    console.log('   Email: admin@pathxpress.ae');
    console.log('   Password: admin123');
    console.log('   URL: /portal/login');
    console.log('');
    console.log('👤 Customer Portal:');
    console.log('   Email: customer@techsolutions.ae');
    console.log('   Password: customer123');
    console.log('   URL: /portal/login');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }

  process.exit(0);
}

seed();
