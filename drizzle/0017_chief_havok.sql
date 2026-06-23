CREATE TABLE `internationalCountryMaps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`country` varchar(100) NOT NULL,
	`zone` varchar(20),
	`primeEligible` int NOT NULL DEFAULT 0,
	`gccEligible` int NOT NULL DEFAULT 0,
	`riskFlag` int NOT NULL DEFAULT 0,
	`isActive` int NOT NULL DEFAULT 1,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `internationalCountryMaps_id` PRIMARY KEY(`id`),
	CONSTRAINT `internationalCountryMaps_country_unique` UNIQUE(`country`)
);
--> statement-breakpoint
CREATE TABLE `internationalRates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rateType` enum('prime','gcc','premium') NOT NULL,
	`country` varchar(100),
	`zone` varchar(20),
	`weightBracket` varchar(10) NOT NULL,
	`serviceKey` varchar(50),
	`price` decimal(10,2) NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `internationalRates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `codRecords` MODIFY COLUMN `status` enum('pending_collection','collected','remitted','disputed','cancelled') NOT NULL DEFAULT 'pending_collection';--> statement-breakpoint
ALTER TABLE `routeOrders` MODIFY COLUMN `status` enum('pending','in_progress','picked_up','delivered','attempted','returned','failed','on_hold') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `fodAllowed` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `fodFee` varchar(20);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `intlAllowed` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `intlDiscountPercent` varchar(10);--> statement-breakpoint
ALTER TABLE `orders` ADD `itemsDescription` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `fitOnDelivery` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `routeOrders` ADD `collectedAmount` varchar(50);