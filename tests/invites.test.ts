import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, testUsers, loginUser, initializeTests, teardownTests } from './setup.js';
import { db } from '../src/db/index.js';
import { users } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

describe('Invite API', () => {
  beforeAll(async () => {
    await initializeTests();
  });

  afterAll(async () => {
    await teardownTests();
  });

  describe('POST /api/invites', () => {
    it('returns 401 when not authenticated', async () => {
      const app = await getApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/invites',
        payload: {
          email: 'newuser@test.com',
          firstName: 'New',
          lastName: 'User',
          role: 'full_viewer',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 when non-admin', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.member.email, testUsers.member.password);

      const response = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          email: 'newuser@test.com',
          firstName: 'New',
          lastName: 'User',
          role: 'full_viewer',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('creates invite and returns invite data', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      const response = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          email: 'invite@test.com',
          firstName: 'Invited',
          lastName: 'User',
          role: 'devices_admin',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.email).toBe('invite@test.com');
      expect(body.firstName).toBe('Invited');
      expect(body.role).toBe('devices_admin');
      expect(body.status).toBe('pending');
      expect(body.expiresAt).toBeDefined();
    });

    it('fails for existing user email', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      const response = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          email: testUsers.member.email,
          firstName: 'Duplicate',
          lastName: 'User',
          role: 'full_viewer',
        },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.message).toContain('already');
    });

    it('fails for existing pending invite', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      // Create first invite with unique email
      await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          email: 'pending-test@test.com',
          firstName: 'First',
          lastName: 'Invite',
          role: 'full_viewer',
        },
      });

      // Try to create second invite with same email
      const response = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          email: 'pending-test@test.com',
          firstName: 'Second',
          lastName: 'Invite',
          role: 'devices_admin',
        },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.message).toContain('already exists');
    });
  });

  describe('GET /api/invites', () => {
    it('returns 403 when non-admin', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.member.email, testUsers.member.password);

      const response = await app.inject({
        method: 'GET',
        url: '/api/invites',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns invite list when admin', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      // Create an invite first
      await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          email: 'invite@test.com',
          firstName: 'Invited',
          lastName: 'User',
          role: 'full_viewer',
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/invites',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe('GET /api/invites/:token', () => {
    it('returns invite details for valid token', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      // Create invite with unique email
      await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          email: 'validate-token@test.com',
          firstName: 'Validate',
          lastName: 'Token',
          role: 'full_viewer',
        },
      });

      // Get token from DB
      const invite = await db.query.users.findFirst({
        where: eq(users.email, 'validate-token@test.com'),
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/invites/${invite!.inviteToken}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.email).toBe('validate-token@test.com');
      expect(body.firstName).toBe('Validate');
      expect(body.lastName).toBe('Token');
      expect(body.role).toBe('full_viewer');
    });

    it('returns 404 for invalid token', async () => {
      const app = await getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/api/invites/invalid-token-12345',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/invites/:token/accept', () => {
    it('creates user with invite data', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      // Create invite
      await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          email: 'invite@test.com',
          firstName: 'Invited',
          lastName: 'User',
          role: 'devices_admin',
        },
      });

      // Get token from DB
      const invite = await db.query.users.findFirst({
        where: eq(users.email, 'invite@test.com'),
      });

      // Accept invite
      const response = await app.inject({
        method: 'POST',
        url: `/api/invites/${invite!.inviteToken}/accept`,
        payload: {
          password: 'newpassword123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.message).toBeDefined();

      // Verify user can now login
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'invite@test.com',
          password: 'newpassword123',
        },
      });

      expect(loginResponse.statusCode).toBe(200);
      expect(loginResponse.json().accessToken).toBeDefined();
    });

    it('sets inviteStatus to accepted', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      // Create invite
      await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          email: 'invite@test.com',
          firstName: 'Invited',
          lastName: 'User',
          role: 'full_viewer',
        },
      });

      // Get token from DB
      const invite = await db.query.users.findFirst({
        where: eq(users.email, 'invite@test.com'),
      });

      // Accept invite
      await app.inject({
        method: 'POST',
        url: `/api/invites/${invite!.inviteToken}/accept`,
        payload: {
          password: 'newpassword123',
        },
      });

      // Check invite status
      const updatedInvite = await db.query.users.findFirst({
        where: eq(users.email, 'invite@test.com'),
      });

      expect(updatedInvite!.status).toBe('active');
    });

    it('requires password min 8 chars', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      // Create invite
      await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          email: 'invite@test.com',
          firstName: 'Invited',
          lastName: 'User',
          role: 'full_viewer',
        },
      });

      // Get token from DB
      const invite = await db.query.users.findFirst({
        where: eq(users.email, 'invite@test.com'),
      });

      // Try to accept with short password
      const response = await app.inject({
        method: 'POST',
        url: `/api/invites/${invite!.inviteToken}/accept`,
        payload: {
          password: 'short',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('fails for already-accepted invite', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      // Create invite
      await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          email: 'invite@test.com',
          firstName: 'Invited',
          lastName: 'User',
          role: 'full_viewer',
        },
      });

      // Get token from DB
      const invite = await db.query.users.findFirst({
        where: eq(users.email, 'invite@test.com'),
      });

      // Accept invite first time
      await app.inject({
        method: 'POST',
        url: `/api/invites/${invite!.inviteToken}/accept`,
        payload: {
          password: 'newpassword123',
        },
      });

      // Try to accept again
      const response = await app.inject({
        method: 'POST',
        url: `/api/invites/${invite!.inviteToken}/accept`,
        payload: {
          password: 'anotherpassword123',
        },
      });

      // Token is nulled after acceptance, so second attempt returns 404
      expect([400, 404]).toContain(response.statusCode);
    });
  });

  describe('DELETE /api/invites/:id', () => {
    it('returns 403 when non-admin', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.member.email, testUsers.member.password);

      // Use a valid UUID format
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/invites/00000000-0000-0000-0000-000000000000',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('revokes invite', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      // Create invite with unique email
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          email: 'revoke-test@test.com',
          firstName: 'Revoke',
          lastName: 'Test',
          role: 'full_viewer',
        },
      });

      const inviteId = createResponse.json().id;

      // Revoke invite
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/invites/${inviteId}`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify invite is revoked
      const invite = await db.query.users.findFirst({
        where: eq(users.id, inviteId),
      });

      expect(invite!.status).toBe('deleted');
    });
  });

  describe('POST /api/invites/:id/resend', () => {
    it('returns 403 when non-admin', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.member.email, testUsers.member.password);

      // Use a valid UUID format
      const response = await app.inject({
        method: 'POST',
        url: '/api/invites/00000000-0000-0000-0000-000000000000/resend',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('resends invite with new token', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      // Create invite with unique email
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          email: 'resend-test@test.com',
          firstName: 'Resend',
          lastName: 'Test',
          role: 'full_viewer',
        },
      });

      const inviteId = createResponse.json().id;

      // Get original token
      const originalInvite = await db.query.users.findFirst({
        where: eq(users.id, inviteId),
      });

      // Backdate inviteLastSentAt to bypass 24-hour rate limit
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      await db.update(users).set({ inviteLastSentAt: twoDaysAgo }).where(eq(users.id, inviteId));

      // Resend invite
      const response = await app.inject({
        method: 'POST',
        url: `/api/invites/${inviteId}/resend`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify token has changed
      const updatedInvite = await db.query.users.findFirst({
        where: eq(users.id, inviteId),
      });

      expect(updatedInvite!.inviteToken).not.toBe(originalInvite!.inviteToken);
    });
  });
});
