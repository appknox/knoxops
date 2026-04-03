import { eq, and, or, ilike, sql, desc, asc, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  onpremDeployments,
  onpremStatusHistory,
  onpremComments,
  onpremDocuments,
  OnpremDeployment,
  OnpremStatusHistory,
  OnpremComment,
  OnpremDocument,
  DeploymentStatus,
  DocumentCategory,
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
  saveDocumentFile,
  deleteDocumentFile,
  deleteFileFromS3,
  getS3FileStream,
} from '../../services/file.service.js';
import { parseExcelFile, ParsedExcelData } from '../../services/excel-parser.service.js';
import { getSignedUrl } from '../../services/file.service.js';

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

  // Delete associated S3 files
  if (deployment.prerequisiteFileUrl) {
    await deleteFileFromS3(deployment.prerequisiteFileUrl);
  }
  if (deployment.sslCertificateFileUrl) {
    await deleteFileFromS3(deployment.sslCertificateFileUrl);
  }

  // Delete all documents
  const docs = await getDocuments(id);
  for (const doc of docs) {
    await deleteFileFromS3(doc.fileUrl);
  }

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

  // Use deploymentId as client ID for folder structure: onprem/{clientId}/
  const clientId = deploymentId;

  // Delete old file if exists
  if (deployment.prerequisiteFileUrl) {
    await deletePrerequisiteFile(deployment.prerequisiteFileUrl);
  }

  // Save new file to S3
  const { fileName, s3Key, buffer } = await savePrerequisiteFile(file, deploymentId, clientId);

  // Parse Excel file
  let parsedData: ParsedExcelData | undefined;
  try {
    if (buffer) {
      parsedData = await parseExcelFile(buffer);
    }
  } catch (error) {
    console.error('Failed to parse Excel file:', error);
    // Continue even if parsing fails - file is already uploaded
  }

  // Update deployment with file info
  await db
    .update(onpremDeployments)
    .set({
      prerequisiteFileName: fileName,
      prerequisiteFileUrl: s3Key,
      updatedAt: new Date(),
    })
    .where(eq(onpremDeployments.id, deploymentId));

  return {
    fileName,
    fileUrl: s3Key,
    parsedData, // Return parsed data to frontend
  };
}

export async function getPrerequisiteFile(
  deploymentId: string
): Promise<{ s3Key: string; fileName: string; signedUrl: string }> {
  const deployment = await getOnpremById(deploymentId);

  if (!deployment.prerequisiteFileUrl || !deployment.prerequisiteFileName) {
    throw new NotFoundError('Prerequisite file not found');
  }

  const signedUrl = await getSignedUrl(deployment.prerequisiteFileUrl, undefined, deployment.prerequisiteFileName);

  return {
    s3Key: deployment.prerequisiteFileUrl,
    fileName: deployment.prerequisiteFileName,
    signedUrl,
  };
}

export async function uploadSslCertificateFile(
  deploymentId: string,
  file: MultipartFile
): Promise<{ fileName: string; fileUrl: string }> {
  // Verify deployment exists
  const deployment = await getOnpremById(deploymentId);

  // Use deploymentId as client ID for folder structure: onprem/{clientId}/
  const clientId = deploymentId;

  // Delete old file if exists
  if (deployment.sslCertificateFileUrl) {
    await deleteSslCertificateFile(deployment.sslCertificateFileUrl);
  }

  // Save new file with generic name: {deploymentId}-ssl-certs.zip
  const { fileName, s3Key } = await saveSslCertificateFile(file, deploymentId, clientId);

  // Update deployment with file info
  await db
    .update(onpremDeployments)
    .set({
      sslCertificateFileUrl: s3Key,
      updatedAt: new Date(),
    })
    .where(eq(onpremDeployments.id, deploymentId));

  return {
    fileName,
    fileUrl: s3Key,
  };
}

export async function getSslCertificateFile(
  deploymentId: string
): Promise<{ s3Key: string; fileName: string; signedUrl: string }> {
  const deployment = await getOnpremById(deploymentId);

  if (!deployment.sslCertificateFileUrl) {
    throw new NotFoundError('SSL certificate file not found');
  }

  // Extract filename from S3 key
  const fileName = deployment.sslCertificateFileUrl.split('/').pop() || 'ssl-certificate';

  const signedUrl = await getSignedUrl(deployment.sslCertificateFileUrl, undefined, fileName);

  return {
    s3Key: deployment.sslCertificateFileUrl,
    fileName,
    signedUrl,
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
  options: { type?: string; page?: number; limit?: number } = {}
): Promise<{ data: CombinedHistoryEntry[]; total: number; totalPages: number }> {
  const { type = 'all', page = 1, limit = 20 } = options;

  // Verify deployment exists
  await getOnpremById(deploymentId);

  // Fetch all three types in parallel
  const [comments, auditLogs, statusHistory] = await Promise.all([
    getComments(deploymentId, 10000),
    getAuditLogsByEntity('onprem_deployment', deploymentId, 10000),
    getOnpremStatusHistory(deploymentId, 10000),
  ]);

  // Transform and combine
  let combined: CombinedHistoryEntry[] = [
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

  // Sort by timestamp descending
  combined.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Apply type filter
  if (type === 'comments') {
    combined = combined.filter((e) => e.type === 'comment');
  } else if (type === 'activities') {
    combined = combined.filter((e) => e.type !== 'comment');
  }

  const total = combined.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const data = combined.slice(offset, offset + limit);

  return { data, total, totalPages };
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

/**
 * Upload one document file and insert DB record
 */
export async function uploadDocument(
  deploymentId: string,
  category: DocumentCategory,
  file: MultipartFile
): Promise<OnpremDocument> {
  // Verify deployment exists
  await getOnpremById(deploymentId);

  // Use deploymentId as client ID for folder structure: onprem/{clientId}/
  const clientId = deploymentId;

  const { fileName, s3Key, mimeType, fileSize } = await saveDocumentFile(deploymentId, category, file, clientId);
  const [doc] = await db
    .insert(onpremDocuments)
    .values({
      deploymentId,
      category,
      fileName,
      fileUrl: s3Key, // Store S3 key
      mimeType,
      fileSize,
    })
    .returning();
  return doc;
}

/**
 * Get all documents for a deployment (optionally filtered by category)
 */
export async function getDocuments(
  deploymentId: string,
  category?: DocumentCategory
): Promise<OnpremDocument[]> {
  const conditions = [eq(onpremDocuments.deploymentId, deploymentId)];
  if (category) conditions.push(eq(onpremDocuments.category, category));
  return db.select().from(onpremDocuments).where(and(...conditions));
}

/**
 * Delete a single document record and its file
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const docs = await db.select().from(onpremDocuments).where(eq(onpremDocuments.id, documentId));
  const doc = docs[0];
  if (!doc) throw new NotFoundError('Document not found');
  await deleteDocumentFile(doc.fileUrl);
  await db.delete(onpremDocuments).where(eq(onpremDocuments.id, documentId));
}

/**
 * Get signed URL for document download
 */
export async function getDocumentFile(documentId: string): Promise<{ signedUrl: string; fileName: string }> {
  const docs = await db.select().from(onpremDocuments).where(eq(onpremDocuments.id, documentId));
  const doc = docs[0];
  if (!doc) throw new NotFoundError('Document not found');

  const signedUrl = await getSignedUrl(doc.fileUrl, undefined, doc.fileName);
  return {
    signedUrl,
    fileName: doc.fileName,
  };
}

/**
 * Build a ZIP buffer containing ALL files for a deployment
 */
export async function buildDeploymentZip(deploymentId: string): Promise<Buffer> {
  const deployment = await getOnpremById(deploymentId);
  if (!deployment) throw new NotFoundError('Deployment not found');

  const docs = await getDocuments(deploymentId);

  const { default: archiver } = await import('archiver');
  const archive = archiver('zip', { zlib: { level: 6 } });

  return new Promise(async (resolve, reject) => {
    const chunks: Buffer[] = [];

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    try {
      // Add prerequisite file from S3
      if (deployment.prerequisiteFileUrl) {
        const stream = await getS3FileStream(deployment.prerequisiteFileUrl);
        archive.append(stream, {
          name: `prerequisite/${deployment.prerequisiteFileName ?? 'prerequisite'}`,
        });
      }

      // Add SSL certificate from S3
      if (deployment.sslCertificateFileUrl) {
        const stream = await getS3FileStream(deployment.sslCertificateFileUrl);
        const sslName = deployment.sslCertificateFileUrl.split('/').pop() || 'ssl-certificate';
        archive.append(stream, { name: `ssl-certificate/${sslName}` });
      }

      // Add uploaded documents from S3
      for (const doc of docs) {
        const stream = await getS3FileStream(doc.fileUrl);
        archive.append(stream, { name: `documents/${doc.fileName}` });
      }

      archive.finalize();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Record patch deployment for a client
 */
export async function recordPatchDeployment(
  id: string,
  data: {
    patchDate: string;
    newVersion?: string;
    nextScheduledPatchDate?: string;
  }
): Promise<void> {
  // Verify deployment exists
  const deployment = await getOnpremById(id);
  if (!deployment) {
    throw new NotFoundError('Deployment not found');
  }

  const updateFields: Record<string, any> = {
    lastPatchDate: new Date(data.patchDate),
    updatedAt: new Date(),
  };

  if (data.newVersion) {
    updateFields.currentVersion = data.newVersion;
  }

  if (data.nextScheduledPatchDate) {
    updateFields.nextScheduledPatchDate = new Date(data.nextScheduledPatchDate);
  }

  await db
    .update(onpremDeployments)
    .set(updateFields)
    .where(eq(onpremDeployments.id, id));

  // Create audit log
  await createAuditLog({
    module: 'onprem',
    entityType: 'OnpremDeployment',
    entityId: id,
    action: 'record_patch',
    metadata: { version: data.newVersion, nextScheduledPatchDate: data.nextScheduledPatchDate },
  });
}

export async function searchClients(
  q: string
): Promise<{ id: string; clientName: string; contactEmail: string | null }[]> {
  return db
    .select({
      id: onpremDeployments.id,
      clientName: onpremDeployments.clientName,
      contactEmail: onpremDeployments.contactEmail,
    })
    .from(onpremDeployments)
    .where(
      and(
        eq(onpremDeployments.clientStatus, 'active'),
        ilike(onpremDeployments.clientName, `%${q}%`)
      )
    )
    .orderBy(asc(onpremDeployments.clientName))
    .limit(10);
}
