import { pgTable, uuid, text, timestamp, boolean, pgEnum, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const commentEntityTypeEnum = pgEnum('comment_entity_type', [
  'onprem_deployment',
  'device',
]);

export const entityComments = pgTable(
  'entity_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: commentEntityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    text: text('text').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    isDeleted: boolean('is_deleted').notNull().default(false),
  },
  (t) => [
    index('entity_comments_entity_idx').on(t.entityType, t.entityId),
    index('entity_comments_created_by_idx').on(t.createdBy),
  ]
);

export type EntityComment = typeof entityComments.$inferSelect;
export type NewEntityComment = typeof entityComments.$inferInsert;
export type CommentEntityType = (typeof commentEntityTypeEnum.enumValues)[number];
