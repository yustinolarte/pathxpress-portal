ALTER TABLE `quoteRequests`
  ADD COLUMN `status` enum('new','contacted','scheduled','completed') NOT NULL DEFAULT 'new',
  ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE INDEX `quoteRequests_status_createdAt_idx`
  ON `quoteRequests` (`status`, `createdAt`);
