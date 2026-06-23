ALTER TABLE `invoices` ADD `amountPaid` varchar(50) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `invoices` ADD `balance` varchar(50) NOT NULL;