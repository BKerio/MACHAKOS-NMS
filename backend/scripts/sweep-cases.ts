import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma.js';

/**
 * DESTRUCTIVE: wipes ALL case data so numbering can restart at "Case 001".
 *
 * Deletes: incidents, tasks (and their TAT timestamps), patient care reports,
 *          GBV reports, forwarding logs, and INCIDENT/TASK audit-log entries.
 * Unlinks: call logs (the PBX call records are kept, just detached from cases).
 * Keeps:   users, vehicles, agencies/partners, facilities, SMS contacts/templates,
 *          SMS logs, crew check-ins.
 * Resets:  the case sequence so the next incident is Case 001.
 *
 * Usage:
 *   npx tsx scripts/sweep-cases.ts          # DRY RUN - shows counts, changes nothing
 *   npx tsx scripts/sweep-cases.ts --yes    # actually performs the sweep
 */
const prisma = createPrismaClient();
const CONFIRM = process.argv.includes('--yes');

async function main() {
  const [incidents, tasks, pcrs, gbv, fwd, linkedCalls, caseAudits] = await Promise.all([
    prisma.incident.count(),
    prisma.task.count(),
    prisma.patientCareReport.count(),
    prisma.gbvReport.count(),
    prisma.forwardingLog.count(),
    prisma.callLog.count({ where: { incidentId: { not: null } } }),
    prisma.auditLog.count({ where: { subjectType: { in: ['INCIDENT', 'TASK'] } } }),
  ]);

  console.log('── Case data currently in the database ──');
  console.log(`  incidents ............... ${incidents}`);
  console.log(`  tasks (TAT) ............. ${tasks}`);
  console.log(`  patient care reports .... ${pcrs}`);
  console.log(`  gbv reports ............. ${gbv}`);
  console.log(`  forwarding logs ......... ${fwd}`);
  console.log(`  call logs to unlink ..... ${linkedCalls}`);
  console.log(`  incident/task audits .... ${caseAudits}`);
  console.log('');

  if (!CONFIRM) {
    console.log('DRY RUN - nothing was changed. Re-run with --yes to perform the sweep.');
    return;
  }

  console.log('⚠️  Performing sweep…');

  await prisma.$transaction([
    prisma.patientCareReport.deleteMany({}),
    prisma.task.deleteMany({}),
    prisma.gbvReport.deleteMany({}),
    prisma.forwardingLog.deleteMany({}),
    prisma.callLog.updateMany({ where: { incidentId: { not: null } }, data: { incidentId: null } }),
    prisma.auditLog.deleteMany({ where: { subjectType: { in: ['INCIDENT', 'TASK'] } } }),
    prisma.incident.deleteMany({}),
  ]);

  // Restart the case sequence so the next incident is Case 001.
  await prisma.$executeRawUnsafe(
    "SELECT setval(pg_get_serial_sequence('incidents', 'case_seq'), 1, false)",
  );

  const remaining = await prisma.incident.count();
  console.log(`✅ Sweep complete. Incidents remaining: ${remaining}. Next case will be Case 001.`);
}

main()
  .catch((err) => {
    console.error('Sweep failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
