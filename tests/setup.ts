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
    platform: data.platform || 'ios',
    serialNumber: data.serialNumber || `SN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    manufacturer: data.manufacturer || 'Apple',
    model: data.model || 'iPhone 15',
    osVersion: data.osVersion || '17.3',
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
  endDate.setMonth(endDate.getMonth() + 3);

  const defaultData = {
    requestType: data.requestType || 'new',
    targetVersion: data.targetVersion || '7.0.0',
    licenseStartDate: data.licenseStartDate || startDate.toISOString().split('T')[0],
    licenseEndDate: data.licenseEndDate || endDate.toISOString().split('T')[0],
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

// Cleanup test devices
export async function cleanupTestDevices() {
  try {
    // Delete all devices (test DB only, so this is safe)
    await db.delete(devices).where(sql`1=1`);
  } catch (error) {
    // Ignore FK errors
    console.error('Device cleanup error (non-fatal):', error);
  }
}

// Cleanup device requests
export async function cleanupDeviceRequests() {
  await db.delete(deviceRequests).where(sql`1=1`);
}

// Cleanup license requests
export async function cleanupLicenseRequests() {
  await db.delete(onpremLicenseRequests).where(sql`1=1`);
}

// Cleanup onprem test data
export async function cleanupOnpremDeployments() {
  try {
    // Delete all onprem documents first
    // (Assuming there's an onpremDocuments table - add if it exists)
    // await db.delete(onpremDocuments).where(sql`1=1`);
  } catch (error) {
    // Ignore if table doesn't exist
  }

  try {
    // Delete all status history
    await db.delete(onpremStatusHistory).where(sql`1=1`);
  } catch (error) {
    // Ignore if table is empty or doesn't exist
  }

  try {
    // Delete all onprem deployments (test DB only, so safe)
    await db.delete(onpremDeployments).where(sql`1=1`);
  } catch (error) {
    console.error('OnPrem cleanup error (non-fatal):', error);
  }
}

export async function cleanupTestData() {
  // Clean up in order to avoid foreign key issues
  // Dependencies: entityComments -> users, devices -> users, etc.

  // Step 1: Delete all comments (may have FK to users)
  try {
    await db.delete(entityComments).where(sql`1=1`);
  } catch (error) {
    console.error('Comment cleanup error (non-fatal):', error);
  }

  // Step 2: Delete license requests
  await cleanupLicenseRequests();

  // Step 3: Delete device requests (may have FK to users)
  await cleanupDeviceRequests();

  // Step 4: Delete all devices (may have registered_by FK to users)
  await cleanupTestDevices();

  // Step 5: Delete onprem deployments (may have associated_csm_id FK to users)
  await cleanupOnpremDeployments();

  // Step 6: Delete audit logs and refresh tokens for test users
  try {
    const testUsersList = await db.query.users.findMany({
      where: like(users.email, '%@test.com'),
    });

    for (const user of testUsersList) {
      try {
        await db.delete(auditLogs).where(eq(auditLogs.userId, user.id));
      } catch (e) {
        // Ignore
      }
      try {
        await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
      } catch (e) {
        // Ignore
      }
    }
  } catch (error) {
    // Ignore if users don't exist
  }

  // Step 7: Delete all test users (last, after all FK dependencies)
  try {
    await db.delete(users).where(like(users.email, '%@test.com'));
  } catch (error) {
    // Ignore foreign key errors - some users might still be referenced
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
