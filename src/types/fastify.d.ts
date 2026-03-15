import { User } from '../db/schema/index.js';
import { AppAbility } from '../lib/abilities.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
    ability?: AppAbility;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      email: string;
      role: string;
    };
    user: {
      userId: string;
      email: string;
      role: string;
    };
  }
}
