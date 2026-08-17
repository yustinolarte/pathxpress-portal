-- Adds the draft/review stage to invoices: a newly generated invoice is hidden from
-- the customer portal and sends no notification until staff explicitly send it.
-- Applied manually via scripts/add-invoice-sent-to-client.ts (production) — see drizzle/MIGRATIONS_NOTES.md.
ALTER TABLE `invoices` ADD COLUMN `sentToClient` int NOT NULL DEFAULT 0;
ALTER TABLE `invoices` ADD COLUMN `sentAt` timestamp NULL;

-- Backfill: every invoice that already existed was already visible/notified under the
-- old behavior, so mark it sent (using its issue date) instead of hiding it retroactively.
UPDATE `invoices` SET `sentToClient` = 1, `sentAt` = `issueDate` WHERE `sentToClient` = 0;
