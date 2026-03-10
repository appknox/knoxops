import { FastifyInstance } from 'fastify';
import {
  sendInvite,
  getInvites,
  validateInvite,
  acceptInviteHandler,
  revokeInviteHandler,
  resendInviteHandler,
} from './invites.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeAdmin } from '../../middleware/authorize.js';

export async function inviteRoutes(app: FastifyInstance) {
  // Send invite (admin only)
  app.post(
    '/',
    {
      preHandler: [authenticate, authorizeAdmin()],
      schema: {
        tags: ['Invites'],
        summary: 'Send user invite',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['email', 'firstName', 'lastName', 'role'],
          properties: {
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string', minLength: 1 },
            lastName: { type: 'string', minLength: 1 },
            role: {
              type: 'string',
              enum: [
                'admin',
                'devices_admin',
                'devices_viewer',
                'onprem_admin',
                'onprem_viewer',
                'full_viewer',
                'full_editor',
              ],
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              role: { type: 'string' },
              status: { type: 'string' },
              expiresAt: { type: 'string', format: 'date-time' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    sendInvite
  );

  // List invites (admin only)
  app.get(
    '/',
    {
      preHandler: [authenticate, authorizeAdmin()],
      schema: {
        tags: ['Invites'],
        summary: 'List all invites',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    role: { type: 'string' },
                    status: { type: 'string' },
                    expiresAt: { type: 'string', format: 'date-time' },
                    createdAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    getInvites
  );

  // Validate invite token (public)
  app.get(
    '/:token',
    {
      schema: {
        tags: ['Invites'],
        summary: 'Validate invite token',
        params: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              role: { type: 'string' },
              expiresAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    validateInvite
  );

  // Accept invite (public)
  app.post(
    '/:token/accept',
    {
      schema: {
        tags: ['Invites'],
        summary: 'Accept invite and create account',
        params: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['password'],
          properties: {
            password: { type: 'string', minLength: 8 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
      },
    },
    acceptInviteHandler
  );

  // Revoke invite (admin only)
  app.delete(
    '/:id',
    {
      preHandler: [authenticate, authorizeAdmin()],
      schema: {
        tags: ['Invites'],
        summary: 'Revoke invite',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
      },
    },
    revokeInviteHandler
  );

  // Resend invite (admin only)
  app.post(
    '/:id/resend',
    {
      preHandler: [authenticate, authorizeAdmin()],
      schema: {
        tags: ['Invites'],
        summary: 'Resend invite email',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              expiresAt: { type: 'string', format: 'date-time' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    resendInviteHandler
  );
}
