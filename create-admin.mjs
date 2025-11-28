import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

async function createAdmin() {
    try {
        if (!DATABASE_URL) {
            console.error('❌ No hay DATABASE_URL en el .env');
            process.exit(1);
        }

        console.log('Conectando a DB con', DATABASE_URL);

        const connection = await mysql.createConnection(DATABASE_URL);

        const email = 'admin@pathxpress.ae';
        const plainPassword = 'admin123';

        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        // Ajusta los nombres de columnas a los de tu tabla portalUsers.
        // Según la guía de Manus suelen ser: id, email, passwordHash, role, createdAt, updatedAt
        const sql = `
      INSERT INTO portalUsers (email, passwordHash, role, createdAt, updatedAt)
      VALUES (?, ?, 'admin', NOW(), NOW())
    `;

        await connection.execute(sql, [email, hashedPassword]);

        console.log('✅ Admin creado correctamente');
        console.log('   Email:    ' + email);
        console.log('   Password: ' + plainPassword);
        console.log('⚠️ Cambia esta contraseña después de probar el login.');

        await connection.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error creando admin:');
        console.error(err);
        process.exit(1);
    }
}

createAdmin();
