import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = postgres(process.env.DATABASE_URL);

async function migrateInfrastructure() {
  console.log('Starting infrastructure migration...');

  try {
    // Drop the old columns
    console.log('Dropping old columns...');
    await sql`ALTER TABLE onprem_deployments DROP COLUMN IF EXISTS cpu_cores`;
    await sql`ALTER TABLE onprem_deployments DROP COLUMN IF EXISTS ram_gb`;
    await sql`ALTER TABLE onprem_deployments DROP COLUMN IF EXISTS storage_gb`;
    await sql`ALTER TABLE onprem_deployments DROP COLUMN IF EXISTS deployment_size`;
    await sql`ALTER TABLE onprem_deployments DROP COLUMN IF EXISTS network_readiness`;

    // Drop the old enums
    console.log('Dropping old enums...');
    await sql`DROP TYPE IF EXISTS deployment_size`;
    await sql`DROP TYPE IF EXISTS lan_speed`;
    await sql`DROP TYPE IF EXISTS wifi_standard`;

    console.log('✓ Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

migrateInfrastructure();
