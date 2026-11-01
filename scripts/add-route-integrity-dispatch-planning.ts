/**
 * Applies migration 0046 (route integrity + dispatch planning) to an existing
 * database. Idempotent: every step skips what's already there.
 *
 *   - routeAuditLog, driverCashHandovers tables
 *   - driverRoutes.plannedStartAt, orders.locationSource / locationVerifiedAt /
 *     shipperLocationSource / priorityOverride
 *   - indexes driverRoutes(status), driverRoutes(startedAt)
 *   - UNIQUE codRecords(shipmentId) — REFUSES while duplicates exist and lists
 *     them; resolve those first (scripts/inspect-route-integrity.ts reports them)
 *   - backfill of orders.locationSource ('geocode' / 'bot') for existing pins
 *
 * Usage: npx tsx scripts/add-route-integrity-dispatch-planning.ts
 *        (runs against DATABASE_URL — set it to the test DB to apply there)
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const TABLES: Array<[string, string]> = [
    ['routeAuditLog', `CREATE TABLE routeAuditLog (
        id int AUTO_INCREMENT NOT NULL PRIMARY KEY,
        routeId varchar(50),
        stopId int,
        orderId int,
        action varchar(50) NOT NULL,
        fromValue varchar(50),
        toValue varchar(50),
        actor varchar(100) NOT NULL,
        reason text,
        payload text,
        createdAt timestamp NOT NULL DEFAULT (now()),
        INDEX routeAuditLog_routeId_idx (routeId),
        INDEX routeAuditLog_orderId_idx (orderId),
        INDEX routeAuditLog_createdAt_idx (createdAt)
    )`],
    ['driverCashHandovers', `CREATE TABLE driverCashHandovers (
        id int AUTO_INCREMENT NOT NULL PRIMARY KEY,
        driverId int NOT NULL,
        amount decimal(10,2) NOT NULL,
        allocations text NOT NULL,
        receivedAt timestamp NOT NULL,
        receivedBy varchar(100) NOT NULL,
        note text,
        voidedAt timestamp NULL DEFAULT NULL,
        voidedBy varchar(100),
        voidReason text,
        createdAt timestamp NOT NULL DEFAULT (now()),
        INDEX driverCashHandovers_driverId_receivedAt_idx (driverId, receivedAt)
    )`],
];

const COLUMNS: Array<[string, string]> = [
    ['driverRoutes.plannedStartAt', 'ALTER TABLE driverRoutes ADD COLUMN plannedStartAt timestamp NULL DEFAULT NULL'],
    ['orders.locationSource', 'ALTER TABLE orders ADD COLUMN locationSource varchar(20) DEFAULT NULL'],
    ['orders.locationVerifiedAt', 'ALTER TABLE orders ADD COLUMN locationVerifiedAt timestamp NULL DEFAULT NULL'],
    ['orders.shipperLocationSource', 'ALTER TABLE orders ADD COLUMN shipperLocationSource varchar(20) DEFAULT NULL'],
    ['orders.priorityOverride', 'ALTER TABLE orders ADD COLUMN priorityOverride varchar(10) DEFAULT NULL'],
];

const INDEXES: Array<[string, string]> = [
    ['driverRoutes_status_idx', 'CREATE INDEX driverRoutes_status_idx ON driverRoutes (status)'],
    ['driverRoutes_startedAt_idx', 'CREATE INDEX driverRoutes_startedAt_idx ON driverRoutes (startedAt)'],
];

async function migrate() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    console.log(`🔌 Connecting to ${new URL(url).hostname}${new URL(url).pathname}...`);
    const connection = await mysql.createConnection({ uri: url });

    try {
        for (const [name, ddl] of TABLES) {
            try {
                await connection.query(ddl);
                console.log(`  ✅ table ${name} created`);
            } catch (error: any) {
                if (error.code !== 'ER_TABLE_EXISTS_ERROR') throw error;
                console.log(`  ⚠️ table ${name} already exists, skipping...`);
            }
        }

        for (const [name, ddl] of COLUMNS) {
            try {
                await connection.query(ddl);
                console.log(`  ✅ ${name} added`);
            } catch (error: any) {
                if (error.code !== 'ER_DUP_FIELDNAME') throw error;
                console.log(`  ⚠️ ${name} already exists, skipping...`);
            }
        }

        for (const [name, ddl] of INDEXES) {
            try {
                await connection.query(ddl);
                console.log(`  ✅ index ${name} created`);
            } catch (error: any) {
                if (error.code !== 'ER_DUP_KEYNAME') throw error;
                console.log(`  ⚠️ index ${name} already exists, skipping...`);
            }
        }

        // UNIQUE codRecords(shipmentId): add the unique key first, drop the old
        // plain index only once it exists, so the column is never unindexed.
        const [uniqueRows] = await connection.query(
            "SHOW INDEX FROM codRecords WHERE Key_name = 'codRecords_shipmentId_unique'",
        ) as any[];
        if ((uniqueRows as any[]).length === 0) {
            const [dupes] = await connection.query(
                `SELECT shipmentId, COUNT(*) n, GROUP_CONCAT(CONCAT(id, ':', status) ORDER BY id) records
                 FROM codRecords GROUP BY shipmentId HAVING n > 1 ORDER BY shipmentId`,
            ) as any[];
            if ((dupes as any[]).length > 0) {
                console.error(`\n❌ ${(dupes as any[]).length} shipments have more than one COD record — resolve them first:`);
                console.table(dupes);
                console.error('Nothing after this point was applied. Re-run once the duplicates are merged.');
                process.exit(2);
            }
            await connection.query('ALTER TABLE codRecords ADD CONSTRAINT codRecords_shipmentId_unique UNIQUE (shipmentId)');
            console.log('  ✅ unique codRecords(shipmentId) added');
        } else {
            console.log('  ⚠️ unique codRecords(shipmentId) already exists, skipping...');
        }
        try {
            await connection.query('DROP INDEX codRecords_shipmentId_idx ON codRecords');
            console.log('  ✅ old codRecords_shipmentId_idx dropped');
        } catch (error: any) {
            if (error.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw error;
            console.log('  ⚠️ old codRecords_shipmentId_idx already gone, skipping...');
        }

        // Backfill where existing pins came from. Only what the data proves:
        // a server geocode is 'approximate'; a pin the recipient shared through
        // the WhatsApp bot has a bot_orders row in a received state. Returns are
        // left alone — the bot wrote their pickup person's location into the
        // delivery columns (fixed going forward), so 'bot' there would be wrong.
        const [geo] = await connection.query(
            "UPDATE orders SET locationSource = 'geocode' WHERE locationSource IS NULL AND locationAccuracy = 'approximate'",
        ) as any[];
        console.log(`  ✅ locationSource='geocode' backfilled on ${(geo as any).affectedRows} orders`);
        try {
            const [bot] = await connection.query(
                `UPDATE orders o JOIN bot_orders b ON b.waybillNumber = o.waybillNumber
                 SET o.locationSource = 'bot', o.locationVerifiedAt = b.updatedAt
                 WHERE o.locationSource IS NULL AND o.locationAccuracy = 'exact' AND o.isReturn = 0
                   AND b.status IN ('location_received', 'reused')`,
            ) as any[];
            console.log(`  ✅ locationSource='bot' backfilled on ${(bot as any).affectedRows} orders`);
        } catch (error: any) {
            if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
            console.log('  ⚠️ bot_orders table not present, skipping bot backfill...');
        }

        console.log('\n✅ Migration 0046 completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

migrate();
