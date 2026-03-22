import Fastify from 'fastify';
import { env } from './config/env.js';
import { loggerConfig } from './lib/logger.js';
import { registerCors } from './plugins/cors.js';
import { registerSwagger } from './plugins/swagger.js';
import { registerAuth } from './plugins/auth.js';
import { registerMultipart } from './plugins/multipart.js';
import { errorHandler } from './middleware/errorHandler.js';

// Routes
import { authRoutes } from './modules/auth/auth.routes.js';
import { inviteRoutes } from './modules/invites/invites.routes.js';
import { userRoutes } from './modules/users/users.routes.js';
import { deviceRoutes } from './modules/devices/devices.routes.js';
import { usbRoutes } from './modules/devices/usb/usb.routes.js';
import { deviceRequestRoutes } from './modules/device-requests/device-requests.routes.js';
import { onpremRoutes } from './modules/onprem/onprem.routes.js';
import { onpremLicenseRequestsRoutes } from './modules/onprem-license-requests/onprem-license-requests.routes.js';
import { notificationsRoutes } from './modules/notifications/notifications.routes.js';
import { auditLogRoutes } from './modules/audit-logs/audit-logs.routes.js';
import { releasesRoutes } from './modules/releases/releases.routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: loggerConfig,
    bodyLimit: 50 * 1024 * 1024, // 50MB — needed for license file uploads
  });

  // Register plugins
  await registerCors(app);
  await registerSwagger(app);
  await registerAuth(app);
  await registerMultipart(app);

  // Error handler
  app.setErrorHandler(errorHandler);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // API info
  app.get('/api', async () => {
    return {
      name: 'KnoxAdmin API',
      version: '1.0.0',
      docs: `${env.APP_URL}/docs`,
    };
  });

  // Register API routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(inviteRoutes, { prefix: '/api/invites' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(deviceRoutes, { prefix: '/api/devices' });
  await app.register(usbRoutes, { prefix: '/api/devices/usb' });
  await app.register(deviceRequestRoutes, { prefix: '/api/device-requests' });
  await app.register(onpremRoutes, { prefix: '/api/onprem' });
  await app.register(onpremLicenseRequestsRoutes, { prefix: '/api/onprem' });
  await app.register(auditLogRoutes, { prefix: '/api/audit-logs' });
  await app.register(notificationsRoutes, { prefix: '/api' });
  await app.register(releasesRoutes, { prefix: '/api/releases' });

  return app;
}
