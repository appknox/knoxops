import { z } from 'zod';
import { roleEnum } from '../../db/schema/index.js';

export const createInviteSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(roleEnum.enumValues),
});

export const acceptInviteSchema = z.object({
  password: z.string().min(8).max(100),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
