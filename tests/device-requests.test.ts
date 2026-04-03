import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, testUsers, loginUser, createTestUser, createTestDevice, createTestDeviceRequest, cleanupTestData, initializeTests, teardownTests } from './setup.js';

describe('Device Requests', () => {
  let app;
  let adminToken: string;
  let requesterToken: string;
  let adminUser;
  let requesterUser;

  beforeAll(async () => {
    await initializeTests();
    app = await getApp();
    adminUser = await createTestUser({
      email: 'request-admin@test.com',
      firstName: 'Request',
      lastName: 'Admin',
      role: 'admin',
      password: 'testpass123',
    });
    requesterUser = await createTestUser({
      email: 'request-requester@test.com',
      firstName: 'Request',
      lastName: 'Requester',
      role: 'full_viewer',
      password: 'testpass123',
    });

    adminToken = (await loginUser(app, adminUser.email, 'testpass123')).accessToken;
    requesterToken = (await loginUser(app, requesterUser.email, 'testpass123')).accessToken;
  });

  afterAll(async () => {
    await cleanupTestData();
    await teardownTests();
  });

  describe('POST /api/device-requests - Create Request', () => {
    it('should create device request with valid data', async () => {
      const response = await createTestDeviceRequest(app, requesterToken, {
        deviceType: 'mobile',
        platform: 'ios',
        osVersion: '17',
        purpose: 'Testing iOS 17',
        requestingFor: 'QA Team',
      });

      expect(response.statusCode).toBe(201);
      const request = response.json();
      expect(request.id).toBeDefined();
      expect(request.requestNo).toBeDefined();
      expect(request.status).toBe('pending');
      expect(request.deviceType).toBe('mobile');
      expect(request.platform).toBe('ios');
    });

    it('should auto-generate requestNo', async () => {
      const response1 = await createTestDeviceRequest(app, requesterToken);
      const response2 = await createTestDeviceRequest(app, requesterToken);

      expect(response1.statusCode).toBe(201);
      expect(response2.statusCode).toBe(201);

      const request1 = response1.json();
      const request2 = response2.json();

      expect(request1.requestNo).toBeDefined();
      expect(request2.requestNo).toBeDefined();
      expect(request1.requestNo).not.toBe(request2.requestNo);
    });

    it('should validate deviceType enum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/device-requests',
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          deviceType: 'invalid',
          platform: 'ios',
          osVersion: '17',
          purpose: 'Test',
          requestingFor: 'User',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require purpose field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/device-requests',
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          deviceType: 'mobile',
          platform: 'ios',
          osVersion: '17',
          requestingFor: 'User',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require requestingFor field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/device-requests',
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          deviceType: 'mobile',
          platform: 'ios',
          osVersion: '17',
          purpose: 'Test',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/device-requests - List Requests', () => {
    it('should list user\'s own requests', async () => {
      await createTestDeviceRequest(app, requesterToken);

      const response = await app.inject({
        method: 'GET',
        url: '/api/device-requests',
        headers: { authorization: `Bearer ${requesterToken}` },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.pagination).toBeDefined();
    });

    it('should allow admin to see all requests', async () => {
      await createTestDeviceRequest(app, requesterToken);

      const response = await app.inject({
        method: 'GET',
        url: '/api/device-requests',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/device-requests',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { page: '1', limit: '10' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });
  });

  describe('GET /api/device-requests/:id - Get Request', () => {
    it('should fetch single request', async () => {
      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      const response = await app.inject({
        method: 'GET',
        url: `/api/device-requests/${request.id}`,
        headers: { authorization: `Bearer ${requesterToken}` },
      });

      expect(response.statusCode).toBe(200);
      const fetched = response.json();
      expect(fetched.id).toBe(request.id);
      expect(fetched.requestNo).toBe(request.requestNo);
    });

    it('should allow requester to see own request', async () => {
      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      const response = await app.inject({
        method: 'GET',
        url: `/api/device-requests/${request.id}`,
        headers: { authorization: `Bearer ${requesterToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow admin to see any request', async () => {
      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      const response = await app.inject({
        method: 'GET',
        url: `/api/device-requests/${request.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 404 for non-existent request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/device-requests/non-existent-id',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/device-requests/:id/approve - Approve Request', () => {
    it('should approve pending request', async () => {
      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const approved = response.json();
      expect(approved.status).toBe('approved');
      expect(approved.approvedBy).toBeDefined();
      expect(approved.approvedAt).toBeDefined();
    });

    it('should capture approver identity', async () => {
      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const approved = response.json();
      expect(approved.approvedBy).toBe(adminUser.id);
    });

    it('should require manage:Device permission', async () => {
      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      // Non-admin trying to approve
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/approve`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(403);
    });

    it('should not allow approving from rejected state', async () => {
      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      // Reject first
      await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/reject`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: 'Invalid request' },
      });

      // Try to approve rejected request
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/device-requests/:id/reject - Reject Request', () => {
    it('should reject pending request with reason', async () => {
      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/reject`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: 'Device not available' },
      });

      expect(response.statusCode).toBe(200);
      const rejected = response.json();
      expect(rejected.status).toBe('rejected');
      expect(rejected.rejectionReason).toBe('Device not available');
      expect(rejected.rejectedBy).toBeDefined();
      expect(rejected.rejectedAt).toBeDefined();
    });

    it('should require rejection reason', async () => {
      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/reject`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should allow rejecting from approved state', async () => {
      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      // Approve first
      await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      // Then reject
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/reject`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: 'Changed mind' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('rejected');
    });

    it('should capture rejector identity', async () => {
      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/reject`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: 'Test' },
      });

      expect(response.statusCode).toBe(200);
      const rejected = response.json();
      expect(rejected.rejectedBy).toBe(adminUser.id);
    });
  });

  describe('PATCH /api/device-requests/:id/complete - Complete Request', () => {
    it('should complete approved request without device allocation', async () => {
      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      // Approve first
      await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/complete`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const completed = response.json();
      expect(completed.status).toBe('completed');
      expect(completed.completedBy).toBeDefined();
      expect(completed.completedAt).toBeDefined();
    });

    it('should allocate device on completion', async () => {
      const deviceRes = await createTestDevice(app, adminToken);
      const device = deviceRes.json();

      const createRes = await createTestDeviceRequest(app, requesterToken, {
        requestingFor: 'Allocated User',
      });
      const request = createRes.json();

      // Approve first
      await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/complete`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { linkedDeviceId: device.id },
      });

      expect(response.statusCode).toBe(200);
      const completed = response.json();
      expect(completed.linkedDeviceId).toBe(device.id);

      // Verify device status changed
      const deviceCheckRes = await app.inject({
        method: 'GET',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const updatedDevice = deviceCheckRes.json();
      expect(updatedDevice.status).toBe('checked_out');
      expect(updatedDevice.assignedTo).toBe('Allocated User');
      expect(updatedDevice.purpose).toBe(request.purpose);
    });

    it('should set assignedTo from requestingFor or requester name', async () => {
      const deviceRes = await createTestDevice(app, adminToken);
      const device = deviceRes.json();

      const createRes = await createTestDeviceRequest(app, requesterToken, {
        requestingFor: 'Specific User',
      });
      const request = createRes.json();

      // Approve
      await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      // Complete
      await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/complete`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { linkedDeviceId: device.id },
      });

      const deviceCheckRes = await app.inject({
        method: 'GET',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(deviceCheckRes.json().assignedTo).toBe('Specific User');
    });

    it('should create audit log for device allocation', async () => {
      const deviceRes = await createTestDevice(app, adminToken);
      const device = deviceRes.json();

      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      // Approve
      await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      // Complete
      await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/complete`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { linkedDeviceId: device.id },
      });

      const auditRes = await app.inject({
        method: 'GET',
        url: `/api/devices/${device.id}/audit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const logs = auditRes.json().data;
      const allocationLog = logs.find(log => log.action === 'device_allocated_from_request');
      expect(allocationLog).toBeDefined();
    });

    it('should not allow completing from pending state', async () => {
      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/complete`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require manage:Device permission', async () => {
      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      // Approve
      await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      // Non-admin tries to complete
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/complete`,
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Device Request State Transitions', () => {
    it('should prevent invalid state transitions', async () => {
      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      // Reject the request
      await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/reject`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: 'Invalid' },
      });

      // Try to approve rejected request
      const approveRes = await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      expect(approveRes.statusCode).toBe(400);
    });

    it('should support complete workflow: pending -> approved -> completed', async () => {
      const deviceRes = await createTestDevice(app, adminToken);
      const device = deviceRes.json();

      const createRes = await createTestDeviceRequest(app, requesterToken);
      const request = createRes.json();

      // Pending -> Approved
      const approveRes = await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });
      expect(approveRes.statusCode).toBe(200);
      expect(approveRes.json().status).toBe('approved');

      // Approved -> Completed
      const completeRes = await app.inject({
        method: 'PATCH',
        url: `/api/device-requests/${request.id}/complete`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { linkedDeviceId: device.id },
      });
      expect(completeRes.statusCode).toBe(200);
      expect(completeRes.json().status).toBe('completed');
    });
  });
});
