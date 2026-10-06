import type { Worksheet } from 'exceljs';
import { labelize, type SystemReport, type SystemReportDetails as D } from '../types';
import { BAD, GOOD, INFO, NAIROBI_MS, NEUTRAL, WARN, register, statusFormats, type Col, type Reg } from './core';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Nairobi weekday (Mon..Sun) and hour (0-23) of a timestamp. */
export function weekdayHour(iso: string) {
  const t = new Date(Date.parse(iso) + NAIROBI_MS);
  return { weekday: WEEKDAYS[(t.getUTCDay() + 6) % 7], hour: t.getUTCHours() };
}

type CaseRow = D['cases'][number];

export function casesRegister(ws: Worksheet, d: SystemReport, x: D): Reg {
  // Derived per-case columns that the analysis sheets slice on.
  const firstTask = new Map<string, D['tasks'][number]>();
  for (const t of x.tasks) {
    const cur = firstTask.get(t.caseNumber);
    if (!cur || Date.parse(t.receivedAt) < Date.parse(cur.receivedAt)) firstTask.set(t.caseNumber, t);
  }
  const tally = (keys: (string | null)[]) => {
    const m = new Map<string, number>();
    keys.forEach((k) => k && m.set(k, (m.get(k) ?? 0) + 1));
    return m;
  };
  const calls = tally(x.calls.map((c) => c.caseNumber));
  const pcrs = tally(x.pcrs.map((p) => p.caseNumber));
  const official = new Set(x.officialSubCounties.map((s) => s.trim().toLowerCase()));

  const cols: Col<CaseRow>[] = [
    { header: 'Case No', width: 11, kind: 'text', get: (r) => r.caseNumber },
    { header: 'Status', width: 17, kind: 'label', get: (r) => r.status },
    { header: 'Case Type', width: 11, kind: 'label', get: (r) => r.incidentType },
    { header: 'Created', width: 17, kind: 'date', get: (r) => r.createdAt },
    { header: 'Weekday', width: 9, kind: 'text', get: (r) => weekdayHour(r.createdAt).weekday },
    { header: 'Hour', width: 7, kind: 'int', get: (r) => weekdayHour(r.createdAt).hour },
    { header: 'Alert Time', width: 17, kind: 'date', get: (r) => r.alertAt },
    { header: 'Alert Mode', width: 13, kind: 'text', get: (r) => r.alertMode },
    { header: 'Origin of Alert', width: 16, kind: 'text', get: (r) => r.originOfAlert },
    { header: 'Nature', width: 22, kind: 'text', get: (r) => r.nature },
    { header: 'Nature Detail', width: 24, kind: 'text', get: (r) => r.natureDetail },
    { header: 'Chief Complaint', width: 40, kind: 'wrap', get: (r) => r.chiefComplaint },
    { header: 'Location', width: 28, kind: 'wrap', get: (r) => r.location },
    { header: 'Sub-County', width: 16, kind: 'text', get: (r) => r.subCounty },
    {
      header: 'Official Sub-County', width: 10, kind: 'yesno',
      get: (r) => official.has((r.subCounty ?? '').trim().toLowerCase()),
    },
    { header: 'Latitude', width: 11, kind: 'coord', get: (r) => r.lat },
    { header: 'Longitude', width: 11, kind: 'coord', get: (r) => r.lng },
    { header: 'Mass Casualty', width: 9, kind: 'yesno', get: (r) => r.massCasualty },
    { header: 'Casualties', width: 10, kind: 'int', get: (r) => r.massCasualtyCount },
    { header: 'GBV Case', width: 9, kind: 'yesno', get: (r) => r.gbv },
    { header: 'Patient Name', width: 22, kind: 'text', get: (r) => r.patientName },
    { header: 'Unknown Person', width: 9, kind: 'yesno', get: (r) => r.patientUnknown },
    { header: 'Distinguishing Features', width: 30, kind: 'wrap', get: (r) => r.patientDescription },
    { header: 'Age', width: 7, kind: 'text', get: (r) => r.patientAge },
    { header: 'Gender', width: 9, kind: 'text', get: (r) => r.patientGender },
    { header: 'Patient Contact', width: 14, kind: 'text', get: (r) => r.patientContact },
    { header: 'National ID', width: 13, kind: 'text', get: (r) => r.patientNationalId },
    { header: 'NHIF/SHA No', width: 13, kind: 'text', get: (r) => r.patientNhif },
    { header: 'Next of Kin', width: 20, kind: 'text', get: (r) => r.nextOfKin },
    { header: 'Next of Kin Phone', width: 14, kind: 'text', get: (r) => r.nextOfKinPhone },
    { header: 'Vitals', width: 36, kind: 'wrap', get: (r) => r.vitals },
    { header: 'Maternity Vitals', width: 30, kind: 'wrap', get: (r) => r.maternityVitals },
    { header: 'Pre-Hospital Management', width: 36, kind: 'wrap', get: (r) => r.preHospitalManagement },
    { header: 'KEPH Level Required', width: 10, kind: 'int', get: (r) => r.hospitalLevelRequired },
    { header: 'Referred From', width: 26, kind: 'text', get: (r) => r.originFacility },
    { header: 'Target Facility', width: 26, kind: 'text', get: (r) => r.targetFacility },
    { header: 'Place of Referral', width: 22, kind: 'text', get: (r) => r.placeOfReferral },
    { header: 'Ambulance Used', width: 14, kind: 'text', get: (r) => r.ambulanceUsed },
    { header: 'First Vehicle', width: 13, kind: 'text', get: (r) => firstTask.get(r.caseNumber)?.vehicle },
    { header: 'First Response (min)', width: 11, kind: 'num1', get: (r) => firstTask.get(r.caseNumber)?.minToScene },
    { header: 'Latest Vehicle', width: 13, kind: 'text', get: (r) => r.latestVehicle },
    { header: 'Latest Task Status', width: 16, kind: 'label', get: (r) => r.latestTaskStatus },
    { header: 'Tasks', width: 7, kind: 'int', get: (r) => r.taskCount },
    { header: 'Calls', width: 7, kind: 'int', get: (r) => calls.get(r.caseNumber) ?? 0 },
    { header: 'PCR Uploads', width: 8, kind: 'int', get: (r) => pcrs.get(r.caseNumber) ?? 0 },
    { header: 'Logged By', width: 20, kind: 'text', get: (r) => r.watcher },
    { header: 'Dispatcher', width: 20, kind: 'text', get: (r) => r.dispatcher },
    { header: 'Agency', width: 20, kind: 'text', get: (r) => r.agency },
    { header: 'Healthcare Worker', width: 20, kind: 'text', get: (r) => r.healthcareWorker },
    { header: 'Watcher Comments', width: 36, kind: 'wrap', get: (r) => r.watcherComments },
    { header: 'Dispatcher Comments', width: 36, kind: 'wrap', get: (r) => r.dispatcherComments },
    { header: 'Dispatcher Challenges', width: 30, kind: 'wrap', get: (r) => r.dispatcherChallenges },
    { header: 'Surveillance Note', width: 30, kind: 'wrap', get: (r) => r.surveillanceNote },
    { header: 'Partner Notes', width: 30, kind: 'wrap', get: (r) => r.partnerNotes },
    { header: 'Closure Reason', width: 30, kind: 'wrap', get: (r) => r.closureReason },
    { header: 'Last Updated', width: 17, kind: 'date', get: (r) => r.updatedAt },
  ];
  const reg = register(ws, d, 'Case Register', 'tblCases', cols, x.cases, 1,
    'Every case, one row each. First Response = minutes from first task received to arrival at scene. Contacts masked.');
  statusFormats(ws, reg, 'Status', [
    ['Resolved', GOOD], ['Dispatched', INFO], ['Submitted', WARN],
    ['Dispatch handling', WARN], ['Dispatch on hold', WARN], ['Draft', NEUTRAL],
  ]);
  statusFormats(ws, reg, 'Official Sub-County', [['No', BAD]]);
  statusFormats(ws, reg, 'Case Type', [['Referral', INFO]]);
  statusFormats(ws, reg, 'Unknown Person', [['Yes', WARN]]);
  statusFormats(ws, reg, 'Mass Casualty', [['Yes', BAD]]);
  statusFormats(ws, reg, 'GBV Case', [['Yes', BAD]]);
  return reg;
}

export function tasksRegister(ws: Worksheet, d: SystemReport, x: D): Reg {
  const reg = register(ws, d, 'Dispatch Tasks', 'tblTasks', [
    { header: 'Case No', width: 11, kind: 'text', get: (r) => r.caseNumber },
    { header: 'Vehicle Plate', width: 13, kind: 'text', get: (r) => r.vehicle },
    { header: 'Task Status', width: 15, kind: 'label', get: (r) => r.status },
    { header: 'Driver', width: 20, kind: 'text', get: (r) => r.driver },
    { header: 'Medics', width: 28, kind: 'wrap', get: (r) => r.medics || null },
    { header: 'Received', width: 17, kind: 'date', get: (r) => r.receivedAt },
    { header: 'Accepted', width: 17, kind: 'date', get: (r) => r.acceptedAt },
    { header: 'At Scene', width: 17, kind: 'date', get: (r) => r.sceneArrivalAt },
    { header: 'Patient Picked', width: 17, kind: 'date', get: (r) => r.patientPickAt },
    { header: 'Left Scene', width: 17, kind: 'date', get: (r) => r.sceneDepartureAt },
    { header: 'At Facility', width: 17, kind: 'date', get: (r) => r.facilityArrivalAt },
    { header: 'Completed', width: 17, kind: 'date', get: (r) => r.completedAt },
    { header: 'Min to Accept', width: 10, kind: 'num1', get: (r) => r.minToAccept },
    { header: 'Min to Scene', width: 10, kind: 'num1', get: (r) => r.minToScene },
    { header: 'Min on Scene', width: 10, kind: 'num1', get: (r) => r.minOnScene },
    { header: 'Min to Facility', width: 10, kind: 'num1', get: (r) => r.minToFacility },
    { header: 'Min Total', width: 10, kind: 'num1', get: (r) => r.minTotal },
    { header: 'Km to Scene', width: 10, kind: 'num1', get: (r) => r.kmToScene },
    { header: 'Km to Facility', width: 10, kind: 'num1', get: (r) => r.kmToFacility },
    { header: 'Cancelled', width: 17, kind: 'date', get: (r) => r.cancelledAt },
    { header: 'Cancel Reason', width: 26, kind: 'wrap', get: (r) => r.cancelReason },
    { header: 'Handed Over', width: 17, kind: 'date', get: (r) => r.handedOverAt },
    { header: 'Handover Reason', width: 26, kind: 'wrap', get: (r) => r.handoverReason },
    { header: 'Handed Over By', width: 20, kind: 'text', get: (r) => r.handoverBy },
    { header: 'Handover Vitals', width: 36, kind: 'wrap', get: (r) => r.handoverVitals },
  ], x.tasks, 2, 'One row per ambulance task. Intervals are minutes from when the task was received.');
  statusFormats(ws, reg, 'Task Status', [
    ['Completed', GOOD], ['Cancelled', BAD], ['Handed over', WARN], ['Pending', WARN],
  ]);
  return reg;
}

export function callsRegister(ws: Worksheet, d: SystemReport, x: D): Reg {
  const reg = register(ws, d, 'Call Log', 'tblCalls', [
    { header: 'Started', width: 17, kind: 'date', get: (r) => r.startedAt },
    { header: 'Direction', width: 11, kind: 'label', get: (r) => r.direction },
    { header: 'Call Status', width: 12, kind: 'label', get: (r) => r.status },
    { header: 'From (masked)', width: 14, kind: 'text', get: (r) => r.from },
    { header: 'To (masked)', width: 14, kind: 'text', get: (r) => r.to },
    { header: 'Ring+Talk (s)', width: 10, kind: 'int', get: (r) => r.durationSec },
    { header: 'Talk (s)', width: 9, kind: 'int', get: (r) => r.talkSec },
    { header: 'Case No', width: 11, kind: 'text', get: (r) => r.caseNumber },
    { header: 'Trunk', width: 14, kind: 'text', get: (r) => r.trunk },
    { header: 'Notes', width: 36, kind: 'wrap', get: (r) => r.notes },
  ], x.calls, 1, 'PBX call records (latest 5,000). Numbers are masked.');
  statusFormats(ws, reg, 'Call Status', [['Answered', GOOD], ['No answer', BAD], ['Busy', WARN], ['Failed', BAD]]);
  return reg;
}

export function facilitiesRegister(ws: Worksheet, d: SystemReport, x: D): Reg {
  const reg = register(ws, d, 'Facility Register', 'tblFacilities', [
    { header: 'Facility Name', width: 32, kind: 'text', get: (r) => r.name },
    { header: 'Ownership', width: 11, kind: 'text', get: (r) => (r.ownership === 'PRIVATE' ? 'Private' : 'Public') },
    { header: 'Type', width: 20, kind: 'text', get: (r) => r.type },
    { header: 'KEPH Level', width: 9, kind: 'int', get: (r) => r.kephLevel },
    { header: 'Sub-County', width: 16, kind: 'text', get: (r) => r.subCounty },
    { header: 'Status', width: 10, kind: 'text', get: (r) => (r.isActive ? 'Active' : 'Inactive') },
    { header: 'Cases Received', width: 10, kind: 'int', get: (r) => r.casesReceived },
    { header: 'Crew Rating', width: 9, kind: 'num1', get: (r) => r.ratingAverage },
    { header: 'Ratings', width: 8, kind: 'int', get: (r) => r.ratingCount },
    { header: 'Latitude', width: 11, kind: 'coord', get: (r) => r.lat },
    { header: 'Longitude', width: 11, kind: 'coord', get: (r) => r.lng },
  ], x.facilities, 1, 'Every facility, public first. Cases Received counts cases with this as target facility.');
  statusFormats(ws, reg, 'Ownership', [['Public', INFO], ['Private', WARN]]);
  statusFormats(ws, reg, 'Status', [['Inactive', BAD]]);
  return reg;
}

export function ratingsRegister(ws: Worksheet, d: SystemReport, x: D): Reg {
  return register(ws, d, 'Facility Ratings', 'tblRatings', [
    { header: 'Rated', width: 17, kind: 'date', get: (r) => r.createdAt },
    { header: 'Facility', width: 30, kind: 'text', get: (r) => r.facility },
    { header: 'Stars', width: 7, kind: 'int', get: (r) => r.stars },
    { header: 'Tags', width: 30, kind: 'wrap', get: (r) => r.tags || null },
    { header: 'Comment', width: 40, kind: 'wrap', get: (r) => r.comment },
    { header: 'Rated By', width: 20, kind: 'text', get: (r) => r.by },
    { header: 'Role', width: 10, kind: 'label', get: (r) => r.role },
    { header: 'Case No', width: 11, kind: 'text', get: (r) => r.caseNumber },
  ], x.ratings, 2, 'Crew rating of the receiving facility after each case (1-5 stars).');
}

export function usersRegister(ws: Worksheet, d: SystemReport, x: D): Reg {
  const reg = register(ws, d, 'Staff Register', 'tblUsers', [
    { header: 'Name', width: 24, kind: 'text', get: (r) => r.name },
    { header: 'Primary Role', width: 14, kind: 'label', get: (r) => r.role },
    { header: 'All Roles', width: 20, kind: 'text', get: (r) => r.roles.split(', ').map(labelize).join(', ') },
    { header: 'Agency', width: 22, kind: 'text', get: (r) => r.agency },
    { header: 'Email (masked)', width: 26, kind: 'text', get: (r) => r.email },
    { header: 'Phone (masked)', width: 14, kind: 'text', get: (r) => r.phone },
    { header: 'Active', width: 8, kind: 'yesno', get: (r) => r.isActive },
    { header: 'Joined', width: 17, kind: 'date', get: (r) => r.createdAt },
    { header: 'Cases Logged', width: 9, kind: 'int', get: (r) => r.casesLogged },
    { header: 'Cases Dispatched', width: 10, kind: 'int', get: (r) => r.casesDispatched },
    { header: 'Crew Tasks', width: 9, kind: 'int', get: (r) => r.crewTasks },
  ], x.users, 1, 'Every user account. Email and phone are masked; passwords are never exported.');
  statusFormats(ws, reg, 'Active', [['No', BAD]]);
  return reg;
}

export function checkInsRegister(ws: Worksheet, d: SystemReport, x: D): Reg {
  const reg = register(ws, d, 'Shift Check-ins', 'tblCheckIns', [
    { header: 'Checked In', width: 17, kind: 'date', get: (r) => r.checkedInAt },
    { header: 'Crew Member', width: 22, kind: 'text', get: (r) => r.name },
    { header: 'Role', width: 10, kind: 'label', get: (r) => r.role },
    { header: 'Vehicle Plate', width: 13, kind: 'text', get: (r) => r.vehicle },
    { header: 'GPS Match', width: 12, kind: 'label', get: (r) => r.locationMatch },
    { header: 'Phone-to-Tracker (m)', width: 12, kind: 'int', get: (r) => r.distanceM },
    { header: 'GPS Accuracy (m)', width: 10, kind: 'int', get: (r) => r.accuracyM },
    { header: 'Mock Location', width: 9, kind: 'yesno', get: (r) => r.mockLocation },
    { header: 'Location', width: 30, kind: 'wrap', get: (r) => r.location },
  ], x.checkIns, 2, 'Crew shift check-ins with the phone-vs-ambulance-tracker location test.');
  statusFormats(ws, reg, 'GPS Match', [['Matched', GOOD], ['Mismatch', BAD], ['Unverified', NEUTRAL]]);
  statusFormats(ws, reg, 'Mock Location', [['Yes', BAD]]);
  return reg;
}

export function fleetRegister(ws: Worksheet, d: SystemReport, x: D): Reg {
  const reg = register(ws, d, 'Fleet Register', 'tblFleet', [
    { header: 'Plate', width: 13, kind: 'text', get: (r) => r.plate },
    { header: 'Status', width: 13, kind: 'label', get: (r) => r.status },
    { header: 'In Service', width: 9, kind: 'yesno', get: (r) => r.isActive },
    { header: 'Agency', width: 22, kind: 'text', get: (r) => r.agency },
    { header: 'Tracker IMEI (masked)', width: 18, kind: 'text', get: (r) => r.trackerImei },
    { header: 'Current Driver', width: 20, kind: 'text', get: (r) => r.currentDriver },
    { header: 'Current Medics', width: 26, kind: 'wrap', get: (r) => r.currentMedics || null },
    { header: 'Last Location', width: 28, kind: 'wrap', get: (r) => r.lastLocation },
    { header: 'Last Seen', width: 17, kind: 'date', get: (r) => r.lastSeenAt },
    { header: 'Fuel (L)', width: 9, kind: 'num1', get: (r) => r.fuelLitres },
    { header: 'Tasks', width: 7, kind: 'int', get: (r) => r.tasksTotal },
    { header: 'Completed', width: 10, kind: 'int', get: (r) => r.tasksCompleted },
    { header: 'GPS Km Logged', width: 11, kind: 'num1', get: (r) => r.distanceKm },
  ], x.fleet, 1, 'Every ambulance by plate. GPS Km Logged is distance recorded by the tracker poller.');
  statusFormats(ws, reg, 'Status', [['Ready', GOOD], ['Busy', WARN], ['Maintenance', BAD]]);
  statusFormats(ws, reg, 'In Service', [['No', BAD]]);
  return reg;
}

export function standbyRegister(ws: Worksheet, d: SystemReport, x: D): Reg {
  return register(ws, d, 'Standby Deployments', 'tblStandby', [
    { header: 'Vehicle Plate', width: 13, kind: 'text', get: (r) => r.vehicle },
    { header: 'Deployment', width: 28, kind: 'wrap', get: (r) => r.title },
    { header: 'Location', width: 28, kind: 'wrap', get: (r) => r.location },
    { header: 'Started', width: 17, kind: 'date', get: (r) => r.startedAt },
    { header: 'Ended', width: 17, kind: 'date', get: (r) => r.endedAt },
    { header: 'Minutes', width: 9, kind: 'num1', get: (r) => r.minutes },
    { header: 'Notes', width: 36, kind: 'wrap', get: (r) => r.notes },
  ], x.standbys, 1, 'Ambulances posted on standby at events or hotspots. Blank Ended = still deployed.');
}

export function inventoryRegister(ws: Worksheet, d: SystemReport, x: D): Reg {
  const reg = register(ws, d, 'Stock Register', 'tblInventory', [
    { header: 'Item', width: 30, kind: 'text', get: (r) => r.name },
    { header: 'Category', width: 15, kind: 'label', get: (r) => r.category },
    { header: 'In Stock', width: 9, kind: 'int', get: (r) => r.quantityStock },
    { header: 'Reorder Level', width: 9, kind: 'int', get: (r) => r.reorderLevel },
    { header: 'Unit', width: 8, kind: 'text', get: (r) => r.unit },
    {
      header: 'Stock Flag', width: 13, kind: 'text',
      get: (r) => (r.quantityStock === 0 ? 'Out of stock' : r.reorderLevel > 0 && r.quantityStock <= r.reorderLevel ? 'Low' : 'OK'),
    },
  ], x.inventory, 1, 'Active stock items in the store. Low = at or below reorder level.');
  statusFormats(ws, reg, 'Stock Flag', [['Out of stock', BAD], ['Low', WARN], ['OK', GOOD]]);
  return reg;
}

export function checkoutsRegister(ws: Worksheet, d: SystemReport, x: D): Reg {
  const reg = register(ws, d, 'Stock Checkouts', 'tblCheckouts', [
    { header: 'Checked Out', width: 17, kind: 'date', get: (r) => r.checkedOutAt },
    { header: 'Item', width: 28, kind: 'text', get: (r) => r.item },
    { header: 'Category', width: 14, kind: 'label', get: (r) => r.category },
    { header: 'Qty Out', width: 8, kind: 'int', get: (r) => r.quantity },
    { header: 'Qty Returned', width: 9, kind: 'int', get: (r) => r.returned },
    { header: 'Unit', width: 8, kind: 'text', get: (r) => r.unit },
    { header: 'Checkout Status', width: 13, kind: 'label', get: (r) => r.status },
    { header: 'Returned', width: 17, kind: 'date', get: (r) => r.returnedAt },
    { header: 'Taken By', width: 20, kind: 'text', get: (r) => r.by },
    { header: 'Vehicle Plate', width: 13, kind: 'text', get: (r) => r.vehicle },
  ], x.checkouts, 2, 'Stock issued from the store to ambulances (latest 5,000).');
  statusFormats(ws, reg, 'Checkout Status', [['Checked out', WARN], ['Returned', GOOD]]);
  return reg;
}

export function checklistRegister(ws: Worksheet, d: SystemReport, x: D): Reg {
  const reg = register(ws, d, 'Equipment Checklists', 'tblChecklist', [
    { header: 'Checked', width: 17, kind: 'date', get: (r) => r.checkedAt },
    { header: 'Vehicle Plate', width: 13, kind: 'text', get: (r) => r.vehicle },
    { header: 'Item', width: 28, kind: 'text', get: (r) => r.item },
    { header: 'Category', width: 14, kind: 'label', get: (r) => r.category },
    { header: 'Result', width: 10, kind: 'label', get: (r) => r.status },
    { header: 'Note', width: 36, kind: 'wrap', get: (r) => r.note },
    { header: 'Checked By', width: 20, kind: 'text', get: (r) => r.by },
  ], x.checklist, 2, 'Latest per-ambulance equipment check for each item.');
  statusFormats(ws, reg, 'Result', [['Ok', GOOD], ['Missing', BAD], ['Faulty', BAD], ['Low', WARN]]);
  return reg;
}

export function pcrRegister(ws: Worksheet, d: SystemReport, x: D): Reg {
  return register(ws, d, 'PCR Uploads', 'tblPcr', [
    { header: 'Uploaded', width: 17, kind: 'date', get: (r) => r.createdAt },
    { header: 'Case No', width: 11, kind: 'text', get: (r) => r.caseNumber },
    { header: 'Uploaded By', width: 22, kind: 'text', get: (r) => r.uploader },
    { header: 'File Type', width: 16, kind: 'text', get: (r) => r.mimeType },
    { header: 'Size (KB)', width: 10, kind: 'num1', get: (r) => r.sizeKb },
    { header: 'Note', width: 40, kind: 'wrap', get: (r) => r.note },
  ], x.pcrs, 2, 'Patient Care Report files attached to cases by crews.');
}

export function activityRegister(ws: Worksheet, d: SystemReport, x: D): Reg {
  return register(ws, d, 'Activity Log', 'tblActivity', [
    { header: 'When', width: 17, kind: 'date', get: (r) => r.at },
    { header: 'User', width: 22, kind: 'text', get: (r) => r.user },
    { header: 'Role', width: 12, kind: 'label', get: (r) => r.role },
    { header: 'Action', width: 18, kind: 'label', get: (r) => r.action },
    { header: 'Record Type', width: 16, kind: 'text', get: (r) => r.subject },
    { header: 'Record Ref', width: 11, kind: 'text', get: (r) => r.subjectId },
    { header: 'IP (masked)', width: 14, kind: 'text', get: (r) => r.ip },
  ], x.activity, 1, 'System audit trail (latest 5,000 actions).');
}
