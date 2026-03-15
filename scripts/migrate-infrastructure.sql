-- Migration: Consolidate infrastructure metadata
-- Drops old columns and enums for server capacity and network readiness

-- Drop old columns (these will be moved into infrastructure JSONB)
ALTER TABLE onprem_deployments DROP COLUMN IF EXISTS cpu_cores;
ALTER TABLE onprem_deployments DROP COLUMN IF EXISTS ram_gb;
ALTER TABLE onprem_deployments DROP COLUMN IF EXISTS storage_gb;
ALTER TABLE onprem_deployments DROP COLUMN IF EXISTS deployment_size;
ALTER TABLE onprem_deployments DROP COLUMN IF EXISTS network_readiness;

-- Drop old enums that are no longer used
DROP TYPE IF EXISTS deployment_size;
DROP TYPE IF EXISTS lan_speed;
DROP TYPE IF EXISTS wifi_standard;
