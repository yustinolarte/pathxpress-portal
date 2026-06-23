ALTER TABLE invoices
ADD COLUMN settlementPeriod ENUM('weekly','biweekly','monthly','custom') NOT NULL DEFAULT 'custom';
