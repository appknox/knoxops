-- Add not_verified to device_status enum
-- PostgreSQL ALTER TYPE ADD VALUE cannot run inside a transaction block

ALTER TYPE "public"."device_status" ADD VALUE IF NOT EXISTS 'not_verified';
