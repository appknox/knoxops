import { pgTable, uuid, varchar, text, timestamp, pgEnum, index, serial } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { devices } from './devices.js';

export const deviceRequestStatusEnum = pgEnum('device_request_status', [
  'pending',
  'approved',
  'rejected',
  'completed',
]);

export const deviceRequests = pgTable(
  'device_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestNo: serial('request_no').notNull(),
    requestedBy: uuid('requested_by').notNull().references(() => users.id),
    deviceType: varchar('device_type', { length: 50 }).notNull(),
    platform: varchar('platform', { length: 50 }).notNull(),
    osVersion: varchar('os_version', { length: 50 }),
    purpose: text('purpose').notNull(),
    requestingFor: varchar('requesting_for', { length: 255 }),
    status: deviceRequestStatusEnum('status').notNull().default('pending'),
    rejectionReason: text('rejection_reason'),
    linkedDeviceId: uuid('linked_device_id').references(() => devices.id),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at'),
    rejectedBy: uuid('rejected_by').references(() => users.id),
    rejectedAt: timestamp('rejected_at'),
    completedBy: uuid('completed_by').references(() => users.id),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('device_requests_requested_by_idx').on(t.requestedBy),
    index('device_requests_status_idx').on(t.status),
  ]
);

export type DeviceRequest = typeof deviceRequests.$inferSelect;
export type NewDeviceRequest = typeof deviceRequests.$inferInsert;
export type DeviceRequestStatus = (typeof deviceRequestStatusEnum.enumValues)[number];
