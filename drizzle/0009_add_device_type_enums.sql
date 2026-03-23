-- Add missing enum values to device_type
-- PostgreSQL ALTER TYPE ADD VALUE cannot run inside a transaction block

ALTER TYPE "public"."device_type" ADD VALUE IF NOT EXISTS 'tablet';
ALTER TYPE "public"."device_type" ADD VALUE IF NOT EXISTS 'charging_hub';
