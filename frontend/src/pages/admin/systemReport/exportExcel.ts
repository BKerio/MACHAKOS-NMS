import type { Workbook, Worksheet } from 'exceljs';
import { renderPie } from './pieImage';
import {
  caseSlices,
  fmtMinutes,
  labelize,
  ownershipSlices,
  toSlices,
  type Slice,
  type SystemReport,
} from './types';

const BRAND = 'FF1B5FAC';
const INK = 'FF15211B';
const MUTED = 'FF6B7670';
const LINE = 'FFE1E0D9';
const ZEBRA = 'FFF7F7F9';
const RED_SOFT = 'FFFBEAEA';
const RED = 'FFD62828';

const PIE_ROWS = 16; // a 300px pie spans ~16 default-height rows
const PIE_COL = 4; // zero-based column E

type Cell = string | number | null;

interface Block {
  title: string;
  headers: string[];
  rows: Cell[][];
  /** Index of a 0-1 share column, formatted as a percentage. */
  shareCol?: number;
  total?: Cell[];
  pie?: { title: string; slices: Slice[]; caption?: string };
  highlight?: (row: Cell[]) => boolean;
}

const nairobi = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' });

/** Builds the styled, chart-carrying workbook as .xlsx bytes. */
export async function buildSystemReportWorkbook(data: SystemReport) {
  // Loaded on demand: ExcelJS is large and only needed when someone exports.
  const mod = await import('exceljs');
  const ExcelJS = ((mod as any).default ?? mod) as typeof import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Machakos County EOC';
  wb.created = new Date(data.generatedAt);

  buildSummary(wb, data);
  buildCases(wb, data);
  buildFacilities(wb, data);
  buildUsers(wb, data);
  buildFleet(wb, data);
  buildInventory(wb, data);

  return wb.xlsx.writeBuffer();
}

/** Builds the workbook and triggers the download. */
export async function exportSystemReportExcel(data: SystemReport) {
  const buf = await buildSystemReportWorkbook(data);
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `EOC_System_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Sheets ───────────────────────────────────────────────────────────────────

function buildSummary(wb: Workbook, d: SystemReport) {
  const ws = sheet(wb, 'Summary', [34, 18, 3]);
  let r = header(ws, 'System Report Summary', d.generatedAt);
  const c = d.caseSummary;
  const rt = d.responseTimes;
  const s = d.summary;

  const casesTop = r;
  r = table(ws, r, {
    title: 'Cases',
    headers: ['Metric', 'Value'],
    rows: [
      ['Total cases', c.total],
      ['Solved (resolved)', c.resolved],
      ['Pending (awaiting dispatch)', c.pending],
      ['In progress (crew dispatched)', c.inProgress],
      ['Drafts (not submitted)', c.drafts],
      ['Resolution rate (of submitted)', `${c.resolutionRate}%`],
      ['Cases today', c.today],
      ['Cases - last 7 days', c.last7Days],
      ['Cases - last 30 days', c.last30Days],
      ['Mass casualty incidents', c.massCasualty],
      ['GBV-flagged cases', c.gbvFlagged],
    ],
  });
  placePie(wb, ws, casesTop, { title: 'Case outcomes', slices: caseSlices(d), caption: 'cases' });
  r = Math.max(r, casesTop + PIE_ROWS + 1);

  const facTop = r;
  r = table(ws, r, {
    title: 'Facilities',
    headers: ['Metric', 'Value'],
    rows: [
      ['Total facilities', s.facilities],
      ['Public', s.publicFacilities],
      ['Private', s.privateFacilities],
      ['Active', s.activeFacilities],
      ['Inactive', s.facilities - s.activeFacilities],
    ],
  });
  placePie(wb, ws, facTop, { title: 'Facilities - Public vs Private', slices: ownershipSlices(d), caption: 'facilities' });
  r = Math.max(r, facTop + PIE_ROWS + 1);

  r = table(ws, r, {
    title: 'Response Times (all tasks)',
    headers: ['Metric', 'Value'],
    rows: [
      ['Avg time to accept', fmtMinutes(rt.avgAcceptMinutes)],
      ['Avg time to reach scene', fmtMinutes(rt.avgResponseMinutes)],
      ['Avg case duration (received to complete)', fmtMinutes(rt.avgCaseMinutes)],
      ['Completed tasks', rt.completedTasks],
      ['Distance covered (km)', rt.totalDistanceKm],
    ],
  });

  table(ws, r, {
    title: 'People, Fleet & Stock',
    headers: ['Metric', 'Value'],
    rows: [
      ['Total users', s.users],
      ['Active users', s.activeUsers],
      ['Inactive users', s.inactiveUsers],
      ['Vehicles', s.vehicles],
      ['Total tasks', s.tasks],
      ['Agencies', s.agencies],
      ['Partner ambulances (active / total)', `${s.activePartnerAmbulances} / ${s.partnerAmbulances}`],
      ['Inventory items', s.inventoryItems],
      ['Low stock items', s.lowStockItems],
      ['GBV reports', s.gbvReports],
      ['Nature options', s.natureOptions],
    ],
    highlight: (row) => row[0] === 'Low stock items' && Number(row[1]) > 0,
  });
}

function buildCases(wb: Workbook, d: SystemReport) {
  const ws = sheet(wb, 'Cases', [32, 12, 12, 3]);
  let r = header(ws, 'Cases', d.generatedAt);
  const total = d.caseSummary.total;

  r = block(wb, ws, r, {
    title: 'Case Outcomes',
    headers: ['Outcome', 'Cases', 'Share'],
    rows: caseSlices(d).map((x) => [x.label, x.value, share(x.value, total)]),
    shareCol: 2,
    total: ['Total', total, 1],
    pie: { title: 'Case outcomes', slices: caseSlices(d), caption: 'cases' },
  });

  r = block(wb, ws, r, {
    title: 'Cases by Status (detailed)',
    headers: ['Status', 'Cases', 'Share'],
    rows: d.incidentsByStatus.map((x) => [labelize(x.status), x.count, share(x.count, total)]),
    shareCol: 2,
  });

  r = block(wb, ws, r, {
    title: 'Cases by Nature',
    headers: ['Nature', 'Cases', 'Share'],
    rows: d.incidentsByNature.map((x) => [x.nature, x.count, share(x.count, total)]),
    shareCol: 2,
    pie: { title: 'Cases by nature', slices: toSlices(d.incidentsByNature, (x) => x.nature, (x) => x.count), caption: 'cases' },
  });

  r = block(wb, ws, r, {
    title: 'Cases by Sub-County',
    headers: ['Sub-County', 'Cases', 'Share'],
    rows: d.incidentsBySubCounty.map((x) => [x.subCounty, x.count, share(x.count, total)]),
    shareCol: 2,
    pie: { title: 'Cases by sub-county', slices: toSlices(d.incidentsBySubCounty, (x) => x.subCounty, (x) => x.count), caption: 'cases' },
  });

  r = block(wb, ws, r, {
    title: 'Patients by Gender',
    headers: ['Gender', 'Cases', 'Share'],
    rows: d.incidentsByGender.map((x) => [x.gender, x.count, share(x.count, total)]),
    shareCol: 2,
    pie: { title: 'Patients by gender', slices: toSlices(d.incidentsByGender, (x) => x.gender, (x) => x.count), caption: 'cases' },
  });

  block(wb, ws, r, {
    title: 'Monthly Trend (last 6 months)',
    headers: ['Month', 'Cases', 'Solved', 'Solved %'],
    rows: d.incidentsByMonth.map((m) => [monthLabel(m.month), m.total, m.resolved, share(m.resolved, m.total)]),
    shareCol: 3,
  });
}

function buildFacilities(wb: Workbook, d: SystemReport) {
  const ws = sheet(wb, 'Facilities', [34, 22, 12, 10, 18, 10]);
  let r = header(ws, 'Facilities', d.generatedAt);
  const total = d.summary.facilities;

  r = block(wb, ws, r, {
    title: 'Ownership - Public vs Private',
    headers: ['Ownership', 'Facilities', 'Share'],
    rows: ownershipSlices(d).map((x) => [x.label, x.value, share(x.value, total)]),
    shareCol: 2,
    total: ['Total', total, 1],
    pie: { title: 'Public vs Private', slices: ownershipSlices(d), caption: 'facilities' },
  });

  r = block(wb, ws, r, {
    title: 'Facilities by Type',
    headers: ['Type', 'Facilities', 'Share'],
    rows: d.facilitiesByType.map((x) => [x.type, x.count, share(x.count, total)]),
    shareCol: 2,
    pie: { title: 'Facilities by type', slices: toSlices(d.facilitiesByType, (x) => x.type, (x) => x.count), caption: 'facilities' },
  });

  r = block(wb, ws, r, {
    title: 'Facilities by KEPH Level',
    headers: ['KEPH Level', 'Facilities', 'Share'],
    rows: d.facilitiesByKeph.map((x) => [`Level ${x.level}`, x.count, share(x.count, total)]),
    shareCol: 2,
  });

  table(ws, r, {
    title: 'Facility Register',
    headers: ['Name', 'Type', 'Ownership', 'KEPH', 'Sub-County', 'Status'],
    rows: d.facilityList.map((f) => [
      f.name,
      f.type,
      f.ownership === 'PRIVATE' ? 'Private' : 'Public',
      f.kephLevel,
      f.subCounty,
      f.isActive ? 'Active' : 'Inactive',
    ]),
    highlight: (row) => row[5] === 'Inactive',
  });
}

function buildUsers(wb: Workbook, d: SystemReport) {
  const ws = sheet(wb, 'Users', [28, 12, 12, 3]);
  let r = header(ws, 'Users', d.generatedAt);
  const total = d.summary.users;

  r = block(wb, ws, r, {
    title: 'Users by Role',
    headers: ['Role', 'Users', 'Share'],
    rows: d.usersByRole.map((x) => [labelize(x.role), x.count, share(x.count, total)]),
    shareCol: 2,
    total: ['Total', total, 1],
    pie: { title: 'Users by role', slices: toSlices(d.usersByRole, (x) => labelize(x.role), (x) => x.count), caption: 'users' },
  });

  block(wb, ws, r, {
    title: 'Account Status',
    headers: ['Status', 'Users', 'Share'],
    rows: d.usersByStatus.map((x) => [x.status, x.count, share(x.count, total)]),
    shareCol: 2,
  });
}

function buildFleet(wb: Workbook, d: SystemReport) {
  const ws = sheet(wb, 'Fleet & Tasks', [30, 12, 12, 3]);
  let r = header(ws, 'Fleet & Tasks', d.generatedAt);
  const s = d.summary;

  r = block(wb, ws, r, {
    title: 'Vehicles by Status',
    headers: ['Status', 'Vehicles', 'Share'],
    rows: d.vehiclesByStatus.map((x) => [labelize(x.status), x.count, share(x.count, s.vehicles)]),
    shareCol: 2,
    total: ['Total', s.vehicles, 1],
    pie: { title: 'Fleet status', slices: toSlices(d.vehiclesByStatus, (x) => labelize(x.status), (x) => x.count), caption: 'vehicles' },
  });

  r = block(wb, ws, r, {
    title: 'Tasks by Status',
    headers: ['Status', 'Tasks', 'Share'],
    rows: d.tasksByStatus.map((x) => [labelize(x.status), x.count, share(x.count, s.tasks)]),
    shareCol: 2,
    total: ['Total', s.tasks, 1],
    pie: { title: 'Tasks by status', slices: toSlices(d.tasksByStatus, (x) => labelize(x.status), (x) => x.count), caption: 'tasks' },
  });

  block(wb, ws, r, {
    title: 'Agencies by Type',
    headers: ['Type', 'Agencies', 'Share'],
    rows: d.agenciesByType.map((x) => [labelize(x.type), x.count, share(x.count, s.agencies)]),
    shareCol: 2,
  });
}

function buildInventory(wb: Workbook, d: SystemReport) {
  const ws = sheet(wb, 'Inventory', [32, 16, 10, 10, 10]);
  let r = header(ws, 'Inventory', d.generatedAt);

  r = block(wb, ws, r, {
    title: 'Stock by Category',
    headers: ['Category', 'Items', 'Units in stock'],
    rows: d.inventoryByCategory.map((x) => [labelize(x.category), x.items, x.stock]),
    total: [
      'Total',
      d.inventoryByCategory.reduce((a, x) => a + x.items, 0),
      d.inventoryByCategory.reduce((a, x) => a + x.stock, 0),
    ],
    pie: {
      title: 'Units in stock by category',
      slices: toSlices(d.inventoryByCategory, (x) => labelize(x.category), (x) => x.stock),
      caption: 'units',
    },
  });

  table(ws, r, {
    title: `Low Stock (${d.inventoryLowStock.length} items at or below reorder level - out of stock in red)`,
    headers: ['Item', 'Category', 'Stock', 'Reorder', 'Unit'],
    rows: d.inventoryLowStock.map((x) => [x.name, labelize(x.category), x.quantityStock, x.reorderLevel, x.unit]),
    highlight: (row) => row[2] === 0,
  });
}

// ── Layout helpers ───────────────────────────────────────────────────────────

function sheet(wb: Workbook, name: string, widths: number[]) {
  const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }] });
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  return ws;
}

/** Title band + timestamp. Returns the first free row. */
function header(ws: Worksheet, title: string, generatedAt: string) {
  ws.mergeCells(1, 1, 1, 12);
  const t = ws.getCell(1, 1);
  t.value = `Machakos County EOC - ${title}`;
  t.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  t.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 32;

  ws.mergeCells(2, 1, 2, 12);
  const s = ws.getCell(2, 1);
  s.value = `Generated ${nairobi(generatedAt)} (Africa/Nairobi)`;
  s.font = { italic: true, size: 10, color: { argb: MUTED } };
  s.alignment = { indent: 1 };
  return 4;
}

/** A table, with its pie to the right when given. Returns the next free row. */
function block(wb: Workbook, ws: Worksheet, row: number, b: Block) {
  const end = table(ws, row, b);
  if (b.pie && b.pie.slices.some((s) => s.value > 0)) {
    placePie(wb, ws, row, b.pie);
    return Math.max(end, row + PIE_ROWS + 1);
  }
  return end;
}

function placePie(wb: Workbook, ws: Worksheet, row: number, pie: NonNullable<Block['pie']>) {
  const img = renderPie(pie.title, pie.slices, pie.caption);
  const id = wb.addImage({ base64: img.dataUrl, extension: 'png' });
  ws.addImage(id, { tl: { col: PIE_COL, row: row - 1 }, ext: { width: img.width, height: img.height } });
}

function table(ws: Worksheet, row: number, b: Block) {
  const cols = b.headers.length;
  const title = ws.getCell(row, 1);
  title.value = b.title;
  title.font = { bold: true, size: 12, color: { argb: INK } };
  row += 1;

  const head = ws.getRow(row);
  b.headers.forEach((h, i) => {
    const c = head.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle' };
    c.border = { bottom: { style: 'thin', color: { argb: BRAND } } };
  });
  head.height = 20;
  row += 1;

  const body = b.rows.length ? b.rows : [['No data', ...Array(cols - 1).fill(null)]];
  body.forEach((vals, ri) => {
    const hot = b.highlight?.(vals) ?? false;
    vals.forEach((v, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = v;
      c.alignment = { horizontal: i === 0 ? 'left' : 'right' };
      if (i === b.shareCol) c.numFmt = '0.0%';
      c.border = { bottom: { style: 'hair', color: { argb: LINE } } };
      if (hot) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_SOFT } };
        c.font = { color: { argb: RED }, bold: i === 0 };
      } else if (ri % 2 === 1) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      }
    });
    row += 1;
  });

  if (b.total) {
    b.total.forEach((v, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = v;
      c.font = { bold: true, color: { argb: INK } };
      c.alignment = { horizontal: i === 0 ? 'left' : 'right' };
      if (i === b.shareCol) c.numFmt = '0.0%';
      c.border = { top: { style: 'thin', color: { argb: INK } } };
    });
    row += 1;
  }
  return row + 1;
}

function share(part: number, whole: number) {
  return whole > 0 ? part / whole : 0;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
