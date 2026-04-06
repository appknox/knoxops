import { eq, and, or, ilike, sql, desc, asc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { devices, Device, NewDevice, DeviceStatus, DeviceType } from '../../db/schema/index.js';
import { NotFoundError, ConflictError } from '../../middleware/errorHandler.js';
import { CreateDeviceInput, UpdateDeviceInput, ListDevicesQuery } from './devices.schema.js';
import { createAuditLog } from '../../services/audit-log.service.js';

// Platform prefix mapping for auto-generated device names
const PLATFORM_PREFIX: Record<string, string> = {
  android: 'A',
  ios: 'B',
  cambrionix: 'C',
};

// Generate auto-assigned device name based on platform
async function generateDeviceName(platform: string): Promise<string> {
  const prefix = PLATFORM_PREFIX[platform.toLowerCase()] ?? 'D';
  // Include soft-deleted devices so names are never reused
  const existing = await db
    .select({ name: devices.name })
    .from(devices)
    .where(sql`${devices.name} ~ ${`^${prefix}[0-9]+$`}`);

  const nums = existing
    .map(r => parseInt(r.name.slice(prefix.length), 10))
    .filter(n => !isNaN(n));

  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

// Optimized list item type (only fields needed for table display)
export interface DeviceListItem {
  id: string;
  name: string;
  status: string;
  model: string | null;
  platform: string | null;
  osVersion: string | null;
  purpose: string | null;
  assignedTo: string | null;
}

export interface PaginatedDevices {
  data: DeviceListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function listDevices(query: ListDevicesQuery): Promise<PaginatedDevices> {
  const { page, limit, search, type, status, platform, osVersion, purpose, assignedTo, sortBy, sortOrder } = query;
  const offset = (page - 1) * limit;

  const conditions = [];

  if (search) {
    conditions.push(
      or(
        ilike(devices.name, `%${search}%`),
        ilike(devices.serialNumber, `%${search}%`),
        ilike(devices.manufacturer, `%${search}%`),
        ilike(devices.model, `%${search}%`),
        ilike(devices.location, `%${search}%`),
        ilike(devices.assignedTo, `%${search}%`)
      )
    );
  }

  if (type) {
    conditions.push(eq(devices.type, type));
  }

  if (status) {
    conditions.push(eq(devices.status, status));
  }

  // Direct column filtering for operational fields
  if (purpose) {
    conditions.push(eq(devices.purpose, purpose));
  }

  if (assignedTo) {
    conditions.push(eq(devices.assignedTo, assignedTo));
  }

  // Metadata filtering using JSONB operators (technical specs)
  if (platform) {
    conditions.push(sql`${devices.metadata}->>'platform' = ${platform}`);
  }

  if (osVersion) {
    // Support comma-separated major versions (e.g. "17,16")
    const versions = osVersion.split(',').map((v) => v.trim()).filter(Boolean);
    if (versions.length === 1) {
      conditions.push(sql`SPLIT_PART(${devices.metadata}->>'osVersion', '.', 1) = ${versions[0]}`);
    } else {
      conditions.push(or(...versions.map((v) => sql`SPLIT_PART(${devices.metadata}->>'osVersion', '.', 1) = ${v}`)));
    }
  }

  // Filter out soft-deleted records
  conditions.push(eq(devices.isDeleted, false));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = {
    name: devices.name,
    createdAt: devices.createdAt,
    updatedAt: devices.updatedAt,
    status: devices.status,
    type: devices.type,
  }[sortBy];

  const orderFn = sortOrder === 'asc' ? asc : desc;

  // Select only fields needed for list display (optimized query)
  const [data, countResult] = await Promise.all([
    db
      .select({
        id: devices.id,
        name: devices.name,
        status: devices.status,
        type: devices.type,
        model: devices.model,
        platform: sql<string | null>`${devices.metadata}->>'platform'`,
        osVersion: sql<string | null>`${devices.metadata}->>'osVersion'`,
        purpose: devices.purpose,
        assignedTo: devices.assignedTo,
      })
      .from(devices)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(devices)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count || 0;

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getDeviceById(id: string): Promise<Device> {
  const device = await db.query.devices.findFirst({
    where: and(eq(devices.id, id), eq(devices.isDeleted, false)),
  });

  if (!device) {
    throw new NotFoundError('Device not found');
  }

  return device;
}

export async function checkSerialNumber(
  serialNumber: string,
  excludeId?: string
): Promise<{ exists: boolean; deviceId: string | null; deviceName: string | null }> {
  const conditions = [
    eq(devices.serialNumber, serialNumber),
    eq(devices.isDeleted, false),
  ];
  if (excludeId) {
    conditions.push(sql`${devices.id} != ${excludeId}`);
  }

  const existing = await db.query.devices.findFirst({
    where: and(...conditions),
    columns: { id: true, name: true, model: true },
  });

  return {
    exists: !!existing,
    deviceId: existing?.name ?? null,   // "name" is the device identifier e.g. A001
    deviceName: existing?.model ?? null,
  };
}

export async function createDevice(input: CreateDeviceInput, userId: string): Promise<Device> {
  // Check for duplicate serial number
  if (input.serialNumber) {
    const existing = await db.query.devices.findFirst({
      where: and(eq(devices.serialNumber, input.serialNumber), eq(devices.isDeleted, false)),
    });

    if (existing) {
      throw new ConflictError('A device with this serial number already exists');
    }
  }

  // Auto-generate device name based on platform in metadata
  const platform = (input.metadata?.platform as string) || '';
  const generatedName = await generateDeviceName(platform);

  const [device] = await db
    .insert(devices)
    .values({
      ...input,
      name: generatedName, // Override any client-provided name
      registeredBy: userId,
      lastUpdatedBy: userId,
    })
    .returning();

  return device;
}

export async function updateDevice(
  id: string,
  input: UpdateDeviceInput,
  userId: string
): Promise<{ before: Device; after: Device }> {
  const before = await getDeviceById(id);

  // Check for duplicate serial number
  if (input.serialNumber && input.serialNumber !== before.serialNumber) {
    const existing = await db.query.devices.findFirst({
      where: and(eq(devices.serialNumber, input.serialNumber), sql`${devices.id} != ${id}`, eq(devices.isDeleted, false)),
    });

    if (existing) {
      throw new ConflictError('A device with this serial number already exists');
    }
  }

  const [after] = await db
    .update(devices)
    .set({
      ...input,
      lastUpdatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(devices.id, id))
    .returning();

  return { before, after };
}

export async function deleteDevice(
  id: string,
  userId: string
): Promise<Device> {
  const device = await getDeviceById(id);

  await db
    .update(devices)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(devices.id, id));

  await createAuditLog({
    userId,
    module: 'devices',
    action: 'device_deleted',
    entityType: 'device',
    entityId: id,
    entityName: device.name,
    changes: {
      before: { isDeleted: false },
      after: { isDeleted: true },
    },
  });

  return device;
}

export async function updateDeviceStatus(
  id: string,
  status: DeviceStatus,
  userId: string
): Promise<{ before: Device; after: Device }> {
  const before = await getDeviceById(id);

  const [after] = await db
    .update(devices)
    .set({
      status,
      lastUpdatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(devices.id, id))
    .returning();

  return { before, after };
}

export interface DeviceStats {
  inInventory: number;
  outForRepair: number;
  toBeSold: number;
  inactive: number;
}

export async function getDeviceStats(): Promise<DeviceStats> {
  const result = await db
    .select({
      status: devices.status,
      count: sql<number>`count(*)::int`,
    })
    .from(devices)
    .where(eq(devices.isDeleted, false))
    .groupBy(devices.status);

  const stats: DeviceStats = {
    inInventory: 0,
    outForRepair: 0,
    toBeSold: 0,
    inactive: 0,
  };

  for (const row of result) {
    switch (row.status) {
      case 'in_inventory':
        stats.inInventory = row.count;
        break;
      case 'maintenance':
        stats.outForRepair = row.count;
        break;
      case 'decommissioned':
        stats.toBeSold = row.count;
        break;
      case 'checked_out':
        stats.inactive = row.count;
        break;
    }
  }

  return stats;
}

export async function getDistinctOsVersions(platform: 'iOS' | 'Android'): Promise<string[]> {
  const results = await db
    .selectDistinct({
      osVersion: sql<string>`${devices.metadata}->>'osVersion'`,
    })
    .from(devices)
    .where(
      and(
        sql`${devices.metadata}->>'platform' = ${platform}`,
        sql`${devices.metadata}->>'osVersion' IS NOT NULL AND ${devices.metadata}->>'osVersion' != ''`,
        eq(devices.isDeleted, false)
      )
    )
    .orderBy(desc(sql`${devices.metadata}->>'osVersion'`));

  // Round to major version and deduplicate (e.g. "17.5" -> "17", "16.4" -> "16")
  const major = results
    .map((r) => r.osVersion?.split('.')[0])
    .filter((v): v is string => !!v && /^\d+$/.test(v));
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const v of major) {
    if (!seen.has(v)) { seen.add(v); deduped.push(v); }
  }
  return deduped;
}

export interface SuggestedDevice {
  id: string;
  name: string;
  model: string | null;
  platform: string | null;
  osVersion: string | null;
  status: string;
}

export async function suggestDevices(
  platform: string,
  osVersion?: string
): Promise<SuggestedDevice[]> {
  const conditions = [
    eq(devices.status, 'in_inventory'),
    eq(devices.isDeleted, false),
    sql`${devices.metadata}->>'platform' = ${platform}`,
  ];

  // Use major version (integer part) for comparison
  const majorV = osVersion ? parseInt(osVersion.split('.')[0], 10) : null;

  const rows = await db
    .select({
      id: devices.id,
      name: devices.name,
      model: devices.model,
      platform: sql<string | null>`${devices.metadata}->>'platform'`,
      osVersion: sql<string | null>`${devices.metadata}->>'osVersion'`,
      status: devices.status,
    })
    .from(devices)
    .where(and(...conditions))
    .orderBy(
      // 0 = exact major version, 1 = higher major, 2 = lower major
      majorV !== null
        ? sql`CASE
            WHEN NULLIF(SPLIT_PART(${devices.metadata}->>'osVersion', '.', 1), '')::int = ${majorV} THEN 0
            WHEN NULLIF(SPLIT_PART(${devices.metadata}->>'osVersion', '.', 1), '')::int > ${majorV} THEN 1
            ELSE 2
          END ASC NULLS LAST`
        : sql`NULLIF(SPLIT_PART(${devices.metadata}->>'osVersion', '.', 1), '')::int ASC NULLS LAST`,
      // Within exact/higher: ascending (16→17→18). Within lower: descending (15→14→13)
      majorV !== null
        ? sql`CASE
            WHEN NULLIF(SPLIT_PART(${devices.metadata}->>'osVersion', '.', 1), '')::int >= ${majorV}
              THEN NULLIF(SPLIT_PART(${devices.metadata}->>'osVersion', '.', 1), '')::int
            ELSE -NULLIF(SPLIT_PART(${devices.metadata}->>'osVersion', '.', 1), '')::int
          END ASC NULLS LAST`
        : sql`NULLIF(SPLIT_PART(${devices.metadata}->>'osVersion', '.', 1), '')::int ASC NULLS LAST`,
      asc(devices.name)
    )
    .limit(50);

  return rows;
}
