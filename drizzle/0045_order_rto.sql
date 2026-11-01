-- Return to Origin (RTO): the same waybill goes back to the shipper.
-- Apply to an existing database with scripts/add-order-rto.ts (idempotent),
-- never with drizzle-kit migrate — see drizzle/MIGRATIONS_NOTES.md.
ALTER TABLE `orders` ADD `isRto` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `rtoAt` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `rtoSnapshot` text;
