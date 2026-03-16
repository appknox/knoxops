import { FastifyRequest, FastifyReply } from 'fastify';
import {
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  LoginInput,
  RefreshTokenInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from './auth.schema.js';
import {
  validateCredentials,
  createRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  updateLastLogin,
  findUserByEmail,
  createPasswordResetToken,
  validatePasswordResetToken,
  resetPassword,
  changePassword,
  getOidcAuthUrl,
  exchangeOidcCode,
  validateOidcUser,
} from './auth.service.js';
import { createAuditLog } from '../../services/audit-log.service.js';
import { sendPasswordResetEmail } from '../../services/email.service.js';
import { User } from '../../db/schema/index.js';
import { env } from '../../config/env.js';

export async function login(
  request: FastifyRequest<{ Body: LoginInput }>,
  reply: FastifyReply
) {
  const input = loginSchema.parse(request.body);
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  try {
    const user = await validateCredentials(input.email, input.password);

    // Generate tokens
    const accessToken = request.server.jwt.sign({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = await createRefreshToken(user.id);

    // Update last login
    await updateLastLogin(user.id);

    // Log successful login
    await createAuditLog({
      userId: user.id,
      module: 'auth',
      action: 'login',
      entityType: 'user',
      entityId: user.id,
      entityName: `${user.firstName} ${user.lastName}`,
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    });

    return reply.send({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    // Log failed login attempt
    await createAuditLog({
      module: 'auth',
      action: 'login_failed',
      metadata: { email: input.email, reason: (error as Error).message },
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    });

    throw error;
  }
}

export async function refresh(
  request: FastifyRequest<{ Body: RefreshTokenInput }>,
  reply: FastifyReply
) {
  const { refreshToken } = refreshTokenSchema.parse(request.body);

  const user = await validateRefreshToken(refreshToken);

  // Revoke old refresh token
  await revokeRefreshToken(refreshToken);

  // Generate new tokens
  const accessToken = request.server.jwt.sign({
    userId: user.id,
    email: user.email,
    role: user.role,
  });
  const newRefreshToken = await createRefreshToken(user.id);

  return reply.send({
    accessToken,
    refreshToken: newRefreshToken,
  });
}

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as User;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  // Log logout
  await createAuditLog({
    userId: user.id,
    module: 'auth',
    action: 'logout',
    entityType: 'user',
    entityId: user.id,
    entityName: `${user.firstName} ${user.lastName}`,
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  return reply.send({ message: 'Logged out successfully' });
}

export async function me(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as User;

  return reply.send({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  });
}

export async function forgotPassword(
  request: FastifyRequest<{ Body: ForgotPasswordInput }>,
  reply: FastifyReply
) {
  const { email } = forgotPasswordSchema.parse(request.body);
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  // Find user by email
  const user = await findUserByEmail(email);

  // Only proceed if user exists, is active, and has accepted invite
  if (user && user.isActive && user.inviteStatus === 'accepted') {
    const token = await createPasswordResetToken(user.id);
    await sendPasswordResetEmail(email, token, `${user.firstName} ${user.lastName}`);

    // Log password reset request
    await createAuditLog({
      userId: user.id,
      module: 'auth',
      action: 'password_reset_requested',
      entityType: 'user',
      entityId: user.id,
      entityName: `${user.firstName} ${user.lastName}`,
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    });
  }

  // Always return success to prevent email enumeration
  return reply.send({
    message: 'If an account with that email exists, a password reset link has been sent.',
  });
}

export async function validateResetToken(
  request: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply
) {
  const { token } = request.params;

  const user = await validatePasswordResetToken(token);

  return reply.send({
    valid: true,
    email: user.email,
  });
}

export async function resetPasswordHandler(
  request: FastifyRequest<{ Params: { token: string }; Body: ResetPasswordInput }>,
  reply: FastifyReply
) {
  const { token } = request.params;
  const { password } = resetPasswordSchema.parse(request.body);
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  const user = await resetPassword(token, password);

  // Log password reset
  await createAuditLog({
    userId: user.id,
    module: 'auth',
    action: 'password_reset',
    entityType: 'user',
    entityId: user.id,
    entityName: `${user.firstName} ${user.lastName}`,
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  return reply.send({
    message: 'Password reset successfully. You can now log in with your new password.',
  });
}

export async function changePasswordHandler(
  request: FastifyRequest<{ Body: ChangePasswordInput }>,
  reply: FastifyReply
) {
  const user = request.user as User;
  const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  await changePassword(user.id, currentPassword, newPassword);

  // Log password change
  await createAuditLog({
    userId: user.id,
    module: 'auth',
    action: 'password_changed',
    entityType: 'user',
    entityId: user.id,
    entityName: `${user.firstName} ${user.lastName}`,
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  return reply.send({
    message: 'Password changed successfully.',
  });
}

export async function oidcInitiate(_request: FastifyRequest, reply: FastifyReply) {
  const url = getOidcAuthUrl();
  return reply.redirect(url);
}

export async function oidcCallback(request: FastifyRequest, reply: FastifyReply) {
  const { code, error } = request.query as { code?: string; error?: string };
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'];

  if (error || !code) {
    // Google rejected or user cancelled — redirect to login with error flag
    return reply.redirect(`${env.FRONTEND_URL}/login?error=oidc_failed`);
  }

  try {
    const { email } = await exchangeOidcCode(code);
    const user = await validateOidcUser(email);

    // Generate tokens
    const accessToken = request.server.jwt.sign({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = await createRefreshToken(user.id);

    // Update last login
    await updateLastLogin(user.id);

    // Log successful OIDC login
    await createAuditLog({
      userId: user.id,
      module: 'auth',
      action: 'oidc_login',
      entityType: 'user',
      entityId: user.id,
      entityName: `${user.firstName} ${user.lastName}`,
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    });

    // Redirect to frontend AuthCallback with tokens in hash (same pattern as existing auth flow)
    const redirectUrl = `${env.FRONTEND_URL}/auth/callback#accessToken=${accessToken}&refreshToken=${refreshToken}`;
    return reply.redirect(redirectUrl);
  } catch (error) {
    // Log failed OIDC login
    await createAuditLog({
      module: 'auth',
      action: 'oidc_login_failed',
      metadata: { reason: (error as Error).message },
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    });

    return reply.redirect(`${env.FRONTEND_URL}/login?error=oidc_unauthorized`);
  }
}
