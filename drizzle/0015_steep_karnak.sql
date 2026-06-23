CREATE TABLE `driverReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driverId` int NOT NULL,
	`issueType` varchar(50) NOT NULL,
	`description` text,
	`photoUrl` text,
	`latitude` varchar(50),
	`longitude` varchar(50),
	`accuracy` varchar(50),
	`status` enum('pending','in_review','resolved','rejected') NOT NULL DEFAULT 'pending',
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `driverReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `driverRoutes` (
	`id` varchar(50) NOT NULL,
	`driverId` int,
	`date` timestamp NOT NULL,
	`zone` varchar(100),
	`vehicleInfo` varchar(100),
	`status` enum('pending','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `driverRoutes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `driverShifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driverId` int NOT NULL,
	`startTime` timestamp NOT NULL,
	`endTime` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `driverShifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drivers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(50) NOT NULL,
	`email` varchar(320),
	`passwordHash` varchar(255) NOT NULL,
	`fullName` varchar(100) NOT NULL,
	`phone` varchar(50),
	`vehicleNumber` varchar(50),
	`photoUrl` text,
	`emiratesId` varchar(50),
	`emiratesIdExp` timestamp,
	`licenseNo` varchar(50),
	`licenseExp` timestamp,
	`status` enum('active','inactive','suspended') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drivers_id` PRIMARY KEY(`id`),
	CONSTRAINT `drivers_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `routeOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routeId` varchar(50) NOT NULL,
	`orderId` int NOT NULL,
	`sequence` int,
	`status` enum('pending','in_progress','delivered','attempted','returned') NOT NULL DEFAULT 'pending',
	`proofPhotoUrl` text,
	`notes` text,
	`attemptedAt` timestamp,
	`deliveredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `routeOrders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `clientAccounts` ADD `returnFee` varchar(20);--> statement-breakpoint
ALTER TABLE `orders` ADD `isReturn` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `originalOrderId` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `returnCharged` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `orderType` varchar(20) DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `exchangeOrderId` int;