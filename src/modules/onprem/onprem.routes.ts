import { FastifyInstance } from 'fastify';
import {
  list,
  getById,
  create,
  update,
  updateStatus,
  remove,
  getStatusHistory,
  getAuditLog,
  uploadPrerequisite,
  downloadPrerequisite,
  uploadSslCertificate,
  downloadSslCertificate,
  checkEmail,
  checkPhone,
  createDeploymentComment,
  updateDeploymentComment,
  deleteDeploymentComment,
  getDeploymentComments,
  getCombinedDeploymentHistory,
  getDistinctAppknoxVersions,
  getDistinctCsmUsersHandler,
  uploadDocuments,
  listDocuments,
  removeDocument,
  downloadAll,
  recordPatch,
  searchClients,
} from './onprem.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const onpremSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    clientName: { type: 'string' },
    clientStatus: { type: 'string', nullable: true },
    environmentType: { type: 'string', nullable: true },
    associatedCsmId: { type: 'string', format: 'uuid', nullable: true },
    associatedCsm: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string', format: 'uuid' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
      },
    },
    contactEmail: { type: 'string', nullable: true },
    contactPhone: { type: 'string', nullable: true },
    firstDeploymentDate: { type: 'string', format: 'date-time', nullable: true },
    currentVersion: { type: 'string', nullable: true },
    lastPatchDate: { type: 'string', format: 'date-time', nullable: true },
    maintenancePlan: { type: 'string', nullable: true },
    nextScheduledPatchDate: { type: 'string', format: 'date-time', nullable: true },
    prerequisiteFileUrl: { type: 'string', nullable: true },
    prerequisiteFileName: { type: 'string', nullable: true },
    domainName: { type: 'string', nullable: true },
    sslCertificateFileUrl: { type: 'string', nullable: true },
    infrastructure: {
      type: 'object',
      nullable: true,
      properties: {
        hypervisor: {
          type: 'object',
          nullable: true,
          properties: {
            type: { type: 'string', nullable: true },
            version: { type: 'string', nullable: true },
            customType: { type: 'string', nullable: true },
          },
        },
        network: {
          type: 'object',
          nullable: true,
          properties: {
            staticIP: { type: 'string', nullable: true },
            gateway: { type: 'string', nullable: true },
            netmask: { type: 'string', nullable: true },
            dnsServers: { type: 'array', items: { type: 'string' }, nullable: true },
            ntpServer: { type: 'string', nullable: true },
            smtpServer: { type: 'string', nullable: true },
            lanSpeed: { type: 'string', nullable: true },
            wifiStandard: { type: 'string', nullable: true },
          },
        },
        server: {
          type: 'object',
          nullable: true,
          properties: {
            cpuCores: { type: 'integer', nullable: true },
            ramGB: { type: 'integer', nullable: true },
            storageGB: { type: 'integer', nullable: true },
            size: { type: 'string', nullable: true },
          },
        },
        fingerprint: { type: 'string', nullable: true },
      },
    },
    license: {
      type: 'object',
      nullable: true,
      properties: {
        userFullName: { type: 'string', nullable: true },
        email: { type: 'string', nullable: true },
        username: { type: 'string', nullable: true },
        startDate: { type: 'string', format: 'date-time', nullable: true },
        endDate: { type: 'string', format: 'date-time', nullable: true },
        pricingPlan: { type: 'string', enum: ['per app', 'per scan'], nullable: true },
        numberOfApps: { type: 'integer', nullable: true },
      },
    },
    customerId: { type: 'string', nullable: true },
    customerName: { type: 'string', nullable: true },
    status: { type: 'string' },
    version: { type: 'string', nullable: true },
    hostname: { type: 'string', nullable: true },
    region: { type: 'string', nullable: true },
    environment: { type: 'string', nullable: true },
    nodeCount: { type: 'integer', nullable: true },
    lastHealthCheck: { type: 'string', format: 'date-time', nullable: true },
    healthCheckDetails: { type: 'object', nullable: true },
    configuration: { type: 'object', nullable: true },
    notes: { type: 'string', nullable: true },
    registeredBy: { type: 'string', nullable: true },
    lastUpdatedBy: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export async function onpremRoutes(app: FastifyInstance) {
  // List deployments
  app.get(
    '/',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'List on-prem deployments',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            search: { type: 'string' },
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'offline', 'maintenance', 'provisioning', 'decommissioned'],
            },
            clientStatus: {
              type: 'string',
              enum: ['active', 'inactive'],
            },
            environmentType: {
              type: 'string',
              enum: ['poc', 'production'],
            },
            currentVersion: { type: 'string' },
            maintenancePlan: {
              type: 'string',
              enum: ['quarterly', 'annually'],
            },
            environment: { type: 'string' },
            region: { type: 'string' },
            sortBy: {
              type: 'string',
              enum: ['clientName', 'createdAt', 'updatedAt', 'status', 'customerName', 'lastPatchDate'],
              default: 'createdAt',
            },
            sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array', items: onpremSchema },
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

  // Search clients (for autosuggest)
  app.get(
    '/search',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Search active clients by name',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 1 },
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
                    clientName: { type: 'string' },
                    contactEmail: { type: 'string', format: 'email' },
                  },
                },
              },
            },
          },
        },
      },
    },
    searchClients
  );

  // Get deployment by ID
  app.get(
    '/:id',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Get on-prem deployment by ID',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: onpremSchema,
        },
      },
    },
    getById
  );

  // Create deployment
  app.post(
    '/',
    {
      preHandler: [authenticate, authorize('create', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Register on-prem deployment',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['clientName'],
          properties: {
            clientName: { type: 'string', minLength: 1, maxLength: 255 },
            clientStatus: { type: 'string', enum: ['active', 'inactive'] },
            environmentType: { type: 'string', enum: ['poc', 'production'] },
            associatedCsmId: { type: 'string', format: 'uuid' },
            contactEmail: { type: 'string', format: 'email' },
            contactPhone: { type: 'string', maxLength: 50 },
            firstDeploymentDate: { type: 'string' },
            currentVersion: { type: 'string', maxLength: 50 },
            maintenancePlan: { type: 'string', enum: ['quarterly', 'annually'] },
            nextScheduledPatchDate: { type: 'string' },
            domainName: { type: 'string', maxLength: 255 },
            sslProvided: { type: 'boolean' },
            infrastructure: { type: 'object' },
            license: { type: 'object' },
            cpuCores: { type: 'integer', minimum: 1 },
            ramGB: { type: 'integer', minimum: 1 },
            storageGB: { type: 'integer', minimum: 1 },
            deploymentSize: { type: 'string', enum: ['small', 'medium', 'large', 'enterprise'] },
            networkReadiness: { type: 'object' },
            customerId: { type: 'string', maxLength: 100 },
            customerName: { type: 'string', maxLength: 255 },
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'offline', 'maintenance', 'provisioning', 'decommissioned'],
              default: 'provisioning',
            },
            version: { type: 'string', maxLength: 50 },
            hostname: { type: 'string', maxLength: 255 },
            region: { type: 'string', maxLength: 100 },
            environment: { type: 'string', maxLength: 50 },
            nodeCount: { type: 'integer', minimum: 1, default: 1 },
            configuration: { type: 'object' },
            notes: { type: 'string' },
          },
        },
        response: {
          201: onpremSchema,
        },
      },
    },
    create
  );

  // Update deployment
  app.put(
    '/:id',
    {
      preHandler: [authenticate, authorize('update', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Update on-prem deployment',
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
            clientName: { type: 'string', minLength: 1, maxLength: 255 },
            clientStatus: { type: 'string', enum: ['active', 'inactive'] },
            environmentType: { type: 'string', enum: ['poc', 'production'] },
            associatedCsmId: { type: 'string', format: 'uuid' },
            contactEmail: { type: 'string', format: 'email' },
            contactPhone: { type: 'string', maxLength: 50 },
            firstDeploymentDate: { type: 'string' },
            currentVersion: { type: 'string', maxLength: 50 },
            maintenancePlan: { type: 'string', enum: ['quarterly', 'annually'] },
            nextScheduledPatchDate: { type: 'string' },
            domainName: { type: 'string', maxLength: 255 },
            sslProvided: { type: 'boolean' },
            infrastructure: { type: 'object' },
            license: { type: 'object' },
            cpuCores: { type: 'integer', minimum: 1 },
            ramGB: { type: 'integer', minimum: 1 },
            storageGB: { type: 'integer', minimum: 1 },
            deploymentSize: { type: 'string', enum: ['small', 'medium', 'large', 'enterprise'] },
            networkReadiness: { type: 'object' },
            customerId: { type: 'string', maxLength: 100 },
            customerName: { type: 'string', maxLength: 255 },
            version: { type: 'string', maxLength: 50 },
            hostname: { type: 'string', maxLength: 255 },
            region: { type: 'string', maxLength: 100 },
            environment: { type: 'string', maxLength: 50 },
            nodeCount: { type: 'integer', minimum: 1 },
            configuration: { type: 'object' },
            notes: { type: 'string' },
          },
        },
        response: {
          200: onpremSchema,
        },
      },
    },
    update
  );

  // Record patch deployment
  app.patch(
    '/:id/record-patch',
    {
      preHandler: [authenticate, authorize('update', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Record patch deployment',
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
          required: ['patchDate'],
          properties: {
            patchDate: { type: 'string' },
            newVersion: { type: 'string', maxLength: 50 },
            nextScheduledPatchDate: { type: 'string' },
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
    recordPatch
  );

  // Update deployment status
  app.patch(
    '/:id/status',
    {
      preHandler: [authenticate, authorize('update', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Update on-prem deployment status',
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
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'offline', 'maintenance', 'provisioning', 'decommissioned'],
            },
            reason: { type: 'string' },
          },
        },
        response: {
          200: onpremSchema,
        },
      },
    },
    updateStatus
  );

  // Delete deployment
  app.delete(
    '/:id',
    {
      preHandler: [authenticate, authorize('delete', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Delete on-prem deployment',
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

  // Get status history
  app.get(
    '/:id/history',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Get on-prem deployment status history',
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
                    deploymentId: { type: 'string' },
                    previousStatus: { type: 'string', nullable: true },
                    newStatus: { type: 'string' },
                    changedBy: { type: 'string', nullable: true },
                    reason: { type: 'string', nullable: true },
                    createdAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    getStatusHistory
  );

  // Get audit log
  app.get(
    '/:id/audit',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Get on-prem deployment audit log',
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
                    changes: { type: 'object', nullable: true },
                    createdAt: { type: 'string', format: 'date-time' },
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

  // Upload prerequisite file
  app.post(
    '/:id/prerequisite',
    {
      preHandler: [authenticate, authorize('update', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Upload prerequisite file for deployment',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        consumes: ['multipart/form-data'],
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              fileName: { type: 'string' },
              parsedData: { type: 'object', nullable: true },
            },
          },
        },
      },
    },
    uploadPrerequisite
  );

  // Download prerequisite file
  app.get(
    '/:id/prerequisite',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Download prerequisite file for deployment',
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
            type: 'string',
            description: 'File content',
          },
        },
      },
    },
    downloadPrerequisite
  );

  // Upload SSL certificate file
  app.post(
    '/:id/ssl-certificate',
    {
      preHandler: [authenticate, authorize('update', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Upload SSL certificate file (ZIP, GZ, TAR.GZ) for deployment',
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
              fileName: { type: 'string' },
            },
          },
        },
      },
    },
    uploadSslCertificate
  );

  // Download SSL certificate file
  app.get(
    '/:id/ssl-certificate',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Download SSL certificate file for deployment',
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
            type: 'string',
            description: 'ZIP file content',
          },
        },
      },
    },
    downloadSslCertificate
  );

  // Check if email exists
  app.get(
    '/check-email',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Check if contact email already exists',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string' },
            excludeId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              exists: { type: 'boolean' },
              deployment: {
                type: 'object',
                nullable: true,
                properties: {
                  id: { type: 'string' },
                  clientName: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    checkEmail
  );

  // Check if phone exists
  app.get(
    '/check-phone',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Check if contact phone already exists',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['phone'],
          properties: {
            phone: { type: 'string' },
            excludeId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              exists: { type: 'boolean' },
              deployment: {
                type: 'object',
                nullable: true,
                properties: {
                  id: { type: 'string' },
                  clientName: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    checkPhone
  );

  // Get distinct Appknox versions
  app.get(
    '/distinct-versions',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Get distinct Appknox versions across all deployments',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
    },
    getDistinctAppknoxVersions
  );

  // Get distinct CSM users
  app.get(
    '/distinct-csm-users',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Get distinct CSM users assigned to on-prem deployments',
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
    getDistinctCsmUsersHandler
  );

  // ============================================
  // COMMENT ROUTES
  // ============================================

  // Get combined history (audit + comments + status)
  app.get(
    '/:id/combined-history',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Get combined deployment history (audit logs + comments + status changes)',
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
            type: { type: 'string', enum: ['all', 'comments', 'activities'], default: 'all' },
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
                    type: { type: 'string', enum: ['comment', 'audit', 'status_change'] },
                    timestamp: { type: 'string', format: 'date-time' },
                    user: { type: 'object', nullable: true, additionalProperties: true },
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
    getCombinedDeploymentHistory
  );

  // Get comments
  app.get(
    '/:id/comments',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Get deployment comments',
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
                    deploymentId: { type: 'string' },
                    comment: { type: 'string' },
                    createdBy: { type: 'string', nullable: true },
                    createdByUser: { type: 'object', nullable: true },
                    updatedBy: { type: 'string', nullable: true },
                    updatedByUser: { type: 'object', nullable: true },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    getDeploymentComments
  );

  // Create comment
  app.post(
    '/:id/comments',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Add comment to deployment',
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
          required: ['comment'],
          properties: {
            comment: { type: 'string', minLength: 1, maxLength: 5000 },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              comment: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    createDeploymentComment
  );

  // Update comment
  app.put(
    '/:id/comments/:commentId',
    {
      preHandler: [authenticate, authorize('update', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Update deployment comment (only by creator)',
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
          required: ['comment'],
          properties: {
            comment: { type: 'string', minLength: 1, maxLength: 5000 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              comment: { type: 'string' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    updateDeploymentComment
  );

  // Delete comment
  app.delete(
    '/:id/comments/:commentId',
    {
      preHandler: [authenticate, authorize('delete', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Delete deployment comment (only by creator)',
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
    deleteDeploymentComment
  );

  // Document upload route
  app.post(
    '/:id/documents',
    {
      preHandler: [authenticate, authorize('update', 'OnPrem')],
      config: { isMultipart: true },
      schema: {
        tags: ['On-prem'],
        summary: 'Upload RFP or other documents',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          required: ['category'],
          properties: { category: { type: 'string', enum: ['rfp', 'other'] } },
        },
      },
    },
    uploadDocuments
  );

  // List documents route
  app.get(
    '/:id/documents',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'List documents for a deployment',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    listDocuments
  );

  // Delete document route
  app.delete(
    '/:id/documents/:docId',
    {
      preHandler: [authenticate, authorize('update', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Delete a document',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'docId'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            docId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    removeDocument
  );

  // Download all files as ZIP route
  app.get(
    '/:id/download-all',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-prem'],
        summary: 'Download all files as ZIP',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    downloadAll
  );
}
