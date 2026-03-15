import { FastifyRequest, FastifyReply } from 'fastify';
import { listAuditLogsQuerySchema, ListAuditLogsQuery } from './audit-logs.schema.js';
import { listAuditLogs, getAuditLogsByEntity } from '../../services/audit-log.service.js';
import { AuditModule } from '../../db/schema/index.js';

export async function list(
  request: FastifyRequest<{ Querystring: ListAuditLogsQuery }>,
  reply: FastifyReply
) {
  const query = listAuditLogsQuerySchema.parse(request.query);
  const result = await listAuditLogs(query);
  return reply.send(result);
}

export async function listByModule(
  request: FastifyRequest<{ Params: { module: AuditModule }; Querystring: ListAuditLogsQuery }>,
  reply: FastifyReply
) {
  const { module } = request.params;
  const query = listAuditLogsQuerySchema.parse(request.query);
  const result = await listAuditLogs({ ...query, module });
  return reply.send(result);
}

export async function listByUser(
  request: FastifyRequest<{ Params: { userId: string }; Querystring: ListAuditLogsQuery }>,
  reply: FastifyReply
) {
  const { userId } = request.params;
  const query = listAuditLogsQuerySchema.parse(request.query);
  const result = await listAuditLogs({ ...query, userId });
  return reply.send(result);
}

export async function listByEntity(
  request: FastifyRequest<{ Params: { type: string; id: string } }>,
  reply: FastifyReply
) {
  const { type, id } = request.params;
  const logs = await getAuditLogsByEntity(type, id);
  return reply.send({ data: logs });
}
