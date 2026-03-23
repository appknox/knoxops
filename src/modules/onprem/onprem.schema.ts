import { z } from 'zod';
import { deploymentStatusEnum } from '../../db/schema/index.js';

// Enums for client fields
const clientStatusEnum = z.enum(['active', 'inactive']);
const environmentTypeEnum = z.enum(['poc', 'production']);
const maintenancePlanEnum = z.enum(['quarterly', 'annually']);

// Consolidated infrastructure metadata schema
const infrastructureSchema = z
  .object({
    hypervisor: z
      .object({
        type: z.string().max(50).optional(), // Allow any string for flexibility
        version: z.string().max(50).optional(),
        customType: z.string().max(100).optional(), // For "other" option
      })
      .optional(),
    network: z
      .object({
        staticIP: z.string().max(45).optional(),
        gateway: z.string().max(45).optional(),
        netmask: z.string().max(45).optional(),
        dnsServers: z.array(z.string()).optional(),
        ntpServer: z.string().max(255).optional(),
        smtpServer: z.string().max(255).optional(),
        lanSpeed: z.enum(['100mbps', '1gbps', '10gbps', '']).optional(),
        wifiStandard: z.enum(['wifi5', 'wifi6', 'wifi6e', '']).optional(),
      })
      .optional(),
    server: z
      .object({
        cpuCores: z.number().int().min(1).optional(),
        ramGB: z.number().int().min(1).optional(),
        storageGB: z.number().int().min(1).optional(),
        size: z.enum(['small', 'medium', 'large', 'enterprise', '']).optional(),
      })
      .optional(),
    fingerprint: z.string().max(500).optional(),
  })
  .optional();

// License information schema
const licenseSchema = z
  .object({
    userFullName: z.string().max(255).optional(),
    email: z.string().email('Invalid email format').max(255).optional(),
    username: z.string().max(100).optional(),
    startDate: z
      .string()
      .optional()
      .transform((val) => (val ? new Date(val) : undefined)),
    endDate: z
      .string()
      .optional()
      .transform((val) => (val ? new Date(val) : undefined)),
    pricingPlan: z.enum(['per app', 'per scan']).optional().default('per app'),
    numberOfApps: z.number().int().min(1).optional(),
  })
  .optional()
  .refine(
    (data) => {
      // If both dates exist, endDate must be after startDate
      if (data?.startDate && data?.endDate) {
        return new Date(data.endDate) > new Date(data.startDate);
      }
      return true;
    },
    {
      message: 'License end date must be after start date',
      path: ['endDate'],
    }
  );

export const createOnpremSchema = z.object({
  // Section 1: Client & Ownership (new fields)
  clientName: z.string().min(1, 'Client name is required').max(255),
  clientStatus: clientStatusEnum.optional().default('active'),
  environmentType: environmentTypeEnum.optional().default('poc'),
  associatedCsmId: z.string().uuid('Must be a valid UUID').min(1, 'Associated CSM is required'),
  contactEmail: z.string().min(1, 'Contact email is required').email('Invalid email format'),
  contactPhone: z.string().min(1, 'Contact phone is required').max(50),

  // Section 2: Deployment & Versioning
  firstDeploymentDate: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  currentVersion: z.string().max(50).optional(),
  maintenancePlan: maintenancePlanEnum.optional(),
  nextScheduledPatchDate: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),

  // Section 3: Prerequisites
  domainName: z.string().max(255).optional(),
  sslCertificateFileUrl: z.string().optional(),

  // Section 4: Infrastructure & Technical Details (consolidated)
  infrastructure: infrastructureSchema,

  // Section 5: License Information
  license: licenseSchema,

  // Legacy fields (for backward compatibility)
  customerId: z.string().max(100).optional(),
  customerName: z.string().max(255).optional(),
  status: z.enum(deploymentStatusEnum.enumValues).optional().default('provisioning'),
  version: z.string().max(50).optional(),
  hostname: z.string().max(255).optional(),
  region: z.string().max(100).optional(),
  environment: z.string().max(50).optional(),
  nodeCount: z.number().int().min(1).optional().default(1),
  configuration: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
});

export const updateOnpremSchema = createOnpremSchema.partial();

export const updateStatusSchema = z.object({
  status: z.enum(deploymentStatusEnum.enumValues),
  reason: z.string().optional(),
});

export const listOnpremQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  status: z.enum(deploymentStatusEnum.enumValues).optional(),
  clientStatus: clientStatusEnum.optional(),
  environmentType: environmentTypeEnum.optional(),
  currentVersion: z.string().optional(),
  currentVersions: z.union([z.string(), z.array(z.string())]).optional().transform((val) => {
    if (val === undefined || val === null || val === '') return undefined;
    if (Array.isArray(val)) {
      return val.filter((v) => v !== '');
    }
    if (typeof val === 'string') {
      // Handle comma-separated values
      return val
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v !== '');
    }
    return undefined;
  }),
  csmIds: z.union([z.string(), z.array(z.string())]).optional().transform((val) => {
    if (val === undefined || val === null || val === '') return undefined;
    if (Array.isArray(val)) {
      return val.filter((v) => v !== '');
    }
    if (typeof val === 'string') {
      // Handle comma-separated values
      return val
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v !== '');
    }
    return undefined;
  }),
  maintenancePlan: maintenancePlanEnum.optional(),
  environment: z.string().optional(),
  region: z.string().optional(),
  sortBy: z.enum(['clientName', 'createdAt', 'updatedAt', 'status', 'customerName', 'lastPatchDate']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Comment schemas
export const createCommentSchema = z.object({
  comment: z.string().min(1, 'Comment cannot be empty').max(5000, 'Comment too long (max 5000 characters)'),
});

export const updateCommentSchema = z.object({
  comment: z.string().min(1, 'Comment cannot be empty').max(5000, 'Comment too long (max 5000 characters)'),
});

export type CreateOnpremInput = z.infer<typeof createOnpremSchema>;
export type UpdateOnpremInput = z.infer<typeof updateOnpremSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ListOnpremQuery = z.infer<typeof listOnpremQuerySchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
