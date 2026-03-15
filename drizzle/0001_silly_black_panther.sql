ALTER TABLE "onprem_deployments" DROP COLUMN "cpu_cores";--> statement-breakpoint
ALTER TABLE "onprem_deployments" DROP COLUMN "ram_gb";--> statement-breakpoint
ALTER TABLE "onprem_deployments" DROP COLUMN "storage_gb";--> statement-breakpoint
ALTER TABLE "onprem_deployments" DROP COLUMN "deployment_size";--> statement-breakpoint
ALTER TABLE "onprem_deployments" DROP COLUMN "network_readiness";--> statement-breakpoint
DROP TYPE "public"."deployment_size";--> statement-breakpoint
DROP TYPE "public"."lan_speed";--> statement-breakpoint
DROP TYPE "public"."wifi_standard";