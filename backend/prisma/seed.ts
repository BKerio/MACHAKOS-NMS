import 'dotenv/config';
import { Role, AgencyType } from '../src/generated/prisma/index.js';
import { createPrismaClient } from '../src/lib/prisma.js';
import bcrypt from 'bcrypt';

const prisma = createPrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // ── 1. NMS Internal Agency ──────────────────────────────────────────────────
  const nmsAgency = await prisma.agency.upsert({
    where: { id: 'nms-internal-agency' },
    update: {},
    create: {
      id: 'nms-internal-agency',
      name: 'NMS Emergency Operations Centre',
      type: AgencyType.INTERNAL,
      location: 'Nairobi, Kenya',
      contactInfo: {
        phone: '+254700000000',
        email: 'eoc@nms.go.ke',
      },
      isActive: true,
    },
  });
  console.log(`✅ Agency: ${nmsAgency.name}`);

  // ── 2. Super Admin User ─────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin@123!', 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@nms.go.ke' },
    update: {},
    create: {
      email: 'admin@nms.go.ke',
      passwordHash,
      name: 'System Administrator',
      phone: '+254700000001',
      role: Role.SUPER_ADMIN,
      agencyId: nmsAgency.id,
      isActive: true,
    },
  });
  console.log(`✅ Super Admin: ${superAdmin.email}`);

  // ── 3. Sample Facilities (KEPH levels 4–6) ──────────────────────────────────
  const facilities = [
    {
      id: 'facility-knh',
      name: 'Kenyatta National Hospital',
      type: 'Referral Hospital',
      kephLevel: 6,
      subCounty: 'Dagoretti North',
      lat: -1.3009,
      lng: 36.8062,
    },
    {
      id: 'facility-pumwani',
      name: 'Pumwani Maternity Hospital',
      type: 'Hospital',
      kephLevel: 5,
      subCounty: 'Kamukunji',
      lat: -1.2746,
      lng: 36.8395,
    },
    {
      id: 'facility-mbagathi',
      name: 'Mbagathi District Hospital',
      type: 'District Hospital',
      kephLevel: 4,
      subCounty: 'Dagoretti South',
      lat: -1.3223,
      lng: 36.7636,
    },
    {
      id: 'facility-mathare',
      name: 'Mathare Hospital',
      type: 'Hospital',
      kephLevel: 4,
      subCounty: 'Mathare',
      lat: -1.2612,
      lng: 36.8619,
    },
    {
      id: 'facility-ruaraka',
      name: 'Ruaraka Health Centre',
      type: 'Health Centre',
      kephLevel: 3,
      subCounty: 'Ruaraka',
      lat: -1.2480,
      lng: 36.8813,
    },
  ];

  for (const facility of facilities) {
    await prisma.facility.upsert({
      where: { id: facility.id },
      update: {},
      create: facility,
    });
    console.log(`✅ Facility: ${facility.name} (KEPH ${facility.kephLevel})`);
  }

  // ── 4. Fleet - real vehicles from Uffizio/Kimii Telematics ─────────────────
  // IMEIs confirmed from live Uffizio API response (getTokenBaseLiveData).
  // The TrackingService matches by imei to write lastLat/lastLng every 30s.
  // ⚠️  GKB 847V: IMEI below is 13 digits - real IMEIs are 15. Verify on Uffizio dashboard and correct here.
  const uffizioVehicles = [
    { registrationNumber: 'GKB 847V', imei: '8642870320357'   },
    { registrationNumber: 'GKB 645W', imei: '350317178839878' },
    { registrationNumber: 'GKB 848V', imei: '862273048245427' },
    { registrationNumber: 'GKB 849V', imei: '869270049176117' },
    { registrationNumber: 'GKB 657W', imei: '350317178979112' },
    { registrationNumber: '47CG036A', imei: '869467049288328' },
  ];

  for (const v of uffizioVehicles) {
    const created = await prisma.vehicle.upsert({
      where: { registrationNumber: v.registrationNumber },
      update: { imei: v.imei, isActive: true },
      create: { registrationNumber: v.registrationNumber, imei: v.imei, agencyId: nmsAgency.id, isActive: true },
    });
    console.log(`✅ Vehicle: ${created.registrationNumber} (IMEI ${created.imei})`);
  }

  // KCX 123A mock placeholder removed - all vehicles are real Uffizio units above

  const driver = await prisma.user.upsert({
    where: { id: 'driver-001' },
    update: {},
    create: {
      id: 'driver-001',
      email: 'driver1@nms.go.ke',
      passwordHash,
      name: 'John Driver',
      role: Role.DRIVER,
      agencyId: nmsAgency.id,
      isActive: true,
    },
  });

  const emt = await prisma.user.upsert({
    where: { id: 'emt-001' },
    update: {},
    create: {
      id: 'emt-001',
      email: 'emt1@nms.go.ke',
      passwordHash,
      name: 'Sarah EMT',
      role: Role.EMT,
      agencyId: nmsAgency.id,
      isActive: true,
    },
  });

  const nurse = await prisma.user.upsert({
    where: { id: 'nurse-001' },
    update: {},
    create: {
      id: 'nurse-001',
      email: 'nurse1@nms.go.ke',
      passwordHash,
      name: 'Mike Nurse',
      role: Role.NURSE,
      agencyId: nmsAgency.id,
      isActive: true,
    },
  });
  console.log(`✅ Crew created: Driver, EMT, Nurse`);

  // ── 5. Frontend Developer Account ──────────────────────────────────────────
  const erickyHash = await bcrypt.hash('12345678', 10);
  const ericky = await prisma.user.upsert({
    where: { email: 'ericksonmutai56@gmail.com' },
    update: {},
    create: {
      email: 'ericksonmutai56@gmail.com',
      passwordHash: erickyHash,
      name: 'Erickson Mutai',
      role: Role.SUPER_ADMIN,
      agencyId: nmsAgency.id,
      isActive: true,
    },
  });
  console.log(`✅ Frontend Dev: ${ericky.email}`);

  // ── 6. Joe (AFOSI Admin) ────────────────────────────────────────────────────
  const joeHash = await bcrypt.hash('joeyflow21', 10);
  const joe = await prisma.user.upsert({
    where: { email: 'joe@afosi.org' },
    update: { passwordHash: joeHash, role: Role.ADMIN, isActive: true },
    create: {
      email: 'joe@afosi.org',
      passwordHash: joeHash,
      name: 'Joe',
      role: Role.ADMIN,
      agencyId: nmsAgency.id,
      isActive: true,
    },
  });
  console.log(`✅ Admin: ${joe.email}`);

  console.log('\n🎉 Seed complete!');
  console.log('─────────────────────────────────────');
  console.log('Super Admin credentials:');
  console.log('  Email:    admin@nms.go.ke');
  console.log('  Password: Admin@123!');
  console.log('─────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
