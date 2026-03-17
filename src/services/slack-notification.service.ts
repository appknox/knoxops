import { IncomingWebhook } from '@slack/webhook';
import { env } from '../config/env.js';

export type SlackCategory = 'patch' | 'info' | 'warning' | 'error';

interface PatchNotification {
  clientName: string;
  nextPatchDate: string;
  daysUntilPatch: number;
  currentVersion: string | null;
  environmentType: string;
  csmName?: string | null;
}

const CATEGORY_HEADER: Record<SlackCategory, string> = {
  patch: '🔔 Patch Reminder',
  info: 'ℹ️ Info',
  warning: '⚠️ Warning',
  error: '🚨 Error',
};

function getWebhook(): IncomingWebhook | null {
  if (!env.SLACK_WEBHOOK_URL) {
    console.warn('SLACK_WEBHOOK_URL not configured. Skipping Slack notification.');
    return null;
  }
  return new IncomingWebhook(env.SLACK_WEBHOOK_URL);
}

/**
 * Core send function — all notification types funnel through here.
 * `category` controls the header label; `blocks` controls the body.
 */
export async function sendSlackNotification(
  message: string,
  blocks?: any[],
  category: SlackCategory = 'info'
): Promise<void> {
  const webhook = getWebhook();
  if (!webhook) return;

  const headerBlocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: CATEGORY_HEADER[category],
        emoji: true,
      },
    },
  ];

  try {
    await webhook.send({
      text: message,
      blocks: blocks ? [...headerBlocks, ...blocks] : undefined,
    });
    console.log(`Slack [${category}] notification sent`);
  } catch (error) {
    console.error('Failed to send Slack notification:', error);
    throw error;
  }
}

/**
 * Send a grouped digest for multiple upcoming or overdue patches
 */
export async function sendPatchReminders(
  patches: PatchNotification[],
  type: 'overdue' | 'upcoming' = 'upcoming'
): Promise<void> {
  if (patches.length === 0) return;

  const isOverdue = type === 'overdue';
  const headerText = isOverdue
    ? `*⚠️ ${patches.length} client${patches.length > 1 ? 's' : ''} have OVERDUE patch update${patches.length === 1 ? 's' : ''}:*`
    : `*${patches.length} client${patches.length > 1 ? 's' : ''} require${patches.length === 1 ? 's' : ''} patch updates in the next 10 days:*`;

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: headerText,
      },
    },
    { type: 'divider' },
  ];

  patches.forEach((patch) => {
    const urgencyEmoji = isOverdue
      ? '🔴' // Always red for overdue
      : patch.daysUntilPatch <= 3
        ? '🔴'
        : patch.daysUntilPatch <= 7
          ? '🟡'
          : '🟢';

    const fields: any[] = [
      { type: 'mrkdwn', text: `*Client:*\n${patch.clientName}` },
      { type: 'mrkdwn', text: `*Environment:*\n${patch.environmentType}` },
      { type: 'mrkdwn', text: `*Current Version:*\n${patch.currentVersion || 'N/A'}` },
      {
        type: 'mrkdwn',
        text: `*${isOverdue ? 'Overdue Since' : 'Next Patch'}:*\n${urgencyEmoji} ${patch.nextPatchDate} _(${Math.abs(patch.daysUntilPatch)} day${Math.abs(patch.daysUntilPatch) === 1 ? '' : 's'}${isOverdue ? ' ago' : ''})_`,
      },
    ];

    // Add CSM if available
    if (patch.csmName) {
      fields.push({ type: 'mrkdwn', text: `*CSM:*\n${patch.csmName}` });
    }

    blocks.push({
      type: 'section',
      fields,
    });
    blocks.push({ type: 'divider' });
  });

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: isOverdue
          ? '🚨 *Alert:* These patches are overdue and require immediate attention.'
          : '💡 *Legend:* 🔴 Critical (≤3 days) | 🟡 Soon (4–7 days) | 🟢 Upcoming (8–10 days)',
      },
    ],
  });

  await sendSlackNotification(
    isOverdue
      ? `${patches.length} client(s) have overdue patch updates`
      : `${patches.length} client(s) have upcoming patch updates`,
    blocks,
    'patch'
  );
}
