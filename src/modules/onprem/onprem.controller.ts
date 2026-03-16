import { FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs';
import {
  createOnpremSchema,
  updateOnpremSchema,
  updateStatusSchema,
  listOnpremQuerySchema,
  createCommentSchema,
  updateCommentSchema,
  CreateOnpremInput,
  UpdateOnpremInput,
  UpdateStatusInput,
  ListOnpremQuery,
  CreateCommentInput,
  UpdateCommentInput,
} from './onprem.schema.js';
import {
  listOnprem,
  getOnpremById,
  createOnprem,
  updateOnprem,
  updateOnpremStatus,
  deleteOnprem,
  getOnpremStatusHistory,
  uploadPrerequisiteFile,
  getPrerequisiteFile,
  uploadSslCertificateFile,
  getSslCertificateFile,
  checkEmailExists,
  checkPhoneExists,
  createComment,
  updateComment,
  deleteComment,
  getComments,
  getCombinedHistory,
  getDistinctVersions,
  getDistinctCsmUsers,
} from './onprem.service.js';
import { createAuditLog, getAuditLogsByEntity } from '../../services/audit-log.service.js';
import { User } from '../../db/schema/index.js';

export async function list(
  request: FastifyRequest<{ Querystring: ListOnpremQuery }>,
  reply: FastifyReply
) {
  const query = listOnpremQuerySchema.parse(request.query);
  const result = await listOnprem(query);
  return reply.send(result);
}

export async function getById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const deployment = await getOnpremById(id);
  return reply.send(deployment);
}

export async function create(
  request: FastifyRequest<{ Body: CreateOnpremInput }>,
  reply: FastifyReply
) {
  const input = createOnpremSchema.parse(request.body);
  const user = request.user as User;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  const deployment = await createOnprem(input, user.id);

  await createAuditLog({
    userId: user.id,
    module: 'onprem',
    action: 'deployment_created',
    entityType: 'onprem_deployment',
    entityId: deployment.id,
    entityName: deployment.name,
    changes: { after: deployment as unknown as Record<string, unknown> },
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  return reply.status(201).send(deployment);
}

export async function update(
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateOnpremInput }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const input = updateOnpremSchema.parse(request.body);
  const user = request.user as User;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  const { before, after } = await updateOnprem(id, input, user.id);

  await createAuditLog({
    userId: user.id,
    module: 'onprem',
    action: 'deployment_updated',
    entityType: 'onprem_deployment',
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

export async function updateStatus(
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateStatusInput }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const { status, reason } = updateStatusSchema.parse(request.body);
  const user = request.user as User;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  const { before, after } = await updateOnpremStatus(id, status, user.id, reason);

  await createAuditLog({
    userId: user.id,
    module: 'onprem',
    action: 'status_changed',
    entityType: 'onprem_deployment',
    entityId: after.id,
    entityName: after.name,
    changes: {
      before: { status: before.status },
      after: { status: after.status },
    },
    metadata: { reason },
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

  const deployment = await deleteOnprem(id, user.id);

  return reply.send({ message: 'Deployment deleted successfully' });
}

export async function getStatusHistory(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const history = await getOnpremStatusHistory(id);
  return reply.send({ data: history });
}

export async function getAuditLog(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;

  // Verify deployment exists
  await getOnpremById(id);

  const logs = await getAuditLogsByEntity('onprem_deployment', id);

  return reply.send({ data: logs });
}

export async function uploadPrerequisite(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const data = await request.file();

  if (!data) {
    return reply.status(400).send({ message: 'No file uploaded' });
  }

  const result = await uploadPrerequisiteFile(id, data);

  return reply.send({
    message: 'File uploaded successfully',
    fileName: result.fileName,
    parsedData: result.parsedData, // Include parsed data
  });
}

export async function downloadPrerequisite(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const { filePath, fileName } = await getPrerequisiteFile(id);

  const stream = fs.createReadStream(filePath);

  return reply
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('Content-Disposition', `attachment; filename="${fileName}"`)
    .send(stream);
}

export async function checkEmail(
  request: FastifyRequest<{ Querystring: { email: string; excludeId?: string } }>,
  reply: FastifyReply
) {
  const { email, excludeId } = request.query;

  if (!email) {
    return reply.status(400).send({ message: 'Email parameter is required' });
  }

  const result = await checkEmailExists(email, excludeId);
  return reply.send(result);
}

export async function checkPhone(
  request: FastifyRequest<{ Querystring: { phone: string; excludeId?: string } }>,
  reply: FastifyReply
) {
  const { phone, excludeId } = request.query;

  if (!phone) {
    return reply.status(400).send({ message: 'Phone parameter is required' });
  }

  const result = await checkPhoneExists(phone, excludeId);
  return reply.send(result);
}

export async function uploadSslCertificate(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const data = await request.file();

  if (!data) {
    return reply.status(400).send({ message: 'No file uploaded' });
  }

  const result = await uploadSslCertificateFile(id, data);

  return reply.send({
    message: 'SSL certificate uploaded successfully',
    fileName: result.fileName,
  });
}

export async function downloadSslCertificate(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const { filePath, fileName } = await getSslCertificateFile(id);

  const stream = fs.createReadStream(filePath);

  // Determine MIME type based on file extension
  let mimeType = 'application/zip';
  if (fileName.endsWith('.tar.gz') || fileName.endsWith('.tgz')) {
    mimeType = 'application/x-compressed-tar';
  } else if (fileName.endsWith('.gz')) {
    mimeType = 'application/gzip';
  }

  return reply
    .type(mimeType)
    .header('Content-Disposition', `attachment; filename="${fileName}"`)
    .send(stream);
}

// ============================================
// COMMENT CONTROLLERS
// ============================================

export async function createDeploymentComment(
  request: FastifyRequest<{ Params: { id: string }; Body: CreateCommentInput }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const { comment } = createCommentSchema.parse(request.body);
  const user = request.user as User;

  const result = await createComment(id, comment, user.id);

  return reply.status(201).send(result);
}

export async function updateDeploymentComment(
  request: FastifyRequest<{
    Params: { id: string; commentId: string };
    Body: UpdateCommentInput;
  }>,
  reply: FastifyReply
) {
  const { commentId } = request.params;
  const { comment } = updateCommentSchema.parse(request.body);
  const user = request.user as User;

  const result = await updateComment(commentId, comment, user.id);

  return reply.send(result);
}

export async function deleteDeploymentComment(
  request: FastifyRequest<{ Params: { id: string; commentId: string } }>,
  reply: FastifyReply
) {
  const { commentId } = request.params;
  const user = request.user as User;

  await deleteComment(commentId, user.id);

  return reply.send({ message: 'Comment deleted successfully' });
}

export async function getDeploymentComments(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;

  const comments = await getComments(id);

  return reply.send({ data: comments });
}

export async function getCombinedDeploymentHistory(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;

  const history = await getCombinedHistory(id);

  return reply.send({ data: history });
}

export async function getDistinctAppknoxVersions(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const versions = await getDistinctVersions();
  return reply.send({ data: versions });
}

export async function getDistinctCsmUsersHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const results = await getDistinctCsmUsers();
  return reply.send({ data: results });
}
