ALTER TABLE `invoices` ADD `type` enum('domestic','international') DEFAULT 'domestic' NOT NULL;--> statement-breakpoint
CREATE INDEX `invoices_type_idx` ON `invoices` (`type`);