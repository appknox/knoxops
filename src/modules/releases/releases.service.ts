import { db } from '../../db/index.js';
import { onpremDeployments } from '../../db/schema/index.js';
import { eq, inArray } from 'drizzle-orm';
import { listReleases } from '../../services/github.service.js';
import { sendSlackNotification } from '../../services/slack-notification.service.js';
import { sendReleaseEmail } from '../../services/email.service.js';
import { env } from '../../config/env.js';

export interface ShareReleaseResult {
  sharedCount: number;
}

/**
 * Share a release with selected clients via Slack notification
 */
export async function shareReleaseWithClients(
  releaseId: number,
  clientIds: string[]
): Promise<ShareReleaseResult> {
  try {
    // Get the release details
    const releases = await listReleases();
    const release = releases.find((r) => r.id === releaseId);

    if (!release) {
      throw new Error(`Release ${releaseId} not found`);
    }

    // Get the clients with their CSM info and Slack channel details
    const clients = await db
      .select({
        id: onpremDeployments.id,
        clientName: onpremDeployments.clientName,
        environmentType: onpremDeployments.environmentType,
      })
      .from(onpremDeployments)
      .where(inArray(onpremDeployments.id, clientIds));

    if (clients.length === 0) {
      throw new Error('No clients found');
    }

    // Format release details for Slack
    const releaseDate = new Date(release.publishedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    const assetsList = release.assets
      .map((asset) => `• ${asset.name}`)
      .join('\n');

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📦 New Release Available',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${release.name}* (${release.tagName})\n_Released on ${releaseDate}_`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Release Notes*\n```\n' + (release.body || 'No release notes') + '\n```',
        },
      },
    ];

    if (assetsList) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Available Downloads*\n' + assetsList,
        },
      });
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${release.prerelease ? '⚠️ Pre-release' : '✅ Stable Release'} • ${release.assets.length} file(s) available`,
        },
      ],
    });

    // Send notifications to each client
    let sharedCount = 0;
    for (const client of clients) {
      try {
        await sendSlackNotification(
          `New release ${release.tagName} available for ${client.clientName}`,
          blocks
        );
        sharedCount++;
      } catch (error) {
        console.error(`Failed to share release with client ${client.clientName}:`, error);
        // Continue with next client even if one fails
      }
    }

    return { sharedCount };
  } catch (error) {
    console.error('Failed to share release with clients:', error);
    throw error;
  }
}

/**
 * Share a release with a single client via email with JWT-signed download token
 */
export async function shareReleaseWithClient(
  app: any,
  releaseId: number,
  deploymentId: string,
  assetType: 'zipball' | 'asset',
  assetId?: number,
  assetName?: string
): Promise<{ message: string }> {
  try {
    // Get the release details
    const releases = await listReleases();
    const release = releases.find((r) => r.id === releaseId);

    if (!release) {
      throw new Error(`Release ${releaseId} not found`);
    }

    // Get the client details
    const client = await db
      .select({
        id: onpremDeployments.id,
        clientName: onpremDeployments.clientName,
        contactEmail: onpremDeployments.contactEmail,
      })
      .from(onpremDeployments)
      .where(eq(onpremDeployments.id, deploymentId))
      .limit(1);

    if (!client || client.length === 0) {
      throw new Error('Client not found');
    }

    const deployment = client[0];

    if (!deployment.contactEmail) {
      throw new Error('Client has no contact email registered');
    }

    // Sign JWT token for 7 days
    const token = app.jwt.sign(
      {
        releaseId,
        assetType,
        assetId: assetId || null,
        assetName: assetName || null,
      },
      { expiresIn: '7d' }
    );

    // Build download URL
    const downloadUrl = `${env.APP_URL}/api/releases/download?token=${token}`;

    // Send email
    await sendReleaseEmail({
      toEmail: deployment.contactEmail,
      clientName: deployment.clientName,
      tagName: release.tagName,
      releaseName: release.name,
      releaseBody: release.body,
      assetName: assetName || (assetType === 'zipball' ? 'Source Code' : 'Release Asset'),
      downloadUrl,
    });

    return { message: `Email sent to ${deployment.contactEmail}` };
  } catch (error) {
    console.error('Failed to share release with client:', error);
    throw error;
  }
}
