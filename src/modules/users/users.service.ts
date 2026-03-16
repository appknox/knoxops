import { eq, and, or, ilike, sql, desc, asc, ne, lt } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users, User, Role } from '../../db/schema/index.js';
import { NotFoundError, BadRequestError } from '../../middleware/errorHandler.js';
import { env } from '../../config/env.js';
import { UpdateUserInput, ListUsersQuery } from './users.schema.js';

export interface UserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: 'pending' | 'active' | 'expired' | 'deleted';
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedUsers {
  data: UserListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function listUsers(query: ListUsersQuery): Promise<PaginatedUsers> {
  const { page, limit, search, role, status, sortBy, sortOrder } = query;
  const offset = (page - 1) * limit;

  // Auto-expire pending users past their deadline
  await db
    .update(users)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(and(eq(users.status, 'pending'), lt(users.inviteExpiresAt, new Date())));

  // Build filter conditions
  const userConditions = [ne(users.status, 'deleted')];
  if (search) {
    userConditions.push(
      or(
        ilike(users.email, `%${search}%`),
        ilike(users.firstName, `%${search}%`),
        ilike(users.lastName, `%${search}%`)
      )
    );
  }
  if (role) {
    userConditions.push(eq(users.role, role));
  }
  if (status !== undefined) {
    userConditions.push(eq(users.status, status));
  }

  const userWhereClause = userConditions.length > 0 ? and(...userConditions) : undefined;

  // Query all users from users table (single query)
  const usersData = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(userWhereClause);

  const allData: UserListItem[] = usersData as UserListItem[];

  // Sort data
  const sortFn = (a: UserListItem, b: UserListItem) => {
    let aVal: string | Date | null;
    let bVal: string | Date | null;

    switch (sortBy) {
      case 'email':
        aVal = a.email;
        bVal = b.email;
        break;
      case 'firstName':
        aVal = a.firstName;
        bVal = b.firstName;
        break;
      case 'lastName':
        aVal = a.lastName;
        bVal = b.lastName;
        break;
      case 'lastLoginAt':
        aVal = a.lastLoginAt;
        bVal = b.lastLoginAt;
        break;
      case 'createdAt':
      default:
        aVal = a.createdAt;
        bVal = b.createdAt;
    }

    if (aVal === null) return sortOrder === 'asc' ? 1 : -1;
    if (bVal === null) return sortOrder === 'asc' ? -1 : 1;

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  };

  allData.sort(sortFn);

  // Apply pagination
  const total = allData.length;
  const paginatedData = allData.slice(offset, offset + limit);

  return {
    data: paginatedData,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getUserById(id: string): Promise<Omit<User, 'passwordHash'>> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: {
      passwordHash: false,
    },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return user as Omit<User, 'passwordHash'>;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  updatedBy: string
): Promise<{ before: Omit<User, 'passwordHash'>; after: Omit<User, 'passwordHash'> }> {
  const before = await getUserById(id);

  // Prevent changing own role
  if (id === updatedBy && input.role && input.role !== before.role) {
    throw new BadRequestError('You cannot change your own role');
  }

  const [updated] = await db
    .update(users)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });

  return {
    before,
    after: updated as Omit<User, 'passwordHash'>,
  };
}

export async function deleteUser(
  id: string,
  deletedBy: string
): Promise<Omit<User, 'passwordHash'>> {
  // Prevent self-deletion
  if (id === deletedBy) {
    throw new BadRequestError('You cannot delete your own account');
  }

  const user = await getUserById(id);

  if (user.status === 'deleted') {
    throw new BadRequestError('User is already deleted');
  }

  const [updated] = await db
    .update(users)
    .set({
      status: 'deleted',
      inviteToken: null,
      inviteExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });

  return updated as Omit<User, 'passwordHash'>;
}
