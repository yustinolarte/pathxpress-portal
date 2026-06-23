-- Add type and pickedUpAt columns to routeOrders table
-- type: 'pickup' or 'delivery' to distinguish stop types
-- status: add 'picked_up' to existing enum
-- pickedUpAt: timestamp for when pickup was completed

-- Add type column
ALTER TABLE routeOrders ADD COLUMN type ENUM('pickup', 'delivery') NOT NULL DEFAULT 'delivery' AFTER sequence;

-- Add pickedUpAt column
ALTER TABLE routeOrders ADD COLUMN pickedUpAt TIMESTAMP NULL AFTER deliveredAt;

-- Modify status enum to include 'picked_up'
ALTER TABLE routeOrders MODIFY COLUMN status ENUM('pending', 'in_progress', 'picked_up', 'delivered', 'attempted', 'returned') NOT NULL DEFAULT 'pending';
