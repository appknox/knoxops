import { IncomingWebhook } from '@slack/webhook';
import { env } from '../config/env.js';
import * as settingsService from '../modules/settings/settings.service.js';

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

export function getWebhook(): IncomingWebhook | null {
  // Read from settings with fallback to env
  const url = settingsService.getSetting(settingsService.SETTING_KEYS.SLACK_ONPREM_WEBHOOK_URL) ||
    env.SLACK_WEBHOOK_URL;

  if (!url) {
    console.warn('SLACK_WEBHOOK_URL not configured. Skipping Slack notification.');
    return null;
  }
  return new IncomingWebhook(url);
}

export function getDeviceWebhook(): IncomingWebhook | null {
  // Read from settings with fallback to env
  const url = settingsService.getSetting(settingsService.SETTING_KEYS.SLACK_DEVICE_WEBHOOK_URL) ||
    env.SLACK_DEVICE_WEBHOOK_URL;

  if (!url) {
    console.warn('SLACK_DEVICE_WEBHOOK_URL not configured. Skipping device Slack notification.');
    return null;
  }
  return new IncomingWebhook(url);
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
 * Send a notification to the device webhook
 */
export async function sendDeviceSlackNotification(
  message: string,
  blocks?: any[],
  category: SlackCategory = 'info'
): Promise<void> {
  const webhook = getDeviceWebhook();
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
    console.log(`Slack Device [${category}] notification sent`);
  } catch (error) {
    console.error('Failed to send device Slack notification:', error);
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

/**
 * Get sale webhook (for device sale announcements)
 */
export function getSaleWebhook(): IncomingWebhook | null {
  const url = settingsService.getSetting(settingsService.SETTING_KEYS.SLACK_SALE_WEBHOOK_URL);
  if (!url) {
    console.warn('SLACK_SALE_WEBHOOK_URL not configured. Skipping sale Slack notification.');
    return null;
  }
  return new IncomingWebhook(url);
}

interface ForSaleDevice {
  name: string;
  model: string | null;
  condition: string | null;
  conditionNotes: string | null;
  askingPrice: number | null;
}

/**
 * Send device sale announcement to Slack
 */
export async function sendSaleAnnouncement(
  devices: ForSaleDevice[],
  salePageUrl: string
): Promise<void> {
  if (devices.length === 0) return;

  const webhook = getSaleWebhook();
  if (!webhook) return;

  const frontendBase = salePageUrl.replace(/\/sale$/, '');
  const isLocalhost = frontendBase.includes('localhost') || frontendBase.includes('127.0.0.1');
  const imageUrl = `${frontendBase}/sale.png`;

  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🛍️ Appknox Device Sale',
        emoji: true,
      },
    },
    ...(isLocalhost ? [] : [{
      type: 'image',
      image_url: imageUrl,
      alt_text: 'Appknox Device Sale',
    }]),
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `We're selling off some devices. Grab yours before they're gone! *<${salePageUrl}|click here>* to view the devices.`,
      },
    },
  ];

  try {
    await webhook.send({
      text: `Appknox Device Sale — ${devices.length} device(s) available`,
      blocks,
    });
    console.log(`Slack sale announcement sent for ${devices.length} device(s)`);
  } catch (error) {
    console.error('Failed to send sale announcement:', error);
    throw error;
  }
}
