import { FastifyInstance } from 'fastify';
import { list, getById, update, remove } from './users.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeAdmin } from '../../middleware/authorize.js';

const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    role: { type: 'string' },
    isActive: { type: 'boolean' },
    inviteStatus: { type: 'string' },
    lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export async function userRoutes(app: FastifyInstance) {
  // List users
  app.get(
    '/',
    {
      preHandler: [authenticate, authorizeAdmin()],
      schema: {
        tags: ['Users'],
        summary: 'List users',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            search: { type: 'string' },
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
            isActive: { type: 'string', enum: ['true', 'false'] },
            sortBy: {
              type: 'string',
              enum: ['email', 'firstName', 'lastName', 'createdAt', 'lastLoginAt'],
              default: 'createdAt',
            },
            sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array', items: userSchema },
              pagination: {
                type: 'object',
                properties: {
                  page: { type: 'integer' },
                  limit: { type: 'integer' },
                  total: { type: 'integer' },
                  totalPages: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
    list
  );

  // Get user by ID
  app.get(
    '/:id',
    {
      preHandler: [authenticate, authorizeAdmin()],
      schema: {
        tags: ['Users'],
        summary: 'Get user by ID',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: userSchema,
        },
      },
    },
    getById
  );

  // Update user
  app.put(
    '/:id',
    {
      preHandler: [authenticate, authorizeAdmin()],
      schema: {
        tags: ['Users'],
        summary: 'Update user',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            firstName: { type: 'string', minLength: 1, maxLength: 100 },
            lastName: { type: 'string', minLength: 1, maxLength: 100 },
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
            isActive: { type: 'boolean' },
          },
        },
        response: {
          200: userSchema,
        },
      },
    },
    update
  );

  // Deactivate user
  app.delete(
    '/:id',
    {
      preHandler: [authenticate, authorizeAdmin()],
      schema: {
        tags: ['Users'],
        summary: 'Deactivate user',
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
    remove
  );
}
