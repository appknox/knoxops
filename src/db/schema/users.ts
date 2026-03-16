import { pgTable, uuid, varchar, timestamp, boolean, pgEnum, text } from 'drizzle-orm/pg-core';

// Role enum
export const roleEnum = pgEnum('role', [
  'admin',
  'devices_admin',
  'devices_viewer',
  'onprem_admin',
  'onprem_viewer',
  'full_viewer',
  'full_editor',
]);

// User status enum
export const userStatusEnum = pgEnum('user_status', ['pending', 'active', 'expired', 'deleted']);

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  role: roleEnum('role').notNull().default('full_viewer'),
  status: userStatusEnum('status').notNull().default('pending'),
  inviteToken: varchar('invite_token', { length: 255 }),
  inviteExpiresAt: timestamp('invite_expires_at'),
  invitedBy: uuid('invited_by'),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Refresh tokens table
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 500 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  revokedAt: timestamp('revoked_at'),
});

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
export type Role = (typeof roleEnum.enumValues)[number];
export type UserStatus = (typeof userStatusEnum.enumValues)[number];
