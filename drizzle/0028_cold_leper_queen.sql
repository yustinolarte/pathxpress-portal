CREATE INDEX `codRecords_collectedDate_idx` ON `codRecords` (`collectedDate`);--> statement-breakpoint
CREATE INDEX `codRecords_remittedToClientDate_idx` ON `codRecords` (`remittedToClientDate`);--> statement-breakpoint
CREATE INDEX `codRemittanceItems_remittanceId_idx` ON `codRemittanceItems` (`remittanceId`);