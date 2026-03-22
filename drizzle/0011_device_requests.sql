-- Create device request status enum
CREATE TYPE "public"."device_request_status" AS ENUM('pending', 'approved', 'rejected', 'completed');

-- Create device_requests table
CREATE TABLE "device_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "requested_by" uuid NOT NULL REFERENCES "users"("id"),
  "device_type" varchar(50) NOT NULL,
  "platform" varchar(50) NOT NULL,
  "os_version" varchar(50),
  "purpose" text NOT NULL,
  "status" "device_request_status" NOT NULL DEFAULT 'pending',
  "rejection_reason" text,
  "linked_device_id" uuid REFERENCES "devices"("id"),
  "approved_by" uuid REFERENCES "users"("id"),
  "approved_at" timestamp,
  "rejected_by" uuid REFERENCES "users"("id"),
  "rejected_at" timestamp,
  "completed_by" uuid REFERENCES "users"("id"),
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Create indices
CREATE INDEX "device_requests_requested_by_idx" ON "device_requests" ("requested_by");
CREATE INDEX "device_requests_status_idx" ON "device_requests" ("status");
