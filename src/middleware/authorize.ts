import { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from './errorHandler.js';
import { AppAbility } from '../lib/abilities.js';

type Actions = 'manage' | 'create' | 'read' | 'update' | 'delete';
type Subjects = 'Device' | 'OnPrem' | 'User' | 'AuditLog' | 'Invite' | 'all';

export function authorize(action: Actions, subject: Subjects) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const ability = request.ability as AppAbility;

    if (!ability) {
      throw new ForbiddenError('No permissions defined');
    }

    if (!ability.can(action, subject)) {
      throw new ForbiddenError(`You do not have permission to ${action} ${subject}`);
    }
  };
}

export function authorizeAdmin() {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = request.user;

    if (!user || user.role !== 'admin') {
      throw new ForbiddenError('Admin access required');
    }
  };
}
