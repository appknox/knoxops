-- Drop the full unique constraint that incorrectly blocks re-adding soft-deleted devices
ALTER TABLE "devices" DROP CONSTRAINT "devices_serial_number_unique";

-- Add a partial unique index: only enforce uniqueness among non-deleted records
CREATE UNIQUE INDEX "devices_serial_number_active_unique" ON "devices"("serial_number") WHERE "serial_number" IS NOT NULL AND "is_deleted" = false;
