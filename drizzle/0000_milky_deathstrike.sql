CREATE TYPE "public"."audit_module" AS ENUM('auth', 'users', 'devices', 'onprem');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('active', 'inactive', 'maintenance', 'decommissioned');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('server', 'workstation', 'mobile', 'iot', 'network', 'other');--> statement-breakpoint
CREATE TYPE "public"."deployment_status" AS ENUM('healthy', 'degraded', 'offline', 'maintenance', 'provisioning', 'decommissioned');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'expired');--> statement-breakpoint
CREATE TYPE "public"."password_reset_status" AS ENUM('pending', 'used', 'expired');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'devices_admin', 'devices_viewer', 'onprem_admin', 'onprem_viewer', 'full_viewer', 'full_editor');--> statement-breakpoint
CREATE TYPE "public"."user_invite_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."connection_type" AS ENUM('usb', 'network', 'wifi', 'ethernet');--> statement-breakpoint
CREATE TYPE "public"."deployment_size" AS ENUM('small', 'medium', 'large', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."environment_type" AS ENUM('poc', 'production');--> statement-breakpoint
CREATE TYPE "public"."hypervisor_type" AS ENUM('vmware', 'proxmox');--> statement-breakpoint
CREATE TYPE "public"."lan_speed" AS ENUM('100mbps', '1gbps', '10gbps');--> statement-breakpoint
CREATE TYPE "public"."maintenance_plan" AS ENUM('quarterly', 'annually');--> statement-breakpoint
CREATE TYPE "public"."version_action_type" AS ENUM('deployment', 'patch', 'upgrade');--> statement-breakpoint
CREATE TYPE "public"."wifi_standard" AS ENUM('wifi5', 'wifi6', 'wifi6e');--> statement-breakpoint
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
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"serial_number" varchar(100),
	"type" "device_type" NOT NULL,
	"status" "device_status" DEFAULT 'active' NOT NULL,
	"manufacturer" varchar(100),
	"model" varchar(100),
	"location" varchar(255),
	"description" text,
	"purpose" varchar(100),
	"assigned_to" varchar(255),
	"metadata" jsonb,
	"registered_by" uuid,
	"last_updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "devices_serial_number_unique" UNIQUE("serial_number")
);
--> statement-breakpoint
CREATE TABLE "onprem_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_name" varchar(255) NOT NULL,
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
	"ssl_provided" boolean,
	"infrastructure" jsonb,
	"cpu_cores" integer,
	"ram_gb" integer,
	"storage_gb" integer,
	"deployment_size" "deployment_size",
	"network_readiness" jsonb,
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
CREATE TABLE "user_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"role" "role" NOT NULL,
	"invite_token" varchar(255) NOT NULL,
	"invited_by" uuid NOT NULL,
	"status" "user_invite_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_invites_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"role" "role" DEFAULT 'full_viewer' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"invite_status" "invite_status" DEFAULT 'pending' NOT NULL,
	"invite_token" varchar(255),
	"invite_expires_at" timestamp,
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
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_last_updated_by_users_id_fk" FOREIGN KEY ("last_updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_deployments" ADD CONSTRAINT "onprem_deployments_associated_csm_id_users_id_fk" FOREIGN KEY ("associated_csm_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_deployments" ADD CONSTRAINT "onprem_deployments_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_deployments" ADD CONSTRAINT "onprem_deployments_last_updated_by_users_id_fk" FOREIGN KEY ("last_updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_status_history" ADD CONSTRAINT "onprem_status_history_deployment_id_onprem_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."onprem_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_status_history" ADD CONSTRAINT "onprem_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_device_associations" ADD CONSTRAINT "onprem_device_associations_deployment_id_onprem_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."onprem_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_device_associations" ADD CONSTRAINT "onprem_device_associations_associated_by_users_id_fk" FOREIGN KEY ("associated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_version_history" ADD CONSTRAINT "onprem_version_history_deployment_id_onprem_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."onprem_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onprem_version_history" ADD CONSTRAINT "onprem_version_history_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_module_created_at_idx" ON "audit_logs" USING btree ("module","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");