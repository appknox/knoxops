import { gte, lt, eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { devices } from '../db/schema/index.js';
import { getDeviceWebhook } from './slack-notification.service.js';

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getDateRange(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function dateLabel(date?: Date) {
  const d = date || new Date();
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }); // "19 March 2026"
}

function getYesterdayDate() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday;
}

// ─── Check-in ────────────────────────────────────────────────────────────────

export interface CheckinDevice {
  name: string;
  model: string | null;
  purpose: string | null;
  metadata: Record<string, unknown> | null;
}

async function getCheckinsForDate(date: Date): Promise<CheckinDevice[]> {
  const { start, end } = getDateRange(date);
  return db
    .select({
      name: devices.name,
      model: devices.model,
      purpose: devices.purpose,
      metadata: devices.metadata,
    })
    .from(devices)
    .where(
      and(
        gte(devices.createdAt, start),
        lt(devices.createdAt, end),
        eq(devices.isDeleted, false)
      )
    )
    .orderBy(devices.createdAt);
}

export async function getTodaysCheckins(): Promise<CheckinDevice[]> {
  return getCheckinsForDate(new Date());
}

export async function getYesterdaysCheckins(): Promise<CheckinDevice[]> {
  return getCheckinsForDate(getYesterdayDate());
}

export async function sendDeviceCheckinDigestForDate(date: Date): Promise<number> {
  const list = await getCheckinsForDate(date);
  if (list.length === 0) return 0;

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${list.length} device${list.length === 1 ? '' : 's'} registered:*`,
      },
    },
    { type: 'divider' },
  ];

  for (const device of list) {
    const meta = device.metadata as any;
    const platform = meta?.platform ?? null;
    const osVersion = meta?.osVersion ?? null;
    const os = osVersion
      ? `${platform ?? ''} ${osVersion}`.trim()
      : platform ?? 'N/A';
    const detail = device.purpose ?? '—';

    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Device ID:*\n${device.name}` },
        { type: 'mrkdwn', text: `*Model:*\n${device.model ?? 'N/A'}` },
        { type: 'mrkdwn', text: `*OS:*\n${os}` },
        { type: 'mrkdwn', text: `*Detail:*\n${detail}` },
      ],
    });
    blocks.push({ type: 'divider' });
  }

  const webhook = getDeviceWebhook();
  await webhook?.send({
    text: `Device Check-in — ${dateLabel(date)}: ${list.length} device(s) registered`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📦 Device Check-in — ${dateLabel(date)}`,
          emoji: true,
        },
      },
      ...blocks,
    ],
  });

  return list.length;
}

export async function sendDeviceCheckinDigest(): Promise<number> {
  return sendDeviceCheckinDigestForDate(new Date());
}

// ─── Check-out ───────────────────────────────────────────────────────────────

export interface CheckoutDevice {
  name: string;
  model: string | null;
  status: string;
  assignedTo: string | null;
  purpose: string | null;
  metadata: Record<string, unknown> | null;
}

// Returns all currently checked-out devices (no date filter — reflects current state)
async function getAllCheckouts(): Promise<CheckoutDevice[]> {
  return db
    .select({
      name: devices.name,
      model: devices.model,
      status: devices.status,
      assignedTo: devices.assignedTo,
      purpose: devices.purpose,
      metadata: devices.metadata,
    })
    .from(devices)
    .where(
      and(
        inArray(devices.status, ['inactive', 'maintenance']),
        eq(devices.isDeleted, false)
      )
    )
    .orderBy(devices.name);
}

export async function getTodaysCheckouts(): Promise<CheckoutDevice[]> {
  return getAllCheckouts();
}

export async function getYesterdaysCheckouts(): Promise<CheckoutDevice[]> {
  return getAllCheckouts();
}

export async function sendDeviceCheckoutDigestForDate(date: Date): Promise<number> {
  const list = await getAllCheckouts();
  if (list.length === 0) return 0;

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${list.length} device${list.length === 1 ? '' : 's'} currently out of inventory:*`,
      },
    },
    { type: 'divider' },
  ];

  for (const device of list) {
    const meta = device.metadata as any;
    const platform = meta?.platform ?? null;
    const osVersion = meta?.osVersion ?? null;
    const os = osVersion
      ? `${platform ?? ''} ${osVersion}`.trim()
      : platform ?? 'N/A';
    const assignedTo = device.assignedTo ?? '—';
    const detail =
      device.status === 'maintenance'
        ? `Out for Repair${device.purpose ? ` - ${device.purpose}` : ''}`
        : device.purpose ?? '—';

    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Device ID:*\n${device.name}` },
        { type: 'mrkdwn', text: `*Model:*\n${device.model ?? 'N/A'}` },
        { type: 'mrkdwn', text: `*OS:*\n${os}` },
        { type: 'mrkdwn', text: `*Assigned To:*\n${assignedTo}` },
        { type: 'mrkdwn', text: `*Detail:*\n${detail}` },
      ],
    });
    blocks.push({ type: 'divider' });
  }

  const webhook = getDeviceWebhook();
  await webhook?.send({
    text: `Device Check-out — ${dateLabel(date)}: ${list.length} device(s) out of inventory`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📤 Device Check-out — ${dateLabel(date)}`,
          emoji: true,
        },
      },
      ...blocks,
    ],
  });

  return list.length;
}

export async function sendDeviceCheckoutDigest(): Promise<number> {
  return sendDeviceCheckoutDigestForDate(new Date());
}
