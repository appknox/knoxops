import { FastifyRequest, FastifyReply } from 'fastify';
import {
  updateUserSchema,
  listUsersQuerySchema,
  UpdateUserInput,
  ListUsersQuery,
} from './users.schema.js';
import { listUsers, getUserById, updateUser, deleteUser } from './users.service.js';
import { createAuditLog } from '../../services/audit-log.service.js';
import { User } from '../../db/schema/index.js';

export async function list(
  request: FastifyRequest<{ Querystring: ListUsersQuery }>,
  reply: FastifyReply
) {
  const query = listUsersQuerySchema.parse(request.query);
  const result = await listUsers(query);
  return reply.send(result);
}

export async function getById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const user = await getUserById(id);
  return reply.send(user);
}

export async function update(
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateUserInput }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const input = updateUserSchema.parse(request.body);
  const currentUser = request.user as User;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  const { before, after } = await updateUser(id, input, currentUser.id);

  // Check if role was changed
  const action = input.role && input.role !== before.role ? 'role_changed' : 'user_updated';

  await createAuditLog({
    userId: currentUser.id,
    module: 'users',
    action,
    entityType: 'user',
    entityId: after.id,
    entityName: `${after.firstName} ${after.lastName}`,
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
  const currentUser = request.user as User;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  const user = await deleteUser(id, currentUser.id);

  await createAuditLog({
    userId: currentUser.id,
    module: 'users',
    action: 'user_deleted',
    entityType: 'user',
    entityId: user.id,
    entityName: `${user.firstName} ${user.lastName}`,
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  return reply.send({ message: 'User deleted successfully' });
}
