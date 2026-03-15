import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = postgres(process.env.DATABASE_URL);

async function checkInfrastructure() {
  console.log('Checking infrastructure data...\n');

  try {
    // Check column type
    const columnInfo = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'onprem_deployments'
      AND column_name = 'infrastructure';
    `;

    console.log('Column info:', columnInfo);
    console.log('');

    // Check actual data
    const deployments = await sql`
      SELECT id, client_name, infrastructure
      FROM onprem_deployments
      LIMIT 5;
    `;

    console.log('Deployments:');
    deployments.forEach((d) => {
      console.log(`\nID: ${d.id}`);
      console.log(`Client: ${d.client_name}`);
      console.log(`Infrastructure:`, JSON.stringify(d.infrastructure, null, 2));
    });
  } catch (error) {
    console.error('Check failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

checkInfrastructure();
