ALTER TABLE clientAccounts
ADD COLUMN defaultSettlementPeriod ENUM('weekly','biweekly','monthly','custom') NOT NULL DEFAULT 'custom';
