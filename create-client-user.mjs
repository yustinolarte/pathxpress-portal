import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import 'dotenv/config';
import readline from 'readline';

const DATABASE_URL = process.env.DATABASE_URL;

async function createClient() {
    try {
        if (!DATABASE_URL) {
            console.error('❌ No hay DATABASE_URL en el .env');
            process.exit(1);
        }

        console.log('Conectando a DB con', DATABASE_URL);

        const connection = await mysql.createConnection(DATABASE_URL);

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

        const email = await ask('Enter customer email: ');
        const plainPassword = await ask('Enter customer password: ');
        const clientIdInput = await ask('Enter Client ID (optional, press Enter to skip): ');

        rl.close();

        if (!email || !plainPassword) {
            console.error('❌ Email and password are required.');
            process.exit(1);
        }

        const clientId = clientIdInput.trim() ? parseInt(clientIdInput.trim()) : null;

        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        // Ajusta los nombres de columnas a los de tu tabla portalUsers.
        const sql = `
      INSERT INTO portalUsers (email, passwordHash, role, clientId, createdAt, updatedAt)
      VALUES (?, ?, 'customer', ?, NOW(), NOW())
    `;

        await connection.execute(sql, [email, hashedPassword, clientId]);

        console.log('✅ Cliente creado correctamente');
        console.log('   Email:    ' + email);
        console.log('   Password: ' + plainPassword);
        console.log('⚠️ Cambia esta contraseña después de probar el login.');

        await connection.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error creando cliente:');
        console.error(err);
        process.exit(1);
    }
}

createClient();
