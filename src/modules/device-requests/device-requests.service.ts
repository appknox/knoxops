import { db } from '../../db/index.js';
import { deviceRequests, users, DeviceRequest, DeviceRequestStatus } from '../../db/schema/index.js';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { sendSlackNotification } from '../../services/slack-notification.service.js';
import { User } from '../../db/schema/users.js';

export interface CreateDeviceRequestInput {
  deviceType: string;
  platform: string;
  osVersion?: string;
  purpose: string;
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

  await sendSlackNotification(
    `📋 New Device Request — ${date}\n\nRequested by: ${userName} (${userEmail})\nDevice type: ${input.deviceType}\nPlatform: ${input.platform}\n${input.osVersion ? `OS version: ${input.osVersion}\n` : ''}Purpose: ${input.purpose}\nStatus: Pending`
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

  const requests = results.map(({ request, requestedByUser }) => ({
    ...request,
    requestedByUser: requestedByUser as User | null,
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
    `✅ Device Request Approved — ${date}\n\nRequested by: ${requesterName} | Approved by: ${approverName}\nDevice: ${updated.deviceType} ${updated.platform}`
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
    `❌ Device Request Rejected — ${date}\n\nRequested by: ${requesterName} | Rejected by: ${rejecterName}\nReason: ${reason}`
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

  const [updated] = await db
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

  // Fetch user info and device info for Slack
  const [requestedByUser, completerUser, linkedDevice] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, updated.requestedBy),
    }),
    db.query.users.findFirst({
      where: eq(users.id, completerUserId),
    }),
    linkedDeviceId
      ? db.query.devices.findFirst({
          where: eq(db.schema.devices.id, linkedDeviceId),
        })
      : Promise.resolve(null),
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
    `📦 Device Request Completed — ${date}\n\nRequested by: ${requesterName} | Completed by: ${completerName}\nDevice allocated: ${deviceInfo}`
  );

  return {
    ...updated,
    requestedByUser,
  };
}
