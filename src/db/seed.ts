import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { users } from './schema/index.js';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const queryClient = postgres(DATABASE_URL);
const db = drizzle(queryClient);

async function seed() {
  console.log('Seeding database...');

  // Create admin user
  const adminPassword = 'admin123'; // Change in production!
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const existingAdmin = await db
    .select()
    .from(users)
    .where(eq(users.email, 'ginil@appknox.com'))
    .limit(1);

  if (existingAdmin.length === 0) {
    await db.insert(users).values({
      email: 'ginil@appknox.com',
      passwordHash,
      firstName: 'Ginil',
      lastName: 'Appknox',
      role: 'admin',
      isActive: true,
      inviteStatus: 'accepted',
    });
    console.log('Admin user created:');
    console.log('  Email: ginil@appknox.com');
    console.log('  Password: admin123');
  } else {
    console.log('Admin user already exists');
  }

  console.log('Seeding complete!');
  await queryClient.end();
  process.exit(0);
}

seed().catch(async (error) => {
  console.error('Seeding failed:', error);
  await queryClient.end();
  process.exit(1);
});
