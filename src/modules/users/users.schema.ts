import { z } from 'zod';
import { roleEnum, userStatusEnum } from '../../db/schema/index.js';

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  role: z.enum(roleEnum.enumValues).optional(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  role: z.enum(roleEnum.enumValues).optional(),
  status: z.string().optional().transform(val => {
    if (!val) return [];
    return val.split(',').filter(s => s.length > 0);
  }).refine(
    val => {
      if (val.length === 0) return true;
      const validStatuses = userStatusEnum.enumValues;
      return val.every(s => validStatuses.includes(s as any));
    },
    { message: 'Invalid status value' }
  ),
  sortBy: z.enum(['email', 'firstName', 'lastName', 'createdAt', 'lastLoginAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
