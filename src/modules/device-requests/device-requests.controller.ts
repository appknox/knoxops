import { FastifyRequest, FastifyReply } from 'fastify';
import {
  createRequest,
  listRequests,
  getRequest,
  approveRequest,
  rejectRequest,
  completeRequest,
  CreateDeviceRequestInput,
} from './device-requests.service.js';
import { User } from '../../db/schema/index.js';

export async function create(
  request: FastifyRequest<{ Body: CreateDeviceRequestInput }>,
  reply: FastifyReply
) {
  const user = request.user as User;
  const input = request.body;

  const result = await createRequest(input, user.id);
  return reply.status(201).send(result);
}

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as User;
  const query = request.query as { page?: string; limit?: string };
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));
  const result = await listRequests(user.id, user.role);
  return reply.send({
    data: result.requests,
    pagination: {
      page,
      limit,
      total: result.total,
    },
  });
}

export async function getById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = request.user as User;
  const { id } = request.params;

  try {
    const result = await getRequest(id, user.id, user.role);
    if (!result) {
      return reply.status(404).send({ message: 'Request not found' });
    }
    return reply.send(result);
  } catch (error) {
    if ((error as Error).message === 'Forbidden') {
      return reply.status(403).send({ message: 'You do not have access to this request' });
    }
    throw error;
  }
}

export async function approve(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = request.user as User;
  const { id } = request.params;

  try {
    const result = await approveRequest(id, user.id);
    return reply.send(result);
  } catch (error) {
    return reply.status(400).send({ message: (error as Error).message });
  }
}

export async function reject(
  request: FastifyRequest<{ Params: { id: string }; Body: { reason: string } }>,
  reply: FastifyReply
) {
  const user = request.user as User;
  const { id } = request.params;
  const { reason } = request.body;

  if (!reason || !reason.trim()) {
    return reply.status(400).send({ message: 'Rejection reason is required' });
  }

  try {
    const result = await rejectRequest(id, user.id, reason);
    return reply.send(result);
  } catch (error) {
    return reply.status(400).send({ message: (error as Error).message });
  }
}

export async function complete(
  request: FastifyRequest<{ Params: { id: string }; Body: { linkedDeviceId?: string } }>,
  reply: FastifyReply
) {
  const user = request.user as User;
  const { id } = request.params;
  const { linkedDeviceId } = request.body;

  try {
    const result = await completeRequest(id, user.id, linkedDeviceId);
    return reply.send(result);
  } catch (error) {
    return reply.status(400).send({ message: (error as Error).message });
  }
}
