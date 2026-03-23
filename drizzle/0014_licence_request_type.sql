-- Add request type enum
CREATE TYPE license_request_type AS ENUM ('license_renewal', 'patch_update');

-- Add columns to onprem_license_requests
ALTER TABLE onprem_license_requests
  ADD COLUMN request_type license_request_type NOT NULL DEFAULT 'license_renewal',
  ADD COLUMN target_version VARCHAR(50);
