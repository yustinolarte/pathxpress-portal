ALTER TABLE `driverRoutes` ADD `shiftId` int;--> statement-breakpoint
ALTER TABLE `driverRoutes` ADD `startedAt` timestamp;--> statement-breakpoint
ALTER TABLE `driverRoutes` ADD `finishedAt` timestamp;--> statement-breakpoint
ALTER TABLE `driverRoutes` ADD `activeSeconds` int;--> statement-breakpoint
ALTER TABLE `driverRoutes` ADD `codCollectedReported` decimal(10,2);--> statement-breakpoint
ALTER TABLE `driverRoutes` ADD `completedStopsReported` int;--> statement-breakpoint
CREATE INDEX `driverRoutes_shiftId_idx` ON `driverRoutes` (`shiftId`);