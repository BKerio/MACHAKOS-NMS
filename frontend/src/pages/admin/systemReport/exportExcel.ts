import type { Workbook, Worksheet } from 'exceljs';
import { renderPie } from './pieImage';
import {
  CASE_COLORS,
  OWNERSHIP_COLORS,
  labelize,
  toSlices,
  type Slice,
  type SystemReport,
  type SystemReportDetails,
} from './types';

/*
 * Workbook layout
 *   Contents          index with links, definitions, data notes
 *   Summary           headline figures - formulas over the registers below
 *   Case Analysis     outcomes, status, nature, sub-county, gender, monthly trend (+ pies)
 *   Cases             full case register, one row per case
 *   Dispatch Tasks    one row per ambulance task, every timestamp and interval
 *   Facility Analysis ownership, type, KEPH level (+ pies)
 *   Facilities        facility register
 *   People & Fleet    users by role, account status, fleet and task status (+ pies)
 *   Users             staff register (contacts masked)
 *   Fleet             vehicle register by plate
 *   Inventory         stock register with low / out-of-stock flags
 *
 * Analysis cells are COUNTIF/COUNTIFS/AVERAGE formulas against the register
 * sheets, written with their computed result cached so the file reads correctly
 * before Excel recalculates. Pies are images: a snapshot at export time.
 */

const FONT = 'Arial';
const BRAND = 'FF1B5FAC';
const INK = 'FF15211B';
const MUTED = 'FF6B7670';
const LINE = 'FFE1E0D9';
const SECTION_FILL = 'FFEEF3FA';
const TABLE_STYLE = 'TableStyleMedium2';
const HEAD_ROW = 4; // register header row; data starts on 5
const PIE_ROWS = 16;
const PIE_COL = 5; // zero-based column F on analysis sheets
const NAIROBI_MS = 3 * 3600_000;

const S = {
  contents: 'Contents',
  summary: 'Summary',
  caseAnalysis: 'Case Analysis',
  cases: 'Cases',
  tasks: 'Dispatch Tasks',
  facilityAnalysis: 'Facility Analysis',
  facilities: 'Facilities',
  peopleFleet: 'People & Fleet',
  users: 'Users',
  fleet: 'Fleet',
  inventory: 'Inventory',
} as const;

// Status colours for conditional formatting (fill, text).
const GOOD = ['FFE3F5E3', 'FF0A6B0A'];
const WARN = ['FFFDF1D6', 'FF8A5A00'];
const INFO = ['FFE3EEFB', 'FF1C5CAB'];
const BAD = ['FFFBE3E3', 'FFB42020'];
const NEUTRAL = ['FFEFEFEF', 'FF555555'];

type Kind = 'text' | 'wrap' | 'int' | 'num1' | 'coord' | 'date' | 'yesno' | 'label';

interface Col<R> {
  header: string;
  width: number;
  kind: Kind;
  get: (r: R) => unknown;
}

/** Where a register's data sits, so analysis formulas can point at it. */
interface Reg {
  sheet: string;
  first: number;
  last: number;
  count: number;
  letter: Record<string, string>;
  values: Record<string, unknown[]>;
}

const nairobi = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' });

/** Excel stores wall-clock time with no zone, so shift UTC to Nairobi before writing. */
const toExcelDate = (iso: string | null | undefined) => (iso ? new Date(Date.parse(iso) + NAIROBI_MS) : null);

export async function buildSystemReportWorkbook(data: SystemReport, details: SystemReportDetails) {
  // Loaded on demand: ExcelJS is large and only needed when someone exports.
  const mod = await import('exceljs');
  const ExcelJS = ((mod as any).default ?? mod) as typeof import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Machakos County EOC';
  wb.created = new Date(data.generatedAt);
  wb.calcProperties = { fullCalcOnLoad: true };

  // Create every sheet up front so the tab order is fixed, then fill them.
  const ws = Object.fromEntries(
    Object.entries(S).map(([k, name]) => [k, wb.addWorksheet(name, { views: [{ showGridLines: false }] })])
  ) as Record<keyof typeof S, Worksheet>;

  const regs = {
    cases: casesRegister(ws.cases, data, details),
    tasks: tasksRegister(ws.tasks, data, details),
    facilities: facilitiesRegister(ws.facilities, data, details),
    users: usersRegister(ws.users, data, details),
    fleet: fleetRegister(ws.fleet, data, details),
    inventory: inventoryRegister(ws.inventory, data, details),
  };

  caseAnalysis(wb, ws.caseAnalysis, data, regs.cases);
  facilityAnalysis(wb, ws.facilityAnalysis, data, regs.facilities);
  peopleFleetAnalysis(wb, ws.peopleFleet, data, regs.users, regs.fleet, regs.tasks);
  summarySheet(wb, ws.summary, data, regs);
  contentsSheet(ws.contents, data, details);

  wb.eachSheet(applyFont);
  return wb.xlsx.writeBuffer();
}

/** Builds the workbook and triggers the download. */
export async function exportSystemReportExcel(data: SystemReport, details: SystemReportDetails) {
  const buf = await buildSystemReportWorkbook(data, details);
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `EOC_System_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Registers ────────────────────────────────────────────────────────────────

type CaseRow = SystemReportDetails['cases'][number];
type TaskRow = SystemReportDetails['tasks'][number];

function casesRegister(ws: Worksheet, d: SystemReport, x: SystemReportDetails) {
  const cols: Col<CaseRow>[] = [
    { header: 'Case No', width: 11, kind: 'text', get: (r) => r.caseNumber },
    { header: 'Status', width: 17, kind: 'label', get: (r) => r.status },
    { header: 'Created', width: 17, kind: 'date', get: (r) => r.createdAt },
    { header: 'Alert Time', width: 17, kind: 'date', get: (r) => r.alertAt },
    { header: 'Alert Mode', width: 13, kind: 'text', get: (r) => r.alertMode },
    { header: 'Origin of Alert', width: 16, kind: 'text', get: (r) => r.originOfAlert },
    { header: 'Nature', width: 22, kind: 'text', get: (r) => r.nature },
    { header: 'Nature Detail', width: 24, kind: 'text', get: (r) => r.natureDetail },
    { header: 'Chief Complaint', width: 40, kind: 'wrap', get: (r) => r.chiefComplaint },
    { header: 'Location', width: 28, kind: 'wrap', get: (r) => r.location },
    { header: 'Sub-County', width: 16, kind: 'text', get: (r) => r.subCounty },
    { header: 'Latitude', width: 11, kind: 'coord', get: (r) => r.lat },
    { header: 'Longitude', width: 11, kind: 'coord', get: (r) => r.lng },
    { header: 'Mass Casualty', width: 9, kind: 'yesno', get: (r) => r.massCasualty },
    { header: 'Casualties', width: 10, kind: 'int', get: (r) => r.massCasualtyCount },
    { header: 'GBV Case', width: 9, kind: 'yesno', get: (r) => r.gbv },
    { header: 'Patient Name', width: 22, kind: 'text', get: (r) => r.patientName },
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
    { header: 'Target Facility', width: 26, kind: 'text', get: (r) => r.targetFacility },
    { header: 'Place of Referral', width: 22, kind: 'text', get: (r) => r.placeOfReferral },
    { header: 'Ambulance Used', width: 14, kind: 'text', get: (r) => r.ambulanceUsed },
    { header: 'Latest Vehicle', width: 13, kind: 'text', get: (r) => r.latestVehicle },
    { header: 'Latest Task Status', width: 16, kind: 'label', get: (r) => r.latestTaskStatus },
    { header: 'Tasks', width: 7, kind: 'int', get: (r) => r.taskCount },
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
    'Every case, one row each. Contact and ID numbers are masked.');
  statusFormats(ws, reg, 'Status', [
    ['Resolved', GOOD], ['Dispatched', INFO], ['Submitted', WARN],
    ['Dispatch handling', WARN], ['Dispatch on hold', WARN], ['Draft', NEUTRAL],
  ]);
  statusFormats(ws, reg, 'Mass Casualty', [['Yes', BAD]]);
  statusFormats(ws, reg, 'GBV Case', [['Yes', BAD]]);
  return reg;
}

function tasksRegister(ws: Worksheet, d: SystemReport, x: SystemReportDetails) {
  const cols: Col<TaskRow>[] = [
    { header: 'Case No', width: 11, kind: 'text', get: (r) => r.caseNumber },
    { header: 'Vehicle Plate', width: 13, kind: 'text', get: (r) => r.vehicle },
    { header: 'Task Status', width: 15, kind: 'label', get: (r) => r.status },
    { header: 'Driver', width: 20, kind: 'text', get: (r) => r.driver },
    { header: 'Medics', width: 28, kind: 'wrap', get: (r) => r.medics },
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
  ];
  const reg = register(ws, d, 'Dispatch Tasks', 'tblTasks', cols, x.tasks, 2,
    'One row per ambulance task. Intervals are minutes from when the task was received.');
  statusFormats(ws, reg, 'Task Status', [
    ['Completed', GOOD], ['Cancelled', BAD], ['Handed over', WARN], ['Pending', WARN],
  ]);
  return reg;
}

function facilitiesRegister(ws: Worksheet, d: SystemReport, x: SystemReportDetails) {
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

function usersRegister(ws: Worksheet, d: SystemReport, x: SystemReportDetails) {
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

function fleetRegister(ws: Worksheet, d: SystemReport, x: SystemReportDetails) {
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

function inventoryRegister(ws: Worksheet, d: SystemReport, x: SystemReportDetails) {
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
  ], x.inventory, 1, 'Active stock items. Low = at or below reorder level.');
  statusFormats(ws, reg, 'Stock Flag', [['Out of stock', BAD], ['Low', WARN], ['OK', GOOD]]);
  return reg;
}

/** Writes a titled Excel Table at row 4 with typed columns, freeze panes and print setup. */
function register<R>(
  ws: Worksheet, d: SystemReport, title: string, tableName: string,
  cols: Col<R>[], rows: R[], freezeCols: number, note: string,
): Reg {
  banner(ws, title, d.generatedAt, cols.length, `${rows.length} record${rows.length === 1 ? '' : 's'}. ${note}`);
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));

  const values: Record<string, unknown[]> = {};
  const letter: Record<string, string> = {};
  cols.forEach((c, i) => {
    letter[c.header] = colLetter(i + 1);
    values[c.header] = rows.map((r) => cellValue(c.kind, c.get(r)));
  });

  if (rows.length) {
    ws.addTable({
      name: tableName,
      ref: `A${HEAD_ROW}`,
      headerRow: true,
      style: { theme: TABLE_STYLE, showRowStripes: true },
      columns: cols.map((c) => ({ name: c.header, filterButton: true })),
      rows: rows.map((_, ri) => cols.map((c) => values[c.header][ri] as any)),
    });
  } else {
    cols.forEach((c, i) => {
      const cell = ws.getCell(HEAD_ROW, i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    });
  }

  // Direct cell formatting beats the table style, so restate the header look
  // explicitly; the Arial pass at the end would otherwise turn it black.
  const head = ws.getRow(HEAD_ROW);
  head.height = 30;
  cols.forEach((_, i) => {
    const c = head.getCell(i + 1);
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    c.alignment = { wrapText: true, vertical: 'middle' };
  });

  const first = HEAD_ROW + 1;
  const last = HEAD_ROW + rows.length;
  cols.forEach((c, i) => {
    for (let r = first; r <= last; r++) {
      const cell = ws.getCell(r, i + 1);
      cell.alignment = { vertical: 'top', wrapText: c.kind === 'wrap', horizontal: isNumeric(c.kind) ? 'right' : 'left' };
      const fmt = numFmt(c.kind);
      if (fmt) cell.numFmt = fmt;
    }
  });

  ws.views = [{ state: 'frozen', xSplit: freezeCols, ySplit: HEAD_ROW, showGridLines: false }];
  printSetup(ws, `${HEAD_ROW}:${HEAD_ROW}`);
  return { sheet: ws.name, first, last, count: rows.length, letter, values };
}

function cellValue(kind: Kind, v: unknown): unknown {
  if (v === undefined || v === null || v === '') return null;
  switch (kind) {
    case 'date': return toExcelDate(String(v));
    case 'yesno': return v ? 'Yes' : 'No';
    case 'label': return labelize(String(v));
    default: return v;
  }
}

const isNumeric = (k: Kind) => k === 'int' || k === 'num1' || k === 'coord';
function numFmt(k: Kind) {
  switch (k) {
    case 'date': return 'dd-mmm-yyyy hh:mm';
    case 'int': return '#,##0';
    case 'num1': return '#,##0.0';
    case 'coord': return '0.00000';
    default: return undefined;
  }
}

function statusFormats(ws: Worksheet, reg: Reg, header: string, rules: [string, string[]][]) {
  if (!reg.count) return;
  const L = reg.letter[header];
  ws.addConditionalFormatting({
    ref: `${L}${reg.first}:${L}${reg.last}`,
    rules: rules.map(([text, [fill, font]], i) => ({
      type: 'expression' as const,
      priority: i + 1,
      formulae: [`EXACT(LOWER(${L}${reg.first}),"${text.toLowerCase()}")`],
      style: {
        fill: { type: 'pattern' as const, pattern: 'solid' as const, bgColor: { argb: fill } },
        font: { color: { argb: font }, bold: true },
      },
    })),
  });
}

// ── Formula helpers (each returns { formula, result } with the cached value) ─

function rng(reg: Reg, header: string) {
  const L = reg.letter[header];
  return `'${reg.sheet}'!$${L}$${reg.first}:$${L}$${Math.max(reg.last, reg.first)}`;
}

const crit = (s: string) => `"=${s.replace(/"/g, '""').replace(/[~*?]/g, '~$&')}"`;
const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const blank = (v: unknown) => v === null || v === undefined || v === '';

function countEq(reg: Reg, header: string, label: string) {
  return {
    formula: `COUNTIF(${rng(reg, header)},${crit(label)})`,
    result: reg.values[header].filter((v) => same(v, label)).length,
  };
}

function countNum(reg: Reg, header: string, n: number) {
  return { formula: `COUNTIF(${rng(reg, header)},${n})`, result: reg.values[header].filter((v) => v === n).length };
}

function countBlank(reg: Reg, header: string) {
  return { formula: `COUNTBLANK(${rng(reg, header)})`, result: reg.count ? reg.values[header].filter(blank).length : 0 };
}

function countAll(reg: Reg, header: string) {
  return { formula: `COUNTA(${rng(reg, header)})`, result: reg.values[header].filter((v) => !blank(v)).length };
}

function sumOf(reg: Reg, header: string) {
  const vals = reg.values[header].filter((v): v is number => typeof v === 'number');
  return { formula: `SUM(${rng(reg, header)})`, result: round1(vals.reduce((a, b) => a + b, 0)) };
}

function avgOf(reg: Reg, header: string) {
  const vals = reg.values[header].filter((v): v is number => typeof v === 'number');
  return {
    formula: `IFERROR(AVERAGE(${rng(reg, header)}),"-")`,
    result: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : '-',
  };
}

/** Cases created on/after a Nairobi calendar day. */
function countSince(reg: Reg, header: string, day: Date) {
  const [y, m, dd] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
  const cut = Date.UTC(y, m - 1, dd);
  return {
    formula: `COUNTIF(${rng(reg, header)},">="&DATE(${y},${m},${dd}))`,
    result: reg.values[header].filter((v) => v instanceof Date && v.getTime() >= cut).length,
  };
}

function countMonth(reg: Reg, dateHeader: string, y: number, m: number, extra?: { header: string; label: string }) {
  const from = Date.UTC(y, m - 1, 1);
  const to = Date.UTC(y, m, 1);
  const extraF = extra ? `,${rng(reg, extra.header)},${crit(extra.label)}` : '';
  const result = reg.values[dateHeader].filter((v, i) => {
    if (!(v instanceof Date) || v.getTime() < from || v.getTime() >= to) return false;
    return extra ? same(reg.values[extra.header][i], extra.label) : true;
  }).length;
  return {
    formula: `COUNTIFS(${rng(reg, dateHeader)},">="&DATE(${y},${m},1),${rng(reg, dateHeader)},"<"&DATE(${y},${m + 1},1)${extraF})`,
    result,
  };
}

function sumFormulas(...parts: { formula: string; result: number }[]) {
  return { formula: parts.map((p) => p.formula).join('+'), result: parts.reduce((a, p) => a + p.result, 0) };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ── Analysis sheets ──────────────────────────────────────────────────────────

interface CountItem {
  label: string;
  cell: { formula: string; result: number };
  color?: string;
}

/**
 * Label | Count (formula) | Share (formula) with a SUM total row, and an optional
 * pie to the right. Returns the next free row.
 */
function countTable(
  wb: Workbook, ws: Worksheet, row: number, title: string, labelHeader: string,
  items: CountItem[], pie?: { title: string; caption: string; categorical?: boolean },
) {
  section(ws, row, title, 3);
  const top = row;
  row += 1;
  tableHead(ws, row, [labelHeader, 'Count', 'Share']);
  row += 1;
  const first = row;
  const totalRow = first + items.length;
  const total = items.reduce((a, i) => a + i.cell.result, 0);

  items.forEach((it, i) => {
    ws.getCell(row, 1).value = it.label;
    ws.getCell(row, 2).value = it.cell;
    ws.getCell(row, 2).numFmt = '#,##0';
    ws.getCell(row, 3).value = { formula: `IF($B$${totalRow}=0,0,B${row}/$B$${totalRow})`, result: total ? it.cell.result / total : 0 };
    ws.getCell(row, 3).numFmt = '0.0%';
    bodyRow(ws, row, 3, i);
    row += 1;
  });
  if (!items.length) {
    ws.getCell(row, 1).value = 'No records';
    ws.getCell(row, 1).font = { italic: true, color: { argb: MUTED } };
    row += 1;
  }
  const tr = items.length ? totalRow : row;
  ws.getCell(tr, 1).value = 'Total';
  ws.getCell(tr, 2).value = items.length ? { formula: `SUM(B${first}:B${totalRow - 1})`, result: total } : 0;
  ws.getCell(tr, 2).numFmt = '#,##0';
  ws.getCell(tr, 3).value = items.length ? { formula: `IF(B${tr}=0,0,1)`, result: total ? 1 : 0 } : 0;
  ws.getCell(tr, 3).numFmt = '0.0%';
  totalStyle(ws, tr, 3);
  row = tr + 2;

  if (pie && total > 0) {
    const slices: Slice[] = pie.categorical
      ? toSlices(items, (i) => i.label, (i) => i.cell.result)
      : items.map((i) => ({ label: i.label, value: i.cell.result, color: i.color ?? '#898781' }));
    placePie(wb, ws, top, pie.title, slices, pie.caption);
    row = Math.max(row, top + PIE_ROWS + 1);
  }
  return row;
}

/** Distinct values of a register column, most frequent first, with blanks as "Not recorded". */
function distinct(reg: Reg, header: string): CountItem[] {
  const seen = new Map<string, string>();
  for (const v of reg.values[header]) {
    if (blank(v)) continue;
    const key = String(v).toLowerCase();
    if (!seen.has(key)) seen.set(key, String(v));
  }
  const items: CountItem[] = [...seen.values()].map((label) => ({ label, cell: countEq(reg, header, label) }));
  const blanks = countBlank(reg, header);
  if (blanks.result > 0) items.push({ label: 'Not recorded', cell: blanks });
  return items.sort((a, b) => b.cell.result - a.cell.result);
}

function caseAnalysis(wb: Workbook, ws: Worksheet, d: SystemReport, cases: Reg) {
  banner(ws, 'Case Analysis', d.generatedAt, 10, `Live counts over the ${S.cases} sheet. Pies are a snapshot at export time.`);
  widths(ws, [30, 11, 10, 3, 3]);
  let r = 4;

  const st = (label: string) => countEq(cases, 'Status', label);
  r = countTable(wb, ws, r, 'Case Outcomes', 'Outcome', [
    { label: 'Solved', cell: st('Resolved'), color: CASE_COLORS.resolved },
    { label: 'Pending', cell: sumFormulas(st('Submitted'), st('Dispatch handling'), st('Dispatch on hold')), color: CASE_COLORS.pending },
    { label: 'In progress', cell: st('Dispatched'), color: CASE_COLORS.inProgress },
    { label: 'Drafts', cell: st('Draft'), color: CASE_COLORS.drafts },
  ], { title: 'Case outcomes', caption: 'cases' });

  r = countTable(wb, ws, r, 'Cases by Status (detailed)', 'Status',
    ['Resolved', 'Dispatched', 'Submitted', 'Dispatch handling', 'Dispatch on hold', 'Draft'].map((s) => ({ label: s, cell: st(s) })));

  r = countTable(wb, ws, r, 'Cases by Nature', 'Nature', distinct(cases, 'Nature'),
    { title: 'Cases by nature', caption: 'cases', categorical: true });
  r = countTable(wb, ws, r, 'Cases by Sub-County', 'Sub-County', distinct(cases, 'Sub-County'),
    { title: 'Cases by sub-county', caption: 'cases', categorical: true });
  r = countTable(wb, ws, r, 'Patients by Gender', 'Gender', distinct(cases, 'Gender'),
    { title: 'Patients by gender', caption: 'cases', categorical: true });
  r = countTable(wb, ws, r, 'Cases by Alert Mode', 'Alert Mode', distinct(cases, 'Alert Mode'));
  r = countTable(wb, ws, r, 'Cases by Target Facility', 'Facility', distinct(cases, 'Target Facility'));

  // Monthly trend: last 6 Nairobi calendar months up to the export date.
  section(ws, r, 'Monthly Trend (last 6 months)', 4);
  r += 1;
  tableHead(ws, r, ['Month', 'Cases', 'Solved', 'Solved %']);
  r += 1;
  const gen = new Date(Date.parse(d.generatedAt) + NAIROBI_MS);
  for (let k = 5; k >= 0; k--) {
    const dt = new Date(Date.UTC(gen.getUTCFullYear(), gen.getUTCMonth() - k, 1));
    const [y, m] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1];
    const total = countMonth(cases, 'Created', y, m);
    const solved = countMonth(cases, 'Created', y, m, { header: 'Status', label: 'Resolved' });
    ws.getCell(r, 1).value = dt.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    ws.getCell(r, 2).value = total;
    ws.getCell(r, 3).value = solved;
    ws.getCell(r, 4).value = { formula: `IF(B${r}=0,0,C${r}/B${r})`, result: total.result ? solved.result / total.result : 0 };
    ws.getCell(r, 4).numFmt = '0.0%';
    bodyRow(ws, r, 4, 5 - k);
    r += 1;
  }
  printSetup(ws);
}

function facilityAnalysis(wb: Workbook, ws: Worksheet, d: SystemReport, fac: Reg) {
  banner(ws, 'Facility Analysis', d.generatedAt, 10, `Live counts over the ${S.facilities} sheet.`);
  widths(ws, [30, 11, 10, 3, 3]);
  let r = 4;
  r = countTable(wb, ws, r, 'Ownership - Public vs Private', 'Ownership', [
    { label: 'Public', cell: countEq(fac, 'Ownership', 'Public'), color: OWNERSHIP_COLORS.PUBLIC },
    { label: 'Private', cell: countEq(fac, 'Ownership', 'Private'), color: OWNERSHIP_COLORS.PRIVATE },
  ], { title: 'Public vs Private', caption: 'facilities' });
  r = countTable(wb, ws, r, 'Facilities by Type', 'Type', distinct(fac, 'Type'),
    { title: 'Facilities by type', caption: 'facilities', categorical: true });
  const levels = [...new Set(fac.values['KEPH Level'].filter((v): v is number => typeof v === 'number'))].sort();
  r = countTable(wb, ws, r, 'Facilities by KEPH Level', 'KEPH Level',
    levels.map((l) => ({ label: `Level ${l}`, cell: countNum(fac, 'KEPH Level', l) })));
  r = countTable(wb, ws, r, 'Facilities by Sub-County', 'Sub-County', distinct(fac, 'Sub-County'));
  countTable(wb, ws, r, 'Facility Status', 'Status', [
    { label: 'Active', cell: countEq(fac, 'Status', 'Active') },
    { label: 'Inactive', cell: countEq(fac, 'Status', 'Inactive') },
  ]);
  printSetup(ws);
}

function peopleFleetAnalysis(wb: Workbook, ws: Worksheet, d: SystemReport, users: Reg, fleet: Reg, tasks: Reg) {
  banner(ws, 'People & Fleet', d.generatedAt, 10, `Live counts over the ${S.users}, ${S.fleet} and ${S.tasks} sheets.`);
  widths(ws, [30, 11, 10, 3, 3]);
  let r = 4;
  r = countTable(wb, ws, r, 'Users by Role', 'Role', distinct(users, 'Primary Role'),
    { title: 'Users by role', caption: 'users', categorical: true });
  r = countTable(wb, ws, r, 'Account Status', 'Active', [
    { label: 'Yes', cell: countEq(users, 'Active', 'Yes') },
    { label: 'No', cell: countEq(users, 'Active', 'No') },
  ]);
  r = countTable(wb, ws, r, 'Fleet by Status', 'Status', distinct(fleet, 'Status'),
    { title: 'Fleet status', caption: 'vehicles', categorical: true });
  countTable(wb, ws, r, 'Tasks by Status', 'Task Status', distinct(tasks, 'Task Status'),
    { title: 'Tasks by status', caption: 'tasks', categorical: true });
  printSetup(ws);
}

// ── Summary ──────────────────────────────────────────────────────────────────

function summarySheet(
  wb: Workbook, ws: Worksheet, d: SystemReport,
  g: { cases: Reg; tasks: Reg; facilities: Reg; users: Reg; fleet: Reg; inventory: Reg },
) {
  banner(ws, 'System Report Summary', d.generatedAt, 12, 'Every figure is a formula over the register sheets.');
  widths(ws, [38, 14, 3, 3, 3]);
  const gen = new Date(Date.parse(d.generatedAt) + NAIROBI_MS);
  const day = (back: number) => new Date(Date.UTC(gen.getUTCFullYear(), gen.getUTCMonth(), gen.getUTCDate() - back));
  const st = (label: string) => countEq(g.cases, 'Status', label);
  const total = countAll(g.cases, 'Case No');
  const solved = st('Resolved');
  const drafts = st('Draft');
  const inv = g.inventory;
  const low = inv.values['Stock Flag'].filter((v) => v === 'Low' || v === 'Out of stock').length;

  type Line = [string, unknown, string?];
  const blocks: [string, Line[], number?][] = [
    ['Cases', [
      ['Total cases', total],
      ['Solved (resolved)', solved],
      ['Pending (awaiting dispatch)', sumFormulas(st('Submitted'), st('Dispatch handling'), st('Dispatch on hold'))],
      ['In progress (crew dispatched)', st('Dispatched')],
      ['Drafts (not submitted)', drafts],
      ['Resolution rate (of submitted cases)', { formula: `IF(B5-B9=0,0,B6/(B5-B9))`, result: total.result - drafts.result ? solved.result / (total.result - drafts.result) : 0 }, '0.0%'],
      ['Cases today', countSince(g.cases, 'Created', day(0))],
      ['Cases - last 7 days', countSince(g.cases, 'Created', day(6))],
      ['Cases - last 30 days', countSince(g.cases, 'Created', day(29))],
      ['Mass casualty incidents', countEq(g.cases, 'Mass Casualty', 'Yes')],
      ['GBV-flagged cases', countEq(g.cases, 'GBV Case', 'Yes')],
    ]],
    ['Response Times (minutes, all tasks)', [
      ['Avg time to accept', avgOf(g.tasks, 'Min to Accept'), '0.0'],
      ['Avg time to reach scene', avgOf(g.tasks, 'Min to Scene'), '0.0'],
      ['Avg time on scene', avgOf(g.tasks, 'Min on Scene'), '0.0'],
      ['Avg scene to facility', avgOf(g.tasks, 'Min to Facility'), '0.0'],
      ['Avg case duration (received to complete)', avgOf(g.tasks, 'Min Total'), '0.0'],
      ['Completed tasks', countEq(g.tasks, 'Task Status', 'Completed')],
      ['Km driven on cases', sumFormulas(sumOf(g.tasks, 'Km to Scene'), sumOf(g.tasks, 'Km to Facility')), '#,##0.0'],
    ]],
    ['Facilities', [
      ['Total facilities', countAll(g.facilities, 'Facility Name')],
      ['Public', countEq(g.facilities, 'Ownership', 'Public')],
      ['Private', countEq(g.facilities, 'Ownership', 'Private')],
      ['Active', countEq(g.facilities, 'Status', 'Active')],
      ['Inactive', countEq(g.facilities, 'Status', 'Inactive')],
    ]],
    ['People', [
      ['Total users', countAll(g.users, 'Name')],
      ['Active users', countEq(g.users, 'Active', 'Yes')],
      ['Inactive users', countEq(g.users, 'Active', 'No')],
      ...distinct(g.users, 'Primary Role').map((i): Line => [`- ${i.label}`, i.cell]),
    ]],
    ['Fleet', [
      ['Vehicles (plates)', countAll(g.fleet, 'Plate')],
      ...distinct(g.fleet, 'Status').map((i): Line => [`- ${i.label}`, i.cell]),
      ['GPS km logged', sumOf(g.fleet, 'GPS Km Logged'), '#,##0.0'],
      ['Partner ambulances (active / total)', `${d.summary.activePartnerAmbulances} / ${d.summary.partnerAmbulances}`],
    ]],
    ['Inventory', [
      ['Stock items', countAll(inv, 'Item')],
      ['Low or out of stock', { formula: `${countEq(inv, 'Stock Flag', 'Low').formula}+${countEq(inv, 'Stock Flag', 'Out of stock').formula}`, result: low }],
      ['Out of stock', countEq(inv, 'Stock Flag', 'Out of stock')],
      ['Units in stock', sumOf(inv, 'In Stock'), '#,##0'],
    ]],
    ['Other Registers', [
      ['GBV reports', d.summary.gbvReports],
      ['Nature options', d.summary.natureOptions],
      ['Agencies', d.summary.agencies],
    ]],
  ];

  let r = 4;
  const pieAt: Record<string, number> = {};
  for (const [title, lines] of blocks) {
    pieAt[title] = r;
    section(ws, r, title, 2);
    r += 1;
    lines.forEach(([label, value, fmt], i) => {
      ws.getCell(r, 1).value = label;
      ws.getCell(r, 2).value = value as any;
      ws.getCell(r, 2).numFmt = fmt ?? '#,##0';
      ws.getCell(r, 2).alignment = { horizontal: 'right' };
      bodyRow(ws, r, 2, i);
      r += 1;
    });
    r += 1;
    if (title === 'Cases' || title === 'Facilities') r = Math.max(r, pieAt[title] + PIE_ROWS + 1);
  }

  // The resolution-rate formula above points at fixed cells; keep them honest.
  if (
    ws.getCell('A5').value !== 'Total cases' ||
    ws.getCell('A6').value !== 'Solved (resolved)' ||
    ws.getCell('A9').value !== 'Drafts (not submitted)'
  ) {
    throw new Error('Summary layout changed: update the resolution-rate formula references');
  }

  const caseCounts = (blocks[0][1] as Line[]).slice(1, 5).map(([, v]) => (v as { result: number }).result);
  placePie(wb, ws, pieAt['Cases'], 'Case outcomes', [
    { label: 'Solved', value: caseCounts[0], color: CASE_COLORS.resolved },
    { label: 'Pending', value: caseCounts[1], color: CASE_COLORS.pending },
    { label: 'In progress', value: caseCounts[2], color: CASE_COLORS.inProgress },
    { label: 'Drafts', value: caseCounts[3], color: CASE_COLORS.drafts },
  ], 'cases', 3);
  placePie(wb, ws, pieAt['Facilities'], 'Facilities - Public vs Private', [
    { label: 'Public', value: countEq(g.facilities, 'Ownership', 'Public').result, color: OWNERSHIP_COLORS.PUBLIC },
    { label: 'Private', value: countEq(g.facilities, 'Ownership', 'Private').result, color: OWNERSHIP_COLORS.PRIVATE },
  ], 'facilities', 3);
  ws.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }];
  printSetup(ws);
}

// ── Contents ─────────────────────────────────────────────────────────────────

function contentsSheet(ws: Worksheet, d: SystemReport, x: SystemReportDetails) {
  banner(ws, 'System Report', d.generatedAt, 3, 'Click a sheet name to jump to it.');
  widths(ws, [24, 70, 12]);
  let r = 4;
  tableHead(ws, r, ['Sheet', 'What it holds', 'Rows']);
  r += 1;
  const sheets: [string, string, number | null][] = [
    [S.summary, 'Headline figures: case outcomes, response times, facilities, people, fleet, stock', null],
    [S.caseAnalysis, 'Outcomes, status, nature, sub-county, gender, alert mode, target facility, monthly trend', null],
    [S.cases, 'Full case register - every field captured for each case', x.cases.length],
    [S.tasks, 'Every ambulance task: crew, plate, each timestamp, intervals and distances', x.tasks.length],
    [S.facilityAnalysis, 'Public vs private, type, KEPH level, sub-county, status', null],
    [S.facilities, 'Facility register with cases received and crew ratings', x.facilities.length],
    [S.peopleFleet, 'Users by role and status, fleet status, task status', null],
    [S.users, 'Staff register with roles and activity (contacts masked)', x.users.length],
    [S.fleet, 'Ambulances by plate with crew, location, fuel, tasks and km', x.fleet.length],
    [S.inventory, 'Stock register with low / out-of-stock flags', x.inventory.length],
  ];
  sheets.forEach(([name, desc, rows], i) => {
    const link = ws.getCell(r, 1);
    link.value = { text: name, hyperlink: `#'${name}'!A1` };
    link.font = { color: { argb: BRAND }, underline: true, bold: true };
    ws.getCell(r, 2).value = desc;
    ws.getCell(r, 3).value = rows;
    ws.getCell(r, 3).numFmt = '#,##0';
    bodyRow(ws, r, 3, i);
    r += 1;
  });

  r += 1;
  section(ws, r, 'Definitions & Notes', 3);
  r += 1;
  const notes: [string, string][] = [
    ['Solved', 'Case status Resolved.'],
    ['Pending', 'Waiting on dispatch: Submitted, Dispatch handling or Dispatch on hold.'],
    ['In progress', 'Status Dispatched - a crew is assigned and working the case.'],
    ['Drafts', 'Logged by a watcher but never submitted; excluded from the resolution rate.'],
    ['Resolution rate', 'Solved / (Total cases - Drafts).'],
    ['Times', 'All dates and times are Africa/Nairobi (EAT, UTC+3).'],
    ['Intervals', 'Minutes, measured from when the ambulance task was received. Blank = step not recorded.'],
    ['Masking', 'Phone numbers, emails, ID/NHIF numbers and tracker IMEIs are masked (e.g. 07*****123). Passwords are never exported.'],
    ['Formulas', 'Summary and analysis figures are live formulas over the register sheets; editing or adding register rows outside the current range is not picked up.'],
    ['Pie charts', 'Images captured at export time; they do not update when the data changes.'],
    ['Source', `Machakos County EOC system database, snapshot ${nairobi(d.generatedAt)}.`],
  ];
  notes.forEach(([k, v], i) => {
    ws.getCell(r, 1).value = k;
    ws.getCell(r, 1).font = { bold: true, color: { argb: INK } };
    ws.getCell(r, 2).value = v;
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: 'top' };
    bodyRow(ws, r, 3, i);
    r += 1;
  });
  printSetup(ws);
}

// ── Styling helpers ──────────────────────────────────────────────────────────

function banner(ws: Worksheet, title: string, generatedAt: string, span: number, note: string) {
  const cols = Math.max(span, 8);
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell(1, 1);
  t.value = `Machakos County EOC - ${title}`;
  t.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  t.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 32;

  ws.mergeCells(2, 1, 2, cols);
  const s = ws.getCell(2, 1);
  s.value = `Generated ${nairobi(generatedAt)} (Africa/Nairobi) - ${note}`;
  s.font = { italic: true, size: 9, color: { argb: MUTED } };
  s.alignment = { indent: 1, vertical: 'middle' };
  ws.getRow(2).height = 18;
}

function widths(ws: Worksheet, w: number[]) {
  w.forEach((x, i) => (ws.getColumn(i + 1).width = x));
}

function section(ws: Worksheet, row: number, title: string, span: number) {
  for (let c = 1; c <= span; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_FILL } };
    cell.border = { bottom: { style: 'medium', color: { argb: BRAND } } };
  }
  const cell = ws.getCell(row, 1);
  cell.value = title;
  cell.font = { bold: true, size: 11, color: { argb: BRAND } };
}

function tableHead(ws: Worksheet, row: number, headers: string[]) {
  headers.forEach((h, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle' };
  });
}

function bodyRow(ws: Worksheet, row: number, span: number, index: number) {
  for (let c = 1; c <= span; c++) {
    const cell = ws.getCell(row, c);
    cell.border = { bottom: { style: 'hair', color: { argb: LINE } } };
    if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F8FA' } };
    if (c > 1 && !cell.alignment?.horizontal) cell.alignment = { ...cell.alignment, horizontal: 'right' };
  }
}

function totalStyle(ws: Worksheet, row: number, span: number) {
  for (let c = 1; c <= span; c++) {
    const cell = ws.getCell(row, c);
    cell.font = { bold: true, color: { argb: INK } };
    cell.border = { top: { style: 'thin', color: { argb: INK } } };
    if (c > 1) cell.alignment = { horizontal: 'right' };
  }
}

function placePie(wb: Workbook, ws: Worksheet, row: number, title: string, slices: Slice[], caption: string, col = PIE_COL) {
  if (!slices.some((s) => s.value > 0)) return;
  const img = renderPie(title, slices, caption);
  const id = wb.addImage({ base64: img.dataUrl, extension: 'png' });
  ws.addImage(id, { tl: { col, row: row - 1 }, ext: { width: img.width, height: img.height } });
}

function printSetup(ws: Worksheet, titleRows?: string) {
  ws.pageSetup = {
    ...ws.pageSetup,
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
    ...(titleRows ? { printTitlesRow: titleRows } : {}),
  };
  ws.headerFooter = { oddFooter: '&L&8Machakos County EOC&C&8&A&R&8Page &P of &N' };
}

/** Arial everywhere, keeping each cell's size, weight and colour. */
function applyFont(ws: Worksheet) {
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { size: 10, ...cell.font, name: FONT };
    });
  });
}

function colLetter(n: number) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
