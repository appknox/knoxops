import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = postgres(process.env.DATABASE_URL);

async function updateAdminEmail() {
  console.log('Updating admin email...');

  try {
    // Update the admin user email
    const result = await sql`
      UPDATE users
      SET email = 'ginil@appknox.com',
          first_name = 'Ginil',
          last_name = 'Appknox'
      WHERE email = 'admin@knoxadmin.local'
      RETURNING email, first_name, last_name, role;
    `;

    if (result.length > 0) {
      console.log('✓ Admin user updated successfully!');
      console.log('  Email:', result[0].email);
      console.log('  Name:', result[0].first_name, result[0].last_name);
      console.log('  Role:', result[0].role);
      console.log('  Password: admin123 (unchanged)');
    } else {
      console.log('ℹ No user found with email admin@knoxadmin.local');
      console.log('  The user may already be updated or does not exist.');
    }
  } catch (error) {
    console.error('Update failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

updateAdminEmail();
