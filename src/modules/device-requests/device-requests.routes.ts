import { FastifyInstance } from 'fastify';
import { create, list, getById, approve, reject, complete } from './device-requests.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

export async function deviceRequestRoutes(app: FastifyInstance) {
  // Create device request
  app.post(
    '/',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Device Requests'],
        summary: 'Submit a new device request',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['deviceType', 'platform', 'purpose'],
          properties: {
            deviceType: { type: 'string', enum: ['mobile', 'tablet', 'charging_hub'] },
            platform: { type: 'string' },
            osVersion: { type: 'string', nullable: true },
            purpose: { type: 'string' },
            requestingFor: { type: 'string', maxLength: 255, nullable: true },
            additionalDetails: { type: 'string', nullable: true },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    create
  );

  // List device requests
  app.get(
    '/',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Device Requests'],
        summary: 'List device requests (all for admin, own for read-only)',
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
                    id: { type: 'string', format: 'uuid' },
                    requestNo: { type: 'integer' },
                    requestedBy: { type: 'string', format: 'uuid' },
                    requestedByUser: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        id: { type: 'string' },
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                        email: { type: 'string' },
                      },
                    },
                    deviceType: { type: 'string' },
                    platform: { type: 'string' },
                    osVersion: { type: 'string', nullable: true },
                    purpose: { type: 'string' },
                    requestingFor: { type: 'string', nullable: true },
                    additionalDetails: { type: 'string', nullable: true },
                    status: { type: 'string' },
                    rejectionReason: { type: 'string', nullable: true },
                    linkedDeviceId: { type: 'string', nullable: true },
                    approvedBy: { type: 'string', nullable: true },
                    approvedByUser: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        id: { type: 'string' },
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                        email: { type: 'string' },
                      },
                    },
                    approvedAt: { type: 'string', format: 'date-time', nullable: true },
                    rejectedBy: { type: 'string', nullable: true },
                    rejectedByUser: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        id: { type: 'string' },
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                        email: { type: 'string' },
                      },
                    },
                    rejectedAt: { type: 'string', format: 'date-time', nullable: true },
                    completedBy: { type: 'string', nullable: true },
                    completedByUser: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        id: { type: 'string' },
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                        email: { type: 'string' },
                      },
                    },
                    completedAt: { type: 'string', format: 'date-time', nullable: true },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
              pagination: {
                type: 'object',
                properties: {
                  total: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
    list
  );

  // Get single device request
  app.get(
    '/:id',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Device Requests'],
        summary: 'Get single device request (own or admin)',
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
          },
        },
      },
    },
    getById
  );

  // Approve device request
  app.patch(
    '/:id/approve',
    {
      preHandler: [authenticate, authorize('manage', 'Device')],
      schema: {
        tags: ['Device Requests'],
        summary: 'Approve device request (admin only)',
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
          },
        },
      },
    },
    approve
  );

  // Reject device request
  app.patch(
    '/:id/reject',
    {
      preHandler: [authenticate, authorize('manage', 'Device')],
      schema: {
        tags: ['Device Requests'],
        summary: 'Reject device request (admin only)',
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
          required: ['reason'],
          properties: {
            reason: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: {
            type: 'object',
          },
        },
      },
    },
    reject
  );

  // Complete device request
  app.patch(
    '/:id/complete',
    {
      preHandler: [authenticate, authorize('manage', 'Device')],
      schema: {
        tags: ['Device Requests'],
        summary: 'Complete device request and optionally link a device (admin only)',
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
            linkedDeviceId: { type: 'string', format: 'uuid', nullable: true },
          },
        },
        response: {
          200: {
            type: 'object',
          },
        },
      },
    },
    complete
  );
}
