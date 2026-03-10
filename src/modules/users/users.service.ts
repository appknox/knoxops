import { eq, and, or, ilike, sql, desc, asc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users, userInvites, User, Role } from '../../db/schema/index.js';
import { NotFoundError, BadRequestError } from '../../middleware/errorHandler.js';
import { UpdateUserInput, ListUsersQuery } from './users.schema.js';

export interface UserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  inviteStatus: 'pending' | 'accepted' | 'expired';
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
  const { page, limit, search, role, isActive, sortBy, sortOrder } = query;
  const offset = (page - 1) * limit;

  // Get accepted users from users table
  const userConditions = [];
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
  if (isActive !== undefined) {
    userConditions.push(eq(users.isActive, isActive));
  }
  const userWhereClause = userConditions.length > 0 ? and(...userConditions) : undefined;

  // Get pending invites from user_invites table
  const inviteConditions = [eq(userInvites.status, 'pending')];
  if (search) {
    inviteConditions.push(
      or(
        ilike(userInvites.email, `%${search}%`),
        ilike(userInvites.firstName, `%${search}%`),
        ilike(userInvites.lastName, `%${search}%`)
      )!
    );
  }
  if (role) {
    inviteConditions.push(eq(userInvites.role, role));
  }
  // If filtering by isActive, don't include pending invites (they're not active yet)
  const includePendingInvites = isActive === undefined || isActive === true;

  const [usersData, invitesData] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        isActive: users.isActive,
        inviteStatus: users.inviteStatus,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(userWhereClause),
    includePendingInvites
      ? db
          .select({
            id: userInvites.id,
            email: userInvites.email,
            firstName: userInvites.firstName,
            lastName: userInvites.lastName,
            role: userInvites.role,
            createdAt: userInvites.createdAt,
            updatedAt: userInvites.updatedAt,
          })
          .from(userInvites)
          .where(and(...inviteConditions))
      : Promise.resolve([]),
  ]);

  // Transform invites to match user format
  const pendingInvites: UserListItem[] = invitesData.map((invite) => ({
    id: invite.id,
    email: invite.email,
    firstName: invite.firstName,
    lastName: invite.lastName,
    role: invite.role,
    isActive: false,
    inviteStatus: 'pending' as const,
    lastLoginAt: null,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
  }));

  // Combine users and pending invites
  const allData: UserListItem[] = [...(usersData as UserListItem[]), ...pendingInvites];

  // Sort combined data
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

  // Prevent self-deactivation
  if (id === updatedBy && input.isActive === false) {
    throw new BadRequestError('You cannot deactivate your own account');
  }

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
      isActive: users.isActive,
      inviteStatus: users.inviteStatus,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });

  return {
    before,
    after: updated as Omit<User, 'passwordHash'>,
  };
}

export async function deactivateUser(
  id: string,
  deactivatedBy: string
): Promise<Omit<User, 'passwordHash'>> {
  // Prevent self-deactivation
  if (id === deactivatedBy) {
    throw new BadRequestError('You cannot deactivate your own account');
  }

  const user = await getUserById(id);

  if (!user.isActive) {
    throw new BadRequestError('User is already deactivated');
  }

  const [updated] = await db
    .update(users)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      isActive: users.isActive,
      inviteStatus: users.inviteStatus,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });

  return updated as Omit<User, 'passwordHash'>;
}
