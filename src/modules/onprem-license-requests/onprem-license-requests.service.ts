import { db } from '../../db/index.js';
import {
  onpremLicenseRequests,
  onpremDeployments,
  users,
  onpremComments,
  OnpremLicenseRequest,
  LicenseRequestStatus,
  LicenseRequestType,
} from '../../db/schema/index.js';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { sendSlackNotification } from '../../services/slack-notification.service.js';
import { createAuditLog } from '../../services/audit-log.service.js';
import { User } from '../../db/schema/users.js';
import { env } from '../../config/env.js';
import jwt from 'jsonwebtoken';
import { saveLicenseFile, getSignedUrl, deleteFileFromS3 } from '../../services/file.service.js';

const requestUrl = (deploymentId: string, requestId: string) =>
  `${env.FRONTEND_URL}/onprem/${deploymentId}?tab=requests&requestId=${requestId}`;

export interface CreateLicenseRequestInput {
  requestType: LicenseRequestType;
  targetVersion: string;
  licenseStartDate: Date;
  licenseEndDate: Date;
  numberOfProjects: number;
  fingerprint: string;
  notes?: string;
}

export interface LicenseRequestWithUser extends OnpremLicenseRequest {
  requestedByUser?: User | null;
  uploadedByUser?: User | null;
  cancelledByUser?: User | null;
  clientName?: string;
}

export async function createLicenseRequest(
  deploymentId: string,
  input: CreateLicenseRequestInput,
  userId: string
): Promise<LicenseRequestWithUser> {
  // Verify deployment exists
  const deployment = await db.query.onpremDeployments.findFirst({
    where: eq(onpremDeployments.id, deploymentId),
  });
  if (!deployment) throw new Error('Deployment not found');

  // Validate: no active pending request for this client
  const existingPending = await db.query.onpremLicenseRequests.findFirst({
    where: and(
      eq(onpremLicenseRequests.deploymentId, deploymentId),
      eq(onpremLicenseRequests.status, 'pending')
    ),
  });
  if (existingPending) {
    throw new Error(
      `A pending licence request (#${existingPending.requestNo}) already exists for this client. Cancel it before submitting a new one.`
    );
  }

  // Validate: minimum 3-month gap between start and end date
  const diffMs = input.licenseEndDate.getTime() - input.licenseStartDate.getTime();
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.44);
  if (diffMonths < 3) {
    throw new Error('License end date must be at least 3 months after the start date.');
  }

  // Create request
  const [request] = await db
    .insert(onpremLicenseRequests)
    .values({
      deploymentId,
      requestedBy: userId,
      requestType: input.requestType,
      targetVersion: input.targetVersion.trim(),
      licenseStartDate: input.licenseStartDate,
      licenseEndDate: input.licenseEndDate,
      numberOfProjects: input.numberOfProjects,
      fingerprint: input.fingerprint.trim(),
      notes: input.notes?.trim() || null,
      status: 'pending',
    })
    .returning();

  // Fetch user info for Slack notification
  const [requestedByUser, csm] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    deployment.associatedCsmId
      ? db.query.users.findFirst({
          where: eq(users.id, deployment.associatedCsmId),
        })
      : Promise.resolve(null),
  ]);

  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const requesterName = requestedByUser
    ? `${requestedByUser.firstName} ${requestedByUser.lastName}`
    : 'Unknown User';
  const requesterEmail = requestedByUser?.email || '';
  const startDate = input.licenseStartDate.toLocaleDateString();
  const endDate = input.licenseEndDate.toLocaleDateString();

  // Add activity comment
  const commentText = `License key requested by ${requesterName} for period ${startDate} – ${endDate} (${input.numberOfProjects} projects). Request #${request.requestNo}.`;
  await db.insert(onpremComments).values({
    deploymentId,
    comment: commentText,
    createdBy: userId,
    updatedBy: userId,
  });

  // Send Slack notification (non-blocking)
  const requestTypeLabel = input.requestType === 'patch_update' ? 'Patch Update' : 'License Renewal';
  sendSlackNotification(
    `📋 License Key Request — ${date}\n\n*Request #:* ${request.requestNo}\n*Type:* ${requestTypeLabel}\n*Client:* ${deployment.clientName}\n*Requested by:* ${requesterName} (${requesterEmail})\n*License:* ${startDate} to ${endDate} · ${input.numberOfProjects} projects${input.notes ? `\n*Notes:* ${input.notes}` : ''}\n\n<${requestUrl(deploymentId, request.id)}|View Request →>`
  ).catch((err) => console.error('Slack notification failed (create):', err));

  return {
    ...request,
    requestedByUser,
  };
}

export async function listLicenseRequests(
  deploymentId: string,
  userId: string,
  role: string
): Promise<{ requests: LicenseRequestWithUser[]; total: number }> {
  const isAdmin = ['admin', 'onprem_admin', 'full_editor'].includes(role);

  // Fetch all requests for deployment
  const results = await db
    .select({
      request: onpremLicenseRequests,
      requestedByUser: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
      },
    })
    .from(onpremLicenseRequests)
    .leftJoin(users, eq(onpremLicenseRequests.requestedBy, users.id))
    .where(eq(onpremLicenseRequests.deploymentId, deploymentId))
    .orderBy(desc(onpremLicenseRequests.createdAt));

  // Fetch additional user info (uploadedBy, cancelledBy)
  const uploadedByIds = new Set<string>();
  const cancelledByIds = new Set<string>();

  results.forEach(({ request }) => {
    if (request.uploadedBy) uploadedByIds.add(request.uploadedBy);
    if (request.cancelledBy) cancelledByIds.add(request.cancelledBy);
  });

  const [uploadedByUsers, cancelledByUsers] = await Promise.all([
    uploadedByIds.size > 0
      ? db
          .select()
          .from(users)
          .where(inArray(users.id, Array.from(uploadedByIds)))
      : Promise.resolve([]),
    cancelledByIds.size > 0
      ? db
          .select()
          .from(users)
          .where(inArray(users.id, Array.from(cancelledByIds)))
      : Promise.resolve([]),
  ]);

  const uploadedByMap = Object.fromEntries(uploadedByUsers.map((u) => [u.id, u]));
  const cancelledByMap = Object.fromEntries(cancelledByUsers.map((u) => [u.id, u]));

  const requests = results.map(({ request, requestedByUser }) => ({
    ...request,
    requestedByUser: requestedByUser as User | null,
    uploadedByUser: request.uploadedBy ? (uploadedByMap[request.uploadedBy] || null) : null,
    cancelledByUser: request.cancelledBy ? (cancelledByMap[request.cancelledBy] || null) : null,
  }));

  return {
    requests,
    total: requests.length,
  };
}

export async function listAllLicenseRequests(
  _userId: string,
  _role: string
): Promise<{ requests: LicenseRequestWithUser[]; total: number }> {
  const results = await db
    .select({
      request: onpremLicenseRequests,
      requestedByUser: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
      },
      clientName: onpremDeployments.clientName,
    })
    .from(onpremLicenseRequests)
    .leftJoin(users, eq(onpremLicenseRequests.requestedBy, users.id))
    .leftJoin(onpremDeployments, eq(onpremLicenseRequests.deploymentId, onpremDeployments.id))
    .orderBy(desc(onpremLicenseRequests.createdAt));

  const uploadedByIds = new Set<string>();
  const cancelledByIds = new Set<string>();
  results.forEach(({ request }) => {
    if (request.uploadedBy) uploadedByIds.add(request.uploadedBy);
    if (request.cancelledBy) cancelledByIds.add(request.cancelledBy);
  });

  const [uploadedByUsers, cancelledByUsers] = await Promise.all([
    uploadedByIds.size > 0
      ? db.select().from(users).where(inArray(users.id, Array.from(uploadedByIds)))
      : Promise.resolve([]),
    cancelledByIds.size > 0
      ? db.select().from(users).where(inArray(users.id, Array.from(cancelledByIds)))
      : Promise.resolve([]),
  ]);

  const uploadedByMap = Object.fromEntries(uploadedByUsers.map((u) => [u.id, u]));
  const cancelledByMap = Object.fromEntries(cancelledByUsers.map((u) => [u.id, u]));

  const requests = results.map(({ request, requestedByUser, clientName }) => ({
    ...request,
    clientName: clientName ?? undefined,
    requestedByUser: requestedByUser as User | null,
    uploadedByUser: request.uploadedBy ? (uploadedByMap[request.uploadedBy] || null) : null,
    cancelledByUser: request.cancelledBy ? (cancelledByMap[request.cancelledBy] || null) : null,
  }));

  return { requests, total: requests.length };
}

export async function getLicenseRequest(
  requestId: string,
  deploymentId: string
): Promise<LicenseRequestWithUser | null> {
  const result = await db
    .select({
      request: onpremLicenseRequests,
      requestedByUser: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
      },
    })
    .from(onpremLicenseRequests)
    .leftJoin(users, eq(onpremLicenseRequests.requestedBy, users.id))
    .where(
      and(
        eq(onpremLicenseRequests.id, requestId),
        eq(onpremLicenseRequests.deploymentId, deploymentId)
      )
    );

  if (!result.length) return null;

  const { request, requestedByUser } = result[0];

  // Fetch additional user info
  let uploadedByUser = null;
  let cancelledByUser = null;

  if (request.uploadedBy) {
    uploadedByUser = await db.query.users.findFirst({
      where: eq(users.id, request.uploadedBy),
    });
  }

  if (request.cancelledBy) {
    cancelledByUser = await db.query.users.findFirst({
      where: eq(users.id, request.cancelledBy),
    });
  }

  return {
    ...request,
    requestedByUser: requestedByUser as User | null,
    uploadedByUser,
    cancelledByUser,
  };
}

export async function uploadLicenseFile(
  requestId: string,
  deploymentId: string,
  file: {
    filename: string;
    data: Buffer;
  },
  uploadedBy: string
): Promise<LicenseRequestWithUser> {
  const request = await db.query.onpremLicenseRequests.findFirst({
    where: and(
      eq(onpremLicenseRequests.id, requestId),
      eq(onpremLicenseRequests.deploymentId, deploymentId)
    ),
  });

  if (!request) throw new Error('License request not found');
  if (request.status !== 'pending') {
    throw new Error(`Cannot upload file for request with status ${request.status}`);
  }

  // Use deploymentId as client ID for folder structure: onprem/{clientId}/
  const clientId = deploymentId;

  // Save file to S3
  const { s3Key } = await saveLicenseFile(file, deploymentId, requestId, clientId);

  // Update request with file info and complete it
  const [updated] = await db
    .update(onpremLicenseRequests)
    .set({
      status: 'completed',
      fileName: file.filename,
      filePath: s3Key, // Store S3 key
      fileSize: file.data.length,
      uploadedBy,
      uploadedAt: new Date(),
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(onpremLicenseRequests.id, requestId))
    .returning();

  // Update deployment license info
  const deployment = await db.query.onpremDeployments.findFirst({
    where: eq(onpremDeployments.id, deploymentId),
  });

  if (deployment) {
    await db
      .update(onpremDeployments)
      .set({
        license: {
          ...deployment.license,
          startDate: request.licenseStartDate.toISOString(),
          endDate: request.licenseEndDate.toISOString(),
          numberOfApps: request.numberOfProjects,
        },
        ...(request.targetVersion && { currentVersion: request.targetVersion }),
        ...(request.fingerprint && {
          infrastructure: sql`coalesce(${onpremDeployments.infrastructure}, '{}'::jsonb) || ${JSON.stringify({ fingerprint: request.fingerprint })}::jsonb`,
        }),
        updatedAt: new Date(),
      })
      .where(eq(onpremDeployments.id, deploymentId));
  }

  // Add activity comment
  const startDate = request.licenseStartDate.toLocaleDateString();
  const endDate = request.licenseEndDate.toLocaleDateString();
  const uploadedByUser = await db.query.users.findFirst({
    where: eq(users.id, uploadedBy),
  });
  const uploadedByName = uploadedByUser
    ? `${uploadedByUser.firstName} ${uploadedByUser.lastName}`
    : 'Unknown User';
  const versionNote = request.targetVersion ? ` Version updated to: ${request.targetVersion}.` : '';
  const fingerprintNote = request.fingerprint ? ` Fingerprint updated to: ${request.fingerprint}.` : '';
  const commentText = `License key generated by ${uploadedByName} for request #${request.requestNo}. Valid: ${startDate} – ${endDate}.${versionNote}${fingerprintNote}`;
  await db.insert(onpremComments).values({
    deploymentId,
    comment: commentText,
    createdBy: uploadedBy,
    updatedBy: uploadedBy,
  });

  // Create audit log
  await createAuditLog({
    userId: uploadedBy,
    module: 'onprem',
    action: 'license_file_uploaded',
    entityType: 'onprem_license_request',
    entityId: requestId,
    entityName: `Request #${request.requestNo}`,
    changes: {
      before: { status: 'pending', fileName: null },
      after: { status: 'completed', fileName: file.filename },
    },
  });

  // Send Slack notification (non-blocking)
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  sendSlackNotification(
    `✅ License Key Generated — ${date}\n\n*Request #:* ${request.requestNo}\n*Client:* ${deployment?.clientName}\n*Generated by:* ${uploadedByName}\n*File:* ${file.filename}\n*Valid:* ${startDate} to ${endDate}\n\n<${requestUrl(deploymentId, requestId)}|View Request →>`
  ).catch((err) => console.error('Slack notification failed (upload):', err));

  // Return with user info
  return await getLicenseRequest(requestId, deploymentId) as LicenseRequestWithUser;
}

export async function cancelLicenseRequest(
  requestId: string,
  deploymentId: string,
  cancelledBy: string,
  reason?: string
): Promise<LicenseRequestWithUser> {
  const request = await db.query.onpremLicenseRequests.findFirst({
    where: and(
      eq(onpremLicenseRequests.id, requestId),
      eq(onpremLicenseRequests.deploymentId, deploymentId)
    ),
  });

  if (!request) throw new Error('License request not found');
  if (request.status !== 'pending') {
    throw new Error(`Cannot cancel request with status ${request.status}`);
  }

  const [updated] = await db
    .update(onpremLicenseRequests)
    .set({
      status: 'cancelled',
      cancelledBy,
      cancelledAt: new Date(),
      cancellationReason: reason?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(onpremLicenseRequests.id, requestId))
    .returning();

  // Add activity comment
  const cancelledByUser = await db.query.users.findFirst({
    where: eq(users.id, cancelledBy),
  });
  const cancelledByName = cancelledByUser
    ? `${cancelledByUser.firstName} ${cancelledByUser.lastName}`
    : 'Unknown User';
  const reasonText = reason ? ` Reason: ${reason}` : '';
  const commentText = `License request #${request.requestNo} cancelled by ${cancelledByName}.${reasonText}`;
  await db.insert(onpremComments).values({
    deploymentId,
    comment: commentText,
    createdBy: cancelledBy,
    updatedBy: cancelledBy,
  });

  // Create audit log
  await createAuditLog({
    userId: cancelledBy,
    module: 'onprem',
    action: 'license_request_cancelled',
    entityType: 'onprem_license_request',
    entityId: requestId,
    entityName: `Request #${request.requestNo}`,
    changes: {
      before: { status: 'pending' },
      after: { status: 'cancelled', reason },
    },
  });

  // Send Slack notification
  const deployment = await db.query.onpremDeployments.findFirst({
    where: eq(onpremDeployments.id, deploymentId),
  });

  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  sendSlackNotification(
    `❌ License Request Cancelled — ${date}\n\n*Request #:* ${request.requestNo}\n*Client:* ${deployment?.clientName}\n*Cancelled by:* ${cancelledByName}${reason ? `\n*Cancelled Reason:* ${reason}` : ''}\n\n<${requestUrl(deploymentId, requestId)}|View Request →>`
  ).catch((err) => console.error('Slack notification failed (cancel):', err));

  // Return with user info
  return await getLicenseRequest(requestId, deploymentId) as LicenseRequestWithUser;
}

export function generateDownloadToken(requestId: string, userId: string): { token: string; expiresAt: string } {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 10); // 10 days

  const token = jwt.sign(
    {
      requestId,
      userId,
    },
    env.JWT_SECRET,
    {
      expiresIn: '10d',
    }
  );

  return {
    token,
    expiresAt: expiresAt.toISOString(),
  };
}

export function verifyDownloadToken(token: string): { requestId: string; userId: string } {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      requestId: string;
      userId: string;
    };
    return {
      requestId: decoded.requestId,
      userId: decoded.userId,
    };
  } catch (error) {
    throw new Error('Invalid or expired download token');
  }
}

export async function downloadLicenseFile(
  requestId: string,
  token: string
): Promise<{ downloadUrl: string; fileName: string }> {
  // Verify token
  verifyDownloadToken(token);

  // Get request
  const request = await db.query.onpremLicenseRequests.findFirst({
    where: eq(onpremLicenseRequests.id, requestId),
  });

  if (!request) throw new Error('License request not found');
  if (request.status !== 'completed') {
    throw new Error('License file not available');
  }
  if (!request.filePath || !request.fileName) {
    throw new Error('License file not found');
  }

  // Generate signed URL for S3 file with proper filename
  const signedUrl = await getSignedUrl(request.filePath, undefined, request.fileName);

  return {
    downloadUrl: signedUrl,
    fileName: request.fileName,
  };
}
