import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, testUsers, loginUser, initializeTests, teardownTests, createTestOnpremDeployment } from './setup.js';
import { db } from '../src/db/index.js';
import { users } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

describe('Onprem Deployment API', () => {
  beforeAll(async () => {
    await initializeTests();
  });

  afterAll(async () => {
    await teardownTests();
  });

  describe('POST /api/onprem - Create', () => {
    describe('Success Cases', () => {
      it('creates deployment with required fields only', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        const response = await createTestOnpremDeployment(app, accessToken);

        expect(response.statusCode).toBe(201);
        const body = response.json();
        expect(body.id).toBeDefined();
        expect(body.clientName).toContain('Test Client');
        expect(body.contactEmail).toContain('@example.com');
        expect(body.contactPhone).toMatch(/^\+1-555-/);
        expect(body.associatedCsmId).toBeDefined();
        expect(body.status).toBe('provisioning');
      });

      it('creates deployment with all fields populated', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        const adminUser = await db.query.users.findFirst({
          where: eq(users.email, testUsers.admin.email),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/onprem',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            clientName: 'Full Test Client',
            contactEmail: `full-test-${Date.now()}@example.com`,
            contactPhone: '+1-555-9999',
            associatedCsmId: adminUser?.id,
            clientStatus: 'active',
            environmentType: 'production',
            currentVersion: '1.0.0',
            maintenancePlan: 'quarterly',
            domainName: 'test.example.com',
            sslProvided: true,
            customerId: 'CUST-123',
            customerName: 'Test Customer',
            hostname: 'test-host',
            region: 'us-west',
            environment: 'prod',
            notes: 'Test notes',
          },
        });

        expect(response.statusCode).toBe(201);
        const body = response.json();
        expect(body.clientName).toBe('Full Test Client');
        expect(body.environmentType).toBe('production');
        expect(body.maintenancePlan).toBe('quarterly');
        expect(body.domainName).toBe('test.example.com');
      });

      it('creates deployment with infrastructure metadata', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        const response = await createTestOnpremDeployment(app, accessToken, {
          infrastructure: {
            hypervisor: {
              type: 'vmware',
              version: '7.0',
            },
            network: {
              staticIP: '192.168.1.100',
              gateway: '192.168.1.1',
              lanSpeed: '1gbps',
              wifiStandard: 'wifi6',
            },
            server: {
              cpuCores: 8,
              ramGB: 32,
              storageGB: 500,
              size: 'medium',
            },
          },
        });

        expect(response.statusCode).toBe(201);
        const body = response.json();
        expect(body.infrastructure).toBeDefined();
        expect(body.infrastructure.hypervisor.type).toBe('vmware');
        expect(body.infrastructure.server.cpuCores).toBe(8);
      });
    });

    describe('Mandatory Field Validation', () => {
      it('rejects when clientName is missing', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        const adminUser = await db.query.users.findFirst({
          where: eq(users.email, testUsers.admin.email),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/onprem',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            contactEmail: `test-${Date.now()}@example.com`,
            contactPhone: '+1-555-1234',
            associatedCsmId: adminUser?.id,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.message).toContain('Client name');
      });

      it('rejects when clientName is empty/whitespace only', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        const adminUser = await db.query.users.findFirst({
          where: eq(users.email, testUsers.admin.email),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/onprem',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            clientName: '   ',
            contactEmail: `test-${Date.now()}@example.com`,
            contactPhone: '+1-555-1234',
            associatedCsmId: adminUser?.id,
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('rejects when contactEmail is missing', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        const adminUser = await db.query.users.findFirst({
          where: eq(users.email, testUsers.admin.email),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/onprem',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            clientName: 'Test Client',
            contactPhone: '+1-555-1234',
            associatedCsmId: adminUser?.id,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.message).toContain('email');
      });

      it('rejects when contactPhone is missing', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        const adminUser = await db.query.users.findFirst({
          where: eq(users.email, testUsers.admin.email),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/onprem',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            clientName: 'Test Client',
            contactEmail: `test-${Date.now()}@example.com`,
            associatedCsmId: adminUser?.id,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.message).toContain('phone');
      });

      it('rejects when associatedCsmId is missing', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        const response = await app.inject({
          method: 'POST',
          url: '/api/onprem',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            clientName: 'Test Client',
            contactEmail: `test-${Date.now()}@example.com`,
            contactPhone: '+1-555-1234',
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.message).toContain('CSM');
      });
    });

    describe('Format Validation', () => {
      it('rejects invalid email format', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        const adminUser = await db.query.users.findFirst({
          where: eq(users.email, testUsers.admin.email),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/onprem',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            clientName: 'Test Client',
            contactEmail: 'invalid-email',
            contactPhone: '+1-555-1234',
            associatedCsmId: adminUser?.id,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.message.toLowerCase()).toContain('email');
      });

      it('rejects invalid UUID for associatedCsmId', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        const response = await app.inject({
          method: 'POST',
          url: '/api/onprem',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            clientName: 'Test Client',
            contactEmail: `test-${Date.now()}@example.com`,
            contactPhone: '+1-555-1234',
            associatedCsmId: 'not-a-uuid',
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.message.toLowerCase()).toContain('uuid');
      });

      it('rejects clientName exceeding 255 characters', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        const adminUser = await db.query.users.findFirst({
          where: eq(users.email, testUsers.admin.email),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/onprem',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            clientName: 'A'.repeat(256),
            contactEmail: `test-${Date.now()}@example.com`,
            contactPhone: '+1-555-1234',
            associatedCsmId: adminUser?.id,
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('rejects invalid enum values for clientStatus', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        const adminUser = await db.query.users.findFirst({
          where: eq(users.email, testUsers.admin.email),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/onprem',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            clientName: 'Test Client',
            contactEmail: `test-${Date.now()}@example.com`,
            contactPhone: '+1-555-1234',
            associatedCsmId: adminUser?.id,
            clientStatus: 'invalid-status',
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('rejects cpuCores less than 1', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        const response = await createTestOnpremDeployment(app, accessToken, {
          infrastructure: {
            server: {
              cpuCores: 0,
            },
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('Uniqueness Validation', () => {
      it('rejects duplicate contactEmail', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        const duplicateEmail = `duplicate-${Date.now()}@example.com`;

        // Create first deployment
        const first = await createTestOnpremDeployment(app, accessToken, {
          contactEmail: duplicateEmail,
        });
        expect(first.statusCode).toBe(201);

        // Try creating second with same email
        const second = await createTestOnpremDeployment(app, accessToken, {
          contactEmail: duplicateEmail,
        });

        expect(second.statusCode).toBe(400);
        const body = second.json();
        expect(body.message).toContain('email');
        expect(body.message).toContain('already used');
      });

      it('rejects duplicate contactPhone', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        const duplicatePhone = '+1-555-9876';

        // Create first deployment
        const first = await createTestOnpremDeployment(app, accessToken, {
          contactPhone: duplicatePhone,
        });
        expect(first.statusCode).toBe(201);

        // Try creating second with same phone
        const second = await createTestOnpremDeployment(app, accessToken, {
          contactPhone: duplicatePhone,
        });

        expect(second.statusCode).toBe(400);
        const body = second.json();
        expect(body.message).toContain('phone');
        expect(body.message).toContain('already used');
      });
    });
  });

  describe('PUT /api/onprem/:id - Update', () => {
    describe('Success Cases', () => {
      it('updates deployment with valid changes', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        // Create deployment
        const createResponse = await createTestOnpremDeployment(app, accessToken);
        expect(createResponse.statusCode).toBe(201);
        const deployment = createResponse.json();

        // Update deployment
        const updateResponse = await app.inject({
          method: 'PUT',
          url: `/api/onprem/${deployment.id}`,
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            clientName: 'Updated Client Name',
            notes: 'Updated notes',
          },
        });

        expect(updateResponse.statusCode).toBe(200);
        const updated = updateResponse.json();
        expect(updated.clientName).toBe('Updated Client Name');
        expect(updated.notes).toBe('Updated notes');
      });

      it('keeps same email without error (excludeId works)', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        // Create deployment
        const createResponse = await createTestOnpremDeployment(app, accessToken, {
          contactEmail: `keep-same-${Date.now()}@example.com`,
        });
        expect(createResponse.statusCode).toBe(201);
        const deployment = createResponse.json();

        // Update keeping same email
        const updateResponse = await app.inject({
          method: 'PUT',
          url: `/api/onprem/${deployment.id}`,
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            contactEmail: deployment.contactEmail,
            notes: 'Updated notes',
          },
        });

        expect(updateResponse.statusCode).toBe(200);
      });

      it('keeps same phone without error (excludeId works)', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        // Create deployment
        const createResponse = await createTestOnpremDeployment(app, accessToken, {
          contactPhone: '+1-555-7777',
        });
        expect(createResponse.statusCode).toBe(201);
        const deployment = createResponse.json();

        // Update keeping same phone
        const updateResponse = await app.inject({
          method: 'PUT',
          url: `/api/onprem/${deployment.id}`,
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            contactPhone: deployment.contactPhone,
            notes: 'Updated notes',
          },
        });

        expect(updateResponse.statusCode).toBe(200);
      });

      it('changes to new unique email successfully', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        // Create deployment
        const createResponse = await createTestOnpremDeployment(app, accessToken);
        expect(createResponse.statusCode).toBe(201);
        const deployment = createResponse.json();

        // Update to new email
        const newEmail = `new-email-${Date.now()}@example.com`;
        const updateResponse = await app.inject({
          method: 'PUT',
          url: `/api/onprem/${deployment.id}`,
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            contactEmail: newEmail,
          },
        });

        expect(updateResponse.statusCode).toBe(200);
        const updated = updateResponse.json();
        expect(updated.contactEmail).toBe(newEmail);
      });

      it('performs partial updates', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        // Create deployment
        const createResponse = await createTestOnpremDeployment(app, accessToken);
        expect(createResponse.statusCode).toBe(201);
        const deployment = createResponse.json();

        // Update only notes
        const updateResponse = await app.inject({
          method: 'PUT',
          url: `/api/onprem/${deployment.id}`,
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            notes: 'Only updating notes',
          },
        });

        expect(updateResponse.statusCode).toBe(200);
        const updated = updateResponse.json();
        expect(updated.notes).toBe('Only updating notes');
        expect(updated.clientName).toBe(deployment.clientName);
        expect(updated.contactEmail).toBe(deployment.contactEmail);
      });
    });

    describe('Uniqueness with excludeId', () => {
      it('rejects update with email used by different deployment', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        // Create first deployment
        const first = await createTestOnpremDeployment(app, accessToken, {
          contactEmail: `first-${Date.now()}@example.com`,
        });
        expect(first.statusCode).toBe(201);
        const firstDeployment = first.json();

        // Create second deployment
        const second = await createTestOnpremDeployment(app, accessToken);
        expect(second.statusCode).toBe(201);
        const secondDeployment = second.json();

        // Try to update second with first's email
        const updateResponse = await app.inject({
          method: 'PUT',
          url: `/api/onprem/${secondDeployment.id}`,
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            contactEmail: firstDeployment.contactEmail,
          },
        });

        expect(updateResponse.statusCode).toBe(400);
        const body = updateResponse.json();
        expect(body.message).toContain('email');
        expect(body.message).toContain('already used');
      });

      it('rejects update with phone used by different deployment', async () => {
        const app = await getApp();
        const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

        // Create first deployment
        const first = await createTestOnpremDeployment(app, accessToken, {
          contactPhone: '+1-555-1111',
        });
        expect(first.statusCode).toBe(201);
        const firstDeployment = first.json();

        // Create second deployment
        const second = await createTestOnpremDeployment(app, accessToken);
        expect(second.statusCode).toBe(201);
        const secondDeployment = second.json();

        // Try to update second with first's phone
        const updateResponse = await app.inject({
          method: 'PUT',
          url: `/api/onprem/${secondDeployment.id}`,
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            contactPhone: firstDeployment.contactPhone,
          },
        });

        expect(updateResponse.statusCode).toBe(400);
        const body = updateResponse.json();
        expect(body.message).toContain('phone');
        expect(body.message).toContain('already used');
      });
    });
  });

  describe('GET /api/onprem/check-email', () => {
    it('returns exists=true when email exists without excludeId', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      const testEmail = `check-email-${Date.now()}@example.com`;

      // Create deployment
      const createResponse = await createTestOnpremDeployment(app, accessToken, {
        contactEmail: testEmail,
      });
      expect(createResponse.statusCode).toBe(201);
      const deployment = createResponse.json();

      // Check email
      const checkResponse = await app.inject({
        method: 'GET',
        url: `/api/onprem/check-email?email=${encodeURIComponent(testEmail)}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(checkResponse.statusCode).toBe(200);
      const body = checkResponse.json();
      expect(body.exists).toBe(true);
      expect(body.deployment).toBeDefined();
      expect(body.deployment.id).toBe(deployment.id);
    });

    it('returns exists=false when email exists with excludeId (own)', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      const testEmail = `check-own-email-${Date.now()}@example.com`;

      // Create deployment
      const createResponse = await createTestOnpremDeployment(app, accessToken, {
        contactEmail: testEmail,
      });
      expect(createResponse.statusCode).toBe(201);
      const deployment = createResponse.json();

      // Check email with excludeId
      const checkResponse = await app.inject({
        method: 'GET',
        url: `/api/onprem/check-email?email=${encodeURIComponent(testEmail)}&excludeId=${deployment.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(checkResponse.statusCode).toBe(200);
      const body = checkResponse.json();
      expect(body.exists).toBe(false);
    });

    it('returns exists=true when email exists with excludeId (different)', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      const testEmail = `check-different-email-${Date.now()}@example.com`;

      // Create first deployment
      const first = await createTestOnpremDeployment(app, accessToken, {
        contactEmail: testEmail,
      });
      expect(first.statusCode).toBe(201);
      const firstDeployment = first.json();

      // Create second deployment
      const second = await createTestOnpremDeployment(app, accessToken);
      expect(second.statusCode).toBe(201);
      const secondDeployment = second.json();

      // Check email with different excludeId
      const checkResponse = await app.inject({
        method: 'GET',
        url: `/api/onprem/check-email?email=${encodeURIComponent(testEmail)}&excludeId=${secondDeployment.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(checkResponse.statusCode).toBe(200);
      const body = checkResponse.json();
      expect(body.exists).toBe(true);
      expect(body.deployment.id).toBe(firstDeployment.id);
    });

    it('returns exists=false when email not found', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      const nonExistentEmail = `nonexistent-${Date.now()}@example.com`;

      const checkResponse = await app.inject({
        method: 'GET',
        url: `/api/onprem/check-email?email=${encodeURIComponent(nonExistentEmail)}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(checkResponse.statusCode).toBe(200);
      const body = checkResponse.json();
      expect(body.exists).toBe(false);
    });
  });

  describe('GET /api/onprem/check-phone', () => {
    it('returns exists=true when phone exists without excludeId', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      const testPhone = '+1-555-2222';

      // Create deployment
      const createResponse = await createTestOnpremDeployment(app, accessToken, {
        contactPhone: testPhone,
      });
      expect(createResponse.statusCode).toBe(201);
      const deployment = createResponse.json();

      // Check phone
      const checkResponse = await app.inject({
        method: 'GET',
        url: `/api/onprem/check-phone?phone=${encodeURIComponent(testPhone)}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(checkResponse.statusCode).toBe(200);
      const body = checkResponse.json();
      expect(body.exists).toBe(true);
      expect(body.deployment).toBeDefined();
      expect(body.deployment.id).toBe(deployment.id);
    });

    it('returns exists=false when phone exists with excludeId (own)', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      const testPhone = '+1-555-3333';

      // Create deployment
      const createResponse = await createTestOnpremDeployment(app, accessToken, {
        contactPhone: testPhone,
      });
      expect(createResponse.statusCode).toBe(201);
      const deployment = createResponse.json();

      // Check phone with excludeId
      const checkResponse = await app.inject({
        method: 'GET',
        url: `/api/onprem/check-phone?phone=${encodeURIComponent(testPhone)}&excludeId=${deployment.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(checkResponse.statusCode).toBe(200);
      const body = checkResponse.json();
      expect(body.exists).toBe(false);
    });

    it('returns exists=true when phone exists with excludeId (different)', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      const testPhone = '+1-555-4444';

      // Create first deployment
      const first = await createTestOnpremDeployment(app, accessToken, {
        contactPhone: testPhone,
      });
      expect(first.statusCode).toBe(201);
      const firstDeployment = first.json();

      // Create second deployment
      const second = await createTestOnpremDeployment(app, accessToken);
      expect(second.statusCode).toBe(201);
      const secondDeployment = second.json();

      // Check phone with different excludeId
      const checkResponse = await app.inject({
        method: 'GET',
        url: `/api/onprem/check-phone?phone=${encodeURIComponent(testPhone)}&excludeId=${secondDeployment.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(checkResponse.statusCode).toBe(200);
      const body = checkResponse.json();
      expect(body.exists).toBe(true);
      expect(body.deployment.id).toBe(firstDeployment.id);
    });

    it('returns exists=false when phone not found', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      const nonExistentPhone = '+1-555-9999';

      const checkResponse = await app.inject({
        method: 'GET',
        url: `/api/onprem/check-phone?phone=${encodeURIComponent(nonExistentPhone)}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(checkResponse.statusCode).toBe(200);
      const body = checkResponse.json();
      expect(body.exists).toBe(false);
    });
  });

  describe('GET /api/onprem/:id', () => {
    it('returns deployment by id', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      // Create deployment
      const createResponse = await createTestOnpremDeployment(app, accessToken);
      expect(createResponse.statusCode).toBe(201);
      const created = createResponse.json();

      // Get deployment
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/onprem/${created.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(getResponse.statusCode).toBe(200);
      const deployment = getResponse.json();
      expect(deployment.id).toBe(created.id);
      expect(deployment.clientName).toBe(created.clientName);
    });

    it('returns 404 for non-existent deployment', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      const fakeId = '00000000-0000-0000-0000-000000000000';
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/onprem/${fakeId}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(getResponse.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/onprem/:id', () => {
    it('deletes deployment successfully', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      // Create deployment
      const createResponse = await createTestOnpremDeployment(app, accessToken);
      expect(createResponse.statusCode).toBe(201);
      const created = createResponse.json();

      // Delete deployment
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/onprem/${created.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(deleteResponse.statusCode).toBe(200);

      // Verify deletion
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/onprem/${created.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(getResponse.statusCode).toBe(404);
    });
  });
});
