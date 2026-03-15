import { FastifyInstance } from 'fastify';
import { list, listByModule, listByUser, listByEntity } from './audit-logs.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeAdmin } from '../../middleware/authorize.js';

const auditLogSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid', nullable: true },
    module: { type: 'string' },
    action: { type: 'string' },
    entityType: { type: 'string', nullable: true },
    entityId: { type: 'string', format: 'uuid', nullable: true },
    entityName: { type: 'string', nullable: true },
    changes: { type: 'object', nullable: true },
    metadata: { type: 'object', nullable: true },
    ipAddress: { type: 'string', nullable: true },
    userAgent: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const paginatedResponse = {
  type: 'object',
  properties: {
    data: { type: 'array', items: auditLogSchema },
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
};

export async function auditLogRoutes(app: FastifyInstance) {
  // List all audit logs
  app.get(
    '/',
    {
      preHandler: [authenticate, authorizeAdmin()],
      schema: {
        tags: ['Audit Logs'],
        summary: 'List all audit logs',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            module: { type: 'string', enum: ['auth', 'users', 'devices', 'onprem'] },
            userId: { type: 'string', format: 'uuid' },
            entityType: { type: 'string' },
            entityId: { type: 'string', format: 'uuid' },
            action: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
          },
        },
        response: {
          200: paginatedResponse,
        },
      },
    },
    list
  );

  // List audit logs by module
  app.get(
    '/module/:module',
    {
      preHandler: [authenticate, authorizeAdmin()],
      schema: {
        tags: ['Audit Logs'],
        summary: 'List audit logs by module',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['module'],
          properties: {
            module: { type: 'string', enum: ['auth', 'users', 'devices', 'onprem'] },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            action: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
          },
        },
        response: {
          200: paginatedResponse,
        },
      },
    },
    listByModule
  );

  // List audit logs by user
  app.get(
    '/user/:userId',
    {
      preHandler: [authenticate, authorizeAdmin()],
      schema: {
        tags: ['Audit Logs'],
        summary: 'List audit logs by user',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            module: { type: 'string', enum: ['auth', 'users', 'devices', 'onprem'] },
            action: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
          },
        },
        response: {
          200: paginatedResponse,
        },
      },
    },
    listByUser
  );

  // List audit logs by entity
  app.get(
    '/entity/:type/:id',
    {
      preHandler: [authenticate, authorizeAdmin()],
      schema: {
        tags: ['Audit Logs'],
        summary: 'List audit logs by entity',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['type', 'id'],
          properties: {
            type: { type: 'string' },
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array', items: auditLogSchema },
            },
          },
        },
      },
    },
    listByEntity
  );
}
