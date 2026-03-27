import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { devices } from '../../db/schema/index.js';
import { getSettingBool, SETTING_KEYS } from '../settings/settings.service.js';

export async function publicRoutes(app: FastifyInstance) {
  // Get all devices for sale (public endpoint - no auth required)
  app.get(
    '/devices/for-sale',
    {
      schema: {
        tags: ['Public'],
        summary: 'Get all devices currently for sale',
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
                    condition: { type: 'string', nullable: true },
                    conditionNotes: { type: 'string', nullable: true },
                    askingPrice: { type: 'number', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const saleEnabled = getSettingBool(SETTING_KEYS.DEVICE_SALE_ENABLED, false);
      if (!saleEnabled) {
        return reply.send({ enabled: false, data: [] });
      }

      try {
        const forSaleDevices = await db
          .select({
            id: devices.id,
            name: devices.name,
            model: devices.model,
            platform: devices.metadata,
            condition: devices.condition,
            conditionNotes: devices.conditionNotes,
            askingPrice: devices.askingPrice,
          })
          .from(devices)
          .where(and(eq(devices.status, 'for_sale'), eq(devices.isDeleted, false)));

        // Extract platform from metadata
        const formattedDevices = forSaleDevices.map((device) => ({
          id: device.id,
          name: device.name,
          model: device.model,
          platform: (device.platform as Record<string, unknown>)?.platform as string || null,
          condition: device.condition,
          conditionNotes: device.conditionNotes,
          askingPrice: device.askingPrice ? Number(device.askingPrice) : null,
        }));

        return reply.send({
          enabled: true,
          data: formattedDevices,
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({
          error: 'Failed to fetch devices for sale',
        });
      }
    }
  );
}
