CREATE INDEX `codRecords_shipmentId_idx` ON `codRecords` (`shipmentId`);--> statement-breakpoint
CREATE INDEX `codRecords_status_idx` ON `codRecords` (`status`);--> statement-breakpoint
CREATE INDEX `codRemittances_clientId_idx` ON `codRemittances` (`clientId`);--> statement-breakpoint
CREATE INDEX `driverRoutes_driverId_idx` ON `driverRoutes` (`driverId`);--> statement-breakpoint
CREATE INDEX `invoiceItems_invoiceId_idx` ON `invoiceItems` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `invoiceItems_shipmentId_idx` ON `invoiceItems` (`shipmentId`);--> statement-breakpoint
CREATE INDEX `invoices_clientId_idx` ON `invoices` (`clientId`);--> statement-breakpoint
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);--> statement-breakpoint
CREATE INDEX `notifications_clientId_idx` ON `notifications` (`clientId`);--> statement-breakpoint
CREATE INDEX `orders_clientId_idx` ON `orders` (`clientId`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_createdAt_idx` ON `orders` (`createdAt`);--> statement-breakpoint
CREATE INDEX `portalUsers_clientId_idx` ON `portalUsers` (`clientId`);--> statement-breakpoint
CREATE INDEX `routeOrders_routeId_idx` ON `routeOrders` (`routeId`);--> statement-breakpoint
CREATE INDEX `routeOrders_orderId_idx` ON `routeOrders` (`orderId`);--> statement-breakpoint
CREATE INDEX `savedShippers_clientId_idx` ON `savedShippers` (`clientId`);--> statement-breakpoint
CREATE INDEX `trackingEvents_shipmentId_idx` ON `trackingEvents` (`shipmentId`);