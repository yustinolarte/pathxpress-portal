CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(100) NOT NULL,
	`entityType` varchar(50) NOT NULL,
	`entityId` int NOT NULL,
	`changes` text,
	`ipAddress` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clientAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyName` varchar(255) NOT NULL,
	`contactName` varchar(255) NOT NULL,
	`phone` varchar(50) NOT NULL,
	`billingEmail` varchar(320) NOT NULL,
	`billingAddress` text NOT NULL,
	`country` varchar(100) NOT NULL,
	`city` varchar(100) NOT NULL,
	`creditTerms` varchar(100),
	`defaultCurrency` varchar(10) NOT NULL DEFAULT 'AED',
	`codAllowed` int NOT NULL DEFAULT 0,
	`defaultRateTableId` int,
	`notes` text,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clientAccounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `codRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shipmentId` int NOT NULL,
	`codAmount` varchar(50) NOT NULL,
	`codCurrency` varchar(10) NOT NULL,
	`collectedDate` timestamp,
	`remittedToClientDate` timestamp,
	`status` enum('pending_collection','collected','remitted','disputed') NOT NULL DEFAULT 'pending_collection',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `codRecords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoiceItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`shipmentId` int,
	`description` text NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unitPrice` varchar(50) NOT NULL,
	`total` varchar(50) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoiceItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`invoiceNumber` varchar(100) NOT NULL,
	`periodFrom` timestamp NOT NULL,
	`periodTo` timestamp NOT NULL,
	`issueDate` timestamp NOT NULL,
	`dueDate` timestamp NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'AED',
	`subtotal` varchar(50) NOT NULL,
	`taxes` varchar(50) DEFAULT '0',
	`total` varchar(50) NOT NULL,
	`status` enum('pending','paid','overdue') NOT NULL DEFAULT 'pending',
	`paymentDate` timestamp,
	`paymentReference` varchar(255),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_invoiceNumber_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`orderNumber` varchar(100),
	`waybillNumber` varchar(50) NOT NULL,
	`shipperName` varchar(255) NOT NULL,
	`shipperAddress` text NOT NULL,
	`shipperCity` varchar(100) NOT NULL,
	`shipperCountry` varchar(100) NOT NULL,
	`shipperPhone` varchar(50) NOT NULL,
	`customerName` varchar(255) NOT NULL,
	`customerPhone` varchar(50) NOT NULL,
	`address` text NOT NULL,
	`city` varchar(100) NOT NULL,
	`emirate` varchar(100),
	`postalCode` varchar(20),
	`destinationCountry` varchar(100) NOT NULL,
	`pieces` int NOT NULL,
	`weight` varchar(50) NOT NULL,
	`volumetricWeight` varchar(50),
	`length` varchar(50),
	`width` varchar(50),
	`height` varchar(50),
	`serviceType` varchar(100) NOT NULL,
	`specialInstructions` text,
	`codRequired` int NOT NULL DEFAULT 0,
	`codAmount` varchar(50),
	`codCurrency` varchar(10),
	`pickupDate` timestamp,
	`deliveryDateEstimated` timestamp,
	`deliveryDateReal` timestamp,
	`status` varchar(50) NOT NULL DEFAULT 'pending_pickup',
	`lastStatusUpdate` timestamp NOT NULL DEFAULT (now()),
	`latitude` varchar(50),
	`longitude` varchar(50),
	`timeWindowStart` varchar(20),
	`timeWindowEnd` varchar(20),
	`priorityLevel` int DEFAULT 1,
	`routeBatchId` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_waybillNumber_unique` UNIQUE(`waybillNumber`)
);
--> statement-breakpoint
CREATE TABLE `portalUsers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`role` enum('admin','customer') NOT NULL,
	`clientId` int,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp,
	CONSTRAINT `portalUsers_id` PRIMARY KEY(`id`),
	CONSTRAINT `portalUsers_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `rateTables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`clientId` int,
	`originZone` varchar(100) NOT NULL,
	`destinationZone` varchar(100) NOT NULL,
	`minWeight` varchar(50) NOT NULL,
	`maxWeight` varchar(50) NOT NULL,
	`pricePerKg` varchar(50) NOT NULL,
	`basePrice` varchar(50) NOT NULL,
	`fuelSurchargePercent` varchar(50) DEFAULT '0',
	`codFeeFixed` varchar(50) DEFAULT '0',
	`codFeePercent` varchar(50) DEFAULT '0',
	`additionalSurcharges` text,
	`serviceType` varchar(100),
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rateTables_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trackingEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shipmentId` int NOT NULL,
	`eventDatetime` timestamp NOT NULL,
	`location` varchar(255),
	`statusCode` varchar(50) NOT NULL,
	`statusLabel` varchar(255) NOT NULL,
	`description` text,
	`createdBy` varchar(50) NOT NULL DEFAULT 'system',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trackingEvents_id` PRIMARY KEY(`id`)
);
