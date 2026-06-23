CREATE TABLE `codRemittanceItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`remittanceId` int NOT NULL,
	`codRecordId` int NOT NULL,
	`shipmentId` int NOT NULL,
	`amount` varchar(50) NOT NULL,
	`currency` varchar(10) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `codRemittanceItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `codRemittances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`remittanceNumber` varchar(50) NOT NULL,
	`totalAmount` varchar(50) NOT NULL,
	`currency` varchar(10) NOT NULL,
	`shipmentCount` int NOT NULL,
	`status` enum('pending','processed','completed') NOT NULL DEFAULT 'pending',
	`paymentMethod` varchar(50),
	`paymentReference` varchar(100),
	`processedDate` timestamp,
	`notes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `codRemittances_id` PRIMARY KEY(`id`),
	CONSTRAINT `codRemittances_remittanceNumber_unique` UNIQUE(`remittanceNumber`)
);
