CREATE TABLE `internationalRateRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`originCountry` varchar(100) NOT NULL,
	`destinationCountry` varchar(100) NOT NULL,
	`deliveryDate` varchar(50) NOT NULL,
	`weight` varchar(50) NOT NULL,
	`length` varchar(50) NOT NULL,
	`width` varchar(50) NOT NULL,
	`height` varchar(50) NOT NULL,
	`phone` varchar(50) NOT NULL,
	`email` varchar(320) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `internationalRateRequests_id` PRIMARY KEY(`id`)
);
