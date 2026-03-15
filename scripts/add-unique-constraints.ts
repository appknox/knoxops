import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = postgres(process.env.DATABASE_URL);

async function addUniqueConstraints() {
  console.log('Adding unique constraints to contact fields...\n');

  try {
    // Create unique indexes for contactEmail and contactPhone
    // Using partial indexes to allow NULL values
    console.log('Creating unique index for contact_email...');
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS onprem_contact_email_unique
      ON onprem_deployments (contact_email)
      WHERE contact_email IS NOT NULL;
    `;

    console.log('Creating unique index for contact_phone...');
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS onprem_contact_phone_unique
      ON onprem_deployments (contact_phone)
      WHERE contact_phone IS NOT NULL;
    `;

    console.log('\n✓ Unique constraints added successfully!');
    console.log('  - contact_email: unique (allows NULL)');
    console.log('  - contact_phone: unique (allows NULL)');
  } catch (error) {
    console.error('Failed to add constraints:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

addUniqueConstraints();
