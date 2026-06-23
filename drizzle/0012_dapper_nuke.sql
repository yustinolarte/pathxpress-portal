CREATE TABLE `contactMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`message` text NOT NULL,
	`status` enum('new','read','archived') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contactMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `weight` decimal(10,2) NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `volumetricWeight` decimal(10,2);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `length` decimal(10,2);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `width` decimal(10,2);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `height` decimal(10,2);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `codFeePercent` varchar(50);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `codMinFee` varchar(50);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `codMaxFee` varchar(50);--> statement-breakpoint
ALTER TABLE `codRemittances` ADD `grossAmount` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `codRemittances` ADD `feeAmount` varchar(50) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `codRemittances` ADD `feePercentage` varchar(10) DEFAULT '0' NOT NULL;