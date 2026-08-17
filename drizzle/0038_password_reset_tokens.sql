CREATE TABLE `passwordResetTokens` (
  `id` int AUTO_INCREMENT NOT NULL,
  `portalUserId` int NOT NULL,
  `tokenHash` varchar(64) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `usedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `passwordResetTokens_id` PRIMARY KEY(`id`),
  CONSTRAINT `passwordResetTokens_tokenHash_unique` UNIQUE(`tokenHash`)
);

CREATE INDEX `passwordResetTokens_user_idx`
  ON `passwordResetTokens` (`portalUserId`);

CREATE INDEX `passwordResetTokens_expiry_idx`
  ON `passwordResetTokens` (`expiresAt`);
