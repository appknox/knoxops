import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL || 'postgres://admin:admin123@localhost:5432/knoxadmin';
const sql = postgres(connectionString);

async function applyMigration() {
  try {
    console.log('Connecting to database...');

    await sql`ALTER TABLE devices ADD COLUMN IF NOT EXISTS condition VARCHAR(50)`;
    console.log('✓ Added condition column to devices');

    await sql`ALTER TABLE devices ADD COLUMN IF NOT EXISTS condition_notes TEXT`;
    console.log('✓ Added condition_notes column to devices');

    await sql`ALTER TABLE devices ADD COLUMN IF NOT EXISTS asking_price NUMERIC(10, 2)`;
    console.log('✓ Added asking_price column to devices');

    console.log('\n✅ Migration 0021 applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', (error as Error).message);
    process.exit(1);
  }
}

applyMigration();
