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

// Users
let adminToken: string;
let onpremViewerToken: string;
let devicesAdminToken: string;

// Test fixtures
let testDeploymentId: string;
let commentByAdminId: string;

describe('Onprem Comments — Authorization & Ownership', () => {
  beforeAll(async () => {
    await initializeTests();

    const app = await getApp();

    // Create test users
    await createTestUser({
      email: 'onprem-viewer@test.com',
      firstName: 'OnpremViewer',
      lastName: 'User',
      role: 'onprem_viewer',
      password: 'pass123',
    });

    await createTestUser({
      email: 'devices-admin@test.com',
      firstName: 'DevicesAdmin',
      lastName: 'User',
      role: 'devices_admin',
      password: 'pass123',
    });

    // Login users
    const adminRes = await loginUser(app, testUsers.admin.email, testUsers.admin.password);
    adminToken = adminRes.accessToken;

    const viewerRes = await loginUser(app, 'onprem-viewer@test.com', 'pass123');
    onpremViewerToken = viewerRes.accessToken;

    const devicesRes = await loginUser(app, 'devices-admin@test.com', 'pass123');
    devicesAdminToken = devicesRes.accessToken;

    // Create test deployment
    const deploymentRes = await createTestOnpremDeployment(app, adminToken);
    testDeploymentId = deploymentRes.json().id;

    // Create a comment by admin for use in ownership tests
    const commentRes = await app.inject({
      method: 'POST',
      url: `/api/onprem/${testDeploymentId}/comments`,
      payload: { comment: 'Test comment by admin' },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const commentData = commentRes.json();
    commentByAdminId = commentData.id;
  });

  afterAll(async () => {
    await teardownTests();
  });

  // Test Group 1 — Unauthenticated (no token → 401)
  describe('Unauthenticated comment endpoints → 401', () => {
    it('GET /:id/comments returns 401 without token', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/onprem/${testDeploymentId}/comments`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /:id/comments returns 401 without token', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/onprem/${testDeploymentId}/comments`,
        payload: { comment: 'Test' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('PUT /:id/comments/:commentId returns 401 without token', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/onprem/${testDeploymentId}/comments/${commentByAdminId}`,
        payload: { comment: 'Updated' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('DELETE /:id/comments/:commentId returns 401 without token', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/onprem/${testDeploymentId}/comments/${commentByAdminId}`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // Test Group 2 — No OnPrem access (devices_admin → 403)
  describe('devices_admin role (no OnPrem access) → 403 on all comment endpoints', () => {
    it('GET /:id/comments returns 403 for devices_admin', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/onprem/${testDeploymentId}/comments`,
        headers: { authorization: `Bearer ${devicesAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /:id/comments returns 403 for devices_admin', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/onprem/${testDeploymentId}/comments`,
        payload: { comment: 'Test' },
        headers: { authorization: `Bearer ${devicesAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('PUT /:id/comments/:commentId returns 403 for devices_admin', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/onprem/${testDeploymentId}/comments/${commentByAdminId}`,
        payload: { comment: 'Updated' },
        headers: { authorization: `Bearer ${devicesAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE /:id/comments/:commentId returns 403 for devices_admin', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/onprem/${testDeploymentId}/comments/${commentByAdminId}`,
        headers: { authorization: `Bearer ${devicesAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // Test Group 3 — Create a Comment
  describe('Comment creation with different roles', () => {
    it('admin can create a comment (201)', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/onprem/${testDeploymentId}/comments`,
        payload: { comment: 'Comment by admin' },
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.comment).toBe('Comment by admin');
    });

    it('onprem_viewer can create a comment (201)', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/onprem/${testDeploymentId}/comments`,
        payload: { comment: 'Comment by viewer' },
        headers: { authorization: `Bearer ${onpremViewerToken}` },
      });
      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.comment).toBe('Comment by viewer');
    });

    it('devices_admin cannot create a comment (403)', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/onprem/${testDeploymentId}/comments`,
        payload: { comment: 'Should fail' },
        headers: { authorization: `Bearer ${devicesAdminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // Test Group 4 — Ownership: Edit
  describe('Comment editing — ownership verification', () => {
    let adminCommentId: string;

    beforeAll(async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/onprem/${testDeploymentId}/comments`,
        payload: { comment: 'Test comment for edit' },
        headers: { authorization: `Bearer ${adminToken}` },
      });
      adminCommentId = res.json().id;
    });

    it('creator (admin) can edit their own comment (200)', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/onprem/${testDeploymentId}/comments/${adminCommentId}`,
        payload: { comment: 'Updated by creator' },
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.comment).toBe('Updated by creator');
    });

    it('non-creator gets 403 when editing another user\'s comment', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/onprem/${testDeploymentId}/comments/${adminCommentId}`,
        payload: { comment: 'Unauthorized edit' },
        headers: { authorization: `Bearer ${onpremViewerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // Test Group 5 — Ownership: Delete
  describe('Comment deletion — ownership verification', () => {
    let adminCommentId: string;

    beforeAll(async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/onprem/${testDeploymentId}/comments`,
        payload: { comment: 'Test comment for deletion' },
        headers: { authorization: `Bearer ${adminToken}` },
      });
      adminCommentId = res.json().id;
    });

    it('creator (admin) can delete their own comment (200)', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/onprem/${testDeploymentId}/comments/${adminCommentId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect([200, 204]).toContain(res.statusCode);
    });

    it('non-creator gets 403 when deleting another user\'s comment', async () => {
      const app = await getApp();
      // Create a comment by admin
      const createRes = await app.inject({
        method: 'POST',
        url: `/api/onprem/${testDeploymentId}/comments`,
        payload: { comment: 'Comment for deletion test' },
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const commentId = createRes.json().id;

      // Try to delete it as viewer
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/onprem/${testDeploymentId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${onpremViewerToken}` },
      });
      expect(deleteRes.statusCode).toBe(403);
    });
  });

  // Test Group 6 — Soft Delete Verification
  describe('Soft delete verification', () => {
    it('deleted comment does not appear in GET /:id/comments list', async () => {
      const app = await getApp();

      // Create a comment
      const createRes = await app.inject({
        method: 'POST',
        url: `/api/onprem/${testDeploymentId}/comments`,
        payload: { comment: 'Comment to be deleted' },
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const commentId = createRes.json().id;

      // Delete it
      await app.inject({
        method: 'DELETE',
        url: `/api/onprem/${testDeploymentId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      // Verify it's not in the list
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/onprem/${testDeploymentId}/comments`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const comments = listRes.json().data || [];
      const deletedComment = comments.find((c: any) => c.id === commentId);
      expect(deletedComment).toBeUndefined();
    });
  });
});
