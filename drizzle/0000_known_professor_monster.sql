CREATE TYPE "public"."audit_module" AS ENUM('auth', 'users', 'devices', 'onprem');--> statement-breakpoint
CREATE TYPE "public"."device_request_status" AS ENUM('pending', 'approved', 'rejected', 'completed');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('in_inventory', 'checked_out', 'maintenance', 'decommissioned', 'sold', 'for_sale', 'not_verified');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('server', 'workstation', 'mobile', 'tablet', 'iot', 'network', 'charging_hub', 'other');--> statement-breakpoint
CREATE TYPE "public"."comment_entity_type" AS ENUM('onprem_deployment', 'device');--> statement-breakpoint
CREATE TYPE "public"."deployment_status" AS ENUM('healthy', 'degraded', 'offline', 'maintenance', 'provisioning', 'decommissioned');--> statement-breakpoint
CREATE TYPE "public"."document_category" AS ENUM('rfp', 'other');--> statement-breakpoint
CREATE TYPE "public"."license_request_status" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."license_request_type" AS ENUM('license_renewal', 'patch_update');--> statement-breakpoint
CREATE TYPE "public"."password_reset_status" AS ENUM('pending', 'used', 'expired');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'devices_admin', 'devices_viewer', 'onprem_admin', 'onprem_viewer', 'full_viewer', 'full_editor');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'active', 'expired', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."connection_type" AS ENUM('usb', 'network', 'wifi', 'ethernet');--> statement-breakpoint
CREATE TYPE "public"."environment_type" AS ENUM('poc', 'production');--> statement-breakpoint
CREATE TYPE "public"."hypervisor_type" AS ENUM('vmware', 'proxmox');--> statement-breakpoint
CREATE TYPE "public"."maintenance_plan" AS ENUM('quarterly', 'annually');--> statement-breakpoint
CREATE TYPE "public"."version_action_type" AS ENUM('deployment', 'patch', 'upgrade');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"module" "audit_module" NOT NULL,
	"action" varchar(50) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"entity_name" varchar(255),
	"changes" jsonb,
	"metadata" jsonb,
	"ip_address" varchar(45),
	"user_agent" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_no" serial NOT NULL,
	"requested_by" uuid NOT NULL,
	"device_type" varchar(50) NOT NULL,
	"platform" varchar(50) NOT NULL,
	"os_version" varchar(50),
	"purpose" text NOT NULL,
	"requesting_for" varchar(255),
	"additional_details" text,
	"status" "device_request_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"linked_device_id" uuid,
	"approved_by" uuid,
	"approved_at" timestamp,
	"rejected_by" uuid,
	"rejected_at" timestamp,
	"completed_by" uuid,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"serial_number" varchar(100),
	"type" "device_type" NOT NULL,
	"status" "device_status" DEFAULT 'in_inventory' NOT NULL,
	"manufacturer" varchar(100),
	"model" varchar(100),
	"location" varchar(255),
	"description" text,
	"purpose" varchar(100),
	"assigned_to" varchar(255),
	"condition" varchar(50),
	"condition_notes" text,
	"asking_price" numeric(10, 2),
	"metadata" jsonb,
	"registered_by" uuid,
	"last_updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false,
	CONSTRAINT "devices_serial_number_unique" UNIQUE("serial_number")
);
--> statement-breakpoint
CREATE TABLE "entity_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "comment_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onprem_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"comment" text NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "onprem_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_name" varchar(255) NOT NULL,
	"name" varchar(255),
	"client_status" "client_status" DEFAULT 'active' NOT NULL,
	"environment_type" "environment_type" DEFAULT 'poc' NOT NULL,
	"associated_csm_id" uuid,
	"contact_email" varchar(255),
	"contact_phone" varchar(50),
	"first_deployment_date" timestamp,
	"current_version" varchar(50),
	"last_patch_date" timestamp,
	"maintenance_plan" "maintenance_plan",
	"next_scheduled_patch_date" timestamp,
	"prerequisite_file_url" text,
	"prerequisite_file_name" varchar(255),
	"domain_name" varchar(255),
	"ssl_certificate_file_url" text,
	"infrastructure" jsonb,
	"license" jsonb,
	"customer_id" varchar(100),
	"customer_name" varchar(255),
	"status" "deployment_status" DEFAULT 'provisioning' NOT NULL,
	"version" varchar(50),
	"hostname" varchar(255),
	"region" varchar(100),
	"environment" varchar(50),
	"node_count" integer DEFAULT 1,
	"last_health_check" timestamp,
	"health_check_details" jsonb,
	"configuration" jsonb,
	"notes" text,
	"registered_by" uuid,
	"last_updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "onprem_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"category" "document_category" NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" varchar(255),
	"file_size" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onprem_license_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_no" serial NOT NULL,
	"deployment_id" uuid NOT NULL,
	"requested_by" uuid,
	"status" "license_request_status" DEFAULT 'pending' NOT NULL,
	"request_type" "license_request_type" DEFAULT 'license_renewal' NOT NULL,
	"target_version" varchar(50),
	"license_start_date" timestamp NOT NULL,
	"license_end_date" timestamp NOT NULL,
	"number_of_projects" integer NOT NULL,
	"notes" text,
	"fingerprint" varchar(500),
	"file_name" varchar(255),
	"file_path" text,
	"file_size" integer,
	"uploaded_by" uuid,
	"uploaded_at" timestamp,
	"cancelled_by" uuid,
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onprem_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"previous_status" "deployment_status",
	"new_status" "deployment_status" NOT NULL,
	"changed_by" uuid,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"status" "password_reset_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(500) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"role" "role" DEFAULT 'full_viewer' NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"invite_token" varchar(255),
	"invite_expires_at" timestamp,
	"invite_last_sent_at" timestamp,
	"invited_by" uuid,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "onprem_device_associations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"device_ip" varchar(45),
	"connection_type" "connection_type",
	"connection_status" varchar(50),
	"last_seen" timestamp,
	"associated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onprem_version_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"version" varchar(50) NOT NULL,
	"action_type" "version_action_type" NOT NULL,
	"patch_notes" text,
	"applied_by" uuid,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_requests" ADD CONSTRAINT "device_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_requests" ADD CONSTRAINT "device_requests_linked_device_id_devices_id_fk" FOREIGN KEY ("linked_device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_requests" ADD CONSTRAINT "device_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_requests" ADD CONSTRAINT "device_requests_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_requests" ADD CONSTRAINT "device_requests_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_last_updated_by_users_id_fk" FOREIGN KEY ("last_updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_comments" ADD CONSTRAINT "entity_comments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_comments" ADD CONSTRAINT "entity_comments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_comments" ADD CONSTRAINT "onprem_comments_deployment_id_onprem_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."onprem_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_comments" ADD CONSTRAINT "onprem_comments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_comments" ADD CONSTRAINT "onprem_comments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_deployments" ADD CONSTRAINT "onprem_deployments_associated_csm_id_users_id_fk" FOREIGN KEY ("associated_csm_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_deployments" ADD CONSTRAINT "onprem_deployments_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_deployments" ADD CONSTRAINT "onprem_deployments_last_updated_by_users_id_fk" FOREIGN KEY ("last_updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_documents" ADD CONSTRAINT "onprem_documents_deployment_id_onprem_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."onprem_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_license_requests" ADD CONSTRAINT "onprem_license_requests_deployment_id_onprem_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."onprem_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_license_requests" ADD CONSTRAINT "onprem_license_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_license_requests" ADD CONSTRAINT "onprem_license_requests_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_license_requests" ADD CONSTRAINT "onprem_license_requests_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_status_history" ADD CONSTRAINT "onprem_status_history_deployment_id_onprem_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."onprem_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_status_history" ADD CONSTRAINT "onprem_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_device_associations" ADD CONSTRAINT "onprem_device_associations_deployment_id_onprem_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."onprem_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_device_associations" ADD CONSTRAINT "onprem_device_associations_associated_by_users_id_fk" FOREIGN KEY ("associated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_version_history" ADD CONSTRAINT "onprem_version_history_deployment_id_onprem_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."onprem_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_version_history" ADD CONSTRAINT "onprem_version_history_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_module_created_at_idx" ON "audit_logs" USING btree ("module","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "device_requests_requested_by_idx" ON "device_requests" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "device_requests_status_idx" ON "device_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "entity_comments_entity_idx" ON "entity_comments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "entity_comments_created_by_idx" ON "entity_comments" USING btree ("created_by");