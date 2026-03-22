import { pgTable, uuid, varchar, timestamp, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

// Module enum for audit logs
export const auditModuleEnum = pgEnum('audit_module', ['auth', 'users', 'devices', 'onprem']);

// Audit logs table
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    module: auditModuleEnum('module').notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }),
    entityId: uuid('entity_id'),
    entityName: varchar('entity_name', { length: 255 }),
    changes: jsonb('changes').$type<{
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    }>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: varchar('user_agent', { length: 500 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_module_created_at_idx').on(table.module, table.createdAt),
    index('audit_logs_user_id_created_at_idx').on(table.userId, table.createdAt),
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),
  ]
);

// Types
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type AuditModule = (typeof auditModuleEnum.enumValues)[number];

// Audit action types by module
export const AuditActions = {
  auth: ['login', 'logout', 'login_failed', 'password_reset', 'password_reset_requested', 'token_refresh'] as const,
  users: [
    'invite_sent',
    'invite_accepted',
    'invite_revoked',
    'invite_resent',
    'user_created',
    'user_updated',
    'user_deleted',
    'role_changed',
  ] as const,
  devices: ['device_created', 'device_updated', 'device_deleted', 'status_changed', 'assigned_to_changed', 'purpose_changed'] as const,
  onprem: [
    'deployment_created',
    'deployment_updated',
    'deployment_deleted',
    'status_changed',
  ] as const,
} as const;

export type AuthAction = (typeof AuditActions.auth)[number];
export type UsersAction = (typeof AuditActions.users)[number];
export type DevicesAction = (typeof AuditActions.devices)[number];
export type OnpremAction = (typeof AuditActions.onprem)[number];
