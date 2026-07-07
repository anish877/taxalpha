/**
 * Create or promote an admin user.
 *   tsx src/scripts/create-admin.ts <email> <password> [name]
 * If the user exists, it is promoted to admin (and the password is updated).
 */
import bcrypt from 'bcryptjs';

import { prisma } from '../lib/prisma.js';

async function main(): Promise<void> {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: tsx src/scripts/create-admin.ts <email> <password> [name]');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { isAdmin: true, passwordHash },
    create: { email, passwordHash, name: name ?? 'Admin', isAdmin: true },
    select: { id: true, email: true, isAdmin: true }
  });
  console.log('Admin ready:', user);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
