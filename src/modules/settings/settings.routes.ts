import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import * as settingsService from './settings.service.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/settings/app — Read all settings (admin only)
  app.get('/settings/app', { preHandler: [authenticate, authorize('read', 'Settings')] }, async (request, reply) => {
    const settings = settingsService.getAllSettings();
    return reply.send({ data: settings });
  });

  // PATCH /api/settings/app — Update multiple settings (admin only)
  app.patch('/settings/app', { preHandler: [authenticate, authorize('manage', 'Settings')] }, async (request, reply) => {
    const userId = request.user?.id;
    const body = request.body as Record<string, string>;

    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Invalid request body' });
    }

    try {
      await settingsService.updateSettings(body, userId);
      const updated = settingsService.getAllSettings();
      return reply.send({ data: updated, message: 'Settings updated successfully' });
    } catch (error) {
      console.error('[Settings API] Error updating settings:', error);
      return reply.status(500).send({ error: 'Failed to update settings' });
    }
  });

  // POST /api/settings/app/test-slack — Test Slack webhook (admin only)
  app.post(
    '/settings/app/test-slack',
    { preHandler: [authenticate, authorize('manage', 'Settings')] },
    async (request, reply) => {
      const query = request.query as { channel?: string };
      const channel = (query.channel || 'onprem') as 'onprem' | 'device';

      try {
        await settingsService.testSlackWebhook(channel);
        return reply.send({ message: `Test Slack notification sent to ${channel} channel` });
      } catch (error: any) {
        console.error('[Settings API] Error testing Slack webhook:', error);
        return reply.status(500).send({ error: `Failed to send test notification: ${error.message}` });
      }
    }
  );
}
