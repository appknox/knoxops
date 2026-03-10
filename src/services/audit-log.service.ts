import { db } from '../db/index.js';
import { auditLogs, NewAuditLog, AuditModule, AuditLog, users } from '../db/schema/index.js';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';

export interface CreateAuditLogInput {
  userId?: string;
  module: AuditModule;
  action: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function createAuditLog(input: CreateAuditLogInput): Promise<AuditLog> {
  const [log] = await db
    .insert(auditLogs)
    .values({
      userId: input.userId,
      module: input.module,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityName: input.entityName,
      changes: input.changes,
      metadata: input.metadata,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    })
    .returning();

  return log;
}

export interface ListAuditLogsParams {
  page?: number;
  limit?: number;
  module?: AuditModule;
  userId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface PaginatedAuditLogs {
  data: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function listAuditLogs(params: ListAuditLogsParams): Promise<PaginatedAuditLogs> {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;

  const conditions = [];

  if (params.module) {
    conditions.push(eq(auditLogs.module, params.module));
  }

  if (params.userId) {
    conditions.push(eq(auditLogs.userId, params.userId));
  }

  if (params.entityType) {
    conditions.push(eq(auditLogs.entityType, params.entityType));
  }

  if (params.entityId) {
    conditions.push(eq(auditLogs.entityId, params.entityId));
  }

  if (params.action) {
    conditions.push(eq(auditLogs.action, params.action));
  }

  if (params.startDate) {
    conditions.push(gte(auditLogs.createdAt, params.startDate));
  }

  if (params.endDate) {
    conditions.push(lte(auditLogs.createdAt, params.endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, countResult] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
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

export interface AuditLogWithUser extends AuditLog {
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export async function getAuditLogsByEntity(
  entityType: string,
  entityId: string,
  limit: number = 50
): Promise<AuditLogWithUser[]> {
  const results = await db
    .select({
      log: auditLogs,
      user: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return results.map(({ log, user }) => ({
    ...log,
    user: user || null,
  }));
}
