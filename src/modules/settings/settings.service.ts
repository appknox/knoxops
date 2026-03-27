import { db } from '../../db/index.js';
import { appSettings } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';

// Settings keys
export const SETTING_KEYS = {
  SLACK_ONPREM_WEBHOOK_URL: 'slack_onprem_webhook_url',
  SLACK_DEVICE_WEBHOOK_URL: 'slack_device_webhook_url',
  SLACK_SALE_WEBHOOK_URL: 'slack_sale_webhook_url',
  PATCH_REMINDER_DAYS_AHEAD: 'patch_reminder_days_ahead',
  PATCH_REMINDER_OVERDUE_DAYS: 'patch_reminder_overdue_days',
  NOTIFICATION_SCHEDULE_HOUR_UTC: 'notification_schedule_hour_utc',
  PATCH_REMINDERS_ENABLED: 'patch_reminders_enabled',
  DEVICE_CHECKIN_DIGEST_ENABLED: 'device_checkin_digest_enabled',
  DEVICE_CHECKOUT_DIGEST_ENABLED: 'device_checkout_digest_enabled',
  DEVICE_SALE_ENABLED: 'device_sale_enabled',
};

// In-memory cache
let settingsCache: Map<string, string> = new Map();

/**
 * Load all settings from database into memory cache
 */
export async function loadSettings(): Promise<void> {
  try {
    const rows = await db.select().from(appSettings);
    settingsCache.clear();
    rows.forEach((row) => {
      settingsCache.set(row.key, row.value);
    });
    console.log(`[Settings] Loaded ${rows.length} settings into cache`);
  } catch (error) {
    console.error('[Settings] Error loading settings:', error);
    throw error;
  }
}

/**
 * Get a single setting value (with env fallback for Slack URLs)
 */
export function getSetting(key: string): string | null {
  const cached = settingsCache.get(key);

  // Fallback to env vars for Slack URLs
  if (key === SETTING_KEYS.SLACK_ONPREM_WEBHOOK_URL && !cached) {
    return env.SLACK_WEBHOOK_URL || null;
  }
  if (key === SETTING_KEYS.SLACK_DEVICE_WEBHOOK_URL && !cached) {
    return env.SLACK_DEVICE_WEBHOOK_URL || null;
  }

  return cached || null;
}

/**
 * Get a setting as a number (with default fallback)
 */
export function getSettingNumber(key: string, defaultVal: number): number {
  const value = getSetting(key);
  if (!value) return defaultVal;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultVal : parsed;
}

/**
 * Get a setting as a boolean
 */
export function getSettingBool(key: string, defaultVal: boolean = true): boolean {
  const value = getSetting(key);
  if (!value) return defaultVal;
  return value.toLowerCase() === 'true';
}

/**
 * Get all settings (includes env fallbacks for Slack URLs so UI always sees effective values)
 */
export function getAllSettings(): Record<string, string> {
  const result: Record<string, string> = {};
  settingsCache.forEach((value, key) => {
    result[key] = value;
  });
  // Include env fallbacks for Slack URLs if not set in DB
  if (!result[SETTING_KEYS.SLACK_ONPREM_WEBHOOK_URL] && env.SLACK_WEBHOOK_URL) {
    result[SETTING_KEYS.SLACK_ONPREM_WEBHOOK_URL] = env.SLACK_WEBHOOK_URL;
  }
  if (!result[SETTING_KEYS.SLACK_DEVICE_WEBHOOK_URL] && env.SLACK_DEVICE_WEBHOOK_URL) {
    result[SETTING_KEYS.SLACK_DEVICE_WEBHOOK_URL] = env.SLACK_DEVICE_WEBHOOK_URL;
  }
  return result;
}

/**
 * Update a single setting
 */
export async function updateSetting(key: string, value: string, userId?: string): Promise<void> {
  try {
    await db.insert(appSettings).values({
      key,
      value,
      updatedBy: userId || null,
    }).onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value,
        updatedBy: userId || null,
        updatedAt: new Date(),
      },
    });

    // Invalidate cache
    settingsCache.set(key, value);
    console.log(`[Settings] Updated ${key} = ${value}`);
  } catch (error) {
    console.error(`[Settings] Error updating ${key}:`, error);
    throw error;
  }
}

/**
 * Update multiple settings at once
 */
export async function updateSettings(updates: Record<string, string>, userId?: string): Promise<void> {
  try {
    for (const [key, value] of Object.entries(updates)) {
      await updateSetting(key, value, userId);
    }
    console.log(`[Settings] Updated ${Object.keys(updates).length} settings`);
  } catch (error) {
    console.error('[Settings] Error updating multiple settings:', error);
    throw error;
  }
}

/**
 * Seed default settings on startup (only if not already set)
 */
export async function seedDefaultSettings(): Promise<void> {
  try {
    const defaults: Record<string, string> = {
      [SETTING_KEYS.PATCH_REMINDER_DAYS_AHEAD]: '10',
      [SETTING_KEYS.PATCH_REMINDER_OVERDUE_DAYS]: '30',
      [SETTING_KEYS.NOTIFICATION_SCHEDULE_HOUR_UTC]: '23',
      [SETTING_KEYS.PATCH_REMINDERS_ENABLED]: 'true',
      [SETTING_KEYS.DEVICE_CHECKIN_DIGEST_ENABLED]: 'true',
      [SETTING_KEYS.DEVICE_CHECKOUT_DIGEST_ENABLED]: 'true',
      [SETTING_KEYS.DEVICE_SALE_ENABLED]: 'false',
      [SETTING_KEYS.SLACK_SALE_WEBHOOK_URL]: '',
    };

    // Seed each default (ignore conflicts — settings already exist)
    for (const [key, value] of Object.entries(defaults)) {
      try {
        await db.insert(appSettings).values({ key, value });
        console.log(`[Settings] Seeded ${key} = ${value}`);
      } catch (error: any) {
        // Ignore unique constraint violations
        if (error.code !== '23505') {
          throw error;
        }
      }
    }

    // Load into cache after seeding
    await loadSettings();
  } catch (error) {
    console.error('[Settings] Error seeding defaults:', error);
    throw error;
  }
}

/**
 * Test Slack webhook URL
 */
export async function testSlackWebhook(channel: 'onprem' | 'device' | 'sale'): Promise<void> {
  const { sendSlackNotification, sendDeviceSlackNotification, sendSaleAnnouncement } = await import('../../services/slack-notification.service.js');

  const testMessage = `✅ Test notification from KnoxAdmin (${new Date().toISOString()})`;

  if (channel === 'onprem') {
    await sendSlackNotification(testMessage);
  } else if (channel === 'device') {
    await sendDeviceSlackNotification(testMessage);
  } else if (channel === 'sale') {
    // For sale channel, send a test device sale announcement
    const testDevices = [{
      name: 'Test Device',
      model: 'Test Model',
      condition: 'Excellent',
      conditionNotes: 'This is a test notification',
      askingPrice: 10000,
    }];
    await sendSaleAnnouncement(testDevices, 'https://example.com/sale');
  }
}
