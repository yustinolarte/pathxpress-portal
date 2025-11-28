import mysql from 'mysql2/promise';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

async function createClientAccount() {
    try {
        if (!DATABASE_URL) {
            console.error('❌ No hay DATABASE_URL en el .env');
            process.exit(1);
        }

        console.log('Conectando a DB con', DATABASE_URL);
        const connection = await mysql.createConnection(DATABASE_URL);

        // Create client account
        const clientSql = `
      INSERT INTO clientAccounts (
        companyName, contactName, phone, billingEmail, billingAddress, 
        country, city, defaultCurrency, status, createdAt, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

        const [result] = await connection.execute(clientSql, [
            'Test Company LLC',
            'John Doe',
            '+971501234567',
            'billing@testcompany.ae',
            'Business Bay, Dubai',
            'UAE',
            'Dubai',
            'AED',
            'active'
        ]);

        const clientId = result.insertId;
        console.log('✅ Cliente creado con ID:', clientId);

        // Update the portal user with clientId
        await connection.execute(
            'UPDATE portalUsers SET clientId = ? WHERE email = ?',
            [clientId, 'client1@pathxpress.net']
        );

        console.log('✅ Usuario actualizado con clientId');
        console.log('\n📋 Detalles de la cuenta:');
        console.log('   Company: Test Company LLC');
        console.log('   Contact: John Doe');
        console.log('   Email: billing@testcompany.ae');
        console.log('   ClientID:', clientId);

        await connection.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error creando cuenta de cliente:');
        console.error(err);
        process.exit(1);
    }
}

createClientAccount();
