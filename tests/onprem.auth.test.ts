import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getApp,
  loginUser,
  initializeTests,
  teardownTests,
  createTestUser,
  createTestOnpremDeployment,
  testUsers,
} from './setup.js';

// Role-specific tokens populated in beforeAll
let adminToken: string;
let onpremAdminToken: string;
let onpremViewerToken: string;
let fullEditorToken: string;
let fullViewerToken: string;
let devicesAdminToken: string;
let devicesViewerToken: string;

// A real deployment ID for update/delete/get tests
let testDeploymentId: string;

describe('Onprem API — Authentication & Authorization', () => {
  beforeAll(async () => {
    await initializeTests(); // creates admin + member test users, cleans up

    const app = await getApp();

    // Create one user per role
    await createTestUser({
      email: 'onprem-admin@test.com',
      firstName: 'OnpremAdmin',
      lastName: 'User',
      role: 'onprem_admin',
      password: 'pass123',
    });
    await createTestUser({
      email: 'onprem-viewer@test.com',
      firstName: 'OnpremViewer',
      lastName: 'User',
      role: 'onprem_viewer',
      password: 'pass123',
    });
    await createTestUser({
      email: 'full-editor@test.com',
      firstName: 'FullEditor',
      lastName: 'User',
      role: 'full_editor',
      password: 'pass123',
    });
    await createTestUser({
      email: 'full-viewer@test.com',
      firstName: 'FullViewer',
      lastName: 'User',
      role: 'full_viewer',
      password: 'pass123',
    });
    await createTestUser({
      email: 'devices-admin@test.com',
      firstName: 'DevicesAdmin',
      lastName: 'User',
      role: 'devices_admin',
      password: 'pass123',
    });
    await createTestUser({
      email: 'devices-viewer@test.com',
      firstName: 'DevicesViewer',
      lastName: 'User',
      role: 'devices_viewer',
      password: 'pass123',
    });

    // Login all users to get tokens
    const adminRes = await loginUser(app, testUsers.admin.email, testUsers.admin.password);
    adminToken = adminRes.accessToken;

    const onpremAdminRes = await loginUser(app, 'onprem-admin@test.com', 'pass123');
    onpremAdminToken = onpremAdminRes.accessToken;

    const onpremViewerRes = await loginUser(app, 'onprem-viewer@test.com', 'pass123');
    onpremViewerToken = onpremViewerRes.accessToken;

    const fullEditorRes = await loginUser(app, 'full-editor@test.com', 'pass123');
    fullEditorToken = fullEditorRes.accessToken;

    const fullViewerRes = await loginUser(app, 'full-viewer@test.com', 'pass123');
    fullViewerToken = fullViewerRes.accessToken;

    const devicesAdminRes = await loginUser(app, 'devices-admin@test.com', 'pass123');
    devicesAdminToken = devicesAdminRes.accessToken;

    const devicesViewerRes = await loginUser(app, 'devices-viewer@test.com', 'pass123');
    devicesViewerToken = devicesViewerRes.accessToken;

    // Create a test deployment using admin (to use as fixture for update/delete tests)
    const created = await createTestOnpremDeployment(app, adminToken);
    const createdData = created.json();
    testDeploymentId = createdData.id;
  });

  afterAll(async () => {
    await teardownTests();
  });

  // Describe Block 1 — Unauthenticated Requests (no token)
  describe('Unauthenticated requests → 401', () => {
    it('GET /api/onprem returns 401', async () => {
      const app = await getApp();
      const res = await app.inject({ method: 'GET', url: '/api/onprem' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /api/onprem returns 401', async () => {
      const app = await getApp();
      const res = await app.inject({ method: 'POST', url: '/api/onprem', payload: {} });
      expect(res.statusCode).toBe(401);
    });

    it('PUT /api/onprem/:id returns 401', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/onprem/${testDeploymentId}`,
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });

    it('DELETE /api/onprem/:id returns 401', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/onprem/${testDeploymentId}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /api/onprem/:id returns 401', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/onprem/${testDeploymentId}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /api/onprem/check-email returns 401', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/onprem/check-email?email=x@y.com',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // Describe Block 2 — Invalid Token
  describe('Invalid/expired token → 401', () => {
    it('GET /api/onprem returns 401 for a bogus token', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/onprem',
        headers: { authorization: 'Bearer this-is-not-a-valid-jwt' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // Describe Block 3 — devices_admin Role (no OnPrem access)
  describe('devices_admin role → 403 on all onprem endpoints', () => {
    it('GET /api/onprem returns 403', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/onprem',
        headers: { authorization: `Bearer ${devicesAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /api/onprem returns 403', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/onprem',
        payload: { clientName: 'Test' },
        headers: { authorization: `Bearer ${devicesAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('PUT /api/onprem/:id returns 403', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/onprem/${testDeploymentId}`,
        payload: { notes: 'test' },
        headers: { authorization: `Bearer ${devicesAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE /api/onprem/:id returns 403', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/onprem/${testDeploymentId}`,
        headers: { authorization: `Bearer ${devicesAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('GET /api/onprem/:id returns 403', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/onprem/${testDeploymentId}`,
        headers: { authorization: `Bearer ${devicesAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // Describe Block 4 — devices_viewer Role (no OnPrem access)
  describe('devices_viewer role → 403 on all onprem endpoints', () => {
    it('GET /api/onprem returns 403', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/onprem',
        headers: { authorization: `Bearer ${devicesViewerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /api/onprem returns 403', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/onprem',
        payload: { clientName: 'Test' },
        headers: { authorization: `Bearer ${devicesViewerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // Describe Block 5 — onprem_viewer Role (read-only)
  describe('onprem_viewer role — read allowed, writes blocked', () => {
    it('GET /api/onprem returns 200', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/onprem',
        headers: { authorization: `Bearer ${onpremViewerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('GET /api/onprem/:id returns 200', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/onprem/${testDeploymentId}`,
        headers: { authorization: `Bearer ${onpremViewerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('POST /api/onprem returns 403', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/onprem',
        payload: { clientName: 'Test' },
        headers: { authorization: `Bearer ${onpremViewerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('PUT /api/onprem/:id returns 403', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/onprem/${testDeploymentId}`,
        payload: { notes: 'test' },
        headers: { authorization: `Bearer ${onpremViewerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE /api/onprem/:id returns 403', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/onprem/${testDeploymentId}`,
        headers: { authorization: `Bearer ${onpremViewerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('GET /api/onprem/check-email returns 200', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/onprem/check-email?email=test@test.com',
        headers: { authorization: `Bearer ${onpremViewerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // Describe Block 6 — full_viewer Role (read-only)
  describe('full_viewer role — read allowed, writes blocked', () => {
    it('GET /api/onprem returns 200', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/onprem',
        headers: { authorization: `Bearer ${fullViewerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('GET /api/onprem/:id returns 200', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/onprem/${testDeploymentId}`,
        headers: { authorization: `Bearer ${fullViewerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('POST /api/onprem returns 403', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/onprem',
        payload: { clientName: 'Test' },
        headers: { authorization: `Bearer ${fullViewerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE /api/onprem/:id returns 403', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/onprem/${testDeploymentId}`,
        headers: { authorization: `Bearer ${fullViewerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // Describe Block 7 — onprem_admin Role (manage, but cannot delete)
  describe('onprem_admin role — can create/update, cannot delete', () => {
    it('GET /api/onprem returns 200', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/onprem',
        headers: { authorization: `Bearer ${onpremAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('POST /api/onprem creates successfully (201)', async () => {
      const app = await getApp();
      const created = await createTestOnpremDeployment(app, onpremAdminToken);
      expect(created.statusCode).toBe(201);
    });

    it('PUT /api/onprem/:id updates successfully (200)', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/onprem/${testDeploymentId}`,
        payload: { notes: 'updated by onprem_admin' },
        headers: { authorization: `Bearer ${onpremAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('DELETE /api/onprem/:id returns 403', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/onprem/${testDeploymentId}`,
        headers: { authorization: `Bearer ${onpremAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // Describe Block 8 — full_editor Role (full manage including delete)
  describe('full_editor role — full access including delete', () => {
    let deleteTestDeploymentId: string;

    beforeAll(async () => {
      const app = await getApp();
      const created = await createTestOnpremDeployment(app, adminToken);
      deleteTestDeploymentId = created.json().id;
    });

    it('GET /api/onprem returns 200', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/onprem',
        headers: { authorization: `Bearer ${fullEditorToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('POST /api/onprem creates successfully (201)', async () => {
      const app = await getApp();
      const created = await createTestOnpremDeployment(app, fullEditorToken);
      expect(created.statusCode).toBe(201);
    });

    it('PUT /api/onprem/:id updates successfully (200)', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/onprem/${testDeploymentId}`,
        payload: { notes: 'updated by full_editor' },
        headers: { authorization: `Bearer ${fullEditorToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('DELETE /api/onprem/:id deletes successfully (200)', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/onprem/${deleteTestDeploymentId}`,
        headers: { authorization: `Bearer ${fullEditorToken}` },
      });
      expect([200, 204]).toContain(res.statusCode);
    });
  });
});
