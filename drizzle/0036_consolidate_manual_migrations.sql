-- DO NOT RUN THIS FILE. drizzle-kit generate produced it to bring meta/_journal.json
-- back in sync with schema.ts, but every statement below was already applied to the
-- live database by hand, before this file existed:
--   ALTER TABLE driverRoutes ADD cashRemittedAt/cashRemittedAmount -> drizzle/0032_driver_cash_remittance.sql
--   ALTER TABLE orders ADD billingExcluded/billingExcludedReason   -> drizzle/0033_order_billing_excluded.sql
--   CREATE INDEX driverShifts_driverId_endTime_idx                -> drizzle/0034_driver_shifts_driver_endtime_idx.sql (scripts/add-driver-shifts-index.ts)
--   CREATE INDEX routeOrders_routeId_sequence_idx                 -> drizzle/0035_route_orders_sequence_idx.sql (scripts/add-route-orders-sequence-index.ts)
-- Running it would fail with duplicate column/index errors. It exists purely so the
-- next `drizzle-kit generate` diffs against a snapshot that matches reality. See
-- drizzle/MIGRATIONS_NOTES.md for the full history of this journal reconciliation.
ALTER TABLE `driverRoutes` ADD `cashRemittedAt` timestamp;--> statement-breakpoint
ALTER TABLE `driverRoutes` ADD `cashRemittedAmount` decimal(10,2);--> statement-breakpoint
ALTER TABLE `orders` ADD `billingExcluded` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `billingExcludedReason` varchar(255);--> statement-breakpoint
CREATE INDEX `driverShifts_driverId_endTime_idx` ON `driverShifts` (`driverId`,`endTime`);--> statement-breakpoint
CREATE INDEX `routeOrders_routeId_sequence_idx` ON `routeOrders` (`routeId`,`sequence`);