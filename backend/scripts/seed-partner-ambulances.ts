import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma.js';

/**
 * Seeds the no-tracker ambulances (reference vehicle info only) into
 * partner_ambulances. These have no GPS trackers, so they are stored as
 * reference capacity for dispatchers rather than live-tracked vehicles.
 *
 * County / EOC-owned units have no partner agency (agencyId = null).
 *
 * Idempotent: skips any registration that already exists, so re-running is safe.
 *
 * Usage:
 *   npx tsx scripts/seed-partner-ambulances.ts          (dry run - shows what would be added)
 *   npx tsx scripts/seed-partner-ambulances.ts --yes     (actually insert)
 */
const prisma = createPrismaClient();
const CONFIRM = process.argv.includes('--yes');

// Registered plates - county / EOC-owned, no GPS tracker.
const PLATES = [
  'GKB 644W',
  'GKB 645W',
  'GKB 466 M',
  '47CG 036A',
  'GKB 657W',
  'GKB 847V',
  'GKB 654W',
  '47CG 200A',
  'GKB 850V',
  'GKB 849V',
  'GKB 848V',
  'GKB 081T',
  '47CG 091A',
  'GKB 656W',
  'KBZ 232B',
  'GKB 663W',
  'GKB 662W',
  '47CG 065A',
];

// Named units without a plate on the on-duty list.
const NAMED = [
  { registrationNumber: 'Rescue Ambulance', notes: 'On-duty rescue ambulance (no plate on roster, no tracker).' },
  { registrationNumber: 'Fire Ambulance', notes: 'On-duty fire ambulance (no plate on roster, no tracker).' },
  { registrationNumber: 'St John Ambulance', notes: 'St John Ambulance unit (no plate on roster, no tracker).' },
  { registrationNumber: 'Red Cross Ambulance', notes: 'Kenya Red Cross ambulance unit (no plate on roster, no tracker).' },
];

async function main() {
  const rows = [
    ...PLATES.map((registrationNumber) => ({
      registrationNumber,
      notes: 'County / EOC ambulance on duty (no GPS tracker).',
    })),
    ...NAMED,
  ];

  const existing = new Set(
    (await prisma.partnerAmbulance.findMany({ select: { registrationNumber: true } }))
      .map((r) => r.registrationNumber.trim().toUpperCase())
  );

  const toAdd = rows.filter((r) => !existing.has(r.registrationNumber.trim().toUpperCase()));
  const skipped = rows.length - toAdd.length;

  console.log(`Roster: ${rows.length} ambulances (${PLATES.length} plated + ${NAMED.length} named)`);
  console.log(`Already present: ${skipped}`);
  console.log(`Will add: ${toAdd.length}`);
  for (const r of toAdd) console.log(`  + ${r.registrationNumber}`);

  if (!CONFIRM) {
    console.log('\nDRY RUN - nothing changed. Re-run with --yes to insert.');
    return;
  }

  if (toAdd.length === 0) {
    console.log('\nNothing to add - all ambulances already present.');
    return;
  }

  await prisma.partnerAmbulance.createMany({
    data: toAdd.map((r) => ({ agencyId: null, ...r })),
  });

  const total = await prisma.partnerAmbulance.count();
  console.log(`\n✅ Added ${toAdd.length}. Partner ambulances now: ${total}`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
