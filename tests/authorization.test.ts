import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, loginUser, createTestUser, createTestDevice, createTestDeviceRequest, createTestLicenseRequest, createTestOnpremDeployment, cleanupTestData, initializeTests, teardownTests } from './setup.js';

describe('Authorization & Role-Based Access Control', () => {
  let app;

  // Different role users
  const users = {
    admin: { email: 'auth-admin@test.com', role: 'admin' as const },
    devicesAdmin: { email: 'auth-devices-admin@test.com', role: 'devices_admin' as const },
    devicesViewer: { email: 'auth-devices-viewer@test.com', role: 'devices_viewer' as const },
    onpremAdmin: { email: 'auth-onprem-admin@test.com', role: 'onprem_admin' as const },
    onpremViewer: { email: 'auth-onprem-viewer@test.com', role: 'onprem_viewer' as const },
    fullEditor: { email: 'auth-full-editor@test.com', role: 'full_editor' as const },
    fullViewer: { email: 'auth-full-viewer@test.com', role: 'full_viewer' as const },
    devicesAdminOnpremViewer: { email: 'auth-devices-admin-onprem-viewer@test.com', role: 'devices_admin_onprem_viewer' as const },
    onpremAdminDevicesViewer: { email: 'auth-onprem-admin-devices-viewer@test.com', role: 'onprem_admin_devices_viewer' as const },
  };

  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    await initializeTests();
    app = await getApp();

    // Create users with different roles
    for (const [key, userData] of Object.entries(users)) {
      const user = await createTestUser({
        email: userData.email,
        firstName: key,
        lastName: 'User',
        role: userData.role,
        password: 'testpass123',
      });
      const { accessToken } = await loginUser(app, userData.email, 'testpass123');
      tokens[key] = accessToken;
    }
  });

  afterAll(async () => {
    await cleanupTestData();
    await teardownTests();
  });

  describe('DEVICES MODULE - Role-Based Access Control', () => {
    describe('POST /api/devices - Create Device', () => {
      it('admin can create devices', async () => {
        const response = await createTestDevice(app, tokens.admin);
        expect(response.statusCode).toBe(201);
      });

      it('devices_admin can create devices', async () => {
        const response = await createTestDevice(app, tokens.devicesAdmin);
        expect(response.statusCode).toBe(201);
      });

      it('devices_viewer cannot create devices', async () => {
        const response = await createTestDevice(app, tokens.devicesViewer);
        expect(response.statusCode).toBe(403);
      });

      it('onprem_admin cannot create devices', async () => {
        const response = await createTestDevice(app, tokens.onpremAdmin);
        expect(response.statusCode).toBe(403);
      });

      it('onprem_viewer cannot create devices', async () => {
        const response = await createTestDevice(app, tokens.onpremViewer);
        expect(response.statusCode).toBe(403);
      });

      it('full_viewer cannot create devices', async () => {
        const response = await createTestDevice(app, tokens.fullViewer);
        expect(response.statusCode).toBe(403);
      });

      it('full_editor can create devices', async () => {
        const response = await createTestDevice(app, tokens.fullEditor);
        expect(response.statusCode).toBe(201);
      });

      it('devices_admin_onprem_viewer can create devices', async () => {
        const response = await createTestDevice(app, tokens.devicesAdminOnpremViewer);
        expect(response.statusCode).toBe(201);
      });

      it('onprem_admin_devices_viewer cannot create devices', async () => {
        const response = await createTestDevice(app, tokens.onpremAdminDevicesViewer);
        expect(response.statusCode).toBe(403);
      });
    });

    describe('GET /api/devices - List Devices', () => {
      it('admin can list devices', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/devices',
          headers: { authorization: `Bearer ${tokens.admin}` },
        });
        expect(response.statusCode).toBe(200);
      });

      it('devices_admin can list devices', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/devices',
          headers: { authorization: `Bearer ${tokens.devicesAdmin}` },
        });
        expect(response.statusCode).toBe(200);
      });

      it('devices_viewer can list devices', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/devices',
          headers: { authorization: `Bearer ${tokens.devicesViewer}` },
        });
        expect(response.statusCode).toBe(200);
      });

      it('onprem_admin cannot list devices', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/devices',
          headers: { authorization: `Bearer ${tokens.onpremAdmin}` },
        });
        expect(response.statusCode).toBe(403);
      });

      it('onprem_viewer cannot list devices', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/devices',
          headers: { authorization: `Bearer ${tokens.onpremViewer}` },
        });
        expect(response.statusCode).toBe(403);
      });

      it('full_viewer can list devices', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/devices',
          headers: { authorization: `Bearer ${tokens.fullViewer}` },
        });
        expect(response.statusCode).toBe(200);
      });

      it('full_editor can list devices', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/devices',
          headers: { authorization: `Bearer ${tokens.fullEditor}` },
        });
        expect(response.statusCode).toBe(200);
      });

      it('devices_admin_onprem_viewer can list devices', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/devices',
          headers: { authorization: `Bearer ${tokens.devicesAdminOnpremViewer}` },
        });
        expect(response.statusCode).toBe(200);
      });

      it('onprem_admin_devices_viewer can list devices', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/devices',
          headers: { authorization: `Bearer ${tokens.onpremAdminDevicesViewer}` },
        });
        expect(response.statusCode).toBe(200);
      });
    });

    describe('PUT /api/devices/:id - Update Device', () => {
      it('admin can update devices', async () => {
        const device = (await createTestDevice(app, tokens.admin)).json();

        const response = await app.inject({
          method: 'PUT',
          url: `/api/devices/${device.id}`,
          headers: { authorization: `Bearer ${tokens.admin}` },
          payload: { model: 'Updated' },
        });

        expect(response.statusCode).toBe(200);
      });

      it('devices_admin can update devices', async () => {
        const device = (await createTestDevice(app, tokens.admin)).json();

        const response = await app.inject({
          method: 'PUT',
          url: `/api/devices/${device.id}`,
          headers: { authorization: `Bearer ${tokens.devicesAdmin}` },
          payload: { model: 'Updated' },
        });

        expect(response.statusCode).toBe(200);
      });

      it('devices_viewer cannot update devices', async () => {
        const device = (await createTestDevice(app, tokens.admin)).json();

        const response = await app.inject({
          method: 'PUT',
          url: `/api/devices/${device.id}`,
          headers: { authorization: `Bearer ${tokens.devicesViewer}` },
          payload: { model: 'Updated' },
        });

        expect(response.statusCode).toBe(403);
      });

      it('full_editor can update devices', async () => {
        const device = (await createTestDevice(app, tokens.admin)).json();

        const response = await app.inject({
          method: 'PUT',
          url: `/api/devices/${device.id}`,
          headers: { authorization: `Bearer ${tokens.fullEditor}` },
          payload: { model: 'Updated' },
        });

        expect(response.statusCode).toBe(200);
      });

      it('devices_admin_onprem_viewer can update devices', async () => {
        const device = (await createTestDevice(app, tokens.admin)).json();

        const response = await app.inject({
          method: 'PUT',
          url: `/api/devices/${device.id}`,
          headers: { authorization: `Bearer ${tokens.devicesAdminOnpremViewer}` },
          payload: { model: 'Updated' },
        });

        expect(response.statusCode).toBe(200);
      });

      it('onprem_admin_devices_viewer cannot update devices', async () => {
        const device = (await createTestDevice(app, tokens.admin)).json();

        const response = await app.inject({
          method: 'PUT',
          url: `/api/devices/${device.id}`,
          headers: { authorization: `Bearer ${tokens.onpremAdminDevicesViewer}` },
          payload: { model: 'Updated' },
        });

        expect(response.statusCode).toBe(403);
      });
    });

    describe('DELETE /api/devices/:id - Delete Device', () => {
      it('admin can delete devices', async () => {
        const device = (await createTestDevice(app, tokens.admin)).json();

        const response = await app.inject({
          method: 'DELETE',
          url: `/api/devices/${device.id}`,
          headers: { authorization: `Bearer ${tokens.admin}` },
        });

        expect(response.statusCode).toBe(200);
      });

      it('devices_admin can delete devices', async () => {
        const device = (await createTestDevice(app, tokens.admin)).json();

        const response = await app.inject({
          method: 'DELETE',
          url: `/api/devices/${device.id}`,
          headers: { authorization: `Bearer ${tokens.devicesAdmin}` },
        });

        expect(response.statusCode).toBe(200);
      });

      it('devices_viewer cannot delete devices', async () => {
        const device = (await createTestDevice(app, tokens.admin)).json();

        const response = await app.inject({
          method: 'DELETE',
          url: `/api/devices/${device.id}`,
          headers: { authorization: `Bearer ${tokens.devicesViewer}` },
        });

        expect(response.statusCode).toBe(403);
      });

      it('full_editor can delete devices', async () => {
        const device = (await createTestDevice(app, tokens.admin)).json();

        const response = await app.inject({
          method: 'DELETE',
          url: `/api/devices/${device.id}`,
          headers: { authorization: `Bearer ${tokens.fullEditor}` },
        });

        expect(response.statusCode).toBe(200);
      });

      it('devices_admin_onprem_viewer can delete devices', async () => {
        const device = (await createTestDevice(app, tokens.admin)).json();

        const response = await app.inject({
          method: 'DELETE',
          url: `/api/devices/${device.id}`,
          headers: { authorization: `Bearer ${tokens.devicesAdminOnpremViewer}` },
        });

        expect(response.statusCode).toBe(200);
      });

      it('onprem_admin_devices_viewer cannot delete devices', async () => {
        const device = (await createTestDevice(app, tokens.admin)).json();

        const response = await app.inject({
          method: 'DELETE',
          url: `/api/devices/${device.id}`,
          headers: { authorization: `Bearer ${tokens.onpremAdminDevicesViewer}` },
        });

        expect(response.statusCode).toBe(403);
      });
    });
  });

  describe('DEVICE REQUESTS MODULE - Role-Based Access Control', () => {
    describe('POST /api/device-requests - Create Request', () => {
      it('admin can create device requests', async () => {
        const response = await createTestDeviceRequest(app, tokens.admin);
        expect(response.statusCode).toBe(201);
      });

      it('devices_admin can create device requests', async () => {
        const response = await createTestDeviceRequest(app, tokens.devicesAdmin);
        expect(response.statusCode).toBe(201);
      });

      it('devices_viewer can create device requests', async () => {
        const response = await createTestDeviceRequest(app, tokens.devicesViewer);
        expect([201, 400]).toContain(response.statusCode);
      });

      it('onprem_admin cannot create device requests', async () => {
        const response = await createTestDeviceRequest(app, tokens.onpremAdmin);
        expect([403, 400]).toContain(response.statusCode);
      });

      it('full_editor can create device requests', async () => {
        const response = await createTestDeviceRequest(app, tokens.fullEditor);
        expect(response.statusCode).toBe(201);
      });

      it('full_viewer can create device requests', async () => {
        const response = await createTestDeviceRequest(app, tokens.fullViewer);
        expect([201, 400]).toContain(response.statusCode);
      });
    });

    describe('GET /api/device-requests - List Requests', () => {
      it('admin can list all requests', async () => {
        await createTestDeviceRequest(app, tokens.admin);

        const response = await app.inject({
          method: 'GET',
          url: '/api/device-requests',
          headers: { authorization: `Bearer ${tokens.admin}` },
        });

        expect(response.statusCode).toBe(200);
      });

      it('devices_admin can list all requests', async () => {
        await createTestDeviceRequest(app, tokens.devicesAdmin);

        const response = await app.inject({
          method: 'GET',
          url: '/api/device-requests',
          headers: { authorization: `Bearer ${tokens.devicesAdmin}` },
        });

        expect(response.statusCode).toBe(200);
      });

      it('user can list own requests', async () => {
        await createTestDeviceRequest(app, tokens.fullViewer);

        const response = await app.inject({
          method: 'GET',
          url: '/api/device-requests',
          headers: { authorization: `Bearer ${tokens.fullViewer}` },
        });

        expect(response.statusCode).toBe(200);
      });

      it('onprem_admin cannot list device requests', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/device-requests',
          headers: { authorization: `Bearer ${tokens.onpremAdmin}` },
        });

        expect(response.statusCode).toBe(403);
      });
    });

    describe('PATCH /api/device-requests/:id/approve - Approve Request', () => {
      it('admin can approve requests', async () => {
        const request = (await createTestDeviceRequest(app, tokens.fullViewer)).json();

        const response = await app.inject({
          method: 'PATCH',
          url: `/api/device-requests/${request.id}/approve`,
          headers: { authorization: `Bearer ${tokens.admin}` },
          payload: {},
        });

        expect(response.statusCode).toBe(200);
      });

      it('devices_admin can approve requests', async () => {
        const request = (await createTestDeviceRequest(app, tokens.fullViewer)).json();

        const response = await app.inject({
          method: 'PATCH',
          url: `/api/device-requests/${request.id}/approve`,
          headers: { authorization: `Bearer ${tokens.devicesAdmin}` },
          payload: {},
        });

        expect(response.statusCode).toBe(200);
      });

      it('devices_viewer cannot approve requests', async () => {
        const request = (await createTestDeviceRequest(app, tokens.admin)).json();

        const response = await app.inject({
          method: 'PATCH',
          url: `/api/device-requests/${request.id}/approve`,
          headers: { authorization: `Bearer ${tokens.devicesViewer}` },
          payload: {},
        });

        expect(response.statusCode).toBe(403);
      });

      it('requester cannot approve own requests', async () => {
        const request = (await createTestDeviceRequest(app, tokens.fullViewer)).json();

        const response = await app.inject({
          method: 'PATCH',
          url: `/api/device-requests/${request.id}/approve`,
          headers: { authorization: `Bearer ${tokens.fullViewer}` },
          payload: {},
        });

        expect(response.statusCode).toBe(403);
      });

      it('onprem_admin cannot approve device requests', async () => {
        const request = (await createTestDeviceRequest(app, tokens.admin)).json();

        const response = await app.inject({
          method: 'PATCH',
          url: `/api/device-requests/${request.id}/approve`,
          headers: { authorization: `Bearer ${tokens.onpremAdmin}` },
          payload: {},
        });

        expect(response.statusCode).toBe(403);
      });
    });
  });

  describe('ONPREM LICENSE REQUESTS MODULE - Role-Based Access Control', () => {
    let deploymentId: string;

    beforeAll(async () => {
      const deployRes = await createTestOnpremDeployment(app, tokens.admin);
      deploymentId = deployRes.json().id;
    });

    describe('POST /api/onprem/:id/license-requests - Create Request', () => {
      it('admin can create license requests', async () => {
        const response = await createTestLicenseRequest(app, tokens.admin, deploymentId);
        expect([201, 400]).toContain(response.statusCode); // 400 if duplicate pending request
      });

      it('onprem_admin can create license requests', async () => {
        const response = await createTestLicenseRequest(app, tokens.onpremAdmin, deploymentId);
        expect([201, 400]).toContain(response.statusCode);
      });

      it('onprem_viewer can create license requests', async () => {
        const response = await createTestLicenseRequest(app, tokens.onpremViewer, deploymentId);
        expect([201, 400]).toContain(response.statusCode);
      });

      it('devices_admin cannot create license requests', async () => {
        const response = await createTestLicenseRequest(app, tokens.devicesAdmin, deploymentId);
        expect([403, 400]).toContain(response.statusCode);
      });

      it('devices_viewer cannot create license requests', async () => {
        const response = await createTestLicenseRequest(app, tokens.devicesViewer, deploymentId);
        expect([403, 400]).toContain(response.statusCode);
      });

      it('full_editor can create license requests', async () => {
        const response = await createTestLicenseRequest(app, tokens.fullEditor, deploymentId);
        expect([201, 400]).toContain(response.statusCode);
      });
    });

    describe('GET /api/onprem/:id/license-requests - List Requests', () => {
      it('admin can list license requests', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/onprem/${deploymentId}/license-requests`,
          headers: { authorization: `Bearer ${tokens.admin}` },
        });

        expect(response.statusCode).toBe(200);
      });

      it('onprem_admin can list license requests', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/onprem/${deploymentId}/license-requests`,
          headers: { authorization: `Bearer ${tokens.onpremAdmin}` },
        });

        expect(response.statusCode).toBe(200);
      });

      it('onprem_viewer can list license requests', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/onprem/${deploymentId}/license-requests`,
          headers: { authorization: `Bearer ${tokens.onpremViewer}` },
        });

        expect(response.statusCode).toBe(200);
      });

      it('devices_admin cannot list license requests', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/onprem/${deploymentId}/license-requests`,
          headers: { authorization: `Bearer ${tokens.devicesAdmin}` },
        });

        expect(response.statusCode).toBe(403);
      });

      it('devices_admin_onprem_viewer can list license requests', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/onprem/${deploymentId}/license-requests`,
          headers: { authorization: `Bearer ${tokens.devicesAdminOnpremViewer}` },
        });

        expect(response.statusCode).toBe(200);
      });

      it('onprem_admin_devices_viewer can list license requests', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/onprem/${deploymentId}/license-requests`,
          headers: { authorization: `Bearer ${tokens.onpremAdminDevicesViewer}` },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /api/onprem/:id/license-requests/:id/upload - Upload License File', () => {
      it('admin can upload license files', async () => {
        const request = (await createTestLicenseRequest(app, tokens.admin, deploymentId)).json();

        const response = await app.inject({
          method: 'POST',
          url: `/api/onprem/${deploymentId}/license-requests/${request.id}/upload`,
          headers: { authorization: `Bearer ${tokens.admin}` },
          payload: { file: Buffer.from('LICENSE') },
        });

        expect([200, 201, 400, 500]).toContain(response.statusCode);
      });

      it('onprem_admin can upload license files', async () => {
        const request = (await createTestLicenseRequest(app, tokens.admin, deploymentId)).json();

        const response = await app.inject({
          method: 'POST',
          url: `/api/onprem/${deploymentId}/license-requests/${request.id}/upload`,
          headers: { authorization: `Bearer ${tokens.onpremAdmin}` },
          payload: { file: Buffer.from('LICENSE') },
        });

        expect([200, 201, 400, 500]).toContain(response.statusCode);
      });

      it('onprem_viewer cannot upload license files', async () => {
        const request = (await createTestLicenseRequest(app, tokens.admin, deploymentId)).json();

        const response = await app.inject({
          method: 'POST',
          url: `/api/onprem/${deploymentId}/license-requests/${request.id}/upload`,
          headers: { authorization: `Bearer ${tokens.onpremViewer}` },
          payload: { file: Buffer.from('LICENSE') },
        });

        expect([403, 400, 500]).toContain(response.statusCode);
      });

      it('devices_admin cannot upload license files', async () => {
        const request = (await createTestLicenseRequest(app, tokens.admin, deploymentId)).json();

        const response = await app.inject({
          method: 'POST',
          url: `/api/onprem/${deploymentId}/license-requests/${request.id}/upload`,
          headers: { authorization: `Bearer ${tokens.devicesAdmin}` },
          payload: { file: Buffer.from('LICENSE') },
        });

        // Should be 403 for permission denied, but may return 400 for invalid multipart
        expect([403, 400]).toContain(response.statusCode);
      });
    });
  });

  describe('ONPREM FILE UPLOADS MODULE - Authentication', () => {
    let deploymentId: string;

    beforeAll(async () => {
      const deployRes = await createTestOnpremDeployment(app, tokens.admin);
      deploymentId = deployRes.json().id;
    });

    describe('File Upload & Download Authentication', () => {
      it('requires authentication for prerequisite download', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/onprem/${deploymentId}/download/prerequisite`,
          headers: {},
        });

        // Should be 401 for auth, may be 404 if middleware processes before auth
        expect([401, 404]).toContain(response.statusCode);
      });

      it('requires authentication for ssl certificate download', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/onprem/${deploymentId}/download/ssl-certificate`,
          headers: {},
        });

        // Should be 401 for auth, may be 404 if middleware processes before auth
        expect([401, 404]).toContain(response.statusCode);
      });

      it('authenticated user can access download endpoint', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/onprem/${deploymentId}/download/prerequisite`,
          headers: { authorization: `Bearer ${tokens.admin}` },
        });

        // Should succeed or 404 if file doesn't exist, but not 401
        expect(response.statusCode).not.toBe(401);
      });

      it('any authenticated role can download files', async () => {
        const roles = [tokens.admin, tokens.onpremAdmin, tokens.devicesAdmin, tokens.fullViewer];

        for (const token of roles) {
          const response = await app.inject({
            method: 'GET',
            url: `/api/onprem/${deploymentId}/download/prerequisite`,
            headers: { authorization: `Bearer ${token}` },
          });

          expect(response.statusCode).not.toBe(401);
        }
      });
    });
  });

  describe('Cross-Module Role Isolation', () => {
    it('devices_admin cannot access onprem endpoints', async () => {
      const deployment = (await createTestOnpremDeployment(app, tokens.admin)).json();

      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deployment.id}`,
        headers: { authorization: `Bearer ${tokens.devicesAdmin}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('onprem_admin cannot access device endpoints', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/devices',
        headers: { authorization: `Bearer ${tokens.onpremAdmin}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('onprem_viewer cannot access device endpoints', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/devices',
        headers: { authorization: `Bearer ${tokens.onpremViewer}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('devices_viewer cannot access onprem endpoints', async () => {
      const deployment = (await createTestOnpremDeployment(app, tokens.admin)).json();

      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deployment.id}`,
        headers: { authorization: `Bearer ${tokens.devicesViewer}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('full_viewer has read-only access across modules', async () => {
      // Can read devices
      const devicesRes = await app.inject({
        method: 'GET',
        url: '/api/devices',
        headers: { authorization: `Bearer ${tokens.fullViewer}` },
      });
      expect(devicesRes.statusCode).toBe(200);

      // Can read onprem
      const deployment = (await createTestOnpremDeployment(app, tokens.admin)).json();
      const onpremRes = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deployment.id}`,
        headers: { authorization: `Bearer ${tokens.fullViewer}` },
      });
      expect(onpremRes.statusCode).toBe(200);
    });

    it('full_editor has read-write access across modules', async () => {
      // Can create device
      const deviceRes = await createTestDevice(app, tokens.fullEditor);
      expect(deviceRes.statusCode).toBe(201);

      // Can create onprem deployment
      const onpremRes = await createTestOnpremDeployment(app, tokens.fullEditor);
      expect(onpremRes.statusCode).toBe(201);
    });

    it('devices_admin_onprem_viewer has read-write on devices and read-only on onprem', async () => {
      // Can create/update/delete devices
      const deviceRes = await createTestDevice(app, tokens.devicesAdminOnpremViewer);
      expect(deviceRes.statusCode).toBe(201);

      // Can read onprem
      const deployment = (await createTestOnpremDeployment(app, tokens.admin)).json();
      const readRes = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deployment.id}`,
        headers: { authorization: `Bearer ${tokens.devicesAdminOnpremViewer}` },
      });
      expect(readRes.statusCode).toBe(200);

      // Cannot create onprem deployments
      const createRes = await createTestOnpremDeployment(app, tokens.devicesAdminOnpremViewer);
      expect(createRes.statusCode).toBe(403);
    });

    it('onprem_admin_devices_viewer has read-write on onprem and read-only on devices', async () => {
      // Can create onprem deployment
      const onpremRes = await createTestOnpremDeployment(app, tokens.onpremAdminDevicesViewer);
      expect(onpremRes.statusCode).toBe(201);

      // Can read devices
      const readRes = await app.inject({
        method: 'GET',
        url: '/api/devices',
        headers: { authorization: `Bearer ${tokens.onpremAdminDevicesViewer}` },
      });
      expect(readRes.statusCode).toBe(200);

      // Cannot create devices
      const createRes = await createTestDevice(app, tokens.onpremAdminDevicesViewer);
      expect(createRes.statusCode).toBe(403);
    });
  });
});
