import { FastifyRequest, FastifyReply } from 'fastify';
import { listReleases, streamAsset, streamZipball } from '../../services/github.service.js';
import { shareReleaseWithClients, shareReleaseWithClient } from './releases.service.js';

export async function listReleasesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const data = await listReleases();
    reply.send({ data });
  } catch (error) {
    console.error('Failed to list releases:', error);
    reply.status(503).send({
      success: false,
      message: 'Releases not configured or GitHub API unavailable',
    });
  }
}

export async function downloadAssetHandler(
  request: FastifyRequest<{
    Params: { releaseId: string; assetId: string };
  }>,
  reply: FastifyReply
) {
  try {
    const { releaseId, assetId } = request.params;
    const { stream, contentType, filename } = await streamAsset(
      parseInt(releaseId),
      parseInt(assetId)
    );

    reply.type(contentType);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.send(stream);
  } catch (error) {
    console.error('Failed to download asset:', error);
    reply.status(500).send({
      success: false,
      message: 'Failed to download asset',
    });
  }
}

export async function downloadZipballHandler(
  request: FastifyRequest<{
    Params: { releaseId: string };
  }>,
  reply: FastifyReply
) {
  try {
    const { releaseId } = request.params;
    const { stream, filename } = await streamZipball(parseInt(releaseId));

    reply.type('application/zip');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.send(stream);
  } catch (error) {
    console.error('Failed to download zipball:', error);
    reply.status(500).send({
      success: false,
      message: 'Failed to download source archive',
    });
  }
}

export async function shareReleaseHandler(
  request: FastifyRequest<{
    Params: { releaseId: string };
    Body: {
      deploymentId: string;
      assetType: 'zipball' | 'asset';
      assetId?: number;
      assetName: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const { releaseId } = request.params;
    const { deploymentId, assetType, assetId, assetName } = request.body;

    const result = await shareReleaseWithClient(
      request.server,
      parseInt(releaseId),
      deploymentId,
      assetType,
      assetId,
      assetName
    );

    reply.send(result);
  } catch (error: any) {
    console.error('Failed to share release:', error);
    const status = error.message.includes('contact email') ? 400 : 500;
    reply.status(status).send({
      success: false,
      message: error.message || 'Failed to share release',
    });
  }
}

export async function downloadTokenHandler(
  request: FastifyRequest<{
    Querystring: { token: string };
  }>,
  reply: FastifyReply
) {
  try {
    const { token } = request.query;

    if (!token) {
      return reply.status(400).send({
        success: false,
        message: 'Download token required',
      });
    }

    // Verify and decode JWT
    const decoded: any = request.server.jwt.verify(token);
    const { releaseId, assetType, assetId } = decoded;

    if (assetType === 'zipball') {
      const { stream, filename } = await streamZipball(releaseId);
      reply.type('application/zip');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.send(stream);
    } else if (assetType === 'asset') {
      const { stream, contentType, filename } = await streamAsset(releaseId, assetId);
      reply.type(contentType);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.send(stream);
    } else {
      reply.status(400).send({
        success: false,
        message: 'Invalid asset type',
      });
    }
  } catch (error: any) {
    console.error('Failed to download with token:', error);

    if (error.name === 'JsonWebTokenError' || error.message.includes('expired')) {
      return reply.status(401).send({
        success: false,
        message: 'Download link has expired or is invalid',
      });
    }

    reply.status(500).send({
      success: false,
      message: 'Failed to download file',
    });
  }
}
