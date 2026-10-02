import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma.js';

/**
 * Seeds Machakos County's KEPH level 4 and 5 hospitals into the facilities
 * table - the receiving hospitals dispatch picks from and that distances,
 * nearest-hospital suggestions and crew ratings are measured against.
 *
 * Safe to re-run. A facility that already exists (same name, or one of its
 * known aliases, ignoring case) is left exactly as it is - admins may have
 * corrected its pin or level on the Facilities page - so existing incidents
 * and ratings are never touched. Only missing facilities are created.
 *
 * Sources (checked 2026-10-01):
 *   - Facility list and levels: Machakos County / Kenya MoH KMHFR registry,
 *     emergencymedicinekenya.org county page, and the Machakos facility table
 *     in PMC8580289. Private hospitals are included only where KMHFR lists
 *     them as KEPH level 4.
 *   - Positions: OpenStreetMap. `pin: 'mapped'` = the hospital's own mapped
 *     point. `pin: 'approximate'` = town or ward centre because the hospital
 *     itself isn't mapped - move these to the real gate on the admin
 *     Facilities map before relying on distances to them.
 *
 * Sub-counties are the 8 official ones in sub_counties (seed-sub-counties.ts);
 * e.g. Kalama ward is under Machakos Town, Athi River under Mavoko.
 *
 * Usage:
 *   npx tsx scripts/seed-facilities.ts            # create missing facilities
 *   npx tsx scripts/seed-facilities.ts --dry-run  # show what would change
 */
const prisma = createPrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

type Pin = 'mapped' | 'approximate';

interface SeedFacility {
  name: string;
  /** Other names the same hospital may already be stored under. */
  aliases?: string[];
  type: string;
  kephLevel: number;
  subCounty: string;
  lat: number;
  lng: number;
  pin: Pin;
}

const FACILITIES: SeedFacility[] = [
  // ── Level 5 - county referral ─────────────────────────────────────────────
  {
    name: 'Machakos Level 5 Hospital',
    aliases: ['Machakos Hospital', 'Machakos General Hospital', 'Machakos County Referral Hospital'],
    type: 'County Referral Hospital', kephLevel: 5, subCounty: 'Machakos Town',
    lat: -1.5237013, lng: 37.2662665, pin: 'mapped',
  },

  // ── Level 4 - public sub-county hospitals ─────────────────────────────────
  {
    name: 'Kangundo Level 4 Hospital',
    aliases: ['Kangundo Sub-County Hospital', 'Kangundo District Hospital', 'Kangundo Level4'],
    type: 'Sub-County Hospital', kephLevel: 4, subCounty: 'Kangundo',
    lat: -1.2984537, lng: 37.346387, pin: 'mapped',
  },
  {
    name: 'Kathiani Level 4 Hospital',
    aliases: ['Kathiani Sub-County Hospital', 'Kathiani Sub County Hospital'],
    type: 'Sub-County Hospital', kephLevel: 4, subCounty: 'Kathiani',
    lat: -1.4137708, lng: 37.3289335, pin: 'mapped',
  },
  {
    name: 'Masii Level 4 Hospital',
    type: 'Sub-County Hospital', kephLevel: 4, subCounty: 'Mwala',
    lat: -1.4601148, lng: 37.4403832, pin: 'mapped',
  },
  {
    name: 'Matuu Level 4 Hospital',
    aliases: ['Matuu Sub-County Hospital', 'Matuu District Hospital'],
    type: 'Sub-County Hospital', kephLevel: 4, subCounty: 'Yatta',
    lat: -1.1438281, lng: 37.5484852, pin: 'approximate', // Matuu town
  },
  {
    name: 'Athi River Level 4 Hospital',
    aliases: ['Mavoko Sub-County Hospital', 'Mavoko Level 4 Hospital', 'Athi River Health Centre'],
    type: 'Sub-County Hospital', kephLevel: 4, subCounty: 'Mavoko',
    lat: -1.4481149, lng: 36.971587, pin: 'approximate', // Athi River town
  },
  {
    name: 'Mutituni Level 4 Hospital',
    aliases: ['Mutituni Health Centre'],
    type: 'Sub-County Hospital', kephLevel: 4, subCounty: 'Machakos Town',
    lat: -1.4537943, lng: 37.2491912, pin: 'approximate', // Mutituni town
  },
  {
    name: 'Mwala Level 4 Hospital',
    aliases: ['Mwala Sub-County Hospital'],
    type: 'Sub-County Hospital', kephLevel: 4, subCounty: 'Mwala',
    lat: -1.4027317, lng: 37.5112618, pin: 'approximate', // Mwala sub-county centre
  },
  {
    name: 'Masinga Level 4 Hospital',
    aliases: ['Masinga Sub-County Hospital'],
    type: 'Sub-County Hospital', kephLevel: 4, subCounty: 'Masinga',
    lat: -0.950666, lng: 37.6031466, pin: 'approximate', // Masinga sub-county centre
  },
  {
    name: 'Ndithini Level 4 Hospital',
    type: 'Sub-County Hospital', kephLevel: 4, subCounty: 'Masinga',
    lat: -0.9459807, lng: 37.3348315, pin: 'approximate', // Ndithini centre
  },
  {
    name: 'Kalama Level 4 Hospital',
    type: 'Sub-County Hospital', kephLevel: 4, subCounty: 'Machakos Town',
    lat: -1.6769844, lng: 37.1314412, pin: 'approximate', // Kalama ward centre
  },

  // ── Level 4 - private (KMHFR KEPH level 4) ────────────────────────────────
  {
    name: 'Plaza Specialist Hospital',
    aliases: ['Plaza Specialist Hospital (Machakos)'],
    type: 'Private Hospital', kephLevel: 4, subCounty: 'Machakos Town',
    lat: -1.5177, lng: 37.2634, pin: 'approximate', // Machakos town centre
  },
  {
    name: "Machakos Doctors' Plaza",
    aliases: ['Machakos Doctors Plaza'],
    type: 'Private Hospital', kephLevel: 4, subCounty: 'Machakos Town',
    lat: -1.5177, lng: 37.2634, pin: 'approximate', // Machakos town centre
  },
];

const norm = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function main() {
  const existing = await prisma.facility.findMany({ select: { id: true, name: true, kephLevel: true } });
  const byName = new Map(existing.map((f) => [norm(f.name), f]));

  let created = 0;
  let kept = 0;
  for (const f of FACILITIES) {
    const match = [f.name, ...(f.aliases ?? [])].map((n) => byName.get(norm(n))).find(Boolean);
    if (match) {
      kept++;
      console.log(`⏭️  Kept      ${match.name} (KEPH ${match.kephLevel}) - already present as "${f.name}"`);
      continue;
    }
    const { aliases: _aliases, pin, ...data } = f;
    if (!DRY_RUN) {
      const row = await prisma.facility.create({ data });
      byName.set(norm(row.name), { id: row.id, name: row.name, kephLevel: row.kephLevel });
    }
    created++;
    console.log(`${DRY_RUN ? '🔎 Would add' : '✅ Added   '} ${f.name} (KEPH ${f.kephLevel}, ${f.subCounty})${pin === 'approximate' ? '  ⚠ approximate pin' : ''}`);
  }

  const approx = FACILITIES.filter((f) => f.pin === 'approximate').length;
  console.log(`\n🎉 ${DRY_RUN ? 'Dry run - ' : ''}${created} ${DRY_RUN ? 'to add' : 'added'}, ${kept} already present.`);
  console.log(`⚠  ${approx} facilities use an approximate pin - correct them on Admin → Facilities.`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
