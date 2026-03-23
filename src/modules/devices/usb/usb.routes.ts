import { FastifyInstance } from 'fastify';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorize } from '../../../middleware/authorize.js';
import { detectHandler, pairHandler, fetchInfoHandler } from './usb.controller.js';

export async function usbRoutes(app: FastifyInstance) {
  // Detect connected device
  app.post(
    '/detect',
    {
      preHandler: [authenticate, authorize('create', 'Device')],
      schema: {
        tags: ['Devices - USB'],
        summary: 'Detect connected iOS or Android device',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              device: {
                type: 'object',
                nullable: true,
                properties: {
                  platform: { type: 'string', enum: ['ios', 'android'] },
                  id: { type: 'string' },
                  name: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
    },
    detectHandler
  );

  // Pair/authorize device
  app.post(
    '/pair',
    {
      preHandler: [authenticate, authorize('create', 'Device')],
      schema: {
        tags: ['Devices - USB'],
        summary: 'Authorize/trust connected device',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['platform', 'id'],
          properties: {
            platform: { type: 'string', enum: ['ios', 'android'] },
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
        },
      },
    },
    pairHandler
  );

  // Fetch device info
  app.post(
    '/fetch',
    {
      preHandler: [authenticate, authorize('create', 'Device')],
      schema: {
        tags: ['Devices - USB'],
        summary: 'Fetch detailed device information',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['platform', 'id'],
          properties: {
            platform: { type: 'string', enum: ['ios', 'android'] },
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              name: { type: 'string', nullable: true },
              model: { type: 'string', nullable: true },
              osVersion: { type: 'string', nullable: true },
              serialNumber: { type: 'string', nullable: true },
              udid: { type: 'string', nullable: true },
              modelNumber: { type: 'string', nullable: true },
              cpuArch: { type: 'string', nullable: true },
              platform: { type: 'string', enum: ['iOS', 'Android'] },
              colour: { type: 'string', nullable: true },
              imei: { type: 'string', nullable: true },
              imei2: { type: 'string', nullable: true },
              macAddress: { type: 'string', nullable: true },
              simNumber: { type: 'string', nullable: true },
              rom: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
    fetchInfoHandler
  );
}
