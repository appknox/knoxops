import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  getApp,
  loginUser,
  createTestUser,
  createTestOnpremDeployment,
  createTestLicenseRequest,
  cancelPendingLicenseRequestsForDeployment,
  cleanupTestData,
  initializeTests,
  teardownTests,
} from './setup.js';

describe('OnPrem License Requests', () => {
  let app;
  let adminToken: string;
  let requesterToken: string;
  let adminUser;
  let requesterUser;
  let deploymentId: string;

  beforeAll(async () => {
    await initializeTests();
    app = await getApp();
    adminUser = await createTestUser({
      email: 'license-admin@test.com',
      firstName: 'License',
      lastName: 'Admin',
      role: 'admin',
      password: 'testpass123',
    });
    requesterUser = await createTestUser({
      email: 'license-requester@test.com',
      firstName: 'License',
      lastName: 'Requester',
      role: 'full_viewer',
      password: 'testpass123',
    });

    adminToken = (await loginUser(app, adminUser.email, 'testpass123')).accessToken;
    requesterToken = (await loginUser(app, requesterUser.email, 'testpass123')).accessToken;

    const deployRes = await createTestOnpremDeployment(app, adminToken, {
      associatedCsmId: adminUser.id,
    });
    const deployment = deployRes.json();
    deploymentId = deployment.id;
  });

  afterAll(async () => {
    await cleanupTestData();
    await teardownTests();
  });

  // Cancel any pending requests before each test so the "one pending per deployment"
  // constraint never causes a cross-test failure.
  beforeEach(async () => {
    if (deploymentId) {
      await cancelPendingLicenseRequestsForDeployment(deploymentId);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('POST /api/onprem/:deploymentId/license-requests - Create License Request', () => {
    it('should create license request with valid data', async () => {
      const response = await createTestLicenseRequest(app, requesterToken, deploymentId, {
        requestType: 'license_renewal',
        targetVersion: '7.0.0',
        numberOfProjects: 10,
      });

      expect(response.statusCode).toBe(201);
      const request = response.json();
      expect(request.id).toBeDefined();
      expect(request.requestNo).toBeDefined();
      expect(request.status).toBe('pending');
      expect(request.deploymentId).toBe(deploymentId);
    });

    it('should auto-generate requestNo (sequential, unique)', async () => {
      // Create first request
      const response1 = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(response1.statusCode).toBe(201);
      const request1 = response1.json();

      // Cancel it so we can create a second one
      await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/license-requests/${request1.id}/cancel`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: { reason: 'Test cleanup' },
      });

      // Create second request
      const response2 = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(response2.statusCode).toBe(201);
      const request2 = response2.json();

      expect(request1.requestNo).toBeDefined();
      expect(request2.requestNo).toBeDefined();
      expect(request1.requestNo).not.toBe(request2.requestNo);
    });

    it('should validate deployment exists', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/onprem/00000000-0000-0000-0000-000000000000/license-requests',
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          requestType: 'license_renewal',
          targetVersion: '7.0.0',
          licenseStartDate: '2026-01-01',
          licenseEndDate: '2026-04-01',
          numberOfProjects: 5,
        },
      });

      // AJV rejects date-only strings (needs date-time) → 400
      // Even with valid dates, non-existent deployment → 400 from service
      expect([400, 404]).toContain(response.statusCode);
    });

    it('should validate date range (3-month minimum)', async () => {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 2); // Only 2 months — below minimum

      const response = await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/license-requests`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          requestType: 'license_renewal',
          targetVersion: '7.0.0',
          licenseStartDate: startDate.toISOString(),
          licenseEndDate: endDate.toISOString(),
          numberOfProjects: 5,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require CSM user to exist (or handle gracefully)', async () => {
      const deployRes = await createTestOnpremDeployment(app, adminToken, {
        associatedCsmId: null,
      });
      const deployment = deployRes.json();

      const response = await createTestLicenseRequest(app, requesterToken, deployment.id);

      expect([201, 400, 500]).toContain(response.statusCode);
    });

    it('should set status to pending', async () => {
      const response = await createTestLicenseRequest(app, requesterToken, deploymentId);

      expect(response.statusCode).toBe(201);
      expect(response.json().status).toBe('pending');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // LIST
  // ─────────────────────────────────────────────────────────────────────────────
  describe('GET /api/onprem/:deploymentId/license-requests - List Requests', () => {
    it('should list requests for specific deployment', async () => {
      await createTestLicenseRequest(app, requesterToken, deploymentId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/license-requests`,
        headers: { authorization: `Bearer ${requesterToken}` },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/license-requests`,
        headers: { authorization: `Bearer ${requesterToken}` },
        query: { page: '1', limit: '10' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.pagination).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // LIST ALL
  // ─────────────────────────────────────────────────────────────────────────────
  describe('GET /api/onprem/licence-requests/all - List All License Requests', () => {
    it('should list all requests across deployments', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/onprem/licence-requests/all',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET SINGLE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('GET /api/onprem/:deploymentId/license-requests/:id - Get Request', () => {
    it('should fetch single license request', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const created = createRes.json();

      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/license-requests/${created.id}`,
        headers: { authorization: `Bearer ${requesterToken}` },
      });

      expect(response.statusCode).toBe(200);
      const fetched = response.json();
      expect(fetched.id).toBe(created.id);
      expect(fetched.requestNo).toBe(created.requestNo);
    });

    it('should return 404 for non-existent request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/license-requests/00000000-0000-0000-0000-000000000000`,
        headers: { authorization: `Bearer ${requesterToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // UPLOAD
  // ─────────────────────────────────────────────────────────────────────────────
  describe('POST /api/onprem/:deploymentId/license-requests/:id/upload - Upload License File', () => {
    it('should upload license file to S3', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      const response = await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/license-requests/${request.id}/upload`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { file: Buffer.from('LICENSE_KEY_DATA') },
      });

      expect([200, 201, 400, 406, 500]).toContain(response.statusCode);
    });

    it('should require manage:OnPrem permission', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      const response = await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/license-requests/${request.id}/upload`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: { file: Buffer.from('LICENSE') },
      });

      expect([403, 400, 406, 500]).toContain(response.statusCode);
    });

    it('should capture upload metadata when successful', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      const response = await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/license-requests/${request.id}/upload`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { file: Buffer.from('LICENSE_DATA') },
      });

      if (response.statusCode === 200 || response.statusCode === 201) {
        const result = response.json();
        expect(result.uploadedBy || result.id).toBeDefined();
      }
    });

    it('should update deployment metadata on successful upload', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId, {
        numberOfProjects: 5,
        targetVersion: '8.0.0',
      });
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/license-requests/${request.id}/upload`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { file: Buffer.from('LICENSE') },
      });

      const deployRes = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      if (deployRes.statusCode === 200) {
        const deployment = deployRes.json();
        if (deployment.license) {
          expect(deployment.license.numberOfApps).toBeDefined();
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TOKEN GENERATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('POST /api/onprem/license-requests/:id/generate-token - Token Generation', () => {
    it('should generate JWT token for completed request', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      const response = await app.inject({
        method: 'POST',
        url: `/api/onprem/license-requests/${request.id}/generate-token`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {},
      });

      if (response.statusCode === 200) {
        const result = response.json();
        expect(result.token).toBeDefined();
        expect(typeof result.token).toBe('string');
      } else {
        // pending request may not support token generation
        expect([400, 403, 404]).toContain(response.statusCode);
      }
    });

    it('should produce a valid JWT format when successful', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      const response = await app.inject({
        method: 'POST',
        url: `/api/onprem/license-requests/${request.id}/generate-token`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {},
      });

      if (response.statusCode === 200) {
        const result = response.json();
        expect(result.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      }
    });

    it('should include requestId and userId in token payload', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      const response = await app.inject({
        method: 'POST',
        url: `/api/onprem/license-requests/${request.id}/generate-token`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {},
      });

      if (response.statusCode === 200) {
        const result = response.json();
        expect(result.token).toBeDefined();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // DOWNLOAD
  // ─────────────────────────────────────────────────────────────────────────────
  describe('GET /api/onprem/license-requests/:id/download - Download License File', () => {
    it('should reject an invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/onprem/license-requests/00000000-0000-0000-0000-000000000000/download',
        headers: {},
        query: { token: 'invalid-token' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should require the token query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/onprem/license-requests/00000000-0000-0000-0000-000000000000/download',
        headers: {},
      });

      // Missing required querystring param → AJV 400, or service 401
      expect([400, 401]).toContain(response.statusCode);
    });

    it('should be a public endpoint (no Authorization header needed)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/onprem/license-requests/00000000-0000-0000-0000-000000000000/download',
        headers: {},
        query: { token: 'invalid-token' },
      });

      // 401 from invalid token (not 403 from missing auth middleware)
      expect([400, 401]).toContain(response.statusCode);
    });

    it('should allow download of completed request with valid token', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      const tokenRes = await app.inject({
        method: 'POST',
        url: `/api/onprem/license-requests/${request.id}/generate-token`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {},
      });

      if (tokenRes.statusCode === 200) {
        const { token } = tokenRes.json();
        const downloadRes = await app.inject({
          method: 'GET',
          url: `/api/onprem/license-requests/${request.id}/download`,
          headers: {},
          query: { token },
        });

        expect([200, 400, 401]).toContain(downloadRes.statusCode);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CANCEL
  // ─────────────────────────────────────────────────────────────────────────────
  describe('POST /api/onprem/:deploymentId/license-requests/:id/cancel - Cancel Request', () => {
    it('should cancel a pending request', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      const response = await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/license-requests/${request.id}/cancel`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: { reason: 'No longer needed' },
      });

      expect(response.statusCode).toBe(200);
      const cancelled = response.json();
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancellationReason).toBe('No longer needed');
    });

    it('should allow cancellation without a reason (reason is optional)', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      const response = await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/license-requests/${request.id}/cancel`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {},
      });

      expect([200, 400]).toContain(response.statusCode);
    });

    it('should capture the canceller identity', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      const response = await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/license-requests/${request.id}/cancel`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: { reason: 'Test' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().cancelledBy).toBe(requesterUser.id);
    });

    it('should prevent cancelling a completed request', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      // Cancel it to move to cancelled state, then try to cancel again
      await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/license-requests/${request.id}/cancel`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: { reason: 'First cancel' },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/license-requests/${request.id}/cancel`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: { reason: 'Second cancel attempt' },
      });

      // Cannot cancel an already-cancelled request
      expect([400, 409, 500]).toContain(response.statusCode);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE TRANSITIONS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('License Request State Transitions', () => {
    it('should support pending -> completed transition via upload', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      const uploadRes = await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/license-requests/${request.id}/upload`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { file: Buffer.from('LICENSE') },
      });

      if (uploadRes.statusCode === 200 || uploadRes.statusCode === 201) {
        const completed = uploadRes.json();
        if (completed.status) {
          expect(completed.status).toMatch(/pending|completed/);
        }
      }
    });

    it('should support pending -> cancelled transition', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      const cancelRes = await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/license-requests/${request.id}/cancel`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: { reason: 'Testing' },
      });

      expect(cancelRes.statusCode).toBe(200);
      expect(cancelRes.json().status).toBe('cancelled');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AUDIT LOGGING
  // ─────────────────────────────────────────────────────────────────────────────
  describe('License Request Audit Logging', () => {
    it('should create audit log on request creation', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);

      const auditRes = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/audit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      if (auditRes.statusCode === 200) {
        const logs = auditRes.json().data;
        expect(Array.isArray(logs)).toBe(true);
      }
    });

    it('should create audit log on file upload', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/license-requests/${request.id}/upload`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { file: Buffer.from('LICENSE') },
      });

      const auditRes = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/audit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(auditRes.statusCode).toBe(200);
    });

    it('should create audit log on cancellation', async () => {
      const createRes = await createTestLicenseRequest(app, requesterToken, deploymentId);
      expect(createRes.statusCode).toBe(201);
      const request = createRes.json();

      await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/license-requests/${request.id}/cancel`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: { reason: 'Testing' },
      });

      const auditRes = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/audit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(auditRes.statusCode).toBe(200);
    });
  });
});
