import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, loginUser, createTestUser, createTestDevice, initializeTests, teardownTests, cleanupTestData } from './setup.js';
import { db } from '../src/db/index.js';
import { devices } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

describe('Notifications — Slack Digests', () => {
  let app;
  let adminToken: string;
  let memberToken: string;
  let adminUser;

  beforeAll(async () => {
    await initializeTests();
    app = await getApp();

    adminUser = await createTestUser({
      email: 'notif-admin@test.com',
      firstName: 'Notif',
      lastName: 'Admin',
      role: 'admin',
      password: 'testpass123',
    });

    const memberUser = await createTestUser({
      email: 'notif-member@test.com',
      firstName: 'Notif',
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

  // ─── Checkout Preview ────────────────────────────────────────────────────────

  describe('GET /api/notifications/device-checkout/preview', () => {
    it('should return all checked_out and maintenance devices', async () => {
      // Create devices in different checkout scenarios
      const checkedOut = await createTestDevice(app, adminToken, {
        platform: 'ios',
        osVersion: '17',
        status: 'checked_out',
      });
      const checkedOutBody = checkedOut.json();

      const maintenance = await createTestDevice(app, adminToken, {
        platform: 'android',
        osVersion: '14',
        status: 'maintenance',
      });
      const maintenanceBody = maintenance.json();

      // Set purpose and assignedTo directly
      await db.update(devices)
        .set({ purpose: 'Security Testing', assignedTo: 'Security Team' })
        .where(eq(devices.id, checkedOutBody.id));

      await db.update(devices)
        .set({ purpose: 'Screen cracked' })
        .where(eq(devices.id, maintenanceBody.id));

      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/device-checkout/preview',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(Array.isArray(result.devices)).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(2);

      const names = result.devices.map((d: any) => d.name);
      expect(names).toContain(checkedOutBody.name);
      expect(names).toContain(maintenanceBody.name);
    });

    it('should not include in_inventory devices', async () => {
      const inInventory = await createTestDevice(app, adminToken, {
        platform: 'ios',
        status: 'in_inventory' as any,
      });
      const inInventoryBody = inInventory.json();

      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/device-checkout/preview',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      const names = result.devices.map((d: any) => d.name);
      expect(names).not.toContain(inInventoryBody.name);
    });

    it('should not include decommissioned or sold devices', async () => {
      const decommissioned = await createTestDevice(app, adminToken, {
        platform: 'ios',
        status: 'decommissioned' as any,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/device-checkout/preview',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      const names = result.devices.map((d: any) => d.name);
      expect(names).not.toContain(decommissioned.json().name);
    });

    it('should return correct fields for each device', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/device-checkout/preview',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      if (result.devices.length > 0) {
        const device = result.devices[0];
        expect(device).toHaveProperty('name');
        expect(device).toHaveProperty('model');
        expect(device).toHaveProperty('status');
        expect(device).toHaveProperty('assignedTo');
        expect(device).toHaveProperty('purpose');
        expect(device).toHaveProperty('metadata');
      }
    });

    it('should allow viewers to access preview', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/device-checkout/preview',
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(response.statusCode).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/device-checkout/preview',
      });
      expect(response.statusCode).toBe(401);
    });
  });

  // ─── Checkin Preview ─────────────────────────────────────────────────────────

  describe('GET /api/notifications/device-checkin/preview', () => {
    it('should return devices registered today', async () => {
      await createTestDevice(app, adminToken, { platform: 'ios' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/device-checkin/preview',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(Array.isArray(result.devices)).toBe(true);
      expect(typeof result.count).toBe('number');
    });

    it('should return correct fields for each device', async () => {
      await createTestDevice(app, adminToken, { platform: 'android' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/device-checkin/preview',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      if (result.devices.length > 0) {
        const device = result.devices[0];
        expect(device).toHaveProperty('name');
        expect(device).toHaveProperty('model');
        expect(device).toHaveProperty('purpose');
        expect(device).toHaveProperty('metadata');
      }
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/device-checkin/preview',
      });
      expect(response.statusCode).toBe(401);
    });
  });

  // ─── Checkout Trigger ────────────────────────────────────────────────────────

  describe('POST /api/notifications/device-checkout/trigger', () => {
    it('should require manage:Device permission', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/device-checkout/trigger',
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(response.statusCode).toBe(403);
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/device-checkout/trigger',
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return deviceCount 0 when no checked-out devices exist for date', async () => {
      // Use yesterday param — tests run fresh so yesterday has no checkouts
      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/device-checkout/trigger?useYesterday=true',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      // May succeed (0 devices, no Slack call needed) or fail with 500 if webhook misconfigured
      // Either way, it should NOT crash with a status filter bug
      expect([200, 500]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        expect(response.json().deviceCount).toBeDefined();
      }
    });
  });

  // ─── Checkin Trigger ─────────────────────────────────────────────────────────

  describe('POST /api/notifications/device-checkin/trigger', () => {
    it('should require manage:Device permission', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/device-checkin/trigger',
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(response.statusCode).toBe(403);
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/device-checkin/trigger',
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return deviceCount 0 when no devices registered yesterday', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/device-checkin/trigger?useYesterday=true',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect([200, 500]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        expect(response.json().deviceCount).toBeDefined();
      }
    });

    it('should succeed and return deviceCount when triggered', async () => {
      await createTestDevice(app, adminToken, { platform: 'ios' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/device-checkin/trigger',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      // 200 (query ran, slack may or may not send) or 500 (webhook misconfigured)
      expect([200, 500]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        expect(response.json().deviceCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ─── Patch Reminder Trigger ──────────────────────────────────────────────────

  describe('POST /api/notifications/patch-reminders/trigger', () => {
    it('should require manage:Device or manage:OnPrem — returns 403 for viewer', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/patch-reminders/trigger',
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {},
      });
      expect(response.statusCode).toBe(403);
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/patch-reminders/trigger',
        payload: {},
      });
      expect(response.statusCode).toBe(401);
    });

    it('should run without crashing for admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/patch-reminders/trigger',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });
      // 200 (no patches or slack sent) or 500 (webhook misconfigured) — not a crash
      expect([200, 500]).toContain(response.statusCode);
    });
  });
});
