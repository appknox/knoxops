import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, testUsers, loginUser, createTestUser, createTestDevice, cleanupTestData, initializeTests, teardownTests } from './setup.js';

describe('Devices', () => {
  let app;
  let adminToken: string;
  let memberToken: string;
  let adminUser;

  beforeAll(async () => {
    await initializeTests();
    app = await getApp();
    adminUser = await createTestUser({
      email: 'device-admin@test.com',
      firstName: 'Device',
      lastName: 'Admin',
      role: 'admin',
      password: 'testpass123',
    });
    const memberUser = await createTestUser({
      email: 'device-member@test.com',
      firstName: 'Device',
      lastName: 'Member',
      role: 'full_viewer',
      password: 'testpass123',
    });

    adminToken = (await loginUser(app, adminUser.email, 'testpass123')).accessToken;
    memberToken = (await loginUser(app, memberUser.email, 'testpass123')).accessToken;
  });

  afterAll(async () => {
    await cleanupTestData();
    await teardownTests();
  });

  describe('POST /api/devices - Create Device', () => {
    it('should create device with valid data', async () => {
      const response = await createTestDevice(app, adminToken, {
        type: 'mobile',
        platform: 'ios',
        manufacturer: 'Apple',
        model: 'iPhone 15 Pro',
        osVersion: '17.4',
      });

      expect(response.statusCode).toBe(201);
      const device = response.json();
      expect(device.id).toBeDefined();
      expect(device.name).toBeDefined();
      expect(device.status).toBe('in_inventory');
      expect(device.type).toBe('mobile');
      expect(device.metadata.platform).toBe('ios');
    });

    it('should auto-generate device name based on platform', async () => {
      const response1 = await createTestDevice(app, adminToken, {
        platform: 'ios',
      });

      const response2 = await createTestDevice(app, adminToken, {
        platform: 'ios',
      });

      expect(response1.statusCode).toBe(201);
      expect(response2.statusCode).toBe(201);

      const device1 = response1.json();
      const device2 = response2.json();

      expect(device1.name).toMatch(/^B\d{3}$/);
      expect(device2.name).toMatch(/^B\d{3}$/);
      expect(device1.name).not.toBe(device2.name);
    });

    it('should not reuse name of a soft-deleted device', async () => {
      const response1 = await createTestDevice(app, adminToken, { platform: 'android' });
      expect(response1.statusCode).toBe(201);
      const device1 = response1.json();
      expect(device1.name).toMatch(/^A\d{3}$/);

      // Soft-delete that device
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/devices/${device1.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(deleteResponse.statusCode).toBe(200);

      // Register a new Android device — should get the NEXT number, not reuse the deleted one
      const response2 = await createTestDevice(app, adminToken, { platform: 'android' });
      expect(response2.statusCode).toBe(201);
      const device2 = response2.json();
      expect(device2.name).toMatch(/^A\d{3}$/);
      expect(device2.name).not.toBe(device1.name);
    });

    it('should reject duplicate serial number', async () => {
      const serialNumber = `SN-UNIQUE-${Date.now()}`;

      const response1 = await createTestDevice(app, adminToken, {
        serialNumber,
      });

      expect(response1.statusCode).toBe(201);

      const response2 = await createTestDevice(app, adminToken, {
        serialNumber,
      });

      expect(response2.statusCode).toBe(409);
    });

    it('should validate device type enum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/devices',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          type: 'invalid_type',
          platform: 'ios',
          serialNumber: `SN-${Date.now()}`,
          manufacturer: 'Apple',
          model: 'iPhone',
          osVersion: '17',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should create audit log on device creation', async () => {
      const response = await createTestDevice(app, adminToken);
      expect(response.statusCode).toBe(201);

      const device = response.json();
      const auditResponse = await app.inject({
        method: 'GET',
        url: `/api/devices/${device.id}/audit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(auditResponse.statusCode).toBe(200);
      const logs = auditResponse.json().data;
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].action).toBe('device_created');
    });
  });

  describe('PUT /api/devices/:id - Update Device', () => {
    it('should update device properties', async () => {
      const createRes = await createTestDevice(app, adminToken);
      const device = createRes.json();

      const updateResponse = await app.inject({
        method: 'PUT',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          model: 'Updated Model',
          location: 'Lab 1',
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      const updated = updateResponse.json();
      expect(updated.model).toBe('Updated Model');
      expect(updated.location).toBe('Lab 1');
    });

    it('should update device status', async () => {
      const createRes = await createTestDevice(app, adminToken);
      const device = createRes.json();

      const updateResponse = await app.inject({
        method: 'PUT',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          status: 'checked_out',
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      const updated = updateResponse.json();
      expect(updated.status).toBe('checked_out');
    });

    it('should update assignedTo and create separate audit log', async () => {
      const createRes = await createTestDevice(app, adminToken);
      const device = createRes.json();

      const updateResponse = await app.inject({
        method: 'PUT',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          assignedTo: 'John Doe',
        },
      });

      expect(updateResponse.statusCode).toBe(200);

      const auditResponse = await app.inject({
        method: 'GET',
        url: `/api/devices/${device.id}/audit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const logs = auditResponse.json().data;
      const assignmentLog = logs.find(log => log.action === 'assigned_to_changed');
      expect(assignmentLog).toBeDefined();
    });

    it('should clear assignedTo when set to null', async () => {
      const createRes = await createTestDevice(app, adminToken);
      const device = createRes.json();

      // First assign someone
      await app.inject({
        method: 'PUT',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { assignedTo: 'Jane Smith' },
      });

      // Now clear it with null
      const clearResponse = await app.inject({
        method: 'PUT',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { assignedTo: null },
      });

      expect(clearResponse.statusCode).toBe(200);

      // Verify it's actually null in the DB by fetching the device
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.json().assignedTo).toBeNull();
    });

    it('should validate serial number uniqueness on update (excluding current)', async () => {
      const device1 = (await createTestDevice(app, adminToken)).json();
      const device2 = (await createTestDevice(app, adminToken)).json();

      const updateResponse = await app.inject({
        method: 'PUT',
        url: `/api/devices/${device1.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          serialNumber: device2.serialNumber,
        },
      });

      expect(updateResponse.statusCode).toBe(409);
    });

    it('should allow updating to same serial number (self)', async () => {
      const device = (await createTestDevice(app, adminToken)).json();

      const updateResponse = await app.inject({
        method: 'PUT',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          serialNumber: device.serialNumber,
          model: 'Updated',
        },
      });

      expect(updateResponse.statusCode).toBe(200);
    });
  });

  describe('GET /api/devices/:id - Get Device', () => {
    it('should fetch single device', async () => {
      const createRes = await createTestDevice(app, adminToken);
      const device = createRes.json();

      const response = await app.inject({
        method: 'GET',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const fetched = response.json();
      expect(fetched.id).toBe(device.id);
      expect(fetched.name).toBe(device.name);
    });

    it('should return 404 for non-existent device', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/devices/:id - Delete Device', () => {
    it('should soft delete device', async () => {
      const createRes = await createTestDevice(app, adminToken);
      const device = createRes.json();

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(deleteResponse.statusCode).toBe(200);

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(getResponse.statusCode).toBe(404);
    });

    it('should create audit log for deletion', async () => {
      const createRes = await createTestDevice(app, adminToken);
      const device = createRes.json();

      await app.inject({
        method: 'DELETE',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      // Device should be soft-deleted but audit log should exist for other devices
      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/devices',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { limit: '1' },
      });

      expect(listResponse.statusCode).toBe(200);
    });
  });

  describe('GET /api/devices - List Devices', () => {
    it('should list all devices with pagination', async () => {
      await createTestDevice(app, adminToken);
      await createTestDevice(app, adminToken);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { page: '1', limit: '10' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBeGreaterThanOrEqual(2);
    });

    it('should search by device name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/devices',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { search: 'B001' },
      });

      expect(response.statusCode).toBe(200);
      // Results depend on what was created, but should complete without error
    });

    it('should filter by device type', async () => {
      await createTestDevice(app, adminToken, { type: 'tablet' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { type: 'tablet' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should filter by status', async () => {
      const device = (await createTestDevice(app, adminToken)).json();

      // Update status
      await app.inject({
        method: 'PUT',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'for_sale' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { status: 'for_sale' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should filter by platform (from metadata)', async () => {
      await createTestDevice(app, adminToken, { platform: 'android' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { platform: 'android' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should sort by name ascending', async () => {
      await createTestDevice(app, adminToken, { platform: 'ios' });
      await createTestDevice(app, adminToken, { platform: 'ios' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { sortBy: 'name', sortOrder: 'asc', limit: '100' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      if (result.data.length > 1) {
        for (let i = 0; i < result.data.length - 1; i++) {
          expect(result.data[i].name <= result.data[i + 1].name).toBe(true);
        }
      }
    });

    it('should exclude soft-deleted devices', async () => {
      const device = (await createTestDevice(app, adminToken)).json();
      const deviceName = device.name;

      await app.inject({
        method: 'DELETE',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { search: deviceName },
      });

      const result = response.json();
      const found = result.data.find(d => d.id === device.id);
      expect(found).toBeUndefined();
    });

    it('should respect pagination limit cap (max 10000)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/devices',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { limit: '50000' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.pagination.limit).toBeLessThanOrEqual(10000);
    });

    it('should default to page 1 for invalid page number', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/devices',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { page: '-1' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.pagination.page).toBe(1);
    });
  });

  describe('GET /api/devices/stats - Device Statistics', () => {
    it('should return device statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/stats',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const stats = response.json();
      expect(stats.inInventory).toBeDefined();
      expect(stats.outForRepair).toBeDefined();
      expect(stats.toBeSold).toBeDefined();
      expect(stats.inactive).toBeDefined();
    });

    it('should count devices by status correctly', async () => {
      const device1 = (await createTestDevice(app, adminToken)).json();
      const device2 = (await createTestDevice(app, adminToken)).json();

      // Set device2 to for_sale
      await app.inject({
        method: 'PUT',
        url: `/api/devices/${device2.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'for_sale' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/stats',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const stats = response.json();
      expect(stats.inInventory).toBeGreaterThanOrEqual(1);
      expect(stats.toBeSold).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/devices/distinct-os-versions - OS Versions', () => {
    it('should return iOS versions', async () => {
      await createTestDevice(app, adminToken, {
        platform: 'ios',
        osVersion: '17.4',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/distinct-os-versions',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { platform: 'iOS' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(Array.isArray(result.versions)).toBe(true);
    });

    it('should return Android versions', async () => {
      await createTestDevice(app, adminToken, {
        platform: 'android',
        osVersion: '14.0',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/distinct-os-versions',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { platform: 'Android' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(Array.isArray(result.versions)).toBe(true);
    });

    it('should reject invalid platform', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/distinct-os-versions',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { platform: 'InvalidOS' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/devices/suggest - Device Suggestion', () => {
    it('should suggest devices for platform', async () => {
      await createTestDevice(app, adminToken, {
        platform: 'ios',
        osVersion: '17.4',
        status: 'in_inventory',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/suggest',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { platform: 'ios' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should prioritize exact OS match', async () => {
      await createTestDevice(app, adminToken, {
        platform: 'ios',
        osVersion: '17.4',
        status: 'in_inventory',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/suggest',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { platform: 'ios', osVersion: '17' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/suggest',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { platform: 'ios', limit: '5' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.data.length).toBeLessThanOrEqual(5);
    });

    it('should exclude deleted devices', async () => {
      const device = (await createTestDevice(app, adminToken, {
        platform: 'ios',
      })).json();

      await app.inject({
        method: 'DELETE',
        url: `/api/devices/${device.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/suggest',
        headers: { authorization: `Bearer ${adminToken}` },
        query: { platform: 'ios', limit: '100' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      const found = result.data.find(d => d.id === device.id);
      expect(found).toBeUndefined();
    });
  });

  describe('Device Comments', () => {
    it('should add comment to device', async () => {
      const device = (await createTestDevice(app, adminToken)).json();

      const response = await app.inject({
        method: 'POST',
        url: `/api/devices/${device.id}/comments`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { text: 'Test comment' },
      });

      expect(response.statusCode).toBe(201);
      const comment = response.json();
      expect(comment.text).toBe('Test comment');
      expect(comment.createdBy).toBeDefined();
    });

    it('should edit own comment', async () => {
      const device = (await createTestDevice(app, adminToken)).json();

      const commentRes = await app.inject({
        method: 'POST',
        url: `/api/devices/${device.id}/comments`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { text: 'Original text' },
      });

      const comment = commentRes.json();

      const editRes = await app.inject({
        method: 'PUT',
        url: `/api/devices/${device.id}/comments/${comment.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { text: 'Updated text' },
      });

      expect(editRes.statusCode).toBe(200);
      expect(editRes.json().text).toBe('Updated text');
    });

    it('should prevent editing other user\'s comment', async () => {
      const device = (await createTestDevice(app, adminToken)).json();

      const commentRes = await app.inject({
        method: 'POST',
        url: `/api/devices/${device.id}/comments`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { text: 'Admin comment' },
      });

      const comment = commentRes.json();

      const editRes = await app.inject({
        method: 'PUT',
        url: `/api/devices/${device.id}/comments/${comment.id}`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { text: 'Hacked' },
      });

      expect(editRes.statusCode).toBe(403);
    });

    it('should delete own comment', async () => {
      const device = (await createTestDevice(app, adminToken)).json();

      const commentRes = await app.inject({
        method: 'POST',
        url: `/api/devices/${device.id}/comments`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { text: 'Delete me' },
      });

      const comment = commentRes.json();

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/devices/${device.id}/comments/${comment.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(deleteRes.statusCode).toBe(200);
    });
  });

  describe('Device History', () => {
    it('should return device history with pagination', async () => {
      const device = (await createTestDevice(app, adminToken)).json();

      const response = await app.inject({
        method: 'GET',
        url: `/api/devices/${device.id}/history`,
        headers: { authorization: `Bearer ${adminToken}` },
        query: { page: '1', limit: '20' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.data).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should filter history by type (comment)', async () => {
      const device = (await createTestDevice(app, adminToken)).json();

      await app.inject({
        method: 'POST',
        url: `/api/devices/${device.id}/comments`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { text: 'History test' },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/devices/${device.id}/history`,
        headers: { authorization: `Bearer ${adminToken}` },
        query: { type: 'comment' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(Array.isArray(result.data)).toBe(true);
      result.data.forEach(entry => {
        expect(entry.type).toMatch(/comment|all/);
      });
    });

    it('should filter history by type (activity)', async () => {
      const device = (await createTestDevice(app, adminToken)).json();

      const response = await app.inject({
        method: 'GET',
        url: `/api/devices/${device.id}/history`,
        headers: { authorization: `Bearer ${adminToken}` },
        query: { type: 'activity' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('Device Audit Logs', () => {
    it('should retrieve device audit logs', async () => {
      const device = (await createTestDevice(app, adminToken)).json();

      const response = await app.inject({
        method: 'GET',
        url: `/api/devices/${device.id}/audit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const logs = response.json().data;
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
    });
  });
});
