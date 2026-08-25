import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma.js';

/**
 * Counterpart to deactivate-all-vehicles.ts - brings every deactivated
 * vehicle back into the active fleet (isActive=true).
 */
const prisma = createPrismaClient();

async function main() {
  const before = await prisma.vehicle.findMany({
    where: { isActive: false },
    select: { registrationNumber: true },
  });

  if (before.length === 0) {
    console.log('No deactivated vehicles to reactivate.');
    return;
  }

  const { count } = await prisma.vehicle.updateMany({
    where: { isActive: false },
    data: { isActive: true },
  });

  console.log(`✅ Reactivated ${count} vehicle(s): ${before.map((v) => v.registrationNumber).join(', ')}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
