-- Marks an order as deliberately non-billable so it stops showing up as a
-- pending shipment in the billing panel forever. Needed for shipments we
-- decide not to charge (goodwill, our own error, historical cleanup) — until
-- now the only way to hide them was to cancel the order, which falsifies the
-- operational status.
ALTER TABLE `orders` ADD COLUMN `billingExcluded` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `orders` ADD COLUMN `billingExcludedReason` varchar(255) DEFAULT NULL;
