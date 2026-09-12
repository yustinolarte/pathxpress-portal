CREATE TABLE `bot_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jid` varchar(64) NOT NULL,
	`direction` enum('in','out','system') NOT NULL,
	`text` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bot_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bot_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jid` varchar(64) NOT NULL,
	`waybillNumber` varchar(50) NOT NULL,
	`storeName` varchar(255),
	`isReturn` int NOT NULL DEFAULT 0,
	`status` enum('awaiting_location','location_received','reused','expired') NOT NULL,
	`deliveryStatus` enum('queued','sent','failed') NOT NULL DEFAULT 'queued',
	`sendAttempts` int NOT NULL DEFAULT 0,
	`lastError` text,
	`requestedAt` timestamp NOT NULL,
	`sentAt` timestamp,
	`expiresAt` timestamp,
	`expiredReason` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `bot_orders_waybillNumber_unique` UNIQUE(`waybillNumber`)
);
--> statement-breakpoint
CREATE TABLE `bot_runtime` (
	`id` int NOT NULL,
	`whatsappConnected` int NOT NULL DEFAULT 0,
	`connectedSince` timestamp,
	`lastHeartbeatAt` timestamp NOT NULL DEFAULT (now()),
	`version` varchar(32),
	CONSTRAINT `bot_runtime_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bot_sessions` (
	`jid` varchar(64) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`botActive` int NOT NULL DEFAULT 1,
	`lastInteractionAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_sessions_jid` PRIMARY KEY(`jid`)
);
--> statement-breakpoint
CREATE INDEX `bot_messages_jid_createdAt_idx` ON `bot_messages` (`jid`,`createdAt`);--> statement-breakpoint
CREATE INDEX `bot_orders_jid_idx` ON `bot_orders` (`jid`);--> statement-breakpoint
CREATE INDEX `bot_orders_status_idx` ON `bot_orders` (`status`);