-- Route integrity + dispatch planning: one COD record per shipment, route audit
-- log, driver cash hand-overs, planned route start, dispatch priority override and
-- where each location pin came from.
-- Apply to an existing database with scripts/add-route-integrity-dispatch-planning.ts
-- (idempotent, refuses to add the unique index while duplicate COD records exist),
-- never with drizzle-kit migrate — see drizzle/MIGRATIONS_NOTES.md.
CREATE TABLE `driverCashHandovers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driverId` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`allocations` text NOT NULL,
	`receivedAt` timestamp NOT NULL,
	`receivedBy` varchar(100) NOT NULL,
	`note` text,
	`voidedAt` timestamp,
	`voidedBy` varchar(100),
	`voidReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `driverCashHandovers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `routeAuditLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routeId` varchar(50),
	`stopId` int,
	`orderId` int,
	`action` varchar(50) NOT NULL,
	`fromValue` varchar(50),
	`toValue` varchar(50),
	`actor` varchar(100) NOT NULL,
	`reason` text,
	`payload` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `routeAuditLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
DROP INDEX `codRecords_shipmentId_idx` ON `codRecords`;--> statement-breakpoint
ALTER TABLE `driverRoutes` ADD `plannedStartAt` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `locationSource` varchar(20);--> statement-breakpoint
ALTER TABLE `orders` ADD `locationVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipperLocationSource` varchar(20);--> statement-breakpoint
ALTER TABLE `orders` ADD `priorityOverride` varchar(10);--> statement-breakpoint
ALTER TABLE `codRecords` ADD CONSTRAINT `codRecords_shipmentId_unique` UNIQUE(`shipmentId`);--> statement-breakpoint
CREATE INDEX `driverCashHandovers_driverId_receivedAt_idx` ON `driverCashHandovers` (`driverId`,`receivedAt`);--> statement-breakpoint
CREATE INDEX `routeAuditLog_routeId_idx` ON `routeAuditLog` (`routeId`);--> statement-breakpoint
CREATE INDEX `routeAuditLog_orderId_idx` ON `routeAuditLog` (`orderId`);--> statement-breakpoint
CREATE INDEX `routeAuditLog_createdAt_idx` ON `routeAuditLog` (`createdAt`);--> statement-breakpoint
CREATE INDEX `driverRoutes_status_idx` ON `driverRoutes` (`status`);--> statement-breakpoint
CREATE INDEX `driverRoutes_startedAt_idx` ON `driverRoutes` (`startedAt`);