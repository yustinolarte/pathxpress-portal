CREATE TABLE `savedShippers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`nickname` varchar(255) NOT NULL,
	`shipperName` varchar(255) NOT NULL,
	`shipperAddress` text NOT NULL,
	`shipperCity` varchar(100) NOT NULL,
	`shipperCountry` varchar(100) NOT NULL,
	`shipperPhone` varchar(50) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `savedShippers_id` PRIMARY KEY(`id`)
);
