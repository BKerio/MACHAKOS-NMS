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
    where: { email: 'admin@brighton.go.ke' },
    update: {},
    create: {
      email: 'admin@brighton.go.ke',
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

  // ── 4. Ambulance Checklist - ALS Ambulance Monthly Checklist inventory ─────
  // Source: ambulance_checklist.xlsx. Each row becomes an InventoryItem, with
  // quantityStock/reorderLevel seeded to the checklist's "Required Qty" (the
  // minimum that must be on board). Vehicle-section rows are pass/fail
  // inspection checks rather than stock, so they're seeded with unit "check"
  // and a note rather than a real reorder threshold. The source sheet lists
  // "Giving Sets" twice (10 and 5) - only the first is kept here.
  const checklistItems: {
    category: string;
    name: string;
    quantityStock: number;
    reorderLevel: number;
    unit: string;
    notes?: string;
  }[] = [
    { category: 'Drugs', name: 'PCM 1GM', quantityStock: 4, reorderLevel: 4, unit: 'each' },
    { category: 'Drugs', name: 'Morphine 10MG', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Drugs', name: 'Pethidine 50MG', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Drugs', name: 'Pethidine 100MG', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Drugs', name: 'Diazepam 10MG', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Drugs', name: 'Buscopan 20MG', quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'Drugs', name: 'Adrenaline 1MG', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Drugs', name: 'Atropine 0.6MG', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'General', name: 'BP Machine', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'General', name: 'Dual Head Stethoscope', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'General', name: 'Surgical Gloves', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'General', name: 'Examination Gloves', quantityStock: 2, reorderLevel: 2, unit: 'pack' },
    { category: 'General', name: 'Venipuncture Kit', quantityStock: 0, reorderLevel: 0, unit: 'each' },
    { category: 'General', name: 'Pen Torch', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'General', name: 'Glucometer', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'General', name: 'Glucometer Strips', quantityStock: 1, reorderLevel: 1, unit: 'pack' },
    { category: 'General', name: 'Trauma Shears', quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'General', name: 'Laryngoscope', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'General', name: 'Stylet', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'General', name: 'KY Jelly', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Venipuncture', name: '18G Cannula', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Venipuncture', name: '20G Cannula', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Venipuncture', name: '22G Cannula', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Venipuncture', name: '24G Cannula', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Venipuncture', name: '26G Cannula', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'IV Fluids', name: 'Normal Saline', quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'IV Fluids', name: "Ringer's Lactate", quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'IV Fluids', name: 'DNS', quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'IV Fluids', name: 'D5%', quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'IV Fluids', name: 'D10%', quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'IV Fluids', name: 'D50%', quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'Consumables', name: 'Giving Sets', quantityStock: 10, reorderLevel: 10, unit: 'each' },
    { category: 'Consumables', name: 'Tape/Strapping', quantityStock: 3, reorderLevel: 3, unit: 'each' },
    { category: 'Consumables', name: '2cc Syringes', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Consumables', name: '5cc Syringes', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Consumables', name: '10cc Syringes', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Consumables', name: '20cc Syringes', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Consumables', name: '60cc Syringes', quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'Airway', name: 'OPA Size 2', quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'Airway', name: 'OPA Size 3', quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'Airway', name: 'OPA Size 4', quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'Airway', name: 'ETT 4.0', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Airway', name: 'ETT 4.5', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Airway', name: 'ETT 5.0', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Airway', name: 'ETT 6.5', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Airway', name: 'ETT 7.5', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Airway', name: 'Suction Size 6', quantityStock: 0, reorderLevel: 0, unit: 'each' },
    { category: 'Airway', name: 'Suction Size 10', quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'Airway', name: 'Suction Size 12', quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'Airway', name: 'BVM Adult', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Airway', name: 'BVM Child', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Respiratory', name: 'Oxygen Cylinders', quantityStock: 3, reorderLevel: 3, unit: 'each' },
    { category: 'Respiratory', name: 'Nasal Cannula Adult', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Respiratory', name: 'Nasal Cannula Child', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Respiratory', name: 'Nasal Cannula Infant', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Respiratory', name: 'Non-Rebreather Mask', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Respiratory', name: 'Non-Rebreather Mask Paediatric', quantityStock: 3, reorderLevel: 3, unit: 'each' },
    { category: 'Respiratory', name: 'Nebulizer Adult', quantityStock: 3, reorderLevel: 3, unit: 'each' },
    { category: 'Respiratory', name: 'Nebulizer Paediatric', quantityStock: 3, reorderLevel: 3, unit: 'each' },
    { category: 'Respiratory', name: 'Ventilator', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Trauma', name: 'SAM Formable Splint', quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'Trauma', name: 'Stretcher Straps', quantityStock: 1, reorderLevel: 1, unit: 'pair' },
    { category: 'Trauma', name: 'Rigid Splints', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Trauma', name: 'Scoop Stretcher', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Trauma', name: 'Head Blocks', quantityStock: 1, reorderLevel: 1, unit: 'pair' },
    { category: 'Trauma', name: 'Blankets', quantityStock: 2, reorderLevel: 2, unit: 'pair' },
    { category: 'Trauma', name: 'Cervical Collar', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Trauma', name: 'Trauma Bag', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Obstetric/Other', name: 'Cord Clamps', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Obstetric/Other', name: 'Crepe Bandage 4"', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Obstetric/Other', name: 'Crepe Bandage 6"', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Obstetric/Other', name: 'Surgical Blades', quantityStock: 5, reorderLevel: 5, unit: 'each' },
    { category: 'Obstetric/Other', name: 'Urine Bags', quantityStock: 2, reorderLevel: 2, unit: 'each' },
    { category: 'Obstetric/Other', name: 'Foley Catheter 18', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Obstetric/Other', name: 'Foley Catheter 16', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Obstetric/Other', name: 'Foley Catheter 14', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Obstetric/Other', name: 'Foley Catheter 12', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Obstetric/Other', name: 'Foley Catheter 8', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'PPE', name: 'Surgical Masks', quantityStock: 1, reorderLevel: 1, unit: 'box' },
    { category: 'Emergency Equipment', name: 'Cardiac Monitor', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Emergency Equipment', name: 'Manual Defibrillator', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Emergency Equipment', name: 'Drug Box', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Emergency Equipment', name: 'Transport Cooler', quantityStock: 1, reorderLevel: 1, unit: 'each' },
    { category: 'Vehicle', name: 'Vehicle Exterior', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Tires', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Engine Oil', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Radiator Coolant', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Power Steering Fluid', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'ATF', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Fan Belt', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Radiator & Heater Hoses', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Fluid Leaks', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Brake Fluid Level', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Windshield Washer Fluid', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Oil Level', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Battery', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Fuel Level', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Steering Play', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Heater/AC', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Hydraulic Brake', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Hand Brake', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Vehicle Lights/Indicators', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Emergency Lights', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Fire Extinguisher', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Floor Covering', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Vehicle Cleanliness', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Door Latches & Hinges', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Reflector Set', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Wheel Chocks', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Siren', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Tow Rope', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Spare Wheel', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Wheel Spanner/Jack', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
    { category: 'Vehicle', name: 'Horn', quantityStock: 1, reorderLevel: 1, unit: 'check', notes: 'Vehicle inspection item (pass/fail check on the ALS monthly checklist, not stock-tracked)' },
  ];

  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // The checklist source sheet's categories (above) are free-text labels from
  // ambulance_checklist.xlsx, not the app's actual InventoryCategory enum
  // (VITALS | CONSUMABLES | MEDICATION | AIRWAY | WOUND_CARE | OTHER - see
  // INVENTORY_CATEGORIES in admin.routes.ts, which the admin create/edit API
  // enforces via zod). Writing the free-text label straight into `category`
  // meant every one of these ~230 items had a category the operator/admin
  // category filter chips could never match, so every filter except "All"
  // silently returned nothing. Mapped here instead of renaming the sheet
  // labels above so `id` (derived from the ORIGINAL label) stays stable -
  // changing it would orphan already-seeded rows instead of updating them,
  // and risks breaking InventoryCheckout.itemId for stock crews already
  // checked out.
  const CHECKLIST_CATEGORY_MAP: Record<string, string> = {
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

  for (const item of checklistItems) {
    const id = `checklist-${slugify(item.category)}-${slugify(item.name)}`;
    const category = CHECKLIST_CATEGORY_MAP[item.category] ?? 'OTHER';
    await prisma.inventoryItem.upsert({
      where: { id },
      update: {
        category,
        quantityStock: item.quantityStock,
        reorderLevel: item.reorderLevel,
        unit: item.unit,
        notes: item.notes,
        isActive: true,
      },
      create: {
        id,
        name: item.name,
        category,
        unit: item.unit,
        quantityStock: item.quantityStock,
        reorderLevel: item.reorderLevel,
        notes: item.notes,
        isActive: true,
      },
    });
  }
  console.log(`✅ Ambulance Checklist: ${checklistItems.length} inventory items across ${new Set(checklistItems.map((i) => CHECKLIST_CATEGORY_MAP[i.category] ?? 'OTHER')).size} categories`);

  // ── 5. Fleet - real vehicles from Uffizio/Kimii Telematics ─────────────────
  // IMEIs confirmed from live Uffizio API response (getTokenBaseLiveData),
  // company "MACHAKOS DISPATCH CENTER" (as of 2026-09-09 - the account was
  // switched from the earlier Nairobi EOC one; see the old fleet below).
  // The TrackingService matches by imei to write lastLat/lastLng every 65s.
  const uffizioVehicles = [
    { registrationNumber: '16CG137A', imei: '354002394285991' },
    { registrationNumber: '16CG109A', imei: '354002394285850' },
    { registrationNumber: '16CG096A', imei: '354002392670129' },
    { registrationNumber: 'JINBEI296A', imei: '354002394286023' },
    { registrationNumber: '16CG094A', imei: '354002392666689' },
    { registrationNumber: '16CG295A', imei: '354002394286056' },
    { registrationNumber: '16CG095A', imei: '354002392666606' },
    { registrationNumber: '16CG217A', imei: '354002394285793' },
    { registrationNumber: '16CG120A', imei: '354002392670277' },
  ];

  // Old (Nairobi-account) fleet, decommissioned when the Uffizio account
  // switched - deactivated rather than deleted so any historical task/
  // checkout rows referencing them stay intact. Not upserted/recreated here.
  const decommissionedVehicles = ['GKB 848V', 'GKB 847V', '47CG036A', 'GKB 645W', 'GKB 657W', 'GKB 849V'];
  await prisma.vehicle.updateMany({
    where: { registrationNumber: { in: decommissionedVehicles } },
    data: { isActive: false },
  });

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

  // ── 6. Frontend Developer Account ──────────────────────────────────────────
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

  // ── 7. Joe (AFOSI Admin) ────────────────────────────────────────────────────
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
