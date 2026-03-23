-- Add requesting_for column to device_requests table
ALTER TABLE device_requests ADD COLUMN requesting_for varchar(255);
