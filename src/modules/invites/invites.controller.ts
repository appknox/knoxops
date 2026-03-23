import { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  createInviteSchema,
  acceptInviteSchema,
  CreateInviteInput,
  AcceptInviteInput,
} from './invites.schema.js';
import {
  createInvite,
  listInvites,
  validateInviteToken,
  acceptInvite,
  revokeInvite,
  resendInvite,
} from './invites.service.js';
import { createAuditLog } from '../../services/audit-log.service.js';
import { User, users } from '../../db/schema/index.js';

export async function sendInvite(
  request: FastifyRequest<{ Body: CreateInviteInput }>,
  reply: FastifyReply
) {
  const input = createInviteSchema.parse(request.body);
  const user = request.user as User;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  const invite = await createInvite({
    ...input,
    invitedBy: user.id,
    inviterName: `${user.firstName} ${user.lastName}`,
  });

  await createAuditLog({
    userId: user.id,
    module: 'users',
    action: 'invite_sent',
    entityType: 'user_invite',
    entityId: invite.id,
    entityName: input.email,
    metadata: { role: input.role },
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  return reply.status(201).send({
    id: invite.id,
    email: invite.email,
    firstName: invite.firstName,
    lastName: invite.lastName,
    role: invite.role,
    status: invite.status,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  });
}

export async function getInvites(request: FastifyRequest, reply: FastifyReply) {
  const invites = await listInvites();

  return reply.send({
    data: invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      firstName: invite.firstName,
      lastName: invite.lastName,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    })),
  });
}

export async function validateInvite(
  request: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply
) {
  const { token } = request.params;

  const invite = await validateInviteToken(token);

  return reply.send({
    email: invite.email,
    firstName: invite.firstName,
    lastName: invite.lastName,
    role: invite.role,
    expiresAt: invite.inviteExpiresAt,
  });
}

export async function acceptInviteHandler(
  request: FastifyRequest<{ Params: { token: string }; Body: AcceptInviteInput }>,
  reply: FastifyReply
) {
  const { token } = request.params;
  const { password } = acceptInviteSchema.parse(request.body);
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  const user = await validateInviteToken(token);

  await acceptInvite(token, password);

  await createAuditLog({
    module: 'users',
    action: 'invite_accepted',
    entityType: 'user_invite',
    entityId: user.id,
    entityName: user.email,
    metadata: { role: user.role },
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  return reply.send({ message: 'Account created successfully. You can now log in.' });
}

export async function revokeInviteHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const user = request.user as User;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  await revokeInvite(id);

  await createAuditLog({
    userId: user.id,
    module: 'users',
    action: 'invite_revoked',
    entityType: 'user_invite',
    entityId: id,
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  return reply.send({ message: 'Invite revoked successfully' });
}

export async function resendInviteHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const admin = request.user as User;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  await resendInvite(id, `${admin.firstName} ${admin.lastName}`);

  // Fetch updated user
  const updatedUser = await db.query.users.findFirst({
    where: eq(users.id, id),
  });

  if (!updatedUser) {
    throw new Error('User not found after resend');
  }

  await createAuditLog({
    userId: admin.id,
    module: 'users',
    action: 'invite_resent',
    entityType: 'user_invite',
    entityId: id,
    entityName: updatedUser.email,
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  return reply.send({
    id: updatedUser.id,
    email: updatedUser.email,
    expiresAt: updatedUser.inviteExpiresAt,
    message: 'Invite resent successfully',
  });
}
