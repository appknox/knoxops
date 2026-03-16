DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_category') THEN
    CREATE TYPE "document_category" AS ENUM ('rfp', 'other');
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onprem_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deployment_id" uuid NOT NULL REFERENCES "onprem_deployments"("id") ON DELETE CASCADE,
  "category" "document_category" NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "file_url" text NOT NULL,
  "mime_type" varchar(255),
  "file_size" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);
