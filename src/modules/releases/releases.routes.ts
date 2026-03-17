import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { listReleasesHandler, downloadAssetHandler, downloadZipballHandler, shareReleaseHandler, downloadTokenHandler } from './releases.controller.js';

export async function releasesRoutes(app: FastifyInstance) {
  // Public download with token (NO auth) — must be FIRST to avoid conflict with /:releaseId
  app.get('/download', downloadTokenHandler);

  // List releases
  app.get(
    '/',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
    },
    listReleasesHandler
  );

  // Download release asset
  app.get(
    '/:releaseId/assets/:assetId/download',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
    },
    downloadAssetHandler
  );

  // Download source zipball
  app.get(
    '/:releaseId/zipball',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
    },
    downloadZipballHandler
  );

  // Share release with client (email with JWT token)
  app.post(
    '/:releaseId/share',
    {
      preHandler: [authenticate, authorize('read', 'OnPrem')],
    },
    shareReleaseHandler
  );
}
