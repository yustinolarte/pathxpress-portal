ALTER TABLE `orders` MODIFY COLUMN `weight` int NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `volumetricWeight` int;--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `length` int;--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `width` int;--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `height` int;