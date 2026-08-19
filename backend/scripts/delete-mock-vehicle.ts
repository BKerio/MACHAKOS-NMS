import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma.js';

const prisma = createPrismaClient();

async function main() {
  const vehicle = await prisma.vehicle.findUnique({
    where: { registrationNumber: 'KCX 123A' },
    include: { _count: { select: { tasks: true } } },
  });

  if (!vehicle) {
    console.log('KCX 123A not found - already deleted or never seeded.');
    return;
  }

  if (vehicle._count.tasks > 0) {
    console.error(`Cannot delete KCX 123A: it has ${vehicle._count.tasks} task(s) referencing it.`);
    console.error('Resolve or reassign those tasks first.');
    process.exit(1);
  }

  await prisma.vehicle.delete({ where: { registrationNumber: 'KCX 123A' } });
  console.log('✅ Deleted mock vehicle KCX 123A (IMEI: NMS-AMB-001)');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
