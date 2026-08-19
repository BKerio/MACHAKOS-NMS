import 'dotenv/config';
import { Role } from '../src/generated/prisma/index.js';
import { createPrismaClient } from '../src/lib/prisma.js';
import bcrypt from 'bcrypt';

const prisma = createPrismaClient();

async function main() {
  const agency = await prisma.agency.findFirst({
    where: { type: 'INTERNAL' },
  });

  if (!agency) {
    throw new Error('No internal agency found. Run the seed first.');
  }

  const passwordHash = await bcrypt.hash('qwerty', 10);

  const user = await prisma.user.upsert({
    where: { email: 'briankerio47@gmail.com' },
    update: { passwordHash, role: Role.SUPER_ADMIN, isActive: true },
    create: {
      email: 'briankerio47@gmail.com',
      passwordHash,
      name: 'Brian Kerio',
      role: Role.SUPER_ADMIN,
      agencyId: agency.id,
      isActive: true,
    },
  });

  console.log(`✅ User created: ${user.email} (${user.role})`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
