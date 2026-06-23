CREATE TABLE `rateTiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serviceType` enum('DOM','SDD') NOT NULL,
	`minVolume` int NOT NULL,
	`maxVolume` int,
	`baseRate` varchar(20) NOT NULL,
	`additionalKgRate` varchar(20) NOT NULL,
	`maxWeight` int NOT NULL DEFAULT 5,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rateTiers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `serviceConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configKey` varchar(100) NOT NULL,
	`configValue` text NOT NULL,
	`description` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `serviceConfig_id` PRIMARY KEY(`id`),
	CONSTRAINT `serviceConfig_configKey_unique` UNIQUE(`configKey`)
);
