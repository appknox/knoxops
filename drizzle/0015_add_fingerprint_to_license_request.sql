-- Add fingerprint column to onprem_license_requests
ALTER TABLE onprem_license_requests ADD COLUMN fingerprint VARCHAR(500);
