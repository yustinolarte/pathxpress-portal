-- findOpenShift/findOrCreateOpenShift filter on (driverId, endTime) on every
-- clock-in, route start and dispatch refresh — driverShifts had no index at
-- all beyond the PK, so every one of those was a full table scan.
CREATE INDEX `driverShifts_driverId_endTime_idx` ON `driverShifts` (`driverId`, `endTime`);
