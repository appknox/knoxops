ALTER TABLE "onprem_deployments" ADD COLUMN "is_deleted" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "is_deleted" boolean DEFAULT false;
--> statement-breakpoint
CREATE INDEX "onprem_deployments_is_deleted_idx" ON "onprem_deployments" USING btree ("is_deleted");
--> statement-breakpoint
CREATE INDEX "devices_is_deleted_idx" ON "devices" USING btree ("is_deleted");
