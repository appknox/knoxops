import { eq, and, or, ilike, sql, desc, asc, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  onpremDeployments,
  onpremStatusHistory,
  onpremComments,
  OnpremDeployment,
  OnpremStatusHistory,
  OnpremComment,
  DeploymentStatus,
  users,
} from '../../db/schema/index.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../middleware/errorHandler.js';
import { CreateOnpremInput, UpdateOnpremInput, ListOnpremQuery } from './onprem.schema.js';
import { getAuditLogsByEntity, createAuditLog } from '../../services/audit-log.service.js';
import type { MultipartFile } from '@fastify/multipart';
import {
  savePrerequisiteFile,
  getPrerequisiteFilePath,
  deletePrerequisiteFile,
  saveSslCertificateFile,
  getSslCertificateFilePath,
  deleteSslCertificateFile,
} from '../../services/file.service.js';
import { parseExcelFile, ParsedExcelData } from '../../services/excel-parser.service.js';
import fsp from 'fs/promises';

export interface OnpremWithCsm extends OnpremDeployment {
  associatedCsm?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export interface PaginatedOnprem {
  data: OnpremDeployment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function listOnprem(query: ListOnpremQuery): Promise<PaginatedOnprem> {
  const { page, limit, search, status, clientStatus, environmentType, currentVersion, currentVersions, csmIds, maintenancePlan, environment, region, sortBy, sortOrder } = query;
  const offset = (page - 1) * limit;

  const conditions = [];

  if (search) {
    conditions.push(
      or(
        ilike(onpremDeployments.clientName, `%${search}%`),
        ilike(onpremDeployments.customerId, `%${search}%`),
        ilike(onpremDeployments.customerName, `%${search}%`),
        ilike(onpremDeployments.hostname, `%${search}%`)
      )
    );
  }

  if (status) {
    conditions.push(eq(onpremDeployments.status, status));
  }

  if (clientStatus) {
    conditions.push(eq(onpremDeployments.clientStatus, clientStatus));
  }

  if (environmentType) {
    conditions.push(eq(onpremDeployments.environmentType, environmentType));
  }

  // Support both old single currentVersion and new currentVersions array
  if (currentVersions && Array.isArray(currentVersions) && currentVersions.length > 0) {
    const validVersions = currentVersions.filter((v) => v && v !== '');
    if (validVersions.length > 0) {
      conditions.push(inArray(onpremDeployments.currentVersion, validVersions));
    }
  } else if (currentVersion) {
    conditions.push(eq(onpremDeployments.currentVersion, currentVersion));
  }

  if (csmIds && Array.isArray(csmIds) && csmIds.length > 0) {
    const validCsmIds = csmIds.filter((id) => id && id !== '');
    if (validCsmIds.length > 0) {
      conditions.push(inArray(onpremDeployments.associatedCsmId, validCsmIds));
    }
  }

  if (maintenancePlan) {
    conditions.push(eq(onpremDeployments.maintenancePlan, maintenancePlan));
  }

  if (environment) {
    conditions.push(eq(onpremDeployments.environment, environment));
  }

  if (region) {
    conditions.push(eq(onpremDeployments.region, region));
  }

  // Filter out soft-deleted records
  conditions.push(eq(onpremDeployments.isDeleted, false));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = {
  clientName: onpremDeployments.clientName,
  createdAt: onpremDeployments.createdAt,
  updatedAt: onpremDeployments.updatedAt,
  status: onpremDeployments.status,
  customerName: onpremDeployments.customerName,
  lastPatchDate: onpremDeployments.lastPatchDate, // Add this line
}[sortBy];


  const orderFn = sortOrder === 'asc' ? asc : desc;

  const [data, countResult] = await Promise.all([
    db
      .select()
      .from(onpremDeployments)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(onpremDeployments)
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

export async function getOnpremById(id: string): Promise<OnpremWithCsm> {
  const result = await db
    .select({
      deployment: onpremDeployments,
      csm: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(onpremDeployments)
    .leftJoin(users, eq(onpremDeployments.associatedCsmId, users.id))
    .where(and(eq(onpremDeployments.id, id), eq(onpremDeployments.isDeleted, false)))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Deployment not found');
  }

  const { deployment, csm } = result[0];

  return {
    ...deployment,
    associatedCsm: csm || null,
  };
}

export async function createOnprem(
  input: CreateOnpremInput,
  userId: string
): Promise<OnpremDeployment> {
  // Validate unique email
  if (input.contactEmail) {
    const emailCheck = await checkEmailExists(input.contactEmail);
    if (emailCheck.exists && emailCheck.deployment) {
      throw new Error(
        `Contact email "${input.contactEmail}" is already used by "${emailCheck.deployment.clientName}"`
      );
    }
  }

  // Validate unique phone
  if (input.contactPhone) {
    const phoneCheck = await checkPhoneExists(input.contactPhone);
    if (phoneCheck.exists && phoneCheck.deployment) {
      throw new Error(
        `Contact phone "${input.contactPhone}" is already used by "${phoneCheck.deployment.clientName}"`
      );
    }
  }

  const [deployment] = await db
    .insert(onpremDeployments)
    .values({
      ...input,
      registeredBy: userId,
      lastUpdatedBy: userId,
    })
    .returning();

  // Create initial status history
  await db.insert(onpremStatusHistory).values({
    deploymentId: deployment.id,
    newStatus: deployment.status,
    changedBy: userId,
    reason: 'Initial deployment registration',
  });

  return deployment;
}

export async function updateOnprem(
  id: string,
  input: UpdateOnpremInput,
  userId: string
): Promise<{ before: OnpremDeployment; after: OnpremDeployment }> {
  const before = await getOnpremById(id);

  // Validate unique email (exclude current deployment)
  if (input.contactEmail) {
    const emailCheck = await checkEmailExists(input.contactEmail, id);
    if (emailCheck.exists && emailCheck.deployment) {
      throw new ConflictError(
        `Contact email "${input.contactEmail}" is already used by "${emailCheck.deployment.clientName}"`
      );
    }
  }

  // Validate unique phone (exclude current deployment)
  if (input.contactPhone) {
    const phoneCheck = await checkPhoneExists(input.contactPhone, id);
    if (phoneCheck.exists && phoneCheck.deployment) {
      throw new ConflictError(
        `Contact phone "${input.contactPhone}" is already used by "${phoneCheck.deployment.clientName}"`
      );
    }
  }

  const [after] = await db
    .update(onpremDeployments)
    .set({
      ...input,
      lastUpdatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(onpremDeployments.id, id))
    .returning();

  return { before, after };
}

export async function updateOnpremStatus(
  id: string,
  status: DeploymentStatus,
  userId: string,
  reason?: string
): Promise<{ before: OnpremDeployment; after: OnpremDeployment }> {
  const before = await getOnpremById(id);

  const [after] = await db
    .update(onpremDeployments)
    .set({
      status,
      lastUpdatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(onpremDeployments.id, id))
    .returning();

  // Record status change in history
  await db.insert(onpremStatusHistory).values({
    deploymentId: id,
    previousStatus: before.status,
    newStatus: status,
    changedBy: userId,
    reason,
  });

  return { before, after };
}

export async function deleteOnprem(
  id: string,
  userId: string
): Promise<OnpremDeployment> {
  const deployment = await getOnpremById(id);

  await db
    .update(onpremDeployments)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(onpremDeployments.id, id));

  await createAuditLog({
    userId,
    module: 'onprem',
    action: 'deployment_deleted',
    entityType: 'onprem_deployment',
    entityId: id,
    entityName: deployment.clientName,
    changes: {
      before: { isDeleted: false },
      after: { isDeleted: true },
    },
  });

  return deployment;
}

export interface OnpremStatusHistoryWithUser extends OnpremStatusHistory {
  changedByUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export async function getOnpremStatusHistory(
  deploymentId: string,
  limit: number = 50
): Promise<OnpremStatusHistoryWithUser[]> {
  // Verify deployment exists
  await getOnpremById(deploymentId);

  const results = await db
    .select({
      history: onpremStatusHistory,
      changedByUser: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(onpremStatusHistory)
    .leftJoin(users, eq(onpremStatusHistory.changedBy, users.id))
    .where(eq(onpremStatusHistory.deploymentId, deploymentId))
    .orderBy(desc(onpremStatusHistory.createdAt))
    .limit(limit);

  return results.map(({ history, changedByUser }) => ({
    ...history,
    changedByUser: changedByUser || null,
  }));
}

export async function checkEmailExists(
  email: string,
  excludeId?: string
): Promise<{ exists: boolean; deployment?: { id: string; clientName: string } }> {
  const conditions = [eq(onpremDeployments.contactEmail, email), eq(onpremDeployments.isDeleted, false)];

  if (excludeId) {
    conditions.push(sql`${onpremDeployments.id} != ${excludeId}`);
  }

  const result = await db
    .select({
      id: onpremDeployments.id,
      clientName: onpremDeployments.clientName,
    })
    .from(onpremDeployments)
    .where(and(...conditions))
    .limit(1);

  if (result.length > 0) {
    return {
      exists: true,
      deployment: result[0],
    };
  }

  return { exists: false };
}

export async function checkPhoneExists(
  phone: string,
  excludeId?: string
): Promise<{ exists: boolean; deployment?: { id: string; clientName: string } }> {
  const conditions = [eq(onpremDeployments.contactPhone, phone), eq(onpremDeployments.isDeleted, false)];

  if (excludeId) {
    conditions.push(sql`${onpremDeployments.id} != ${excludeId}`);
  }

  const result = await db
    .select({
      id: onpremDeployments.id,
      clientName: onpremDeployments.clientName,
    })
    .from(onpremDeployments)
    .where(and(...conditions))
    .limit(1);

  if (result.length > 0) {
    return {
      exists: true,
      deployment: result[0],
    };
  }

  return { exists: false };
}

export async function uploadPrerequisiteFile(
  deploymentId: string,
  file: MultipartFile
): Promise<{ fileName: string; fileUrl: string; parsedData?: ParsedExcelData }> {
  // Verify deployment exists
  const deployment = await getOnpremById(deploymentId);

  // Delete old file if exists
  if (deployment.prerequisiteFileUrl) {
    await deletePrerequisiteFile(deployment.prerequisiteFileUrl);
  }

  // Save new file
  const { fileName, filePath } = await savePrerequisiteFile(file, deploymentId);

  // Parse Excel file
  let parsedData: ParsedExcelData | undefined;
  try {
    const fullPath = getPrerequisiteFilePath(filePath);
    const buffer = await fsp.readFile(fullPath);
    parsedData = await parseExcelFile(buffer);
  } catch (error) {
    console.error('Failed to parse Excel file:', error);
    // Continue even if parsing fails - file is already uploaded
  }

  // Update deployment with file info
  await db
    .update(onpremDeployments)
    .set({
      prerequisiteFileName: fileName,
      prerequisiteFileUrl: filePath,
      updatedAt: new Date(),
    })
    .where(eq(onpremDeployments.id, deploymentId));

  return {
    fileName,
    fileUrl: filePath,
    parsedData, // Return parsed data to frontend
  };
}

export async function getPrerequisiteFile(
  deploymentId: string
): Promise<{ filePath: string; fileName: string }> {
  const deployment = await getOnpremById(deploymentId);

  if (!deployment.prerequisiteFileUrl || !deployment.prerequisiteFileName) {
    throw new NotFoundError('Prerequisite file not found');
  }

  const filePath = getPrerequisiteFilePath(deployment.prerequisiteFileUrl);

  return {
    filePath,
    fileName: deployment.prerequisiteFileName,
  };
}

export async function uploadSslCertificateFile(
  deploymentId: string,
  file: MultipartFile
): Promise<{ fileName: string; fileUrl: string }> {
  // Verify deployment exists
  const deployment = await getOnpremById(deploymentId);

  // Delete old file if exists
  if (deployment.sslCertificateFileUrl) {
    await deleteSslCertificateFile(deployment.sslCertificateFileUrl);
  }

  // Save new file with generic name: {deploymentId}-ssl-certs.zip
  const { fileName, filePath } = await saveSslCertificateFile(file, deploymentId);

  // Update deployment with file info
  await db
    .update(onpremDeployments)
    .set({
      sslCertificateFileUrl: filePath,
      updatedAt: new Date(),
    })
    .where(eq(onpremDeployments.id, deploymentId));

  return {
    fileName,
    fileUrl: filePath,
  };
}

export async function getSslCertificateFile(
  deploymentId: string
): Promise<{ filePath: string; fileName: string }> {
  const deployment = await getOnpremById(deploymentId);

  if (!deployment.sslCertificateFileUrl) {
    throw new NotFoundError('SSL certificate file not found');
  }

  const filePath = getSslCertificateFilePath(deployment.sslCertificateFileUrl);

  return {
    filePath,
    fileName: deployment.sslCertificateFileUrl, // Use the stored filename
  };
}

// ============================================
// COMMENT FUNCTIONS
// ============================================

export interface OnpremCommentWithUser extends OnpremComment {
  createdByUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  updatedByUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export interface CombinedHistoryEntry {
  id: string;
  type: 'comment' | 'audit' | 'status_change';
  timestamp: Date;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  data: any;
}

/**
 * Create a new comment for a deployment
 */
export async function createComment(
  deploymentId: string,
  comment: string,
  userId: string
): Promise<OnpremCommentWithUser> {
  // Verify deployment exists
  await getOnpremById(deploymentId);

  const [newComment] = await db
    .insert(onpremComments)
    .values({
      deploymentId,
      comment,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  return getCommentById(newComment.id);
}

/**
 * Get a single comment by ID with user information
 */
export async function getCommentById(id: string): Promise<OnpremCommentWithUser> {
  const result = await db
    .select({
      comment: onpremComments,
      createdByUser: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(onpremComments)
    .leftJoin(users, eq(onpremComments.createdBy, users.id))
    .where(and(eq(onpremComments.id, id), eq(onpremComments.isDeleted, false)))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Comment not found');
  }

  const { comment, createdByUser } = result[0];

  return {
    ...comment,
    createdByUser: createdByUser || null,
    updatedByUser: null, // Updated by will be the same as creator in most cases
  };
}

/**
 * Update a comment (only by creator)
 */
export async function updateComment(
  commentId: string,
  comment: string,
  userId: string
): Promise<OnpremCommentWithUser> {
  const existing = await getCommentById(commentId);

  // Authorization check - only creator can edit
  if (existing.createdBy !== userId) {
    throw new ForbiddenError('Only the comment creator can edit this comment');
  }

  await db
    .update(onpremComments)
    .set({
      comment,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(onpremComments.id, commentId));

  return getCommentById(commentId);
}

/**
 * Delete a comment (soft delete, only by creator)
 */
export async function deleteComment(commentId: string, userId: string): Promise<void> {
  const existing = await getCommentById(commentId);

  // Authorization check - only creator can delete
  if (existing.createdBy !== userId) {
    throw new ForbiddenError('Only the comment creator can delete this comment');
  }

  await db
    .update(onpremComments)
    .set({
      isDeleted: true,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(onpremComments.id, commentId));
}

/**
 * Get all comments for a deployment
 */
export async function getComments(
  deploymentId: string,
  limit: number = 50
): Promise<OnpremCommentWithUser[]> {
  // Verify deployment exists
  await getOnpremById(deploymentId);

  const results = await db
    .select({
      comment: onpremComments,
      createdByUser: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(onpremComments)
    .leftJoin(users, eq(onpremComments.createdBy, users.id))
    .where(and(eq(onpremComments.deploymentId, deploymentId), eq(onpremComments.isDeleted, false)))
    .orderBy(desc(onpremComments.createdAt))
    .limit(limit);

  return results.map(({ comment, createdByUser }) => ({
    ...comment,
    createdByUser: createdByUser || null,
    updatedByUser: null,
  }));
}

/**
 * Get combined history: comments + audit logs + status changes
 * All merged and sorted by timestamp descending (newest first)
 */
export async function getCombinedHistory(
  deploymentId: string,
  limit: number = 100
): Promise<CombinedHistoryEntry[]> {
  // Verify deployment exists
  await getOnpremById(deploymentId);

  // Fetch all three types in parallel
  const [comments, auditLogs, statusHistory] = await Promise.all([
    getComments(deploymentId, limit),
    getAuditLogsByEntity('onprem_deployment', deploymentId, limit),
    getOnpremStatusHistory(deploymentId, limit),
  ]);

  // Transform and combine
  const combined: CombinedHistoryEntry[] = [
    // Comments
    ...comments.map((c) => ({
      id: c.id,
      type: 'comment' as const,
      timestamp: new Date(c.createdAt),
      user: c.createdByUser || null,
      data: {
        comment: c.comment,
        isEdited: c.createdAt.getTime() !== c.updatedAt.getTime(),
        updatedAt: c.updatedAt,
        createdBy: c.createdBy,
      },
    })),
    // Audit logs with user info
    ...auditLogs.map((a) => ({
      id: a.id,
      type: 'audit' as const,
      timestamp: new Date(a.createdAt),
      user: a.user || null,
      data: {
        action: a.action,
        changes: a.changes,
        entityName: a.entityName,
        module: a.module,
      },
    })),
    // Status changes with user info
    ...statusHistory.map((s) => ({
      id: s.id,
      type: 'status_change' as const,
      timestamp: new Date(s.createdAt),
      user: s.changedByUser || null,
      data: {
        previousStatus: s.previousStatus,
        newStatus: s.newStatus,
        reason: s.reason,
      },
    })),
  ];

  // Sort by timestamp descending (newest first)
  return combined.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export async function getDistinctVersions(): Promise<string[]> {
  const results = await db
    .selectDistinct({ currentVersion: onpremDeployments.currentVersion })
    .from(onpremDeployments)
    .where(and(sql`${onpremDeployments.currentVersion} IS NOT NULL`, eq(onpremDeployments.isDeleted, false)))
    .orderBy(asc(onpremDeployments.currentVersion));

  return results
    .map((r) => r.currentVersion)
    .filter((v): v is string => v !== null);
}

export async function getDistinctCsmUsers(): Promise<{ id: string; firstName: string; lastName: string; email: string }[]> {
  const results = await db
    .selectDistinct({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(onpremDeployments)
    .innerJoin(users, eq(onpremDeployments.associatedCsmId, users.id))
    .where(and(
      isNotNull(onpremDeployments.associatedCsmId),
      eq(onpremDeployments.isDeleted, false)
    ))
    .orderBy(asc(users.firstName));

  return results;
}
