/**
 * Script to fix Noor and Grace orders
 * 
 * 1. PX202600008 - Should be marked as a return
 * 2. PX202600011 and PX202600012 - Should be marked as exchange and connected
 * 
 * Run with: npx tsx scripts/fix-noor-grace-orders.ts
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
    if (!DATABASE_URL) {
        console.error('❌ DATABASE_URL not found in environment');
        process.exit(1);
    }

    // Parse DATABASE_URL
    const url = new URL(DATABASE_URL);
    const connection = await mysql.createConnection({
        host: url.hostname,
        port: parseInt(url.port || '3306'),
        user: url.username,
        password: url.password,
        database: url.pathname.slice(1), // Remove leading /
        ssl: { rejectUnauthorized: false }
    });

    console.log('✅ Connected to database');

    try {
        // 1. Fix PX202600008 - Mark as return
        console.log('\n📦 Fixing PX202600008 (marking as return)...');

        const [order008] = await connection.query(
            `SELECT id, waybillNumber, orderType, isReturn FROM orders WHERE waybillNumber LIKE '%008'`
        ) as any;

        if (order008.length > 0) {
            const orderId = order008[0].id;
            console.log(`   Found order: ${order008[0].waybillNumber} (ID: ${orderId})`);
            console.log(`   Current: orderType=${order008[0].orderType}, isReturn=${order008[0].isReturn}`);

            await connection.query(
                `UPDATE orders SET orderType = 'return', isReturn = 1 WHERE id = ?`,
                [orderId]
            );
            console.log(`   ✅ Updated to: orderType='return', isReturn=1`);
        } else {
            console.log('   ⚠️ Order ending in 008 not found');
        }

        // 2. Fix PX202600011 and PX202600012 - Mark as exchange and connect them
        console.log('\n📦 Fixing PX202600011 and PX202600012 (marking as exchange)...');

        const [order011] = await connection.query(
            `SELECT id, waybillNumber, orderType, exchangeOrderId FROM orders WHERE waybillNumber LIKE '%011'`
        ) as any;

        const [order012] = await connection.query(
            `SELECT id, waybillNumber, orderType, exchangeOrderId FROM orders WHERE waybillNumber LIKE '%012'`
        ) as any;

        if (order011.length > 0 && order012.length > 0) {
            const orderId011 = order011[0].id;
            const orderId012 = order012[0].id;

            console.log(`   Found order 011: ${order011[0].waybillNumber} (ID: ${orderId011})`);
            console.log(`   Found order 012: ${order012[0].waybillNumber} (ID: ${orderId012})`);

            // Update order 011 - this is the return part of the exchange
            await connection.query(
                `UPDATE orders SET orderType = 'exchange', isReturn = 1, exchangeOrderId = ? WHERE id = ?`,
                [orderId012, orderId011]
            );
            console.log(`   ✅ PX202600011 updated: orderType='exchange', isReturn=1, exchangeOrderId=${orderId012}`);

            // Update order 012 - this is the new shipment part of the exchange
            await connection.query(
                `UPDATE orders SET orderType = 'exchange', exchangeOrderId = ? WHERE id = ?`,
                [orderId011, orderId012]
            );
            console.log(`   ✅ PX202600012 updated: orderType='exchange', exchangeOrderId=${orderId011}`);

        } else {
            if (order011.length === 0) console.log('   ⚠️ Order ending in 011 not found');
            if (order012.length === 0) console.log('   ⚠️ Order ending in 012 not found');
        }

        // Verify changes
        console.log('\n📋 Verifying changes...');

        const [verifyOrders] = await connection.query(
            `SELECT waybillNumber, orderType, isReturn, exchangeOrderId 
       FROM orders 
       WHERE waybillNumber LIKE '%008' OR waybillNumber LIKE '%011' OR waybillNumber LIKE '%012'
       ORDER BY waybillNumber`
        ) as any;

        console.log('\n   Current state:');
        verifyOrders.forEach((order: any) => {
            console.log(`   ${order.waybillNumber}: orderType=${order.orderType}, isReturn=${order.isReturn}, exchangeOrderId=${order.exchangeOrderId || 'null'}`);
        });

        console.log('\n✅ All corrections applied successfully!');

    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await connection.end();
        console.log('\n👋 Database connection closed');
    }
}

main();
