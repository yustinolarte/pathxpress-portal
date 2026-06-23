ALTER TABLE `invoices` ADD `adjustmentNotes` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `isAdjusted` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `lastAdjustedBy` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD `lastAdjustedAt` timestamp;