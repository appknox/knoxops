import { FastifyRequest, FastifyReply } from 'fastify';
import {
  detectConnectedDevice,
  verifyAuthorization,
  fetchIosDeviceInfo,
  fetchAndroidDeviceInfo,
} from './usb.service.js';

export async function detectHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const device = await detectConnectedDevice();
    return reply.send({ device });
  } catch (error: any) {
    const message = error.message || 'Failed to detect device. Check cable and try again.';
    const status = error.message?.includes('not found') ? 503 : 400;
    return reply.status(status).send({ success: false, message });
  }
}

export async function pairHandler(
  request: FastifyRequest<{
    Body: { platform: 'ios' | 'android'; id: string };
  }>,
  reply: FastifyReply
) {
  try {
    const { platform, id } = request.body;

    if (!platform || !id) {
      return reply.status(400).send({
        success: false,
        message: 'Missing platform or device ID',
      });
    }

    await verifyAuthorization(platform, id);
    return reply.send({ success: true });
  } catch (error: any) {
    const message = error.message || 'Failed to verify authorization';

    if (message.includes('timeout')) {
      return reply.status(408).send({ success: false, message: 'Device info fetch timed out. Try again.' });
    }

    if (message.includes('not found')) {
      return reply.status(503).send({ success: false, message });
    }

    // 400 for trust/auth issues
    return reply.status(400).send({ success: false, message });
  }
}

export async function fetchInfoHandler(
  request: FastifyRequest<{
    Body: { platform: 'ios' | 'android'; id: string };
  }>,
  reply: FastifyReply
) {
  try {
    const { platform, id } = request.body;

    if (!platform || !id) {
      return reply.status(400).send({
        success: false,
        message: 'Missing platform or device ID',
      });
    }

    let deviceInfo;
    if (platform === 'ios') {
      deviceInfo = await fetchIosDeviceInfo(id);
    } else if (platform === 'android') {
      deviceInfo = await fetchAndroidDeviceInfo(id);
    } else {
      return reply.status(400).send({
        success: false,
        message: 'Invalid platform',
      });
    }

    return reply.send(deviceInfo);
  } catch (error: any) {
    const message = error.message || 'Failed to fetch device information';

    if (message.includes('timeout')) {
      return reply.status(408).send({ success: false, message: 'Device info fetch timed out. Try again.' });
    }

    if (message.includes('not found')) {
      return reply.status(503).send({ success: false, message });
    }

    return reply.status(500).send({ success: false, message });
  }
}
