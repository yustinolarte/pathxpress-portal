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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Nuevas columnas en orders para PREFERRED_TIME
ALTER TABLE `orders`
  ADD COLUMN `preferredDeliveryDate` VARCHAR(10) NULL,
  ADD COLUMN `preferredDeliveryTime` VARCHAR(20) NULL;
