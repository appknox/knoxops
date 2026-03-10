import { z } from 'zod';
import { deviceStatusEnum, deviceTypeEnum } from '../../db/schema/index.js';

export const createDeviceSchema = z.object({
  name: z.string().min(1).max(255),
  serialNumber: z.string().max(100).optional(),
  type: z.enum(deviceTypeEnum.enumValues),
  status: z.enum(deviceStatusEnum.enumValues).optional().default('active'),
  manufacturer: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  location: z.string().max(255).optional(),
  description: z.string().optional(),
  // Operational fields (direct columns)
  purpose: z.string().max(100).optional(),
  assignedTo: z.string().max(255).optional(),
  // Technical specs in metadata (ipAddress, macAddress, cpuArch, rom, platform, colour, imei, simNumber)
  metadata: z.record(z.unknown()).optional(),
});

export const updateDeviceSchema = createDeviceSchema.partial();

export const listDevicesQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  type: z.enum(deviceTypeEnum.enumValues).optional(),
  status: z.enum(deviceStatusEnum.enumValues).optional(),
  platform: z.string().optional(),
  purpose: z.string().optional(),
  assignedTo: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'status', 'type']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type ListDevicesQuery = z.infer<typeof listDevicesQuerySchema>;
