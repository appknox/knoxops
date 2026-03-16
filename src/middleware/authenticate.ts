import { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { UnauthorizedError } from './errorHandler.js';
import { defineAbilitiesFor } from '../lib/abilities.js';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();

    const { userId } = request.user;

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedError('User account is not active');
    }

    request.user = user as unknown as typeof request.user;
    request.ability = defineAbilitiesFor(user.role);
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export async function optionalAuthenticate(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify();

    const { userId } = request.user;

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (user && user.status === 'active') {
      request.user = user as unknown as typeof request.user;
      request.ability = defineAbilitiesFor(user.role);
    }
  } catch {
    // Optional auth - ignore errors
  }
}
