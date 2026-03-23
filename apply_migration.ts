import postgres from 'postgres';

const sql = postgres('postgres://admin:admin123@localhost:5432/knoxadmin');

async function applyMigration() {
  try {
    console.log('Connecting to database...');
    
    // Add is_deleted column to onprem_deployments if it doesn't exist
    await sql`
      ALTER TABLE "onprem_deployments" ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false
    `;
    console.log('✓ Added is_deleted column to onprem_deployments');

    // Add is_deleted column to devices if it doesn't exist
    await sql`
      ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false
    `;
    console.log('✓ Added is_deleted column to devices');

    // Create indexes
    await sql`
      CREATE INDEX IF NOT EXISTS "onprem_deployments_is_deleted_idx" ON "onprem_deployments" USING btree ("is_deleted")
    `;
    console.log('✓ Created index on onprem_deployments.is_deleted');

    await sql`
      CREATE INDEX IF NOT EXISTS "devices_is_deleted_idx" ON "devices" USING btree ("is_deleted")
    `;
    console.log('✓ Created index on devices.is_deleted');

    console.log('\n✅ Schema migration applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

applyMigration();
