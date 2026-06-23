ALTER TABLE `routeOrders` MODIFY COLUMN `status` enum('pending','in_progress','picked_up','delivered','attempted','returned') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `orders` ADD `pickupDriverId` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `hideConsigneeAddress` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `routeOrders` ADD `type` enum('pickup','delivery') DEFAULT 'delivery' NOT NULL;--> statement-breakpoint
ALTER TABLE `routeOrders` ADD `pickedUpAt` timestamp;