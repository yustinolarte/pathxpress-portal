CREATE TABLE `quoteRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(50) NOT NULL,
	`email` varchar(320) NOT NULL,
	`pickupAddress` text NOT NULL,
	`deliveryAddress` text,
	`serviceType` varchar(100) NOT NULL,
	`weight` varchar(100) NOT NULL,
	`comments` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quoteRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trackingId` varchar(20) NOT NULL,
	`status` varchar(50) NOT NULL,
	`pickupAddress` text,
	`deliveryAddress` text,
	`weight` varchar(50),
	`serviceType` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shipments_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipments_trackingId_unique` UNIQUE(`trackingId`)
);
