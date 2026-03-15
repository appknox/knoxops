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

  await createAuditLog({
    userId: user.id,
    module: 'devices',
    action: 'device_updated',
    entityType: 'device',
    entityId: after.id,
    entityName: after.name,
    changes: {
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    },
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  return reply.send(after);
}

export async function remove(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const user = request.user as User;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  const device = await deleteDevice(id);

  await createAuditLog({
    userId: user.id,
    module: 'devices',
    action: 'device_deleted',
    entityType: 'device',
    entityId: device.id,
    entityName: device.name,
    changes: { before: device as unknown as Record<string, unknown> },
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });

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
