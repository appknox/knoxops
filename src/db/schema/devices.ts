import { pgTable, uuid, varchar, timestamp, text, jsonb, pgEnum, boolean, numeric, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

// Device status enum
export const deviceStatusEnum = pgEnum('device_status', [
  'in_inventory',
  'checked_out',
  'maintenance',
  'decommissioned',
  'sold',
  'for_sale',
  'not_verified',
]);

// Device type enum
export const deviceTypeEnum = pgEnum('device_type', [
  'server',
  'workstation',
  'mobile',
  'tablet',
  'iot',
  'network',
  'charging_hub',
  'other',
]);

// Devices table
export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  serialNumber: varchar('serial_number', { length: 100 }),
  type: deviceTypeEnum('type').notNull(),
  status: deviceStatusEnum('status').notNull().default('in_inventory'),
  manufacturer: varchar('manufacturer', { length: 100 }),
  model: varchar('model', { length: 100 }),
  location: varchar('location', { length: 255 }),
  description: text('description'),
  // Operational fields (direct columns)
  purpose: varchar('purpose', { length: 100 }),
  assignedTo: varchar('assigned_to', { length: 255 }),
  // Device sale fields
  condition: varchar('condition', { length: 50 }),
  conditionNotes: text('condition_notes'),
  askingPrice: numeric('asking_price', { precision: 10, scale: 2 }),
  // Technical specs stored in metadata (includes macAddress, cpuArch, osVersion, platform, imei, imei2, udid, modelNumber, etc.)
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  registeredBy: uuid('registered_by').references(() => users.id),
  lastUpdatedBy: uuid('last_updated_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  isDeleted: boolean('is_deleted').default(false),
}, (table) => [
  // Partial unique index: only enforce serial number uniqueness among non-deleted devices
  uniqueIndex('devices_serial_number_active_unique')
    .on(table.serialNumber)
    .where(sql`${table.serialNumber} IS NOT NULL AND ${table.isDeleted} = false`),
]);

// Types
export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
export type DeviceStatus = (typeof deviceStatusEnum.enumValues)[number];
export type DeviceType = (typeof deviceTypeEnum.enumValues)[number];
