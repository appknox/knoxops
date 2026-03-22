import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createLicenseRequest,
  listLicenseRequests,
  listAllLicenseRequests,
  getLicenseRequest,
  uploadLicenseFile,
  cancelLicenseRequest,
  generateDownloadToken,
  downloadLicenseFile,
  verifyDownloadToken,
} from './onprem-license-requests.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { promises as fs, createReadStream } from 'fs';

export async function onpremLicenseRequestsRoutes(app: FastifyInstance) {
  // POST /onprem/:deploymentId/license-requests - Create license request
  app.post(
    '/:deploymentId/license-requests',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-Prem License Requests'],
        summary: 'Submit a new license key request',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['deploymentId'],
          properties: {
            deploymentId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['requestType', 'licenseStartDate', 'licenseEndDate', 'numberOfProjects', 'fingerprint', 'targetVersion'],
          properties: {
            requestType: { type: 'string', enum: ['license_renewal', 'patch_update'] },
            targetVersion: { type: 'string', maxLength: 50 },
            licenseStartDate: { type: 'string', format: 'date-time' },
            licenseEndDate: { type: 'string', format: 'date-time' },
            numberOfProjects: { type: 'integer', minimum: 1 },
            fingerprint: { type: 'string', maxLength: 500 },
            notes: { type: 'string', maxLength: 1000, nullable: true },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              requestNo: { type: 'integer' },
              status: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{
      Params: { deploymentId: string };
      Body: {
        requestType: 'license_renewal' | 'patch_update';
        targetVersion: string;
        licenseStartDate: string;
        licenseEndDate: string;
        numberOfProjects: number;
        fingerprint: string;
        notes?: string;
      };
    }>, reply: FastifyReply) => {
      const { deploymentId } = request.params;
      const { requestType, targetVersion, licenseStartDate, licenseEndDate, numberOfProjects, fingerprint, notes } = request.body;
      const userId = (request.user as any).id;

      try {
        const result = await createLicenseRequest(
          deploymentId,
          {
            requestType,
            targetVersion,
            licenseStartDate: new Date(licenseStartDate),
            licenseEndDate: new Date(licenseEndDate),
            numberOfProjects,
            fingerprint,
            notes,
          },
          userId
        );
        return reply.code(201).send(result);
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    }
  );

  // GET /onprem/licence-requests/all - List all requests across all clients
  app.get(
    '/licence-requests/all',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-Prem License Requests'],
        summary: 'List all licence requests across all clients',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array', items: { type: 'object', additionalProperties: true } },
              pagination: { type: 'object', properties: { total: { type: 'integer' } } },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request.user as any).id;
      const role = (request.user as any).role;
      const { requests, total } = await listAllLicenseRequests(userId, role);
      return reply.send({ data: requests, pagination: { total } });
    }
  );

  // GET /onprem/:deploymentId/license-requests - List requests
  app.get(
    '/:deploymentId/license-requests',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-Prem License Requests'],
        summary: 'List license key requests for a deployment',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['deploymentId'],
          properties: {
            deploymentId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
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
    async (request: FastifyRequest<{
      Params: { deploymentId: string };
    }>, reply: FastifyReply) => {
      const { deploymentId } = request.params;
      const userId = (request.user as any).id;
      const role = (request.user as any).role;

      const { requests, total } = await listLicenseRequests(deploymentId, userId, role);

      return reply.send({
        data: requests,
        pagination: { total },
      });
    }
  );

  // GET /onprem/:deploymentId/license-requests/:id - Get single request
  app.get(
    '/:deploymentId/license-requests/:id',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-Prem License Requests'],
        summary: 'Get a single license key request',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['deploymentId', 'id'],
          properties: {
            deploymentId: { type: 'string', format: 'uuid' },
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
        },
      },
    },
    async (request: FastifyRequest<{
      Params: { deploymentId: string; id: string };
    }>, reply: FastifyReply) => {
      const { deploymentId, id } = request.params;

      const result = await getLicenseRequest(id, deploymentId);
      if (!result) {
        return reply.code(404).send({ error: 'License request not found' });
      }

      return reply.send(result);
    }
  );

  // POST /onprem/:deploymentId/license-requests/:id/upload - Upload license file
  app.post(
    '/:deploymentId/license-requests/:id/upload',
    {
      preHandler: [authenticate, authorize('manage', 'OnPrem')],
      schema: {
        tags: ['On-Prem License Requests'],
        summary: 'Upload license file to complete a request (admin only)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['deploymentId', 'id'],
          properties: {
            deploymentId: { type: 'string', format: 'uuid' },
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
        },
      },
    },
    async (request: FastifyRequest<{
      Params: { deploymentId: string; id: string };
    }>, reply: FastifyReply) => {
      const { deploymentId, id } = request.params;
      const userId = (request.user as any).id;

      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'No file provided' });
      }

      const buffer = await data.toBuffer();
      const result = await uploadLicenseFile(
        id,
        deploymentId,
        {
          filename: data.filename,
          data: buffer,
        },
        userId
      );

      return reply.send(result);
    }
  );

  // POST /onprem/:deploymentId/license-requests/:id/cancel - Cancel request
  app.post(
    '/:deploymentId/license-requests/:id/cancel',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-Prem License Requests'],
        summary: 'Cancel a pending license request',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['deploymentId', 'id'],
          properties: {
            deploymentId: { type: 'string', format: 'uuid' },
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            reason: { type: 'string', maxLength: 500, nullable: true },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
        },
      },
    },
    async (request: FastifyRequest<{
      Params: { deploymentId: string; id: string };
      Body: { reason?: string };
    }>, reply: FastifyReply) => {
      const { deploymentId, id } = request.params;
      const { reason } = request.body;
      const userId = (request.user as any).id;

      const result = await cancelLicenseRequest(id, deploymentId, userId, reason);

      return reply.send(result);
    }
  );

  // POST /onprem/license-requests/:id/generate-token - Generate download token
  app.post(
    '/license-requests/:id/generate-token',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['On-Prem License Requests'],
        summary: 'Generate a time-limited download token for a license file',
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
              token: { type: 'string' },
              expiresAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{
      Params: { id: string };
    }>, reply: FastifyReply) => {
      const { id } = request.params;
      const userId = (request.user as any).id;

      const { token, expiresAt } = generateDownloadToken(id, userId);

      return reply.send({
        token,
        expiresAt,
      });
    }
  );

  // GET /onprem/license-requests/:id/download - Download license file
  app.get(
    '/license-requests/:id/download',
    {
      schema: {
        tags: ['On-Prem License Requests'],
        summary: 'Download a license file using a token',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        querystring: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{
      Params: { id: string };
      Querystring: { token: string };
    }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { token } = request.query;

      if (!token) {
        return reply.code(400).send({ error: 'Download token required' });
      }

      try {
        const { filePath, fileName } = await downloadLicenseFile(id, token);

        // Check if file exists
        try {
          await fs.access(filePath);
        } catch {
          return reply.code(404).send({ error: 'License file not found' });
        }

        // Stream file download
        reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
        reply.header('Content-Type', 'application/octet-stream');

        const fileStream = createReadStream(filePath);
        return reply.send(fileStream);
      } catch (error: any) {
        return reply.code(401).send({ error: error.message });
      }
    }
  );
}
