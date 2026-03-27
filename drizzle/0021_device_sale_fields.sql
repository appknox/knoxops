-- Add 'for_sale' and 'sold' to device_status enum
ALTER TYPE device_status ADD VALUE IF NOT EXISTS 'for_sale';
ALTER TYPE device_status ADD VALUE IF NOT EXISTS 'sold';

-- Add device sale-related fields
ALTER TABLE devices ADD COLUMN IF NOT EXISTS condition VARCHAR(50);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS condition_notes TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS asking_price NUMERIC(10, 2);
