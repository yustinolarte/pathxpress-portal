ALTER TABLE `orders` ADD `locationAccuracy` varchar(20) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipperLat` varchar(50);--> statement-breakpoint
ALTER TABLE `orders` ADD `shipperLng` varchar(50);--> statement-breakpoint
UPDATE `orders` SET `locationAccuracy` = 'exact' WHERE `latitude` IS NOT NULL AND `latitude` != '';