import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma.js';
import { NATURE_TAXONOMY } from '../src/modules/incidents/nature-taxonomy.js';

/**
 * Replaces the incident nature-of-alert taxonomy with NATURE_TAXONOMY
 * (extracted from the legacy NCCG EOC system). This DELETES all existing
 * incident_nature_options rows first, so any manual admin edits are discarded.
 *
 * Existing incidents are unaffected - they store the chosen nature/detail as
 * plain strings on the incident, not as foreign keys to this table.
 *
 * Usage:
 *   npx tsx scripts/reseed-nature-options.ts          (dry run - shows counts only)
 *   npx tsx scripts/reseed-nature-options.ts --yes     (actually replace)
 */
const prisma = createPrismaClient();
const CONFIRM = process.argv.includes('--yes');

function buildRows() {
  const rows: Array<{ nature: string; detail: string | null; sortOrder: number }> = [];
  let order = 0;
  for (const { nature, details } of NATURE_TAXONOMY) {
    rows.push({ nature, detail: null, sortOrder: order++ });
    for (const detail of details) rows.push({ nature, detail, sortOrder: order++ });
  }
  return rows;
}

async function main() {
  const rows = buildRows();
  const existing = await prisma.incidentNatureOption.count();

  console.log(`Existing nature-option rows: ${existing}`);
  console.log(`New taxonomy: ${NATURE_TAXONOMY.length} natures, ${rows.length} total rows`);
  for (const n of NATURE_TAXONOMY) {
    console.log(`  • ${n.nature} - ${n.details.length} specific nature(s)`);
  }

  if (!CONFIRM) {
    console.log('\nDRY RUN - nothing changed. Re-run with --yes to replace.');
    return;
  }

  await prisma.$transaction([
    prisma.incidentNatureOption.deleteMany({}),
    prisma.incidentNatureOption.createMany({ data: rows, skipDuplicates: true }),
  ]);

  const after = await prisma.incidentNatureOption.count();
  console.log(`\n✅ Replaced taxonomy. Rows now: ${after}`);
}

main()
  .catch((err) => {
    console.error('Reseed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
