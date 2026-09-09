import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma.js';

/**
 * One-off data repair: the ambulance-checklist seed (prisma/seed.ts) wrote
 * free-text category labels straight from ambulance_checklist.xlsx (Drugs,
 * General, Venipuncture, IV Fluids, Respiratory, Trauma, Obstetric/Other,
 * PPE, Emergency Equipment, Vehicle, plus mismatched-case Consumables/Airway)
 * instead of the app's real InventoryCategory enum (VITALS | CONSUMABLES |
 * MEDICATION | AIRWAY | WOUND_CARE | OTHER - see INVENTORY_CATEGORIES in
 * admin.routes.ts, enforced by zod on every admin create/edit). None of those
 * labels match what the operator/admin category filter chips check against,
 * so every category filter except "All" silently returned nothing.
 *
 * This ONLY updates the `category` column, matched by its current legacy
 * value - it never touches quantityStock/reorderLevel/notes/isActive, which
 * are live operational values crews change via check-out/return. (Re-running
 * the full seed script instead would reset those back to day-one defaults -
 * do not do that as a way to "fix" this.)
 *
 * Usage:
 *   npx tsx scripts/fix-inventory-categories.ts          (dry run - shows counts only)
 *   npx tsx scripts/fix-inventory-categories.ts --yes     (actually update)
 */
const prisma = createPrismaClient();
const CONFIRM = process.argv.includes('--yes');

const CATEGORY_MAP: Record<string, string> = {
  Drugs: 'MEDICATION',
  General: 'OTHER',
  Venipuncture: 'CONSUMABLES',
  'IV Fluids': 'CONSUMABLES',
  Consumables: 'CONSUMABLES',
  Airway: 'AIRWAY',
  Respiratory: 'AIRWAY',
  Trauma: 'WOUND_CARE',
  'Obstetric/Other': 'OTHER',
  PPE: 'OTHER',
  'Emergency Equipment': 'OTHER',
  Vehicle: 'OTHER',
};

async function main() {
  let total = 0;
  for (const [legacy, canonical] of Object.entries(CATEGORY_MAP)) {
    const count = await prisma.inventoryItem.count({ where: { category: legacy } });
    if (count) console.log(`${legacy.padEnd(20)} -> ${canonical.padEnd(12)} ${count} item(s)`);
    total += count;
  }
  console.log(`\nTotal rows to update: ${total}`);

  if (!CONFIRM) {
    console.log('\nDRY RUN - nothing changed. Re-run with --yes to apply.');
    return;
  }

  for (const [legacy, canonical] of Object.entries(CATEGORY_MAP)) {
    await prisma.inventoryItem.updateMany({ where: { category: legacy }, data: { category: canonical } });
  }
  console.log(`\n✅ Updated ${total} item(s).`);
}

main()
  .catch((err) => {
    console.error('Fix failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
