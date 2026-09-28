/**
 * Push notification doctor - checks every link in the push chain and says
 * exactly which one is broken.
 *
 *   npx tsx scripts/push-doctor.ts                      # server-side checks
 *   npx tsx scripts/push-doctor.ts someone@example.com  # + their devices, and a real test push
 *   npx tsx scripts/push-doctor.ts 0712345678           # (phone works too)
 *
 * Run it on the server, with the same .env the backend uses.
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma.js';
import { decryptJson } from '../src/shared/utils/crypto.js';
import { FcmPushClient } from '../src/modules/push/push.client.js';

const EXPECTED_PROJECT = 'eoc-mcg';
const prisma = createPrismaClient();

let problems = 0;
const ok = (msg: string) => console.log(`  ✔ ${msg}`);
const bad = (msg: string, fix: string) => {
  problems++;
  console.log(`  ✘ ${msg}\n      FIX: ${fix}`);
};
const info = (msg: string) => console.log(`    ${msg}`);

/** Plain-language fix for the FCM errors seen in practice. */
function explain(error: string): string {
  if (/senderid mismatch|mismatched-credential/i.test(error)) {
    return `The saved Firebase key is for a different project than the app/web. Upload a service-account key from the "${EXPECTED_PROJECT}" project (Settings > Push Notifications).`;
  }
  if (/not-registered|unregistered|invalid-registration-token|not a valid fcm/i.test(error)) {
    return 'That device token is dead (app reinstalled / data cleared / browser reset). Sign out and back in on that device; the doctor already removed nothing - the next real send drops it automatically.';
  }
  if (/third-party-auth-error/i.test(error)) {
    return 'iPhone: no APNs key uploaded in Firebase (Project settings > Cloud Messaging > Apple app configuration). Web: the VAPID key in the frontend .env does not belong to this project.';
  }
  if (/has not been used|is disabled|SERVICE_DISABLED|PERMISSION_DENIED/i.test(error)) {
    return `Enable "Firebase Cloud Messaging API (V1)" for the ${EXPECTED_PROJECT} project in Google Cloud console > APIs & Services.`;
  }
  if (/invalid_grant|invalid jwt|private key/i.test(error)) {
    return 'The service-account key was revoked or is malformed. Generate a new key in Firebase (Project settings > Service accounts) and upload it.';
  }
  return 'See the error above; the Firebase console (Cloud Messaging) may have more detail.';
}

async function main() {
  const who = process.argv[2];
  console.log('\nPUSH DOCTOR\n');

  // 1) Database: the push_tokens table from migration 20260928100000_add_push_tokens.
  console.log('1. Database');
  let tokensTableOk = true;
  try {
    const total = await prisma.pushToken.count();
    ok(`push_tokens table present (${total} registered device${total === 1 ? '' : 's'} in total)`);
    const byPlatform = await prisma.pushToken.groupBy({ by: ['platform'], _count: { _all: true } });
    for (const row of byPlatform) info(`${row.platform}: ${row._count._all}`);
  } catch (e) {
    tokensTableOk = false;
    bad(
      `push_tokens table missing (${(e as Error).message.split('\n')[0]})`,
      'Run `npx prisma migrate deploy` in the backend folder, then restart the backend. Until then every device registration fails.',
    );
  }

  // 2) Gateway: saved, active, right project, credentials accepted by Google.
  console.log('\n2. Push gateway (Settings > Push Notifications)');
  const row = await prisma.pushGateway.findFirst();
  let serviceAccountJson: string | null = null;
  if (!row) {
    bad('No Firebase key saved', `Admin > Settings > Push Notifications: upload the service-account JSON from the "${EXPECTED_PROJECT}" Firebase project, then Activate.`);
  } else {
    try {
      serviceAccountJson = decryptJson<{ serviceAccountJson: string }>(process.env.JWT_SECRET ?? '', row.configEnc).serviceAccountJson;
      const projectId = JSON.parse(serviceAccountJson).project_id as string | undefined;
      if (projectId === EXPECTED_PROJECT) ok(`Key is for project "${projectId}"`);
      else bad(`Key is for project "${projectId}", but the app and web use "${EXPECTED_PROJECT}"`, `Upload a service-account key from the "${EXPECTED_PROJECT}" project instead.`);
    } catch {
      bad('Saved key cannot be decrypted', 'JWT_SECRET changed since the key was saved. Re-upload the service-account JSON in Settings > Push Notifications.');
    }
    if (row.isActive) ok('Push is switched ON');
    else bad('Push is switched OFF', 'Admin > Settings > Push Notifications > Activate.');

    if (serviceAccountJson) {
      const client = FcmPushClient.create(serviceAccountJson);
      try {
        const v = await client.verifyCredentials();
        if (v.ok) ok('Google accepted the key');
        else bad('Google rejected the key', explain('invalid_grant'));
      } finally {
        await client.close();
      }
    }
  }

  // 3) + 4) One user's devices, and a real test push to them.
  if (who) {
    console.log(`\n3. Devices for "${who}"`);
    const user = await prisma.user.findFirst({
      where: who.includes('@') ? { email: who.toLowerCase() } : { phone: { contains: who.replace(/\D/g, '').slice(-9) } },
      select: { id: true, name: true, role: true },
    });
    if (!user) {
      bad('No such user', 'Check the email / phone number.');
    } else if (tokensTableOk) {
      info(`${user.name} (${user.role})`);
      const devices = await prisma.pushToken.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } });
      if (devices.length === 0) {
        bad(
          'This user has no registered devices',
          'Phone: install the latest app build, sign in, and ALLOW notifications (Android: Settings > Apps > EOC-MCG > Notifications). '
            + 'Web: sign in as Driver/EMT/Nurse over https and click Allow on the notification prompt.',
        );
      } else {
        for (const d of devices) info(`${d.platform.padEnd(8)} registered ${d.updatedAt.toISOString()}  ...${d.token.slice(-10)}`);
        ok(`${devices.length} device${devices.length === 1 ? '' : 's'} registered`);

        if (serviceAccountJson && row?.isActive) {
          console.log('\n4. Sending a real test push');
          const client = FcmPushClient.create(serviceAccountJson);
          try {
            const results = await client.sendMulticast(
              devices.map((d) => d.token),
              'Push doctor test',
              'If you can read this, case alerts reach this device.',
              { type: 'TEST' },
            );
            results.forEach((r, i) => {
              const d = devices[i];
              if (r.success) ok(`${d.platform} ...${d.token.slice(-10)}: accepted by Firebase - check the device`);
              else bad(`${d.platform} ...${d.token.slice(-10)}: ${r.error}`, explain(r.error ?? ''));
            });
          } finally {
            await client.close();
          }
        }
      }
    }
  } else {
    console.log('\n(Add an email or phone to check that person\'s devices and send them a real test push.)');
  }

  console.log(problems === 0 ? '\nNo problems found on the server side.\n' : `\n${problems} problem${problems === 1 ? '' : 's'} found - fix from the top down.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
