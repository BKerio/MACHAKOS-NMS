import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '../src/lib/prisma.js';

/**
 * Seeds ONE realistic, dispatch-ready test incident (status SUBMITTED, with
 * coordinates so dispatch / referral-distance / PCR can be exercised).
 * It goes through the real case sequence, so the first one is Case 001,
 * the next Case 002, and so on. Run again for more.
 *
 * Usage:  npx tsx scripts/seed-test-case.ts
 */
const prisma = createPrismaClient();

async function main() {
  // Attach the case to an existing active user (and their agency).
  const watcher = await prisma.user.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!watcher) {
    console.error('No active users found - cannot seed a case.');
    process.exit(1);
  }

  // Create with a unique placeholder, then set "Case NNN" from the DB sequence.
  const created = await prisma.incident.create({
    data: {
      caseNumber: `PENDING-${randomUUID()}`,
      status: 'SUBMITTED',
      chiefComplaint: 'Road traffic accident - suspected fractures, conscious',
      locationName: 'Uhuru Highway, near Nyayo Stadium',
      subCounty: 'Starehe',
      lat: -1.3039,
      lng: 36.8248,
      alertMode: 'CALL',
      alertNature: 'Trauma',
      alertNatureDetail: 'Road Traffic Accident',
      originOfAlert: 'Bystander',
      patientName: 'John Test',
      patientAge: '34',
      patientGender: 'Male',
      patientContact: '0712345678',
      nextOfKin: 'Jane Test',
      nextOfKinPhone: '0712345679',
      watcherComments: 'Seeded test case for QA.',
      assignedAgencyId: watcher.agencyId,
      watcherId: watcher.id,
    },
  });

  const caseNumber = `Case ${String(created.caseSeq).padStart(3, '0')}`;
  const incident = await prisma.incident.update({
    where: { id: created.id },
    data: { caseNumber },
  });

  console.log(`✅ Seeded ${caseNumber} (id ${incident.id}) - status SUBMITTED, now in the dispatch queue.`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
