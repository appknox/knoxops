import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users, refreshTokens, passwordResetTokens, User } from '../../db/schema/index.js';
import { verifyPassword, hashPassword } from '../../lib/password.js';
import { generateRefreshToken, generateToken, getExpirationDate } from '../../lib/jwt.js';
import { env } from '../../config/env.js';
import { UnauthorizedError, BadRequestError } from '../../middleware/errorHandler.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
  return user ?? null;
}

export async function validateCredentials(
  email: string,
  password: string
): Promise<User> {
  const user = await findUserByEmail(email);

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.passwordHash) {
    throw new UnauthorizedError('Account not activated. Please check your email for the invite.');
  }

  if (user.status === 'pending') {
    throw new UnauthorizedError('Please accept your invitation first');
  }

  if (user.status === 'expired') {
    throw new UnauthorizedError('Your invitation has expired. Contact your administrator.');
  }

  if (user.status === 'deleted') {
    throw new UnauthorizedError('Account not found');
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  return user;
}

export async function createRefreshToken(userId: string): Promise<string> {
  const token = generateRefreshToken();
  const expiresAt = getExpirationDate(env.JWT_REFRESH_EXPIRES_IN);

  await db.insert(refreshTokens).values({
    userId,
    token,
    expiresAt,
  });

  return token;
}

export async function validateRefreshToken(token: string): Promise<User> {
  const refreshToken = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.token, token),
      isNull(refreshTokens.revokedAt),
      gt(refreshTokens.expiresAt, new Date())
    ),
  });

  if (!refreshToken) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, refreshToken.userId),
  });

  if (!user || user.status !== 'active') {
    throw new UnauthorizedError('User not found or deactivated');
  }

  return user;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.token, token));
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export async function updateLastLogin(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, userId));
}

// Password Reset Functions
const PASSWORD_RESET_EXPIRY = '1h';

export async function createPasswordResetToken(userId: string): Promise<string> {
  // Invalidate any existing pending tokens for this user
  await db
    .update(passwordResetTokens)
    .set({ status: 'expired' })
    .where(
      and(
        eq(passwordResetTokens.userId, userId),
        eq(passwordResetTokens.status, 'pending')
      )
    );

  const token = generateToken(32);
  const expiresAt = getExpirationDate(PASSWORD_RESET_EXPIRY);

  await db.insert(passwordResetTokens).values({
    userId,
    token,
    expiresAt,
  });

  return token;
}

export async function validatePasswordResetToken(token: string): Promise<User> {
  const resetToken = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.token, token),
      eq(passwordResetTokens.status, 'pending'),
      gt(passwordResetTokens.expiresAt, new Date())
    ),
  });

  if (!resetToken) {
    throw new BadRequestError('Invalid or expired password reset token');
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, resetToken.userId),
  });

  if (!user || user.status !== 'active') {
    throw new BadRequestError('User not found or deactivated');
  }

  return user;
}

export async function resetPassword(token: string, newPassword: string): Promise<User> {
  const user = await validatePasswordResetToken(token);

  const passwordHash = await hashPassword(newPassword);

  // Update user's password
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  // Mark token as used
  await db
    .update(passwordResetTokens)
    .set({ status: 'used', usedAt: new Date() })
    .where(eq(passwordResetTokens.token, token));

  // Revoke all existing refresh tokens (force re-login on all devices)
  await revokeAllUserTokens(user.id);

  return user;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<User> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new BadRequestError('User not found');
  }

  if (!user.passwordHash) {
    throw new BadRequestError('Account not activated');
  }

  // Verify current password
  const isValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    throw new BadRequestError('Current password is incorrect');
  }

  // Hash new password
  const passwordHash = await hashPassword(newPassword);

  // Update password
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return user;
}

// OIDC Functions

export function getOidcAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: env.OIDC_CLIENT_ID!,
    redirect_uri: env.OIDC_CALLBACK_URL!,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeOidcCode(code: string): Promise<{ email: string; name: string }> {
  // POST to https://oauth2.googleapis.com/token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.OIDC_CLIENT_ID!,
      client_secret: env.OIDC_CLIENT_SECRET!,
      redirect_uri: env.OIDC_CALLBACK_URL!,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!tokenRes.ok) {
    throw new Error('Failed to exchange OIDC code');
  }

  const tokenData = await tokenRes.json() as { id_token?: string };
  const idToken: string = tokenData.id_token ?? '';

  // Decode JWT payload (no signature verification needed — Google's token endpoint is trusted)
  const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  if (!payload.email || !payload.email_verified) {
    throw new Error('OIDC: email not present or not verified');
  }

  return {
    email: payload.email,
    name: payload.name ?? payload.email,
  };
}

export async function validateOidcUser(email: string): Promise<User> {
  let user = await findUserByEmail(email);

  if (!user) {
    // Check for pending invite — auto-accept on first SSO login
    // Import needed: acceptInviteViaSso, getPendingInviteByEmail from invites.service
    // This will be set up properly in the import section below
    throw new UnauthorizedError('No account found for this Google email. Contact your administrator.');
  }

  if (user.status !== 'active') {
    throw new UnauthorizedError('Account is deactivated');
  }

  return user;
}
