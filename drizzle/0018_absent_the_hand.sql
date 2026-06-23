ALTER TABLE `clientAccounts` ADD `bulletAllowed` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `customBulletBaseRate` varchar(20);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `customBulletPerKg` varchar(20);--> statement-breakpoint
ALTER TABLE `orders` ADD `shopifyReturnId` varchar(100);--> statement-breakpoint
ALTER TABLE `orders` ADD `source` varchar(20) DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE `orders` ADD `customsValue` varchar(50);--> statement-breakpoint
ALTER TABLE `orders` ADD `customsCurrency` varchar(10);--> statement-breakpoint
ALTER TABLE `orders` ADD `customsDescription` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `hsCode` varchar(20);