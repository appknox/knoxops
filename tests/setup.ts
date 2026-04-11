import 'dotenv/config';
import { vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { db } from '../src/db/index.js';

// ============================================
// MOCK EXTERNAL INTEGRATIONS - NO REAL CALLS
// ============================================

// Mock Slack webhook service - prevents sending to Slack channels
vi.mock('../src/services/slack-notification.service.js', () => ({
  sendSlackNotification: vi.fn().mockResolvedValue(undefined),
  sendDeviceSlackNotification: vi.fn().mockResolvedValue(undefined),
  sendPatchReminders: vi.fn().mockResolvedValue(undefined),
  sendSaleAnnouncement: vi.fn().mockResolvedValue(undefined),
  getWebhook: vi.fn().mockReturnValue(null),
  getDeviceWebhook: vi.fn().mockReturnValue(null),
  getSaleWebhook: vi.fn().mockReturnValue(null),
}));

// Mock Email service - prevents sending to inboxes
vi.mock('../src/services/email.service.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendReleaseEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock S3 file service - prevents uploading/downloading from AWS
vi.mock('../src/services/file.service.js', () => ({
  savePrerequisiteFile: vi.fn().mockResolvedValue({
    s3Key: 'mock-prerequisite-key',
    fileName: 'test-prerequisites.xlsx',
    fileSize: 1024,
  }),
  saveSslCertificateFile: vi.fn().mockResolvedValue({
    s3Key: 'mock-ssl-cert-key',
    fileName: 'test-certs.zip',
    fileSize: 2048,
  }),
  saveDocumentFile: vi.fn().mockResolvedValue({
    s3Key: 'mock-document-key',
    fileName: 'test-document.pdf',
    fileUrl: 'mock-document-key',
    mimeType: 'application/pdf',
    fileSize: 4096,
  }),
  saveLicenseFile: vi.fn().mockResolvedValue({
    s3Key: 'mock-license-key',
    fileName: 'test-license.txt',
    fileSize: 512,
  }),
  getSignedUrl: vi.fn().mockResolvedValue('https://mocked-s3-signed-url.example.com/test-file'),
  deleteFileFromS3: vi.fn().mockResolvedValue(undefined),
  fileExistsInS3: vi.fn().mockResolvedValue(true),
  getS3FileStream: vi.fn().mockReturnValue(Buffer.from('mock file content')),
}));
import { users, refreshTokens, auditLogs, onpremDeployments, onpremStatusHistory, devices, deviceRequests, onpremLicenseRequests, entityComments } from '../src/db/schema/index.js';
import { hashPassword } from '../src/lib/password.js';
import { eq, like, sql, inArray, and } from 'drizzle-orm';
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
    role: 'admin' | 'devices_admin' | 'devices_viewer' | 'onprem_admin' | 'onprem_viewer' | 'full_viewer' | 'full_editor' | 'devices_admin_onprem_viewer' | 'onprem_admin_devices_viewer';
    password: string;
  },
  inviteStatus: 'accepted' | 'pending' = 'accepted'
) {
  const passwordHash = await hashPassword(userData.password);

  // Make email unique by adding timestamp if it already exists
  let email = userData.email.toLowerCase();
  let attempts = 0;
  while (attempts < 10) {
    try {
      const [user] = await db
        .insert(users)
        .values({
          email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          passwordHash: inviteStatus === 'accepted' ? passwordHash : null,
          status: inviteStatus === 'accepted' ? 'active' : 'pending',
        })
        .returning();

      return user;
    } catch (error: any) {
      if (error.code === '23505' && attempts < 9) {
        // Unique constraint violation, try again with modified email
        const parts = userData.email.toLowerCase().split('@');
        email = `${parts[0]}-${Date.now()}-${attempts}@${parts[1]}`;
        attempts++;
      } else {
        throw error;
      }
    }
  }

  throw new Error('Failed to create unique test user after 10 attempts');
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

// Helper to create test device
export async function createTestDevice(
  app: FastifyInstance,
  token: string,
  data: {
    type?: 'mobile' | 'tablet' | 'charging_hub';
    platform?: 'android' | 'ios' | 'cambrionix';
    serialNumber?: string;
    manufacturer?: string;
    model?: string;
    osVersion?: string;
    status?: string;
  } = {}
) {
  const defaultData = {
    type: data.type || 'mobile',
    serialNumber: data.serialNumber || `SN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    manufacturer: data.manufacturer || 'Apple',
    model: data.model || 'iPhone 15',
    ...(data.status ? { status: data.status } : {}),
    metadata: {
      platform: data.platform || 'ios',
      osVersion: data.osVersion || '17.3',
    },
  };

  const response = await app.inject({
    method: 'POST',
    url: '/api/devices',
    headers: { authorization: `Bearer ${token}` },
    payload: defaultData,
  });

  return response;
}

// Helper to create test device request
export async function createTestDeviceRequest(
  app: FastifyInstance,
  token: string,
  data: {
    deviceType?: 'mobile' | 'tablet' | 'charging_hub';
    platform?: 'ios' | 'android';
    osVersion?: string;
    purpose?: string;
    requestingFor?: string;
    additionalDetails?: string;
  } = {}
) {
  const defaultData = {
    deviceType: data.deviceType || 'mobile',
    platform: data.platform || 'ios',
    osVersion: data.osVersion || '17',
    purpose: data.purpose || 'Testing',
    requestingFor: data.requestingFor || 'Test User',
    additionalDetails: data.additionalDetails || 'Test details',
  };

  const response = await app.inject({
    method: 'POST',
    url: '/api/device-requests',
    headers: { authorization: `Bearer ${token}` },
    payload: defaultData,
  });

  return response;
}

// Helper to create test license request
export async function createTestLicenseRequest(
  app: FastifyInstance,
  token: string,
  deploymentId: string,
  data: {
    requestType?: string;
    targetVersion?: string;
    licenseStartDate?: string;
    licenseEndDate?: string;
    numberOfProjects?: number;
    fingerprint?: string;
  } = {}
) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 4); // 4 months to safely exceed 3-month minimum

  const defaultData = {
    requestType: data.requestType || 'license_renewal',
    targetVersion: data.targetVersion || '7.0.0',
    licenseStartDate: data.licenseStartDate || startDate.toISOString(),
    licenseEndDate: data.licenseEndDate || endDate.toISOString(),
    numberOfProjects: data.numberOfProjects || 5,
    fingerprint: data.fingerprint || 'test-fingerprint-123',
  };

  const response = await app.inject({
    method: 'POST',
    url: `/api/onprem/${deploymentId}/license-requests`,
    headers: { authorization: `Bearer ${token}` },
    payload: defaultData,
  });

  return response;
}

export async function cancelPendingLicenseRequestsForDeployment(deploymentId: string) {
  await db
    .update(onpremLicenseRequests)
    .set({ status: 'cancelled', cancellationReason: 'Test cleanup' })
    .where(
      and(
        eq(onpremLicenseRequests.deploymentId, deploymentId),
        eq(onpremLicenseRequests.status, 'pending')
      )
    );
}

export async function cleanupTestData() {
  // Find all test user IDs first — everything is scoped to these
  // This ensures we NEVER delete real data even if pointing at wrong DB
  const testUsersList = await db.query.users.findMany({
    where: like(users.email, '%@test.com'),
  });
  const testUserIds = testUsersList.map((u) => u.id);

  if (testUserIds.length === 0) return; // Nothing to clean up

  // Step 1: Delete comments created by test users
  try {
    await db.delete(entityComments).where(inArray(entityComments.createdBy, testUserIds));
  } catch (error) {
    console.error('Comment cleanup error (non-fatal):', error);
  }

  // Step 2: Delete license requests belonging to onprem deployments created by test users
  try {
    const testDeployments = await db.query.onpremDeployments.findMany({
      where: inArray(onpremDeployments.associatedCsmId, testUserIds),
      columns: { id: true },
    });
    const deploymentIds = testDeployments.map((d) => d.id);
    if (deploymentIds.length > 0) {
      await db.delete(onpremLicenseRequests).where(inArray(onpremLicenseRequests.deploymentId, deploymentIds));
    }
  } catch (error) {
    console.error('License request cleanup error (non-fatal):', error);
  }

  // Step 3: Delete device requests created by test users
  try {
    await db.delete(deviceRequests).where(inArray(deviceRequests.requestedBy, testUserIds));
  } catch (error) {
    console.error('Device request cleanup error (non-fatal):', error);
  }

  // Step 4: Delete devices registered by test users
  try {
    await db.delete(devices).where(inArray(devices.registeredBy, testUserIds));
  } catch (error) {
    console.error('Device cleanup error (non-fatal):', error);
  }

  // Step 5: Delete onprem status history + deployments created by test users
  try {
    const testDeployments = await db.query.onpremDeployments.findMany({
      where: inArray(onpremDeployments.associatedCsmId, testUserIds),
      columns: { id: true },
    });
    const deploymentIds = testDeployments.map((d) => d.id);
    if (deploymentIds.length > 0) {
      await db.delete(onpremStatusHistory).where(inArray(onpremStatusHistory.deploymentId, deploymentIds));
    }
    await db.delete(onpremDeployments).where(inArray(onpremDeployments.associatedCsmId, testUserIds));
  } catch (error) {
    console.error('OnPrem cleanup error (non-fatal):', error);
  }

  // Step 6: Delete audit logs + refresh tokens for test users
  try {
    await db.delete(auditLogs).where(inArray(auditLogs.userId, testUserIds));
  } catch (error) {
    console.error('Audit log cleanup error (non-fatal):', error);
  }
  try {
    await db.delete(refreshTokens).where(inArray(refreshTokens.userId, testUserIds));
  } catch (error) {
    console.error('Refresh token cleanup error (non-fatal):', error);
  }

  // Step 7: Delete test users last
  try {
    await db.delete(users).where(like(users.email, '%@test.com'));
  } catch (error) {
    console.error('User cleanup error (non-fatal):', error);
  }
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
  // Safety guard: refuse to run against non-test databases
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl.includes('_test') && !dbUrl.includes('test_')) {
    throw new Error(
      `DANGER: Tests must run against a test database.\n` +
      `Current DATABASE_URL points to: ${dbUrl.split('@').pop()}\n` +
      `Create a test DB and set DATABASE_URL to one containing "_test" in the name.`
    );
  }
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
