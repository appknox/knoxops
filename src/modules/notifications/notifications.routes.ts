import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { checkAndNotifyUpcomingPatches, getUpcomingPatches } from '../../services/patch-reminder.service.js';

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
}
