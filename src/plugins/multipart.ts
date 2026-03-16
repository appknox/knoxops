import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';

export async function registerMultipart(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB max file size
      files: 20, // Max 20 files per request
    },
  });
}
