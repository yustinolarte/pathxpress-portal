ALTER TABLE `routeOrders` ADD `proofPhotoUrl2` text; -- --> statement-breakpoint
ALTER TABLE `trackingEvents` ADD `podFileUrl2` varchar(500);--> statement-breakpoint

-- meta/0023_snapshot.json has always included these two (present from snapshot
-- 23 onward, absent in 0022's), but the statements were missing from this
-- file — they were applied to production by hand via
-- drizzle/migrations/add_client_settlement_period.sql and
-- drizzle/migrations/add_settlement_period.sql, never through drizzle-kit.
-- Discovered 2026-08-12 running drizzle-kit migrate against a brand-new empty
-- database for the first time ever.
ALTER TABLE `clientAccounts` ADD COLUMN `defaultSettlementPeriod` ENUM('weekly','biweekly','monthly','custom') NOT NULL DEFAULT 'custom';--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN `settlementPeriod` ENUM('weekly','biweekly','monthly','custom') NOT NULL DEFAULT 'custom';
