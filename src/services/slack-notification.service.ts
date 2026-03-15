import { IncomingWebhook } from '@slack/webhook';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';

interface PatchNotification {
  clientName: string;
  nextPatchDate: string;
  daysUntilPatch: number;
  currentVersion: string | null;
  environmentType: string;
}

/**
 * Send notification to Slack channel
 */
export async function sendSlackNotification(message: string, blocks?: any[]): Promise<void> {
  if (!SLACK_WEBHOOK_URL) {
    console.warn('Slack webhook URL not configured. Skipping notification.');
    return;
  }

  try {
    const webhook = new IncomingWebhook(SLACK_WEBHOOK_URL);
    await webhook.send({
      text: message,
      blocks: blocks || undefined,
    });
    console.log('Slack notification sent successfully');
  } catch (error) {
    console.error('Failed to send Slack notification:', error);
    throw error;
  }
}

/**
 * Send patch reminder notifications
 */
export async function sendPatchReminders(patches: PatchNotification[]): Promise<void> {
  if (patches.length === 0) return;

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🔔 Upcoming Patch Schedule Reminders',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${patches.length} client${patches.length > 1 ? 's' : ''} require${patches.length === 1 ? 's' : ''} patch updates in the next 10 days:*`,
      },
    },
    {
      type: 'divider',
    },
  ];

  patches.forEach((patch) => {
    const urgencyEmoji = patch.daysUntilPatch <= 3 ? '🔴' : patch.daysUntilPatch <= 7 ? '🟡' : '🟢';

    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Client:*\n${patch.clientName}`,
        },
        {
          type: 'mrkdwn',
          text: `*Environment:*\n${patch.environmentType}`,
        },
        {
          type: 'mrkdwn',
          text: `*Current Version:*\n${patch.currentVersion || 'N/A'}`,
        },
        {
          type: 'mrkdwn',
          text: `*Next Patch:*\n${urgencyEmoji} ${patch.nextPatchDate} _(${patch.daysUntilPatch} days)_`,
        },
      ],
    });
    blocks.push({
      type: 'divider',
    });
  });

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: '💡 *Legend:* 🔴 Critical (≤3 days) | 🟡 Soon (4-7 days) | 🟢 Upcoming (8-10 days)',
      },
    ],
  });

  await sendSlackNotification(
    `${patches.length} client(s) have upcoming patch updates`,
    blocks
  );
}

/**
 * Send individual patch reminder
 */
export async function sendSinglePatchReminder(patch: PatchNotification): Promise<void> {
  const urgencyEmoji = patch.daysUntilPatch <= 3 ? '🔴' : patch.daysUntilPatch <= 7 ? '🟡' : '🟢';

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${urgencyEmoji} Patch Reminder: ${patch.clientName}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Client:*\n${patch.clientName}`,
        },
        {
          type: 'mrkdwn',
          text: `*Environment:*\n${patch.environmentType}`,
        },
        {
          type: 'mrkdwn',
          text: `*Current Version:*\n${patch.currentVersion || 'N/A'}`,
        },
        {
          type: 'mrkdwn',
          text: `*Next Patch Date:*\n${patch.nextPatchDate}`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⏰ *${patch.daysUntilPatch} days remaining* until the scheduled patch update.`,
      },
    },
  ];

  await sendSlackNotification(
    `Patch reminder: ${patch.clientName} - ${patch.daysUntilPatch} days remaining`,
    blocks
  );
}
