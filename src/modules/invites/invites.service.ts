import { eq, and, or, gt, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { userInvites, users, UserInvite, Role, NewUserInvite } from '../../db/schema/index.js';
import { generateInviteToken, getExpirationDate } from '../../lib/jwt.js';
import { hashPassword } from '../../lib/password.js';
import { sendInviteEmail } from '../../services/email.service.js';
import { BadRequestError, NotFoundError, ConflictError } from '../../middleware/errorHandler.js';

const INVITE_EXPIRY = '7d';

export interface CreateInviteParams {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  invitedBy: string;
  inviterName: string;
}

export async function createInvite(params: CreateInviteParams): Promise<UserInvite> {
  const email = params.email.toLowerCase();

  // Check if user already exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existingUser) {
    throw new ConflictError('A user with this email already exists');
  }

  // Check for pending invite
  const existingInvite = await db.query.userInvites.findFirst({
    where: and(
      eq(userInvites.email, email),
      eq(userInvites.status, 'pending'),
      gt(userInvites.expiresAt, new Date())
    ),
  });

  if (existingInvite) {
    throw new ConflictError('An active invite already exists for this email');
  }

  const inviteToken = generateInviteToken();
  const expiresAt = getExpirationDate(INVITE_EXPIRY);

  const [invite] = await db
    .insert(userInvites)
    .values({
      email,
      firstName: params.firstName,
      lastName: params.lastName,
      role: params.role,
      inviteToken,
      invitedBy: params.invitedBy,
      expiresAt,
    })
    .returning();

  // Send invite email
  await sendInviteEmail(email, inviteToken, params.inviterName, params.role);

  return invite;
}

export async function listInvites(status?: 'pending' | 'accepted' | 'expired' | 'revoked'): Promise<UserInvite[]> {
  if (status) {
    return db.query.userInvites.findMany({
      where: eq(userInvites.status, status),
      orderBy: [desc(userInvites.createdAt)],
    });
  }

  return db.query.userInvites.findMany({
    orderBy: [desc(userInvites.createdAt)],
  });
}

export async function getInviteByToken(token: string): Promise<UserInvite | null> {
  const invite = await db.query.userInvites.findFirst({
    where: eq(userInvites.inviteToken, token),
  });

  return invite ?? null;
}

export async function validateInviteToken(token: string): Promise<UserInvite> {
  const invite = await getInviteByToken(token);

  if (!invite) {
    throw new NotFoundError('Invalid invite token');
  }

  if (invite.status === 'accepted') {
    throw new BadRequestError('This invite has already been accepted');
  }

  if (invite.status === 'revoked') {
    throw new BadRequestError('This invite has been revoked');
  }

  if (invite.expiresAt < new Date()) {
    // Update status to expired
    await db
      .update(userInvites)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(userInvites.id, invite.id));

    throw new BadRequestError('This invite has expired');
  }

  return invite;
}

export async function acceptInvite(token: string, password: string): Promise<void> {
  const invite = await validateInviteToken(token);

  const passwordHash = await hashPassword(password);

  // Create user
  await db.insert(users).values({
    email: invite.email,
    passwordHash,
    firstName: invite.firstName,
    lastName: invite.lastName,
    role: invite.role,
    isActive: true,
    inviteStatus: 'accepted',
    invitedBy: invite.invitedBy,
  });

  // Update invite status
  await db
    .update(userInvites)
    .set({
      status: 'accepted',
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(userInvites.id, invite.id));
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const invite = await db.query.userInvites.findFirst({
    where: eq(userInvites.id, inviteId),
  });

  if (!invite) {
    throw new NotFoundError('Invite not found');
  }

  if (invite.status !== 'pending') {
    throw new BadRequestError('Only pending invites can be revoked');
  }

  await db
    .update(userInvites)
    .set({ status: 'revoked', updatedAt: new Date() })
    .where(eq(userInvites.id, inviteId));
}

export async function resendInvite(inviteId: string, inviterName: string): Promise<UserInvite> {
  const invite = await db.query.userInvites.findFirst({
    where: eq(userInvites.id, inviteId),
  });

  if (!invite) {
    throw new NotFoundError('Invite not found');
  }

  if (invite.status !== 'pending' && invite.status !== 'expired') {
    throw new BadRequestError('Only pending or expired invites can be resent');
  }

  const newToken = generateInviteToken();
  const newExpiresAt = getExpirationDate(INVITE_EXPIRY);

  const [updatedInvite] = await db
    .update(userInvites)
    .set({
      inviteToken: newToken,
      expiresAt: newExpiresAt,
      status: 'pending',
      updatedAt: new Date(),
    })
    .where(eq(userInvites.id, inviteId))
    .returning();

  // Resend email
  await sendInviteEmail(invite.email, newToken, inviterName, invite.role);

  return updatedInvite;
}
