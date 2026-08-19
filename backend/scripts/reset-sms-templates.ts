import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma.js';
import { DEFAULT_TEMPLATES } from '../src/modules/sms/sms.service.js';

/**
 * Overwrites the GBV / MCI / SURVEILLANCE SMS templates with the latest
 * detailed defaults from the code. Run once after deploying a template change.
 * NOTE: this replaces any manual edits to those three templates.
 *
 * Usage:  npx tsx scripts/reset-sms-templates.ts
 */
const prisma = createPrismaClient();

async function main() {
  for (const t of DEFAULT_TEMPLATES) {
    await prisma.smsTemplate.upsert({
      where: { key: t.key },
      update: { body: t.body, label: t.label },
      create: t,
    });
    console.log(`✔ ${t.key} template updated`);
  }
  console.log('✅ SMS templates reset to the latest detailed defaults.');
}

main()
  .catch((err) => {
    console.error('Reset failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
