CREATE TABLE `passwordResetTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portalUserId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `passwordResetTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `passwordResetTokens_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `payAtOrigin` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `sentToClient` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `sentAt` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `originPaymentCollected` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `originPaymentMethod` varchar(10);--> statement-breakpoint
ALTER TABLE `orders` ADD `originPaymentAmount` varchar(50);--> statement-breakpoint
ALTER TABLE `orders` ADD `originPaymentReference` varchar(100);--> statement-breakpoint
ALTER TABLE `orders` ADD `originPaymentCollectedAt` timestamp;--> statement-breakpoint
ALTER TABLE `quoteRequests` ADD `status` enum('new','contacted','scheduled','completed') DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE `quoteRequests` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
CREATE INDEX `passwordResetTokens_user_idx` ON `passwordResetTokens` (`portalUserId`);--> statement-breakpoint
CREATE INDEX `passwordResetTokens_expiry_idx` ON `passwordResetTokens` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `quoteRequests_status_createdAt_idx` ON `quoteRequests` (`status`,`createdAt`);