-- Driver live location (dispatch map) + end-of-shift reconciliation.
-- Apply to an existing database with scripts/add-driver-location-reconciliation.ts
-- (idempotent), never with drizzle-kit migrate — see drizzle/MIGRATIONS_NOTES.md.
--
-- Hand-edited: 0043 has no meta snapshot, so drizzle-kit generate re-emitted
-- 0043's codRemittances/codRemittanceOffsets/clientAccounts changes here too.
-- They were removed because 0043_billing_automation.sql already applies them;
-- meta/0044_snapshot.json is complete, so the next generate diffs cleanly.
CREATE TABLE `driverLocations` (
	`driverId` int NOT NULL,
	`lat` double NOT NULL,
	`lng` double NOT NULL,
	`accuracy` double,
	`heading` double,
	`speed` double,
	`routeId` varchar(50),
	`recordedAt` timestamp NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `driverLocations_driverId` PRIMARY KEY(`driverId`)
);
--> statement-breakpoint
ALTER TABLE `driverShifts` ADD `clientRef` varchar(64);--> statement-breakpoint
ALTER TABLE `driverShifts` ADD `reconciledAt` timestamp;--> statement-breakpoint
ALTER TABLE `driverShifts` ADD `expectedCash` decimal(10,2);--> statement-breakpoint
ALTER TABLE `driverShifts` ADD `collectedCash` decimal(10,2);--> statement-breakpoint
ALTER TABLE `driverShifts` ADD `cardCollected` decimal(10,2);--> statement-breakpoint
ALTER TABLE `driverShifts` ADD `declaredCash` decimal(10,2);--> statement-breakpoint
ALTER TABLE `driverShifts` ADD `cashDiscrepancy` decimal(10,2);--> statement-breakpoint
ALTER TABLE `driverShifts` ADD `declaredVariance` decimal(10,2);--> statement-breakpoint
ALTER TABLE `driverShifts` ADD `reconciliationNote` text;--> statement-breakpoint
CREATE INDEX `driverShifts_driverId_clientRef_idx` ON `driverShifts` (`driverId`,`clientRef`);
