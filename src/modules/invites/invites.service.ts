import { eq, and, ne, lt } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users, User, Role } from '../../db/schema/index.js';
import { generateInviteToken } from '../../lib/jwt.js';
import { hashPassword } from '../../lib/password.js';
import { sendInviteEmail } from '../../services/email.service.js';
import { BadRequestError, NotFoundError, ConflictError, TooManyRequestsError } from '../../middleware/errorHandler.js';
import { env } from '../../config/env.js';

export interface CreateInviteParams {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  invitedBy: string;
  inviterName: string;
}

export interface InviteResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: 'pending' | 'active' | 'expired' | 'deleted';
  expiresAt: Date | null;
  createdAt: Date;
}

function mapUserToInvite(user: User): InviteResponse {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status as 'pending' | 'active' | 'expired' | 'deleted',
    expiresAt: user.inviteExpiresAt,
    createdAt: user.createdAt,
  };
}

export async function createInvite(params: CreateInviteParams): Promise<InviteResponse> {
  const email = params.email.toLowerCase();

  // Check if user already exists (not soft-deleted)
  const existingUser = await db.query.users.findFirst({
    where: and(eq(users.email, email), ne(users.status, 'deleted')),
  });

  if (existingUser?.status === 'pending') {
    throw new ConflictError('A pending invite already exists for this email');
  }
  if (existingUser?.status === 'active') {
    throw new ConflictError('A user with this email already exists');
  }

  const inviteToken = generateInviteToken();
  const inviteExpiresAt = new Date();
  inviteExpiresAt.setDate(inviteExpiresAt.getDate() + env.INVITE_EXPIRY_DAYS);
  const now = new Date();

  const [newUser] = await db
    .insert(users)
    .values({
      email,
      firstName: params.firstName,
      lastName: params.lastName,
      role: params.role,
      status: 'pending',
      inviteToken,
      inviteExpiresAt,
      inviteLastSentAt: now,
      invitedBy: params.invitedBy,
      passwordHash: null,
    })
    .returning();

  // Send invite email
  await sendInviteEmail(email, inviteToken, params.inviterName, params.role);

  return mapUserToInvite(newUser);
}

export async function listInvites(): Promise<InviteResponse[]> {
  const invites = await db.query.users.findMany({
    where: ne(users.status, 'active'),
  });

  return invites.map(mapUserToInvite);
}

export async function validateInviteToken(token: string): Promise<User> {
  const user = await db.query.users.findFirst({
    where: eq(users.inviteToken, token),
  });

  if (!user || user.status === 'deleted') {
    throw new NotFoundError('Invalid invite token');
  }

  if (user.status === 'active') {
    throw new BadRequestError('This invite has already been accepted');
  }

  // Auto-expire if past deadline
  if (user.inviteExpiresAt && user.inviteExpiresAt < new Date()) {
    await db
      .update(users)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(users.id, user.id));

    throw new BadRequestError('This invite has expired');
  }

  return user;
}

export async function acceptInvite(token: string, password: string): Promise<void> {
  const user = await validateInviteToken(token);

  const passwordHash = await hashPassword(password);

  await db
    .update(users)
    .set({
      status: 'active',
      passwordHash,
      inviteToken: null,
      inviteExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
}

export async function revokeInvite(userId: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.status === 'active' || user.status === 'deleted') {
    throw new BadRequestError('Cannot revoke this invite');
  }

  await db
    .update(users)
    .set({ status: 'deleted', updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function resendInvite(userId: string, inviterName: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Only block re-invite for active users
  if (user.status === 'active') {
    throw new BadRequestError('User is already active and does not need a new invitation');
  }

  // Rate limit: only one invite email per 24 hours
  if (user.inviteLastSentAt) {
    const msSinceLast = Date.now() - user.inviteLastSentAt.getTime();
    const msIn24h = 24 * 60 * 60 * 1000;
    if (msSinceLast < msIn24h) {
      const nextAllowedAt = new Date(user.inviteLastSentAt.getTime() + msIn24h);
      throw new TooManyRequestsError(
        `An invite was already sent today. You can resend again after ${nextAllowedAt.toISOString()}.`
      );
    }
  }

  // Allow: pending, expired, deleted — all reuse the same row
  const inviteToken = generateInviteToken();
  const inviteExpiresAt = new Date();
  inviteExpiresAt.setDate(inviteExpiresAt.getDate() + env.INVITE_EXPIRY_DAYS);
  const now = new Date();

  await db
    .update(users)
    .set({
      status: 'pending',
      inviteToken,
      inviteExpiresAt,
      inviteLastSentAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  await sendInviteEmail(user.email, inviteToken, inviterName, user.role);
}

export async function acceptInviteViaSso(email: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: and(eq(users.email, email.toLowerCase()), eq(users.status, 'pending')),
  });

  if (!user) return; // no pending invite — caller decides what to do

  // Auto-expire if past deadline
  if (user.inviteExpiresAt && user.inviteExpiresAt < new Date()) {
    await db
      .update(users)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return;
  }

  await db
    .update(users)
    .set({
      status: 'active',
      inviteToken: null,
      inviteExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
}

export async function getPendingInviteByEmail(email: string): Promise<User | null> {
  return (
    (await db.query.users.findFirst({
      where: and(
        eq(users.email, email.toLowerCase()),
        eq(users.status, 'pending')
      ),
    })) ?? null
  );
}
