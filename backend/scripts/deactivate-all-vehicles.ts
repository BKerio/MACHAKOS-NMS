import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma.js';

/**
 * Temporarily pulls every ambulance out of the active fleet (isActive=false)
 * without deleting anything - history, tasks, and GPS data stay intact.
 * Run reactivate-all-vehicles.ts to bring them all back later.
 */
const prisma = createPrismaClient();

async function main() {
  const before = await prisma.vehicle.findMany({
    where: { isActive: true },
    select: { registrationNumber: true },
  });

  if (before.length === 0) {
    console.log('No active vehicles to deactivate.');
    return;
  }

  const { count } = await prisma.vehicle.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  console.log(`✅ Deactivated ${count} vehicle(s): ${before.map((v) => v.registrationNumber).join(', ')}`);
  console.log('Run reactivate-all-vehicles.ts to bring them back.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
