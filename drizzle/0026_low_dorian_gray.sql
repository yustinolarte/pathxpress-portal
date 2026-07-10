ALTER TABLE `clientAccounts` ADD `cardOnDeliveryAllowed` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `cardFeePercent` varchar(50);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `cardMinFee` varchar(50);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `cardMaxFee` varchar(50);--> statement-breakpoint
ALTER TABLE `codRecords` ADD `allowedMethods` varchar(10) DEFAULT 'cash' NOT NULL;--> statement-breakpoint
ALTER TABLE `codRecords` ADD `collectedMethod` varchar(10);--> statement-breakpoint
ALTER TABLE `codRecords` ADD `paymentReference` varchar(100);--> statement-breakpoint
ALTER TABLE `codRecords` ADD `feeAmount` varchar(50);--> statement-breakpoint
ALTER TABLE `orders` ADD `codPaymentMethod` varchar(10);