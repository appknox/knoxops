-- Create new unified comments table
CREATE TYPE "public"."comment_entity_type" AS ENUM('onprem_deployment', 'device');

CREATE TABLE "entity_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_type" "comment_entity_type" NOT NULL,
  "entity_id" uuid NOT NULL,
  "text" text NOT NULL,
  "created_by" uuid REFERENCES "users"("id"),
  "updated_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "is_deleted" boolean NOT NULL DEFAULT false
);

CREATE INDEX "entity_comments_entity_idx" ON "entity_comments" ("entity_type", "entity_id");
CREATE INDEX "entity_comments_created_by_idx" ON "entity_comments" ("created_by");

-- Migrate existing onprem_comments into entity_comments
INSERT INTO entity_comments (id, entity_type, entity_id, text, created_by, updated_by, created_at, updated_at, is_deleted)
SELECT id, 'onprem_deployment', deployment_id, comment, created_by, updated_by, created_at, updated_at, is_deleted
FROM onprem_comments;
