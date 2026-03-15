-- Create onprem_comments table for tracking CSM notes and client call comments
CREATE TABLE IF NOT EXISTS "onprem_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"comment" text NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onprem_comments" ADD CONSTRAINT "onprem_comments_deployment_id_onprem_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."onprem_deployments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onprem_comments" ADD CONSTRAINT "onprem_comments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onprem_comments" ADD CONSTRAINT "onprem_comments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onprem_comments_deployment_id_idx" ON "onprem_comments" USING btree ("deployment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onprem_comments_deployment_created_idx" ON "onprem_comments" USING btree ("deployment_id","created_at" DESC);
