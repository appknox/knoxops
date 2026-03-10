-- Add SSL certificate file field and remove boolean flag
ALTER TABLE "onprem_deployments" ADD COLUMN "ssl_certificate_file_url" text;
ALTER TABLE "onprem_deployments" DROP COLUMN "ssl_provided";
