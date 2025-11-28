import { drizzle } from 'drizzle-orm/mysql2';
import { codRecords, orders, clientAccounts } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

const db = drizzle(process.env.DATABASE_URL!);

async function seedCODData() {
  console.log('🌱 Seeding COD data...');

  try {
    // Get existing orders
    const existingOrders = await db.select().from(orders).limit(10);
    
    if (existingOrders.length === 0) {
      console.log('❌ No orders found. Please run seed-data.ts first.');
      return;
    }

    // Get clients
    const clients = await db.select().from(clientAccounts).limit(5);

    if (clients.length === 0) {
      console.log('❌ No clients found. Please run seed-data.ts first.');
      return;
    }

    // Create COD records for some orders
    const codData = [
      {
        shipmentId: existingOrders[0]?.id || 1,
        codAmount: '250.00',
        codCurrency: 'AED',
        status: 'collected' as const,
        collectedDate: new Date('2024-11-20'),
        remittedToClientDate: null,
        notes: 'COD collected successfully',
      },
      {
        shipmentId: existingOrders[1]?.id || 2,
        codAmount: '180.00',
        codCurrency: 'AED',
        status: 'collected' as const,
        collectedDate: new Date('2024-11-21'),
        remittedToClientDate: null,
        notes: 'Payment collected in cash',
      },
      {
        shipmentId: existingOrders[2]?.id || 3,
        codAmount: '420.00',
        codCurrency: 'AED',
        status: 'pending_collection' as const,
        collectedDate: null,
        remittedToClientDate: null,
        notes: 'Awaiting delivery',
      },
      {
        shipmentId: existingOrders[3]?.id || 4,
        codAmount: '95.50',
        codCurrency: 'AED',
        status: 'collected' as const,
        collectedDate: new Date('2024-11-22'),
        remittedToClientDate: null,
        notes: 'Cash collected from customer',
      },
    ];

    // Check if COD records already exist
    const existingCOD = await db.select().from(codRecords).limit(1);
    
    if (existingCOD.length > 0) {
      console.log('⚠️  COD records already exist. Skipping seed.');
      return;
    }

    // Insert COD records
    for (const cod of codData) {
      await db.insert(codRecords).values(cod);
    }

    console.log(`✅ Created ${codData.length} COD records`);
    console.log('');
    console.log('📊 COD Summary:');
    console.log(`   - Pending Collection: ${codData.filter(c => c.status === 'pending_collection').length} records`);
    console.log(`   - Collected: ${codData.filter(c => c.status === 'collected').length} records`);
    console.log('');
    console.log('💡 Next steps:');
    console.log('   1. Login to admin portal: admin@pathxpress.ae / admin123');
    console.log('   2. Go to "COD Management" tab');
    console.log('   3. Click "Create Remittance" to process collected COD amounts');
    console.log('');

  } catch (error) {
    console.error('❌ Error seeding COD data:', error);
    throw error;
  }
}

seedCODData()
  .then(() => {
    console.log('✅ COD data seeding completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ COD data seeding failed:', error);
    process.exit(1);
  });
