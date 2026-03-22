import { FastifyRequest, FastifyReply } from 'fastify';
import {
  createDeviceSchema,
  updateDeviceSchema,
  listDevicesQuerySchema,
  CreateDeviceInput,
  UpdateDeviceInput,
  ListDevicesQuery,
} from './devices.schema.js';
import {
  listDevices,
  getDeviceById,
  createDevice,
  updateDevice,
  deleteDevice,
  getDeviceStats,
} from './devices.service.js';
import { createAuditLog, getAuditLogsByEntity } from '../../services/audit-log.service.js';
import { User } from '../../db/schema/index.js';

export async function list(
  request: FastifyRequest<{ Querystring: ListDevicesQuery }>,
  reply: FastifyReply
) {
  const query = listDevicesQuerySchema.parse(request.query);
  const result = await listDevices(query);
  return reply.send(result);
}

export async function getById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const device = await getDeviceById(id);
  return reply.send(device);
}

export async function create(
  request: FastifyRequest<{ Body: CreateDeviceInput }>,
  reply: FastifyReply
) {
  const input = createDeviceSchema.parse(request.body);
  const user = request.user as User;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  const device = await createDevice(input, user.id);

  await createAuditLog({
    userId: user.id,
    module: 'devices',
    action: 'device_created',
    entityType: 'device',
    entityId: device.id,
    entityName: device.name,
    changes: { after: device as unknown as Record<string, unknown> },
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  return reply.status(201).send(device);
}

export async function update(
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateDeviceInput }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const input = updateDeviceSchema.parse(request.body);
  const user = request.user as User;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  const { before, after } = await updateDevice(id, input, user.id);

  const commonArgs = {
    userId: user.id,
    module: 'devices' as const,
    entityType: 'device',
    entityId: after.id,
    entityName: after.name,
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  };

  // Log status change
  if (before.status !== after.status) {
    await createAuditLog({
      ...commonArgs,
      action: 'status_changed',
      changes: {
        before: { status: before.status },
        after: { status: after.status },
      },
    });
  }

  // Log assignedTo change
  if (before.assignedTo !== after.assignedTo) {
    await createAuditLog({
      ...commonArgs,
      action: 'assigned_to_changed',
      changes: {
        before: { assignedTo: before.assignedTo ?? null },
        after: { assignedTo: after.assignedTo ?? null },
      },
    });
  }

  // Log purpose change
  if (before.purpose !== after.purpose) {
    await createAuditLog({
      ...commonArgs,
      action: 'purpose_changed',
      changes: {
        before: { purpose: before.purpose ?? null },
        after: { purpose: after.purpose ?? null },
      },
    });
  }

  return reply.send(after);
}

export async function remove(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const user = request.user as User;

  const device = await deleteDevice(id, user.id);

  return reply.send({ message: 'Device deleted successfully' });
}

export async function getAuditLog(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;

  // Verify device exists
  await getDeviceById(id);

  const logs = await getAuditLogsByEntity('device', id);

  return reply.send({ data: logs });
}

export async function stats(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  const deviceStats = await getDeviceStats();
  return reply.send(deviceStats);
}

// Comment handlers
import { createComment, updateComment, deleteComment, getCommentById } from '../../services/entity-comments.service.js';

export async function addComment(
  request: FastifyRequest<{ Params: { id: string }; Body: { text: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const { text } = request.body;
  const user = request.user as User;

  // Verify device exists
  await getDeviceById(id);

  const comment = await createComment('device', id, text, user.id);
  return reply.status(201).send(comment);
}

export async function editComment(
  request: FastifyRequest<{ Params: { id: string; commentId: string }; Body: { text: string } }>,
  reply: FastifyReply
) {
  const { commentId } = request.params;
  const { text } = request.body;
  const user = request.user as User;

  const comment = await getCommentById(commentId);
  if (!comment) {
    return reply.status(404).send({ message: 'Comment not found' });
  }

  // Only comment author can edit
  if (comment.createdBy?.id !== user.id) {
    return reply.status(403).send({ message: 'Only comment author can edit' });
  }

  const updated = await updateComment(commentId, text, user.id);
  return reply.send(updated);
}

export async function removeComment(
  request: FastifyRequest<{ Params: { id: string; commentId: string } }>,
  reply: FastifyReply
) {
  const { commentId } = request.params;
  const user = request.user as User;

  const comment = await getCommentById(commentId);
  if (!comment) {
    return reply.status(404).send({ message: 'Comment not found' });
  }

  // Only comment author can delete
  if (comment.createdBy?.id !== user.id) {
    return reply.status(403).send({ message: 'Only comment author can delete' });
  }

  await deleteComment(commentId);
  return reply.send({ message: 'Comment deleted' });
}
