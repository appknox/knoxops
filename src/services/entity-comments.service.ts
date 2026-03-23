import { db } from '../db/index.js';
import { entityComments, users, EntityComment, CommentEntityType, NewEntityComment } from '../db/schema/index.js';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface EntityCommentWithUser extends EntityComment {
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  updatedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export async function getComments(
  entityType: CommentEntityType,
  entityId: string,
  limit: number = 50,
  offset: number = 0
): Promise<EntityCommentWithUser[]> {
  const results = await db
    .select({
      comment: entityComments,
      createdByUser: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
      updatedByUser: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(entityComments)
    .where(
      and(
        eq(entityComments.entityType, entityType),
        eq(entityComments.entityId, entityId),
        eq(entityComments.isDeleted, false)
      )
    )
    .leftJoin(users, eq(entityComments.createdBy, users.id))
    .orderBy(desc(entityComments.createdAt))
    .limit(limit)
    .offset(offset);

  return results.map(({ comment, createdByUser }) => ({
    ...comment,
    createdBy: createdByUser || null,
  })) as EntityCommentWithUser[];
}

export async function countComments(entityType: CommentEntityType, entityId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(entityComments)
    .where(
      and(
        eq(entityComments.entityType, entityType),
        eq(entityComments.entityId, entityId),
        eq(entityComments.isDeleted, false)
      )
    );

  return result?.count || 0;
}

export async function createComment(
  entityType: CommentEntityType,
  entityId: string,
  text: string,
  userId: string
): Promise<EntityComment> {
  const [comment] = await db
    .insert(entityComments)
    .values({
      entityType,
      entityId,
      text,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  return comment;
}

export async function updateComment(commentId: string, text: string, userId: string): Promise<EntityComment> {
  const [comment] = await db
    .update(entityComments)
    .set({
      text,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(entityComments.id, commentId))
    .returning();

  return comment;
}

export async function deleteComment(commentId: string): Promise<EntityComment> {
  const [comment] = await db
    .update(entityComments)
    .set({
      isDeleted: true,
      updatedAt: new Date(),
    })
    .where(eq(entityComments.id, commentId))
    .returning();

  return comment;
}

export async function getCommentById(commentId: string): Promise<EntityCommentWithUser | null> {
  const result = await db
    .select({
      comment: entityComments,
      createdByUser: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(entityComments)
    .leftJoin(users, eq(entityComments.createdBy, users.id))
    .where(eq(entityComments.id, commentId));

  if (result.length === 0) return null;

  const { comment, createdByUser } = result[0];
  return {
    ...comment,
    createdBy: createdByUser || null,
  } as EntityCommentWithUser;
}
