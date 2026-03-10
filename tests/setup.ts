import 'dotenv/config';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { users, userInvites, refreshTokens, auditLogs, onpremDeployments, onpremStatusHistory } from '../src/db/schema/index.js';
import { hashPassword } from '../src/lib/password.js';
import { eq, like, sql } from 'drizzle-orm';
import type { CreateOnpremInput } from '../src/modules/onprem/onprem.schema.js';

let app: FastifyInstance;

// Test users for different scenarios
export const testUsers = {
  admin: {
    email: 'admin@test.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin' as const,
    password: 'adminpass123',
  },
  member: {
    email: 'member@test.com',
    firstName: 'Member',
    lastName: 'User',
    role: 'full_viewer' as const,
    password: 'memberpass123',
  },
  pending: {
    email: 'pending@test.com',
    firstName: 'Pending',
    lastName: 'User',
    role: 'full_viewer' as const,
    password: 'pendingpass123',
  },
};

export async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  return app;
}

export async function createTestUser(
  userData: {
    email: string;
    firstName: string;
    lastName: string;
    role: 'admin' | 'devices_admin' | 'devices_viewer' | 'onprem_admin' | 'onprem_viewer' | 'full_viewer' | 'full_editor';
    password: string;
  },
  inviteStatus: 'accepted' | 'pending' = 'accepted'
) {
  const passwordHash = await hashPassword(userData.password);

  const [user] = await db
    .insert(users)
    .values({
      email: userData.email.toLowerCase(),
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role,
      passwordHash: inviteStatus === 'accepted' ? passwordHash : null,
      inviteStatus,
      isActive: true,
    })
    .returning();

  return user;
}

export async function loginUser(
  appInstance: FastifyInstance,
  email: string,
  password: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await appInstance.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });

  if (response.statusCode !== 200) {
    throw new Error(`Login failed: ${response.body}`);
  }

  return response.json();
}

// Helper to create test onprem deployment
export async function createTestOnpremDeployment(
  app: FastifyInstance,
  token: string,
  data: Partial<CreateOnpremInput> = {}
) {
  const adminUser = await db.query.users.findFirst({
    where: eq(users.email, testUsers.admin.email),
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/onprem',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      clientName: `Test Client ${Date.now()}`,
      contactEmail: `test-${Date.now()}@example.com`,
      contactPhone: `+1-555-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      associatedCsmId: adminUser?.id,
      ...data,
    },
  });
  return response;
}

// Cleanup onprem test data
export async function cleanupOnpremDeployments() {
  await db.delete(onpremStatusHistory).where(sql`1=1`);
  await db.delete(onpremDeployments).where(
    like(onpremDeployments.clientName, 'Test Client%')
  );
}

export async function cleanupTestData() {
  // Clean up onprem deployments first
  await cleanupOnpremDeployments();

  // Clean up in order to avoid foreign key issues
  // Find test user IDs
  const testUsersList = await db.query.users.findMany({
    where: like(users.email, '%@test.com'),
  });

  for (const user of testUsersList) {
    // Delete audit logs for this user
    await db.delete(auditLogs).where(eq(auditLogs.userId, user.id));
    // Delete refresh tokens for this user
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
  }

  // Delete invites
  await db.delete(userInvites).where(like(userInvites.email, '%@test.com'));

  // Delete users
  await db.delete(users).where(like(users.email, '%@test.com'));
}

export async function setupTestUsers() {
  // Create admin user (accepted invite)
  await createTestUser(testUsers.admin, 'accepted');

  // Create member user (accepted invite)
  await createTestUser(testUsers.member, 'accepted');

  // Create pending user (pending invite - cannot login)
  await createTestUser(testUsers.pending, 'pending');
}

export async function initializeTests() {
  await getApp();
  await cleanupTestData();
  await setupTestUsers();
}

export async function teardownTests() {
  await cleanupTestData();
  if (app) {
    await app.close();
    app = undefined as unknown as FastifyInstance;
  }
}
