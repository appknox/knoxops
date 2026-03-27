import { FastifyInstance } from 'fastify';
import { list, getById, create, update, remove, getAuditLog, stats, addComment, editComment, removeComment, getHistory, getDistinctOsVersionsHandler, suggestDevicesHandler } from './devices.controller.js';
import { checkSerialNumber } from './devices.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

// Full device schema for details endpoint
const deviceSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    serialNumber: { type: 'string', nullable: true },
    type: { type: 'string' },
    status: { type: 'string' },
    manufacturer: { type: 'string', nullable: true },
    model: { type: 'string', nullable: true },
    location: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    purpose: { type: 'string', nullable: true },
    assignedTo: { type: 'string', nullable: true },
    condition: { type: 'string', nullable: true },
    conditionNotes: { type: 'string', nullable: true },
    askingPrice: { type: 'number', nullable: true },
    metadata: { type: 'object', nullable: true, additionalProperties: true },
    registeredBy: { type: 'string', nullable: true },
    lastUpdatedBy: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

// Optimized schema for list endpoint (only fields needed for table display)
const deviceListItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    type: { type: 'string' },
    status: { type: 'string' },
    model: { type: 'string', nullable: true },
    platform: { type: 'string', nullable: true },
    osVersion: { type: 'string', nullable: true },
    purpose: { type: 'string', nullable: true },
    assignedTo: { type: 'string', nullable: true },
  },
};

export async function deviceRoutes(app: FastifyInstance) {
  // Get device stats
  app.get(
    '/stats',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Devices'],
        summary: 'Get device statistics',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              inInventory: { type: 'integer' },
              outForRepair: { type: 'integer' },
              toBeSold: { type: 'integer' },
              inactive: { type: 'integer' },
            },
          },
        },
      },
    },
    stats
  );

  // Check serial number
  app.get(
    '/check-serial',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Devices'],
        summary: 'Check if a serial number is already registered',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['serialNumber'],
          properties: {
            serialNumber: { type: 'string' },
            excludeId: { type: 'string', description: 'Device UUID to exclude (for edit)' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              exists: { type: 'boolean' },
              deviceId: { type: 'string', nullable: true },   // e.g. "A001"
              deviceName: { type: 'string', nullable: true }, // e.g. "Pixel 7a"
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { serialNumber, excludeId } = request.query as { serialNumber: string; excludeId?: string };
      const result = await checkSerialNumber(serialNumber, excludeId);
      return reply.send(result);
    }
  );

  // List devices
  app.get(
    '/',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Devices'],
        summary: 'List devices',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 10000, default: 20 },
            search: { type: 'string' },
            type: {
              type: 'string',
              enum: ['server', 'workstation', 'mobile', 'tablet', 'iot', 'network', 'charging_hub', 'other'],
            },
            status: {
              type: 'string',
              enum: ['in_inventory', 'checked_out', 'maintenance', 'decommissioned', 'for_sale', 'sold', 'not_verified'],
            },
            sortBy: {
              type: 'string',
              enum: ['name', 'createdAt', 'updatedAt', 'status', 'type'],
              default: 'createdAt',
            },
            sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
            platform: { type: 'string' },
            osVersion: { type: 'string' },
            purpose: { type: 'string' },
            assignedTo: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array', items: deviceListItemSchema },
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

  // Get distinct OS versions for a platform
  app.get(
    '/distinct-os-versions',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Devices'],
        summary: 'Get distinct OS versions for a platform',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['platform'],
          properties: {
            platform: {
              type: 'string',
              enum: ['iOS', 'Android'],
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              versions: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
    },
    getDistinctOsVersionsHandler
  );

  // Suggest devices for request completion
  app.get(
    '/suggest',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Devices'],
        summary: 'Suggest devices based on platform and OS version',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['platform'],
          properties: {
            platform: { type: 'string' },
            osVersion: { type: 'string' },
            limit: { type: 'string', default: '50' },
          },
        },
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
                    name: { type: 'string' },
                    model: { type: 'string', nullable: true },
                    platform: { type: 'string', nullable: true },
                    osVersion: { type: 'string', nullable: true },
                    status: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    suggestDevicesHandler
  );

  // Get device by ID
  app.get(
    '/:id',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Devices'],
        summary: 'Get device by ID',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: deviceSchema,
        },
      },
    },
    getById
  );

  // Create device
  app.post(
    '/',
    {
      preHandler: [authenticate, authorize('create', 'Device')],
      schema: {
        tags: ['Devices'],
        summary: 'Create device',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['type'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            serialNumber: { type: 'string', maxLength: 100 },
            type: {
              type: 'string',
              enum: ['server', 'workstation', 'mobile', 'tablet', 'iot', 'network', 'charging_hub', 'other'],
            },
            status: {
              type: 'string',
              enum: ['in_inventory', 'checked_out', 'maintenance', 'decommissioned', 'for_sale', 'sold', 'not_verified'],
              default: 'in_inventory',
            },
            manufacturer: { type: 'string', maxLength: 100 },
            model: { type: 'string', maxLength: 100 },
            location: { type: 'string', maxLength: 255 },
            description: { type: 'string' },
            purpose: { type: 'string', maxLength: 100 },
            assignedTo: { type: 'string', maxLength: 255 },
            metadata: { type: 'object' },
          },
        },
        response: {
          201: deviceSchema,
        },
      },
    },
    create
  );

  // Update device
  app.put(
    '/:id',
    {
      preHandler: [authenticate, authorize('update', 'Device')],
      schema: {
        tags: ['Devices'],
        summary: 'Update device',
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
            name: { type: 'string', minLength: 1, maxLength: 255 },
            serialNumber: { type: 'string', maxLength: 100 },
            type: {
              type: 'string',
              enum: ['server', 'workstation', 'mobile', 'tablet', 'iot', 'network', 'charging_hub', 'other'],
            },
            status: {
              type: 'string',
              enum: ['in_inventory', 'checked_out', 'maintenance', 'decommissioned', 'for_sale', 'sold', 'not_verified'],
            },
            manufacturer: { type: 'string', maxLength: 100 },
            model: { type: 'string', maxLength: 100 },
            location: { type: 'string', maxLength: 255 },
            description: { type: 'string' },
            purpose: { type: 'string', maxLength: 100 },
            assignedTo: { type: 'string', maxLength: 255 },
            metadata: { type: 'object' },
            condition: { type: 'string', maxLength: 50, nullable: true },
            conditionNotes: { type: 'string', nullable: true },
            askingPrice: { type: 'number', nullable: true },
          },
        },
        response: {
          200: deviceSchema,
        },
      },
    },
    update
  );

  // Delete device
  app.delete(
    '/:id',
    {
      preHandler: [authenticate, authorize('delete', 'Device')],
      schema: {
        tags: ['Devices'],
        summary: 'Delete device',
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

  // Get device audit log
  app.get(
    '/:id/audit',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Devices'],
        summary: 'Get device audit log',
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
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    userId: { type: 'string', nullable: true },
                    module: { type: 'string' },
                    action: { type: 'string' },
                    entityType: { type: 'string', nullable: true },
                    entityId: { type: 'string', nullable: true },
                    entityName: { type: 'string', nullable: true },
                    changes: {
                      type: 'object',
                      nullable: true,
                      additionalProperties: true,
                    },
                    createdAt: { type: 'string', format: 'date-time' },
                    user: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        id: { type: 'string' },
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                        email: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    getAuditLog
  );

  // Get device history (merged comments + activities)
  app.get(
    '/:id/history',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Devices'],
        summary: 'Get device history (comments + activities)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['all', 'comment', 'activity'],
              default: 'all',
            },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
        },
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
                    type: { type: 'string', enum: ['comment', 'activity'] },
                    timestamp: { type: 'string', format: 'date-time' },
                    user: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        id: { type: 'string' },
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                        email: { type: 'string' },
                      },
                    },
                    data: { type: 'object', additionalProperties: true },
                  },
                },
              },
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
    getHistory
  );

  // Add comment
  app.post(
    '/:id/comments',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Devices'],
        summary: 'Add comment to device',
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
          required: ['text'],
          properties: {
            text: { type: 'string', minLength: 1 },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              entityType: { type: 'string' },
              entityId: { type: 'string' },
              text: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    addComment
  );

  // Edit comment
  app.put(
    '/:id/comments/:commentId',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Devices'],
        summary: 'Edit device comment (owner only)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'commentId'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            commentId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['text'],
          properties: {
            text: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: {
            type: 'object',
          },
        },
      },
    },
    editComment
  );

  // Delete comment
  app.delete(
    '/:id/comments/:commentId',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Devices'],
        summary: 'Delete device comment (owner only)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'commentId'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            commentId: { type: 'string', format: 'uuid' },
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
    removeComment
  );
}
