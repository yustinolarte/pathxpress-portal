#!/usr/bin/env node
/**
 * Script to add a new portal user with properly hashed password
 * Usage: node add-portal-user.mjs
 */

import { createInterface } from 'readline';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('\n=== PATHXPRESS Portal User Creation ===\n');

  try {
    // Get user input
    const email = await question('Email: ');
    const password = await question('Password: ');
    const role = await question('Role (admin/customer): ');
    
    if (!['admin', 'customer'].includes(role)) {
      console.error('Error: Role must be either "admin" or "customer"');
      process.exit(1);
    }

    let clientId = null;
    if (role === 'customer') {
      clientId = await question('Client ID (from clientAccounts table): ');
      clientId = parseInt(clientId);
      if (isNaN(clientId)) {
        console.error('Error: Client ID must be a number');
        process.exit(1);
      }
    }

    // Hash password
    console.log('\nHashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Connect to database
    console.log('Connecting to database...');
    const connection = await mysql.createConnection(process.env.DATABASE_URL);

    // Check if email already exists
    const [existing] = await connection.execute(
      'SELECT id FROM portalUsers WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      console.error(`\nError: User with email "${email}" already exists!`);
      await connection.end();
      process.exit(1);
    }

    // Insert user
    console.log('Creating user...');
    const [result] = await connection.execute(
      'INSERT INTO portalUsers (email, passwordHash, role, clientId, createdAt, lastSignedIn) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [email, hashedPassword, role, clientId]
    );

    console.log(`\n✅ User created successfully!`);
    console.log(`   ID: ${result.insertId}`);
    console.log(`   Email: ${email}`);
    console.log(`   Role: ${role}`);
    if (clientId) {
      console.log(`   Client ID: ${clientId}`);
    }
    console.log(`\nYou can now login at: /portal/login\n`);

    await connection.end();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
