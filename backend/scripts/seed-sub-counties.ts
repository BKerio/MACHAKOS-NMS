import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma.js';

/**
 * Seeds Machakos County's 8 official sub-counties into the sub_counties
 * table. Upsert by name, so re-running is safe - it never touches existing
 * facility/incident rows, which store the sub-county as plain text.
 *
 * Usage: npx tsx scripts/seed-sub-counties.ts
 */
const prisma = createPrismaClient();

const SUB_COUNTIES = [
  'Machakos Town', 'Mavoko', 'Kathiani', 'Masinga',
  'Matungulu', 'Mwala', 'Yatta', 'Kangundo',
];

async function main() {
  for (const [i, name] of SUB_COUNTIES.entries()) {
    const row = await prisma.subCounty.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: i },
    });
    console.log(`✅ Sub-County: ${row.name}`);
  }
  console.log(`\n🎉 Done - ${SUB_COUNTIES.length} sub-counties seeded.`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
