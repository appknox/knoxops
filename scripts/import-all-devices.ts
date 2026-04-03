/**
 * Import all devices (Android + iOS) from xlsx files.
 *
 * Usage (from knoxadmin dir):
 *   npx tsx scripts/import-all-devices.ts
 *
 * Requires DATABASE_URL and ADMIN_USER_ID env vars.
 * TRUNCATES the devices table (CASCADE) before importing.
 */

import 'dotenv/config';
import XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { randomUUID as uuidv4 } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!process.env.ADMIN_USER_ID) throw new Error('ADMIN_USER_ID is required');

const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function resolveStatus(
  purposeStatus: string,
  inventoryStatus: string,
  extra?: Record<string, string>
): string {
  const ps = purposeStatus.trim().toLowerCase();

  // Purpose/Status column overrides
  if (ps === 'sold') return 'sold';
  if (ps === 'for sale') return 'for_sale';
  if (ps === 'out for repair') return 'maintenance';
  if (ps === 'dead' || ps === 'outdated') return 'decommissioned';
  if (ps === 'testing') return 'in_inventory';
  if (ps === 'unknown') return 'not_verified';

  // Inventory Status column
  const inv = inventoryStatus.trim().toLowerCase();
  if (inv === 'in inventory box') return 'in_inventory';
  if (inv === 'not verified') return 'not_verified';
  if (inv === 'checked out of inventory') return 'checked_out';
  if (inv === 'checked out for repair') return 'maintenance';
  if (inv === 'removed from inventory') return 'decommissioned';
  if (inv === 'to be sold') return 'for_sale';
  if (inv === 'security team') return 'in_inventory';

  return extra?.defaultStatus ?? 'in_inventory';
}

function resolvePurpose(purposeStatus: string): string | null {
  const ps = purposeStatus.trim().toLowerCase();

  // These are status overrides — no purpose stored
  const statusOverrides = new Set([
    'sold', 'for sale', 'out for repair', 'dead', 'outdated', 'testing', 'unknown',
  ]);
  if (statusOverrides.has(ps)) return null;

  const map: Record<string, string> = {
    available: 'available',
    'cs team': 'csTeam',
    'engineering team': 'Engineering',
    'not usable': 'notUsable',
    onpremise: 'onPrem',
    partner: 'partner',
    production: 'Production',
    reserved: 'reserved',
    'security team': 'Security',
    staging: 'staging',
    'to be repaired': 'toBeRepaired',
  };

  return map[ps] ?? null;
}

function resolveCpuArch(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (v === '32 bit') return 'ARM';
  if (v === '64 bit') return 'ARM64';
  return null;
}

function normaliseColour(raw: string): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    black: 'Black',
    'black (charcoal)': 'Black',
    'black+white': 'Black',
    charcoal: 'Black',
    white: 'White',
    'white (chalk)': 'White',
    silver: 'Silver',
    sliver: 'Silver', // typo in sheet
    grey: 'Silver',
    gray: 'Silver',
    gold: 'Gold',
    'rose gold': 'Rose Gold',
    rose: 'Pink',
    pink: 'Pink',
    'purple-ish': 'Purple',
    purple: 'Purple',
    red: 'Red',
    coral: 'Red',
    orange: 'Red',
    blue: 'Blue',
    'light blue': 'Blue',
    'sky blue': 'Blue',
    'blue+black': 'Blue',
    green: 'Green',
    'green (sage)': 'Green',
    sage: 'Green',
    yellow: 'Yellow',
    'space gray': 'Space Gray',
    'space grey': 'Space Gray',
    spacegray: 'Space Gray',
  };
  return map[v] ?? null;
}

function parseImei(raw: string | number): { imei1: string | null; imei2: string | null } {
  if (!raw) return { imei1: null, imei2: null };
  const str = String(raw).trim();

  if (str.includes('Slot 1') || str.includes('Slot 2')) {
    const slot1 = str.match(/(\d[\d\s]+)\s*\(Slot 1\)/);
    const slot2 = str.match(/(\d[\d\s]+)\s*\(Slot 2\)/);
    return {
      imei1: slot1 ? slot1[1].replace(/\D/g, '') || null : null,
      imei2: slot2 ? slot2[1].replace(/\D/g, '') || null : null,
    };
  }

  if (str.includes(',') || str.includes('|')) {
    const parts = str.split(/[,|]/).map((p) => p.replace(/\D/g, '').trim());
    return { imei1: parts[0] || null, imei2: parts[1] || null };
  }

  const imei = str.replace(/\D/g, '');
  return { imei1: imei || null, imei2: null };
}

function excelDateToDate(serial: number): Date {
  return new Date((serial - 25569) * 86400 * 1000);
}

/**
 * Parse history entries from Android format: [DD Mon YYYY] text
 */
function parseAndroidHistory(raw: string): Array<{ date: Date; text: string }> {
  if (!raw || raw.trim() === '?' || raw.trim() === '') return [];
  const entries: Array<{ date: Date; text: string }> = [];
  const regex = /\[(\d{1,2}\s+\w+\s+\d{4})\]\s*(.*?)(?=\[|$)/gs;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const text = match[2].trim();
    if (!text) continue;
    const d = new Date(match[1].trim());
    if (isNaN(d.getTime())) continue;
    entries.push({ date: d, text });
  }
  return entries;
}

/**
 * Parse history entries from iOS format:
 *   [DD Mon YYYY - DD Mon YYYY] text   → start date, text
 *   [DD Mon YYYY] text                 → date, text
 * Entries with no text are skipped.
 */
function parseIosHistory(raw: string): Array<{ date: Date; text: string }> {
  if (!raw || raw.trim() === '?' || raw.trim() === '') return [];
  const entries: Array<{ date: Date; text: string }> = [];
  // Match opening date (possibly followed by " - end_date") then text
  const regex = /\[(\d{1,2}\s+\w+\s+\d{4})(?:\s*-[^\]]*)?]\s*(.*?)(?=\[|$)/gs;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const text = match[2].trim();
    if (!text) continue;
    const d = new Date(match[1].trim());
    if (isNaN(d.getTime())) continue;
    entries.push({ date: d, text });
  }
  return entries;
}

async function insertDevice(params: {
  label: string;
  serial: string | null;
  type: string;
  status: string;
  manufacturer: string;
  model: string | null;
  purpose: string | null;
  assignedTo: string | null;
  description: string | null;
  metadata: Record<string, string>;
  createdAt: Date;
}): Promise<string> {
  const deviceId = uuidv4();
  const { label, serial, type, status, manufacturer, model, purpose, assignedTo, description, metadata, createdAt } = params;

  await db.execute(sql`
    INSERT INTO devices (
      id, name, serial_number, type, status, manufacturer, model,
      purpose, assigned_to, description, metadata,
      registered_by, last_updated_by, created_at, updated_at, is_deleted
    ) VALUES (
      ${deviceId}, ${label}, ${serial},
      ${type}::"device_type", ${status}::"device_status",
      ${manufacturer}, ${model},
      ${purpose}, ${assignedTo}, ${description},
      ${Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null},
      ${ADMIN_USER_ID}, ${ADMIN_USER_ID},
      ${createdAt.toISOString()}, ${createdAt.toISOString()},
      false
    )
  `);
  return deviceId;
}

async function insertComments(
  deviceId: string,
  entries: Array<{ date: Date; text: string }>
): Promise<number> {
  let count = 0;
  for (const entry of entries) {
    await db.execute(sql`
      INSERT INTO entity_comments (
        id, entity_type, entity_id, text,
        created_by, updated_by, created_at, updated_at, is_deleted
      ) VALUES (
        ${uuidv4()}, 'device'::"comment_entity_type", ${deviceId}, ${entry.text},
        ${ADMIN_USER_ID}, ${ADMIN_USER_ID},
        ${entry.date.toISOString()}, ${entry.date.toISOString()},
        false
      )
    `);
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Android import
// ---------------------------------------------------------------------------
async function importAndroid(): Promise<{ devices: number; comments: number; errors: string[] }> {
  const xlsxPath = resolve(__dirname, '..', 'android-devices.xlsx');
  console.log('\n── Android ──────────────────────────────');
  console.log('Reading:', xlsxPath);

  const wb = XLSX.readFile(xlsxPath);
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const rows = raw.slice(1); // skip title row
  console.log(`Found ${rows.length} rows`);

  let deviceCount = 0;
  let commentCount = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const label = String(row['Label'] || '').trim();
    if (!label) continue;

    const serialRaw = String(row['Serial Number/UDID'] || row['Serial number'] || '').trim();
    const serial = serialRaw || null;
    const type = String(row['Type'] || '').trim().toLowerCase() === 'tablet' ? 'tablet' : 'mobile';
    const purposeStatus = String(row['Purpose / Status'] || '').trim();
    const inventoryStatus = String(row['Inventory Status'] || '').trim();
    const platformRaw = String(row['Platform'] || '').trim();
    const colour = normaliseColour(String(row['Colour'] || '').trim());
    const rom = String(row['ROM'] || '').trim() || null;
    const mac = String(row['MAC'] || '').trim() || null;
    const simNumber = String(row['SIM number'] || '').trim() || null;
    const ownership = String(row['Ownership'] || '').trim() || null;
    const comments = String(row['Comments'] || '').trim() || null;
    const historyRaw = String(row['History'] || '').trim();
    const verifiedOn = row['Verified On'];
    const cpuArchRaw = String(row['CPU Arch'] || '').trim();

    const status = resolveStatus(purposeStatus, inventoryStatus);
    const purpose = resolvePurpose(purposeStatus);
    const cpuArch = resolveCpuArch(cpuArchRaw);
    const { imei1, imei2 } = parseImei(row['IMEI']);
    const osVersion = platformRaw.match(/\d[\d.]+/)?.[0] ?? null;

    let createdAt: Date;
    if (typeof verifiedOn === 'number' && verifiedOn > 0) {
      createdAt = excelDateToDate(verifiedOn);
    } else {
      createdAt = new Date();
    }

    const metadata: Record<string, string> = {};
    if (cpuArch) metadata.cpuArch = cpuArch;
    if (osVersion) metadata.osVersion = osVersion;
    if (platformRaw) metadata.platform = 'Android';
    if (colour) metadata.colour = colour;
    if (imei1) metadata.imei = imei1;
    if (imei2) metadata.imei2 = imei2;
    if (mac) metadata.macAddress = mac;
    if (simNumber) metadata.simNumber = simNumber;
    if (rom) metadata.rom = rom;

    try {
      const deviceId = await insertDevice({
        label, serial, type, status, manufacturer: 'Motorola',
        model: String(row['Model'] || '').trim() || null,
        purpose, assignedTo: ownership, description: comments,
        metadata, createdAt,
      });
      deviceCount++;

      const historyEntries = parseAndroidHistory(historyRaw);
      commentCount += await insertComments(deviceId, historyEntries);
      console.log(`  ✓ ${label} (${status}${purpose ? ' / ' + purpose : ''}) — ${historyEntries.length} history`);
    } catch (err: any) {
      errors.push(`${label}: ${err.message}`);
      console.error(`  ✗ ${label}: ${err.message}`);
    }
  }

  return { devices: deviceCount, comments: commentCount, errors };
}

// ---------------------------------------------------------------------------
// iOS import
// ---------------------------------------------------------------------------
async function importIos(): Promise<{ devices: number; comments: number; errors: string[] }> {
  const xlsxPath = resolve(__dirname, '..', 'ios-devices.xlsx');
  console.log('\n── iOS ──────────────────────────────────');
  console.log('Reading:', xlsxPath);

  const wb = XLSX.readFile(xlsxPath);
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  // Skip title row; de-duplicate by label keeping last occurrence
  const allRows = raw.slice(1);
  const labelMap = new Map<string, Record<string, any>>();
  for (const row of allRows) {
    const label = String(row['Label'] || '').trim();
    if (label) labelMap.set(label, row);
  }
  const rows = [...labelMap.values()];
  const dupeCount = allRows.length - rows.length;
  console.log(`Found ${allRows.length} rows${dupeCount > 0 ? ` (${dupeCount} duplicate label(s) removed, keeping last)` : ''}`);

  let deviceCount = 0;
  let commentCount = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const label = String(row['Label'] || '').trim();
    if (!label) continue;

    const udid = String(row['UDID'] || '').trim() || null;
    const serial = String(row['Serial number'] || '').trim() || null;
    const type = String(row['Type'] || '').trim().toLowerCase() === 'tablet' ? 'tablet' : 'mobile';
    const purposeStatus = String(row['Purpose / Status'] || '').trim();
    const inventoryStatus = String(row['Inventory Status'] || '').trim();
    const osRaw = String(row['OS'] || '').trim();
    const colour = normaliseColour(String(row['Colour'] || '').trim());
    const rom = String(row['ROM'] || '').trim() || null;
    const mac = String(row['MAC'] || '').trim() || null;
    const simNumber = String(row['SIM number'] || '').trim() || null;
    const ownership = String(row['Ownership'] || '').trim() || null;
    const comments = String(row['Comments'] || '').trim() || null;
    const historyRaw = String(row['History'] || '').trim();
    const cpuArchRaw = String(row['CPU Arch'] || '').trim();

    // Extract model name and model number (e.g. "iPhone 6 A1586" → model="iPhone 6", modelNumber="A1586")
    const modelRaw = String(row['Model'] || '').trim();
    const modelNumberMatch = modelRaw.match(/\b([A-Z]\d{4})\b/);
    const modelNumber = modelNumberMatch ? modelNumberMatch[1] : null;
    const model = modelRaw.replace(/\b[A-Z]\d{4}\b/, '').trim() || null;

    // Extract OS version from "iOS 12.4.8" → "12.4.8"
    const osVersion = osRaw.match(/\d[\d.]+/)?.[0] ?? null;

    const status = resolveStatus(purposeStatus, inventoryStatus);
    const purpose = resolvePurpose(purposeStatus);
    const cpuArch = resolveCpuArch(cpuArchRaw);
    const { imei1, imei2 } = parseImei(row['IMEI']);

    // No Verified On field in iOS sheet — use current date
    const createdAt = new Date();

    const metadata: Record<string, string> = {};
    if (cpuArch) metadata.cpuArch = cpuArch;
    if (osVersion) metadata.osVersion = osVersion;
    metadata.platform = 'iOS';
    if (colour) metadata.colour = colour;
    if (udid) metadata.udid = udid;
    if (modelNumber) metadata.modelNumber = modelNumber;
    if (imei1) metadata.imei = imei1;
    if (imei2) metadata.imei2 = imei2;
    if (mac) metadata.macAddress = mac;
    if (simNumber) metadata.simNumber = simNumber;
    if (rom) metadata.rom = rom;

    try {
      const deviceId = await insertDevice({
        label, serial, type, status, manufacturer: 'Apple',
        model, purpose, assignedTo: ownership, description: comments,
        metadata, createdAt,
      });
      deviceCount++;

      const historyEntries = parseIosHistory(historyRaw);
      commentCount += await insertComments(deviceId, historyEntries);
      console.log(`  ✓ ${label} (${status}${purpose ? ' / ' + purpose : ''}) — ${historyEntries.length} history`);
    } catch (err: any) {
      errors.push(`${label}: ${err.message}`);
      console.error(`  ✗ ${label}: ${err.message}`);
    }
  }

  return { devices: deviceCount, comments: commentCount, errors };
}

// ---------------------------------------------------------------------------
// Cambrionix / Anker import
// ---------------------------------------------------------------------------
async function importCambrionix(): Promise<{ devices: number; comments: number; errors: string[] }> {
  const xlsxPath = resolve(__dirname, '..', 'cambinoix-devices.xlsx');
  console.log('\n── Cambrionix/Anker ─────────────────────');
  console.log('Reading:', xlsxPath);

  const wb = XLSX.readFile(xlsxPath);
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const rows = raw.slice(1); // skip title row
  console.log(`Found ${rows.length} rows`);

  // Group rows by base label (strip " P1" / " P2" / " P3" etc.)
  const groups = new Map<string, Record<string, any>[]>();
  for (const row of rows) {
    const label = String(row['Label'] || '').trim();
    if (!label) continue;
    const base = label.replace(/\s+P\d+$/i, '').trim();
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push(row);
  }
  console.log(`Grouped into ${groups.size} device(s)`);

  let deviceCount = 0;
  let commentCount = 0;
  const errors: string[] = [];

  for (const [base, parts] of groups) {
    // Identify sub-rows by Type
    const p1 = parts.find((r) => {
      const t = String(r['Type'] || '').trim().toLowerCase();
      return t === 'hub' || t === 'desktop charger' || t === '';
    }) ?? parts[0];

    const adapterRow = parts.find((r) =>
      String(r['Type'] || '').trim().toLowerCase().includes('adapter')
    );
    const powerCordRow = parts.find((r) =>
      String(r['Type'] || '').trim().toLowerCase().includes('power cord')
    );

    const serial = String(p1['Serial Number/UDID'] || '').trim() || null;
    const platform = String(p1['Platform'] || '').trim() || 'Cambrionix';
    const model = String(p1['Model'] || '').trim() || null;
    const modelNumber = String(p1['Model No'] || '').trim() || null;
    const colour = normaliseColour(String(p1['Colour'] || '').trim());
    const ownerRaw = String(p1['Owner'] || '').trim().replace(/\?/g, '').trim();
    const assignedTo = ownerRaw || null;
    const description = String(p1['__EMPTY_19'] || '').trim() || null;
    const verifiedOn = p1['Verified on'];

    let createdAt: Date;
    if (typeof verifiedOn === 'number' && verifiedOn > 0) {
      createdAt = excelDateToDate(verifiedOn);
    } else {
      createdAt = new Date();
    }

    const metadata: Record<string, string> = {};
    metadata.platform = platform;
    if (modelNumber) metadata.modelNumber = modelNumber;
    if (colour) metadata.colour = colour;
    if (adapterRow) {
      const s = String(adapterRow['Serial Number/UDID'] || '').trim();
      const m = String(adapterRow['Model No'] || '').trim();
      if (s) metadata.adapterSerial = m ? `${s}-${m}` : s;
    }
    if (powerCordRow) {
      const s = String(powerCordRow['Serial Number/UDID'] || '').trim();
      const m = String(powerCordRow['Model No'] || '').trim();
      if (s) metadata.powerCordSerial = m ? `${s}-${m}` : s;
    }

    try {
      const deviceId = await insertDevice({
        label: base,
        serial,
        type: 'charging_hub',
        status: 'in_inventory',
        manufacturer: platform === 'Anker' ? 'Anker' : 'Cambrionix',
        model,
        purpose: 'onPrem',
        assignedTo,
        description,
        metadata,
        createdAt,
      });
      deviceCount++;
      console.log(`  ✓ ${base} (${platform}) — serial: ${serial ?? 'none'}`);
    } catch (err: any) {
      errors.push(`${base}: ${err.message}`);
      console.error(`  ✗ ${base}: ${err.message}`);
    }
  }

  return { devices: deviceCount, comments: commentCount, errors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('Truncating devices table (CASCADE)...');
  await db.execute(sql`TRUNCATE TABLE devices CASCADE`);
  console.log('Truncated.\n');

  const android = await importAndroid();
  const ios = await importIos();
  const cambrionix = await importCambrionix();

  await client.end();

  const totalDevices = android.devices + ios.devices + cambrionix.devices;
  const totalComments = android.comments + ios.comments + cambrionix.comments;
  const allErrors = [...android.errors, ...ios.errors, ...cambrionix.errors];

  console.log('\n========================================');
  console.log(`Android devices:    ${android.devices}  Comments: ${android.comments}`);
  console.log(`iOS devices:        ${ios.devices}  Comments: ${ios.comments}`);
  console.log(`Cambrionix devices: ${cambrionix.devices}  Comments: ${cambrionix.comments}`);
  console.log(`─────────────────────────────────────`);
  console.log(`Total devices:      ${totalDevices}  Comments: ${totalComments}`);
  if (allErrors.length > 0) {
    console.log(`\nErrors (${allErrors.length}):`);
    allErrors.forEach((e) => console.log(' -', e));
  } else {
    console.log('No errors.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
