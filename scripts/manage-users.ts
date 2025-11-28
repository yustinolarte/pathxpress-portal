/**
 * User Management Script for PATHXPRESS Portal
 * 
 * This script allows you to create admin and customer users for the portal system.
 * It properly hashes passwords and creates the necessary database records.
 * 
 * Usage:
 *   pnpm tsx scripts/manage-users.ts
 */

import { hashPassword } from '../server/portalAuth';
import { createPortalUser, createClientAccount } from '../server/db';

interface UserData {
  email: string;
  password: string;
  role: 'admin' | 'customer';
  name?: string;
  companyName?: string;
  billingAddress?: string;
  billingEmail?: string;
  paymentTerms?: number;
  currency?: string;
}

async function createUser(userData: UserData) {
  try {
    console.log(`\n📝 Creating ${userData.role} user: ${userData.email}`);
    
    // Hash the password
    const hashedPassword = await hashPassword(userData.password);
    
    // Create the portal user
    const userId = await createPortalUser({
      email: userData.email,
      password: hashedPassword,
      role: userData.role,
      name: userData.name || null,
    });
    
    console.log(`✅ Portal user created with ID: ${userId}`);
    
    // If customer, create client account
    if (userData.role === 'customer' && userData.companyName) {
      const clientId = await createClientAccount({
        companyName: userData.companyName,
        billingAddress: userData.billingAddress || null,
        billingEmail: userData.billingEmail || userData.email,
        paymentTerms: userData.paymentTerms || 30,
        currency: userData.currency || 'AED',
        creditLimit: '0',
        currentBalance: '0',
        status: 'active',
        portalUserId: userId,
      });
      
      console.log(`✅ Client account created with ID: ${clientId}`);
    }
    
    console.log(`\n🎉 User created successfully!`);
    console.log(`   Email: ${userData.email}`);
    console.log(`   Password: ${userData.password}`);
    console.log(`   Role: ${userData.role}`);
    
  } catch (error) {
    console.error(`\n❌ Error creating user:`, error);
    throw error;
  }
}

// Example usage - modify these as needed
async function main() {
  console.log('🚀 PATHXPRESS User Management Script\n');
  console.log('=' .repeat(50));
  
  // Example 1: Create an admin user
  await createUser({
    email: 'newadmin@pathxpress.ae',
    password: 'admin123',
    role: 'admin',
    name: 'New Admin User',
  });
  
  // Example 2: Create a customer user with client account
  await createUser({
    email: 'customer@example.com',
    password: 'customer123',
    role: 'customer',
    name: 'John Doe',
    companyName: 'Example Company LLC',
    billingAddress: 'Office 123, Business Tower, Dubai',
    billingEmail: 'billing@example.com',
    paymentTerms: 30,
    currency: 'AED',
  });
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ All users created successfully!\n');
  
  process.exit(0);
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
