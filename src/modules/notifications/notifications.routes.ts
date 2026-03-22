import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { checkAndNotifyUpcomingPatches, getUpcomingPatches, sendDeploymentPatchReminder } from '../../services/patch-reminder.service.js';
import { sendDeviceCheckinDigest, sendDeviceCheckinDigestForDate, getTodaysCheckins, getYesterdaysCheckins, sendDeviceCheckoutDigest, sendDeviceCheckoutDigestForDate, getTodaysCheckouts, getYesterdaysCheckouts } from '../../services/device-checkin.service.js';

export async function notificationsRoutes(app: FastifyInstance) {
  // Manual trigger for patch reminders (admin only)
  app.post(
    '/notifications/patch-reminders/trigger',
    {
      preHandler: [authenticate, authorize('manage', 'OnPrem')],
      schema: {
        tags: ['Notifications'],
        summary: 'Manually trigger patch reminder notifications',
        description: 'Sends Slack notifications for upcoming patches (admin only, for testing)',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              upcomingPatchesCount: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const patches = await getUpcomingPatches(10);
        await checkAndNotifyUpcomingPatches();

        return reply.send({
          message: 'Patch reminder notifications triggered successfully',
          upcomingPatchesCount: patches.length,
        });
      } catch (error) {
        app.log.error('Error triggering patch reminders:', error);
        return reply.status(500).send({
          message: 'Failed to trigger patch reminders',
        });
      }
    }
  );

  // Manual trigger for specific deployment patch reminder
  app.post(
    '/notifications/patch-reminders/trigger/:id',
    {
      preHandler: [authenticate, authorize('manage', 'OnPrem')],
      schema: {
        tags: ['Notifications'],
        summary: 'Trigger patch reminder for specific deployment',
        description: 'Send Slack notification for a specific deployment patch reminder',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Deployment ID' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              deploymentId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        await sendDeploymentPatchReminder(id);

        return reply.send({
          message: 'Patch reminder notification sent successfully',
          deploymentId: id,
        });
      } catch (error) {
        app.log.error(`Error triggering patch reminder for deployment:`, error);
        return reply.status(500).send({
          message: 'Failed to trigger patch reminder',
        });
      }
    }
  );

  // Get upcoming patches (preview without sending notification)
  app.get(
    '/notifications/patch-reminders/preview',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
      schema: {
        tags: ['Notifications'],
        summary: 'Preview upcoming patch reminders',
        description: 'Get list of deployments with upcoming patches without sending notifications',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            daysAhead: {
              type: 'number',
              default: 10,
              description: 'Number of days to look ahead',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              upcomingPatches: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    clientName: { type: 'string' },
                    nextScheduledPatchDate: { type: 'string' },
                    daysUntilPatch: { type: 'number' },
                    currentVersion: { type: 'string', nullable: true },
                    environmentType: { type: 'string' },
                  },
                },
              },
              count: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { daysAhead = 10 } = request.query as { daysAhead?: number };

      try {
        const patches = await getUpcomingPatches(daysAhead);

        return reply.send({
          upcomingPatches: patches,
          count: patches.length,
        });
      } catch (error) {
        app.log.error('Error fetching upcoming patches:', error);
        return reply.status(500).send({
          message: 'Failed to fetch upcoming patches',
        });
      }
    }
  );

  // Device check-in digest — trigger
  app.post(
    '/notifications/device-checkin/trigger',
    {
      preHandler: [authenticate, authorize('manage', 'Device')],
      schema: {
        tags: ['Notifications'],
        summary: 'Manually trigger device check-in digest',
        description: 'Sends Slack notification for devices registered today (or yesterday for testing)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            useYesterday: {
              type: 'boolean',
              default: false,
              description: 'If true, send notification for yesterday\'s check-ins for testing',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              deviceCount: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { useYesterday = false } = request.query as { useYesterday?: boolean };
        const targetDate = useYesterday ? new Date(new Date().getTime() - 86400000) : new Date(); // yesterday = today - 1 day
        const deviceCount = await sendDeviceCheckinDigestForDate(targetDate);
        return reply.send({
          message: 'Device check-in digest triggered successfully',
          deviceCount,
        });
      } catch (error) {
        app.log.error('Error triggering device check-in digest:', error);
        return reply.status(500).send({
          message: 'Failed to trigger device check-in digest',
        });
      }
    }
  );

  // Device check-in digest — preview
  app.get(
    '/notifications/device-checkin/preview',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Notifications'],
        summary: 'Preview device check-in digest',
        description: 'Get devices registered today (or yesterday for testing) without sending notification',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            useYesterday: {
              type: 'boolean',
              default: false,
              description: 'If true, show yesterday\'s check-ins for testing',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              devices: { type: 'array', items: { type: 'object' } },
              count: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { useYesterday = false } = request.query as { useYesterday?: boolean };
        const devices = useYesterday ? await getYesterdaysCheckins() : await getTodaysCheckins();
        return reply.send({
          devices,
          count: devices.length,
        });
      } catch (error) {
        app.log.error('Error fetching check-in preview:', error);
        return reply.status(500).send({
          message: 'Failed to fetch check-in preview',
        });
      }
    }
  );

  // Device check-out digest — trigger
  app.post(
    '/notifications/device-checkout/trigger',
    {
      preHandler: [authenticate, authorize('manage', 'Device')],
      schema: {
        tags: ['Notifications'],
        summary: 'Manually trigger device check-out digest',
        description: 'Sends Slack notification for devices checked out today (or yesterday for testing)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            useYesterday: {
              type: 'boolean',
              default: false,
              description: 'If true, send notification for yesterday\'s check-outs for testing',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              deviceCount: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { useYesterday = false } = request.query as { useYesterday?: boolean };
        const targetDate = useYesterday ? new Date(new Date().getTime() - 86400000) : new Date(); // yesterday = today - 1 day
        const deviceCount = await sendDeviceCheckoutDigestForDate(targetDate);
        return reply.send({
          message: 'Device check-out digest triggered successfully',
          deviceCount,
        });
      } catch (error) {
        app.log.error('Error triggering device check-out digest:', error);
        return reply.status(500).send({
          message: 'Failed to trigger device check-out digest',
        });
      }
    }
  );

  // Device check-out digest — preview
  app.get(
    '/notifications/device-checkout/preview',
    {
      preHandler: [authenticate, authorize('read', 'Device')],
      schema: {
        tags: ['Notifications'],
        summary: 'Preview device check-out digest',
        description: 'Get devices checked out today (or yesterday for testing) without sending notification',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            useYesterday: {
              type: 'boolean',
              default: false,
              description: 'If true, show yesterday\'s check-outs for testing',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              devices: { type: 'array', items: { type: 'object' } },
              count: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { useYesterday = false } = request.query as { useYesterday?: boolean };
        const devices = useYesterday ? await getYesterdaysCheckouts() : await getTodaysCheckouts();
        return reply.send({
          devices,
          count: devices.length,
        });
      } catch (error) {
        app.log.error('Error fetching check-out preview:', error);
        return reply.status(500).send({
          message: 'Failed to fetch check-out preview',
        });
      }
    }
  );
}
