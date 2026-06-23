-- Add pickupDriverId field to orders table for assigned pickup driver
ALTER TABLE orders ADD COLUMN pickupDriverId INT DEFAULT NULL AFTER exchangeOrderId;
