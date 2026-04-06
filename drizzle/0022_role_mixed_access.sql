-- Add two new role values for asymmetric access combinations
-- devices_admin_onprem_viewer: read/write on devices, read on onprem
-- onprem_admin_devices_viewer: read on devices, read/write on onprem
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'devices_admin_onprem_viewer';
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'onprem_admin_devices_viewer';
