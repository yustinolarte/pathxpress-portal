-- Nueva tabla: configuración de servicios por cliente (one row per client per service)
CREATE TABLE `clientServiceSettings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `clientId` INT NOT NULL,
  `serviceCode` VARCHAR(30) NOT NULL,
  `isEnabled` TINYINT(1) NOT NULL DEFAULT 0,
  `baseRate` VARCHAR(20) NULL,
  `perKgRate` VARCHAR(20) NULL,
  `cutoffTime` VARCHAR(5) NULL,
  `availableRegions` TEXT NULL,
  `deliveryWindow` VARCHAR(100) NULL,
  `deliveryTime` VARCHAR(100) NULL,
  `displayName` VARCHAR(100) NULL,
  `description` TEXT NULL,
  `extraConfig` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_client_service` (`clientId`, `serviceCode`),
  INDEX `idx_css_clientId` (`clientId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;--> statement-breakpoint

-- Nuevas columnas en orders para PREFERRED_TIME
ALTER TABLE `orders`
  ADD COLUMN `preferredDeliveryDate` VARCHAR(10) NULL,
  ADD COLUMN `preferredDeliveryTime` VARCHAR(20) NULL;--> statement-breakpoint

-- Push notification token for the driver app. meta/0022_snapshot.json has
-- always included this on `drivers` (present in every snapshot from 22
-- onward, absent in 0021's), but the statement that should have created it
-- was missing from this file — discovered 2026-08-12 running drizzle-kit
-- migrate against a brand-new empty database for the first time ever; the
-- production DB already has these columns (added by hand, undocumented).
ALTER TABLE `drivers` ADD COLUMN `pushToken` VARCHAR(255) NULL;--> statement-breakpoint
ALTER TABLE `drivers` ADD COLUMN `pushPlatform` VARCHAR(10) NULL;
