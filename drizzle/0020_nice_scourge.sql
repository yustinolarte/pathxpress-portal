ALTER TABLE `clientAccounts` ADD `zone1BaseRate` varchar(20);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `zone1PerKg` varchar(20);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `zone2BaseRate` varchar(20);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `zone2PerKg` varchar(20);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `zone3BaseRate` varchar(20);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `zone3PerKg` varchar(20);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `whatsappNumber` varchar(30);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `bulletCutoffTime` varchar(5);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `sdCutoffTime` varchar(5);--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `paymentLink` varchar(512);