-- Create app_settings table for storing configurable application settings
CREATE TABLE IF NOT EXISTS "app_settings" (
  "key" VARCHAR(100) PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updated_by" UUID REFERENCES "users"("id"),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index on updated_at for efficient queries
CREATE INDEX IF NOT EXISTS "app_settings_updated_at_idx" ON "app_settings"("updated_at");

-- Seed default values
INSERT INTO "app_settings" ("key", "value") VALUES
  ('patch_reminder_days_ahead', '10'),
  ('patch_reminder_overdue_days', '30'),
  ('notification_schedule_hour_utc', '23'),
  ('patch_reminders_enabled', 'true'),
  ('device_checkin_digest_enabled', 'true'),
  ('device_checkout_digest_enabled', 'true')
ON CONFLICT ("key") DO NOTHING;
