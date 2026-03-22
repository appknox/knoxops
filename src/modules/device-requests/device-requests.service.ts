import { db } from '../../db/index.js';
import { deviceRequests, users, devices, DeviceRequest, DeviceRequestStatus } from '../../db/schema/index.js';
import { eq, and, desc, isNull, inArray } from 'drizzle-orm';
import { sendSlackNotification } from '../../services/slack-notification.service.js';
import { createAuditLog } from '../../services/audit-log.service.js';
import { User } from '../../db/schema/users.js';

export interface CreateDeviceRequestInput {
  deviceType: string;
  platform: string;
  osVersion?: string;
  purpose: string;
  requestingFor?: string;
}

export interface DeviceRequestWithUser extends DeviceRequest {
  requestedByUser?: User | null;
  approvedByUser?: User | null;
  rejectedByUser?: User | null;
  completedByUser?: User | null;
}

export async function createRequest(
  input: CreateDeviceRequestInput,
  userId: string
): Promise<DeviceRequestWithUser> {
  const [request] = await db
    .insert(deviceRequests)
    .values({
      requestedBy: userId,
      deviceType: input.deviceType.trim(),
      platform: input.platform.trim(),
      osVersion: input.osVersion?.trim() || null,
      purpose: input.purpose.trim(),
      requestingFor: input.requestingFor?.trim() || null,
      status: 'pending',
    })
    .returning();

  // Fetch user info for Slack notification
  const requestedByUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  // Send Slack notification
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const userName = requestedByUser ? `${requestedByUser.firstName} ${requestedByUser.lastName}` : 'Unknown User';
  const userEmail = requestedByUser?.email || '';
  const requestingFor = input.requestingFor?.trim();
  const requestingForLine =
    requestingFor && requestingFor !== userName ? `Requesting for: ${requestingFor}\n` : '';

  await sendSlackNotification(
    `📋 New Device Request — ${date}\n\n*Request ID:* ${request.id}\nRequested by: ${userName} (${userEmail})\n${requestingForLine}Device: ${input.platform} ${input.deviceType}${input.osVersion ? ` · ${input.osVersion}` : ''}\nPurpose: ${input.purpose}`
  );

  return {
    ...request,
    requestedByUser,
  };
}

export async function listRequests(
  userId: string,
  role: string
): Promise<{ requests: DeviceRequestWithUser[]; total: number }> {
  const isAdmin = ['admin', 'devices_admin', 'full_editor'].includes(role);

  // Use subqueries to join users table multiple times for different fields
  const results = await db
    .select({
      request: deviceRequests,
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
    .from(deviceRequests)
    .leftJoin(users, eq(deviceRequests.requestedBy, users.id))
    .where(isAdmin ? undefined : eq(deviceRequests.requestedBy, userId))
    .orderBy(desc(deviceRequests.createdAt));

  // Now fetch additional user info for rejectedBy, approvedBy, completedBy
  let rejectedByMap: Record<string, User | null> = {};
  let approvedByMap: Record<string, User | null> = {};
  let completedByMap: Record<string, User | null> = {};

  // Collect unique user IDs to fetch
  const rejectedByIds = new Set<string>();
  const approvedByIds = new Set<string>();
  const completedByIds = new Set<string>();

  results.forEach(({ request }) => {
    if (request.rejectedBy) rejectedByIds.add(request.rejectedBy);
    if (request.approvedBy) approvedByIds.add(request.approvedBy);
    if (request.completedBy) completedByIds.add(request.completedBy);
  });

  // Fetch all additional user info in parallel
  const [rejectedByUsers, approvedByUsers, completedByUsers] = await Promise.all([
    rejectedByIds.size > 0
      ? db
          .select()
          .from(users)
          .where(inArray(users.id, Array.from(rejectedByIds)))
      : Promise.resolve([]),
    approvedByIds.size > 0
      ? db
          .select()
          .from(users)
          .where(inArray(users.id, Array.from(approvedByIds)))
      : Promise.resolve([]),
    completedByIds.size > 0
      ? db
          .select()
          .from(users)
          .where(inArray(users.id, Array.from(completedByIds)))
      : Promise.resolve([]),
  ]);

  rejectedByUsers.forEach((u) => {
    rejectedByMap[u.id] = u;
  });
  approvedByUsers.forEach((u) => {
    approvedByMap[u.id] = u;
  });
  completedByUsers.forEach((u) => {
    completedByMap[u.id] = u;
  });

  const requests = results.map(({ request, requestedByUser }) => ({
    ...request,
    requestedByUser: requestedByUser as User | null,
    rejectedByUser: request.rejectedBy ? (rejectedByMap[request.rejectedBy] || null) : null,
    approvedByUser: request.approvedBy ? (approvedByMap[request.approvedBy] || null) : null,
    completedByUser: request.completedBy ? (completedByMap[request.completedBy] || null) : null,
  }));

  return {
    requests,
    total: requests.length,
  };
}

export async function getRequest(
  id: string,
  userId: string,
  role: string
): Promise<DeviceRequestWithUser | null> {
  const request = await db.query.deviceRequests.findFirst({
    where: eq(deviceRequests.id, id),
  });

  if (!request) return null;

  // Check permission: read-only users can only see their own
  const isAdmin = ['admin', 'devices_admin', 'full_editor'].includes(role);
  if (!isAdmin && request.requestedBy !== userId) {
    throw new Error('Forbidden');
  }

  const requestedByUser = await db.query.users.findFirst({
    where: eq(users.id, request.requestedBy),
  });

  return {
    ...request,
    requestedByUser,
  };
}

export async function approveRequest(id: string, approverUserId: string): Promise<DeviceRequestWithUser> {
  const request = await db.query.deviceRequests.findFirst({
    where: eq(deviceRequests.id, id),
  });

  if (!request) throw new Error('Request not found');
  if (request.status !== 'pending') {
    throw new Error(`Cannot approve request with status ${request.status}`);
  }

  const [updated] = await db
    .update(deviceRequests)
    .set({
      status: 'approved',
      approvedBy: approverUserId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(deviceRequests.id, id))
    .returning();

  // Fetch user info for Slack
  const [requestedByUser, approverUser] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, updated.requestedBy),
    }),
    db.query.users.findFirst({
      where: eq(users.id, approverUserId),
    }),
  ]);

  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const requesterName = requestedByUser ? `${requestedByUser.firstName} ${requestedByUser.lastName}` : 'Unknown User';
  const approverName = approverUser ? `${approverUser.firstName} ${approverUser.lastName}` : 'Unknown User';

  await sendSlackNotification(
    `✅ Device Request Approved — ${date}\n\n*Request ID:* ${updated.id}\nRequested by: ${requesterName} | Approved by: ${approverName}\nDevice: ${updated.platform} ${updated.deviceType}${updated.osVersion ? ` · ${updated.osVersion}` : ''}\nPurpose: ${updated.purpose}`
  );

  return {
    ...updated,
    requestedByUser,
  };
}

export async function rejectRequest(
  id: string,
  rejecterUserId: string,
  reason: string
): Promise<DeviceRequestWithUser> {
  const request = await db.query.deviceRequests.findFirst({
    where: eq(deviceRequests.id, id),
  });

  if (!request) throw new Error('Request not found');
  if (!['pending', 'approved'].includes(request.status)) {
    throw new Error(`Cannot reject request with status ${request.status}`);
  }

  const [updated] = await db
    .update(deviceRequests)
    .set({
      status: 'rejected',
      rejectionReason: reason.trim(),
      rejectedBy: rejecterUserId,
      rejectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(deviceRequests.id, id))
    .returning();

  // Fetch user info for Slack
  const [requestedByUser, rejecterUser] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, updated.requestedBy),
    }),
    db.query.users.findFirst({
      where: eq(users.id, rejecterUserId),
    }),
  ]);

  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const requesterName = requestedByUser ? `${requestedByUser.firstName} ${requestedByUser.lastName}` : 'Unknown User';
  const rejecterName = rejecterUser ? `${rejecterUser.firstName} ${rejecterUser.lastName}` : 'Unknown User';

  await sendSlackNotification(
    `❌ Device Request Rejected — ${date}\n\n*Request ID:* ${updated.id}\nRequested by: ${requesterName} | Rejected by: ${rejecterName}\nDevice: ${updated.platform} ${updated.deviceType}${updated.osVersion ? ` · ${updated.osVersion}` : ''}\nPurpose: ${updated.purpose}\nReason: ${reason}`
  );

  return {
    ...updated,
    requestedByUser,
  };
}

export async function completeRequest(
  id: string,
  completerUserId: string,
  linkedDeviceId?: string
): Promise<DeviceRequestWithUser> {
  const request = await db.query.deviceRequests.findFirst({
    where: eq(deviceRequests.id, id),
  });

  if (!request) throw new Error('Request not found');
  if (request.status !== 'approved') {
    throw new Error(`Cannot complete request with status ${request.status}`);
  }

  let updated: DeviceRequest;
  let linkedDevice: any = null;

  // Use transaction for atomicity
  await db.transaction(async (tx) => {
    // 1. Update the request
    const [updatedRequest] = await tx
      .update(deviceRequests)
      .set({
        status: 'completed',
        linkedDeviceId: linkedDeviceId || null,
        completedBy: completerUserId,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deviceRequests.id, id))
      .returning();

    updated = updatedRequest;

    // 2. If a device was linked, update its status + purpose + assignedTo
    if (linkedDeviceId) {
      // Get requester name for assignedTo
      const requester = await tx.query.users.findFirst({
        where: eq(users.id, request.requestedBy),
      });

      const assignedTo = request.requestingFor
        || (requester ? `${requester.firstName} ${requester.lastName}` : undefined);

      // Get current device to log changes
      const currentDevice = await tx.query.devices.findFirst({
        where: eq(devices.id, linkedDeviceId),
      });

      // Update device
      await tx
        .update(devices)
        .set({
          status: 'inactive',
          purpose: request.purpose,
          ...(assignedTo && { assignedTo }),
          lastUpdatedBy: completerUserId,
          updatedAt: new Date(),
        })
        .where(eq(devices.id, linkedDeviceId));

      // 3. Log device audit entry
      if (currentDevice) {
        await createAuditLog({
          userId: completerUserId,
          module: 'devices',
          action: 'device_allocated_from_request',
          entityType: 'device',
          entityId: linkedDeviceId,
          entityName: currentDevice.name,
          changes: {
            before: { status: 'active', assignedTo: currentDevice.assignedTo || null },
            after: { status: 'inactive', assignedTo, purpose: request.purpose },
          },
        });
      }

      // Get updated device for Slack
      linkedDevice = await tx.query.devices.findFirst({
        where: eq(devices.id, linkedDeviceId),
      });
    }
  });

  // Fetch user info for Slack (outside transaction)
  const [requestedByUser, completerUser] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, updated.requestedBy),
    }),
    db.query.users.findFirst({
      where: eq(users.id, completerUserId),
    }),
  ]);

  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const requesterName = requestedByUser ? `${requestedByUser.firstName} ${requestedByUser.lastName}` : 'Unknown User';
  const completerName = completerUser ? `${completerUser.firstName} ${completerUser.lastName}` : 'Unknown User';
  const deviceInfo = linkedDevice ? `${linkedDevice.name} — ${linkedDevice.model || 'Unknown Model'}` : 'No device allocated';

  await sendSlackNotification(
    `📦 Device Request Completed — ${date}\n\n*Request ID:* ${updated.id}\nRequested by: ${requesterName} | Completed by: ${completerName}\nDevice allocated: ${deviceInfo}\nPurpose: ${request.purpose}`
  );

  return {
    ...updated,
    requestedByUser,
  };
}
