import { pgTable, uuid, varchar, timestamp, text, jsonb, pgEnum, integer, boolean, serial } from 'drizzle-orm/pg-core';
import { users } from './users.js';

// Deployment status enum
export const deploymentStatusEnum = pgEnum('deployment_status', [
  'healthy',
  'degraded',
  'offline',
  'maintenance',
  'provisioning',
  'decommissioned',
]);

// Client status enum
export const clientStatusEnum = pgEnum('client_status', ['active', 'inactive']);

// Environment type enum
export const environmentTypeEnum = pgEnum('environment_type', ['poc', 'production']);

// Maintenance plan enum
export const maintenancePlanEnum = pgEnum('maintenance_plan', ['quarterly', 'annually']);

// Hypervisor type enum
export const hypervisorTypeEnum = pgEnum('hypervisor_type', ['vmware', 'proxmox']);

// Note: Deployment size, LAN speed, and WiFi standard are now stored in infrastructure JSON

// Connection type enum
export const connectionTypeEnum = pgEnum('connection_type', ['usb', 'network', 'wifi', 'ethernet']);

// Version action type enum
export const versionActionTypeEnum = pgEnum('version_action_type', ['deployment', 'patch', 'upgrade']);

// On-prem deployments table
export const onpremDeployments = pgTable('onprem_deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Section 1: Client & Ownership
  clientName: varchar('client_name', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }), // Keep for backward compatibility
  clientStatus: clientStatusEnum('client_status').notNull().default('active'),
  environmentType: environmentTypeEnum('environment_type').notNull().default('poc'),
  associatedCsmId: uuid('associated_csm_id').references(() => users.id),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  // Section 2: Deployment & Versioning
  firstDeploymentDate: timestamp('first_deployment_date'),
  currentVersion: varchar('current_version', { length: 50 }),
  lastPatchDate: timestamp('last_patch_date'),
  maintenancePlan: maintenancePlanEnum('maintenance_plan'),
  nextScheduledPatchDate: timestamp('next_scheduled_patch_date'),
  // Section 3: Prerequisites
  prerequisiteFileUrl: text('prerequisite_file_url'),
  prerequisiteFileName: varchar('prerequisite_file_name', { length: 255 }),
  domainName: varchar('domain_name', { length: 255 }),
  sslCertificateFileUrl: text('ssl_certificate_file_url'),
  // Section 4: Infrastructure & Technical Details (consolidated metadata)
  // Contains: hypervisor, network (including LAN/WiFi speeds), server capacity, fingerprint
  infrastructure: jsonb('infrastructure').$type<{
    hypervisor?: {
      type?: string;
      version?: string;
      customType?: string; // For "other" hypervisor option
    };
    network?: {
      staticIP?: string;
      gateway?: string;
      netmask?: string;
      dnsServers?: string[];
      ntpServer?: string;
      smtpServer?: string;
      lanSpeed?: string;
      wifiStandard?: string;
    };
    server?: {
      cpuCores?: number;
      ramGB?: number;
      storageGB?: number;
      size?: string;
    };
    fingerprint?: string;
  }>(),
  // Section 5: License Information
  license: jsonb('license').$type<{
    userFullName?: string;
    email?: string;
    username?: string;
    startDate?: string; // ISO date string
    endDate?: string; // ISO date string
    pricingPlan?: 'per app' | 'per scan';
    numberOfApps?: number;
  }>(),
  // Legacy fields
  customerId: varchar('customer_id', { length: 100 }),
  customerName: varchar('customer_name', { length: 255 }),
  status: deploymentStatusEnum('status').notNull().default('provisioning'),
  version: varchar('version', { length: 50 }),
  hostname: varchar('hostname', { length: 255 }),
  region: varchar('region', { length: 100 }),
  environment: varchar('environment', { length: 50 }),
  nodeCount: integer('node_count').default(1),
  lastHealthCheck: timestamp('last_health_check'),
  healthCheckDetails: jsonb('health_check_details').$type<Record<string, unknown>>(),
  configuration: jsonb('configuration').$type<Record<string, unknown>>(),
  notes: text('notes'),
  registeredBy: uuid('registered_by').references(() => users.id),
  lastUpdatedBy: uuid('last_updated_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').default(false),
});

// On-prem device associations table
export const onpremDeviceAssociations = pgTable('onprem_device_associations', {
  id: uuid('id').primaryKey().defaultRandom(),
  deploymentId: uuid('deployment_id')
    .notNull()
    .references(() => onpremDeployments.id, { onDelete: 'cascade' }),
  deviceId: uuid('device_id').notNull(),
  deviceIP: varchar('device_ip', { length: 45 }),
  connectionType: connectionTypeEnum('connection_type'),
  connectionStatus: varchar('connection_status', { length: 50 }),
  lastSeen: timestamp('last_seen'),
  associatedBy: uuid('associated_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// On-prem version history table
export const onpremVersionHistory = pgTable('onprem_version_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  deploymentId: uuid('deployment_id')
    .notNull()
    .references(() => onpremDeployments.id, { onDelete: 'cascade' }),
  version: varchar('version', { length: 50 }).notNull(),
  actionType: versionActionTypeEnum('action_type').notNull(),
  patchNotes: text('patch_notes'),
  appliedBy: uuid('applied_by').references(() => users.id),
  appliedAt: timestamp('applied_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// On-prem status history table
export const onpremStatusHistory = pgTable('onprem_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  deploymentId: uuid('deployment_id')
    .notNull()
    .references(() => onpremDeployments.id, { onDelete: 'cascade' }),
  previousStatus: deploymentStatusEnum('previous_status'),
  newStatus: deploymentStatusEnum('new_status').notNull(),
  changedBy: uuid('changed_by').references(() => users.id),
  reason: text('reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// On-prem comments table
export const onpremComments = pgTable('onprem_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  deploymentId: uuid('deployment_id')
    .notNull()
    .references(() => onpremDeployments.id, { onDelete: 'cascade' }),
  comment: text('comment').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').default(false),
});

// Document category enum
export const documentCategoryEnum = pgEnum('document_category', ['rfp', 'other']);

// On-prem documents table
export const onpremDocuments = pgTable('onprem_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  deploymentId: uuid('deployment_id')
    .notNull()
    .references(() => onpremDeployments.id, { onDelete: 'cascade' }),
  category: documentCategoryEnum('category').notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileUrl: text('file_url').notNull(),
  mimeType: varchar('mime_type', { length: 255 }),
  fileSize: integer('file_size'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// License request status enum
export const licenseRequestStatusEnum = pgEnum('license_request_status', [
  'pending',
  'completed',
  'cancelled',
]);

// License request type enum
export const licenseRequestTypeEnum = pgEnum('license_request_type', [
  'license_renewal',
  'patch_update',
]);

// On-prem license requests table
export const onpremLicenseRequests = pgTable('onprem_license_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestNo: serial('request_no').notNull(),
  deploymentId: uuid('deployment_id')
    .notNull()
    .references(() => onpremDeployments.id, { onDelete: 'cascade' }),
  requestedBy: uuid('requested_by').references(() => users.id),
  status: licenseRequestStatusEnum('status').notNull().default('pending'),
  requestType: licenseRequestTypeEnum('request_type').notNull().default('license_renewal'),
  targetVersion: varchar('target_version', { length: 50 }),
  licenseStartDate: timestamp('license_start_date').notNull(),
  licenseEndDate: timestamp('license_end_date').notNull(),
  numberOfProjects: integer('number_of_projects').notNull(),
  notes: text('notes'),
  fingerprint: varchar('fingerprint', { length: 500 }),
  fileName: varchar('file_name', { length: 255 }),
  filePath: text('file_path'),
  fileSize: integer('file_size'),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  uploadedAt: timestamp('uploaded_at'),
  cancelledBy: uuid('cancelled_by').references(() => users.id),
  cancelledAt: timestamp('cancelled_at'),
  cancellationReason: text('cancellation_reason'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Types
export type OnpremDeployment = typeof onpremDeployments.$inferSelect;
export type NewOnpremDeployment = typeof onpremDeployments.$inferInsert;
export type OnpremStatusHistory = typeof onpremStatusHistory.$inferSelect;
export type NewOnpremStatusHistory = typeof onpremStatusHistory.$inferInsert;
export type OnpremComment = typeof onpremComments.$inferSelect;
export type NewOnpremComment = typeof onpremComments.$inferInsert;
export type OnpremDocument = typeof onpremDocuments.$inferSelect;
export type NewOnpremDocument = typeof onpremDocuments.$inferInsert;
export type OnpremLicenseRequest = typeof onpremLicenseRequests.$inferSelect;
export type NewOnpremLicenseRequest = typeof onpremLicenseRequests.$inferInsert;
export type DeploymentStatus = (typeof deploymentStatusEnum.enumValues)[number];
export type DocumentCategory = (typeof documentCategoryEnum.enumValues)[number];
export type LicenseRequestStatus = (typeof licenseRequestStatusEnum.enumValues)[number];
export type LicenseRequestType = (typeof licenseRequestTypeEnum.enumValues)[number];
