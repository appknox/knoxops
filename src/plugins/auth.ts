import { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import { env } from '../config/env.js';

export async function registerAuth(app: FastifyInstance) {
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    },
  });
}
