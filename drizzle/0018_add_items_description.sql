-- Add items_description column to orders table
-- This stores product/item descriptions from Shopify for display on waybill

ALTER TABLE `orders` ADD COLUMN `itemsDescription` TEXT NULL;
