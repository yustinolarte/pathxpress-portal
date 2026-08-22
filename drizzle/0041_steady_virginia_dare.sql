ALTER TABLE `savedShippers` ADD `latitude` varchar(50);--> statement-breakpoint
ALTER TABLE `savedShippers` ADD `longitude` varchar(50);--> statement-breakpoint
ALTER TABLE `savedShippers` ADD `isDefault` int DEFAULT 0 NOT NULL;