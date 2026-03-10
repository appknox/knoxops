import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, testUsers, loginUser, initializeTests, teardownTests } from './setup.js';

describe('Auth - Invite Status', () => {
  beforeAll(async () => {
    await initializeTests();
  });

  afterAll(async () => {
    await teardownTests();
  });

  describe('POST /api/auth/login', () => {
    it('returns 401 for user with pending inviteStatus', async () => {
      const app = await getApp();

      // Try to login as pending user
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: testUsers.pending.email,
          password: testUsers.pending.password,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.message).toContain('not activated');
    });

    it('succeeds for user with accepted inviteStatus', async () => {
      const app = await getApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: testUsers.admin.email,
          password: testUsers.admin.password,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
    });

    it('returns 401 for deactivated user', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      // Get member user ID
      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/users?search=member',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      const memberUser = listResponse.json().data.find((u: { email: string }) => u.email === testUsers.member.email);

      // Deactivate member user
      await app.inject({
        method: 'DELETE',
        url: `/api/users/${memberUser.id}`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      // Try to login as deactivated user
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: testUsers.member.email,
          password: testUsers.member.password,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.message).toContain('deactivated');
    });

    it('returns 401 for invalid credentials', async () => {
      const app = await getApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: testUsers.admin.email,
          password: 'wrongpassword',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.message).toContain('Invalid');
    });

    it('returns 401 for non-existent user', async () => {
      const app = await getApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'nonexistent@test.com',
          password: 'somepassword',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns current user info when authenticated', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.email).toBe(testUsers.admin.email);
      expect(body.role).toBe('admin');
      expect(body.passwordHash).toBeUndefined(); // Should not expose password hash
    });

    it('returns 401 when not authenticated', async () => {
      const app = await getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('returns new access token with valid refresh token', async () => {
      const app = await getApp();
      const { refreshToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
    });

    it('returns 401 with invalid refresh token', async () => {
      const app = await getApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: 'invalid-refresh-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('logs out successfully', async () => {
      const app = await getApp();
      const { accessToken } = await loginUser(app, testUsers.admin.email, testUsers.admin.password);

      // Logout
      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(logoutResponse.statusCode).toBe(200);
      expect(logoutResponse.json().message).toContain('Logged out');
    });

    // Note: Current logout implementation logs the action but does not revoke refresh tokens.
    // Token revocation would need to be added to properly invalidate sessions.
  });
});
