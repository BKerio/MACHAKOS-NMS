import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma.js';

/**
 * One-off data backfill: InventoryItem.itemType defaults to 'MEDICAL', which
 * is wrong for the ~31 real vehicle-inspection rows (tires, wheel spanner,
 * battery, etc. - the "Vehicle" section of the ALS Ambulance Monthly
 * Checklist, see prisma/seed.ts). Every one of those rows was seeded with
 * `unit: 'check'`, and no medical item uses that unit (they use each/box/
 * pack/pair/litre) - a reliable, already-present discriminator, so this
 * needs no fragile name matching.
 *
 * Usage:
 *   npx tsx scripts/backfill-vehicle-item-type.ts          (dry run - shows count only)
 *   npx tsx scripts/backfill-vehicle-item-type.ts --yes     (actually update)
 */
const prisma = createPrismaClient();
const CONFIRM = process.argv.includes('--yes');

async function main() {
  const count = await prisma.inventoryItem.count({ where: { unit: 'check' } });
  console.log(`Items with unit='check' currently itemType!='VEHICLE': checking...`);
  const toUpdate = await prisma.inventoryItem.count({ where: { unit: 'check', itemType: { not: 'VEHICLE' } } });
  console.log(`Total unit='check' items: ${count}`);
  console.log(`Needing itemType -> VEHICLE: ${toUpdate}`);

  if (!CONFIRM) {
    console.log('\nDRY RUN - nothing changed. Re-run with --yes to apply.');
    return;
  }

  const result = await prisma.inventoryItem.updateMany({
    where: { unit: 'check' },
    data: { itemType: 'VEHICLE' },
  });
  console.log(`\n✅ Updated ${result.count} item(s) to itemType='VEHICLE'.`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
