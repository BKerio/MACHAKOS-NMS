import type { Workbook, Worksheet } from 'exceljs';
import { CASE_COLORS, OWNERSHIP_COLORS, type SystemReport } from '../types';
import {
  BRAND, INK, MUTED, NAIROBI_MS, PIE_ROWS, TAB,
  analysisSheet, avgIfs, banner, bodyRow, cmp, cmpCell, colLetter, contains, countAll, countIfs, countTable,
  dateCmp, distinct, eq, inputCell, isBlank, link, metricTable, numEq, pickExtreme, placePie, plus, printSetup,
  round1, section, sumIfs, tableHead, totalStyle,
  type BlockRef, type F, type MetricRef, type Reg,
} from './core';
import { WEEKDAYS } from './registers';

export const S = {
  contents: 'Contents',
  insights: 'Insights',
  summary: 'Summary',
  caseAnalysis: 'Case Analysis',
  timePatterns: 'Time Patterns',
  response: 'Response Performance',
  facilityAnalysis: 'Facility Analysis',
  peopleFleet: 'People & Fleet',
  crew: 'Crew Accountability',
  stock: 'Stock Movements',
  quality: 'Data Quality',
  cases: 'Cases',
  tasks: 'Dispatch Tasks',
  calls: 'Calls',
  facilities: 'Facilities',
  ratings: 'Facility Ratings',
  users: 'Users',
  checkIns: 'Check-ins',
  fleet: 'Fleet',
  standby: 'Standby',
  inventory: 'Inventory',
  checkouts: 'Stock Checkouts',
  checklist: 'Checklists',
  pcr: 'PCR Uploads',
  activity: 'Activity Log',
} as const;

export interface Regs {
  cases: Reg; tasks: Reg; calls: Reg; facilities: Reg; ratings: Reg; users: Reg; checkIns: Reg;
  fleet: Reg; standby: Reg; inventory: Reg; checkouts: Reg; checklist: Reg; pcr: Reg; activity: Reg;
}

const pctOf = (part: F, whole: F): F<number | string> => ({
  formula: `IF((${whole.formula})=0,"-",(${part.formula})/(${whole.formula}))`,
  result: whole.result ? part.result / whole.result : '-',
});

const nairobiNow = (d: SystemReport) => new Date(Date.parse(d.generatedAt) + NAIROBI_MS);
const dayStart = (d: SystemReport, back: number) => {
  const g = nairobiNow(d);
  return new Date(Date.UTC(g.getUTCFullYear(), g.getUTCMonth(), g.getUTCDate() - back));
};

// ── Case Analysis ────────────────────────────────────────────────────────────

export function caseAnalysis(wb: Workbook, ws: Worksheet, d: SystemReport, g: Regs) {
  analysisSheet(ws, d, 'Case Analysis', `Live counts over the ${S.cases} sheet. Pies are a snapshot at export time.`, [32, 11, 10, 3, 3]);
  const c = g.cases;
  const st = (label: string) => countIfs(c, eq('Status', label));
  let r = 4;

  r = countTable(wb, ws, r, 'Case Outcomes', 'Outcome', [
    { label: 'Solved', cell: st('Resolved'), color: CASE_COLORS.resolved },
    { label: 'Pending', cell: plus(st('Submitted'), st('Dispatch handling'), st('Dispatch on hold')), color: CASE_COLORS.pending },
    { label: 'In progress', cell: st('Dispatched'), color: CASE_COLORS.inProgress },
    { label: 'Drafts', cell: st('Draft'), color: CASE_COLORS.drafts },
  ], { title: 'Case outcomes', caption: 'cases' }).next;

  r = countTable(wb, ws, r, 'Cases by Status (detailed)', 'Status',
    ['Resolved', 'Dispatched', 'Submitted', 'Dispatch handling', 'Dispatch on hold', 'Draft'].map((s) => ({ label: s, cell: st(s) }))).next;

  const nature = countTable(wb, ws, r, 'Cases by Nature', 'Nature', distinct(c, 'Nature'),
    { title: 'Cases by nature', caption: 'cases', categorical: true });
  r = countTable(wb, ws, nature.next, 'Nature Detail (top 15)', 'Nature Detail', distinct(c, 'Nature Detail').slice(0, 15)).next;
  const subCounty = countTable(wb, ws, r, 'Cases by Sub-County', 'Sub-County', distinct(c, 'Sub-County'),
    { title: 'Cases by sub-county', caption: 'cases', categorical: true });
  r = countTable(wb, ws, subCounty.next, 'Patients by Gender', 'Gender', distinct(c, 'Gender'),
    { title: 'Patients by gender', caption: 'cases', categorical: true }).next;
  r = countTable(wb, ws, r, 'Cases by Alert Mode', 'Alert Mode', distinct(c, 'Alert Mode'),
    { title: 'How alerts came in', caption: 'cases', categorical: true }).next;
  r = countTable(wb, ws, r, 'Cases by Origin of Alert', 'Origin', distinct(c, 'Origin of Alert')).next;
  r = countTable(wb, ws, r, 'Cases by Target Facility', 'Facility', distinct(c, 'Target Facility')).next;
  r = countTable(wb, ws, r, 'Cases by Logging Watcher', 'Logged By', distinct(c, 'Logged By')).next;
  r = countTable(wb, ws, r, 'Cases by Dispatcher', 'Dispatcher', distinct(c, 'Dispatcher')).next;
  r = countTable(wb, ws, r, 'Special Flags', 'Flag', [
    { label: 'Mass casualty', cell: countIfs(c, eq('Mass Casualty', 'Yes')) },
    { label: 'GBV case', cell: countIfs(c, eq('GBV Case', 'Yes')) },
    { label: 'Has PCR upload', cell: countIfs(c, cmp('PCR Uploads', '>', 0)) },
    { label: 'Linked to a call', cell: countIfs(c, cmp('Calls', '>', 0)) },
    { label: 'Needed more than one ambulance', cell: countIfs(c, cmp('Tasks', '>', 1)) },
  ]).next;

  // Monthly trend: last 12 Nairobi calendar months up to the export date.
  section(ws, r, 'Monthly Trend (last 12 months)', 5);
  r += 1;
  tableHead(ws, r, ['Month', 'Cases', 'Solved', 'Solved %', 'Avg First Response (min)']);
  r += 1;
  const g0 = nairobiNow(d);
  for (let k = 11; k >= 0; k--) {
    const from = new Date(Date.UTC(g0.getUTCFullYear(), g0.getUTCMonth() - k, 1));
    const to = new Date(Date.UTC(g0.getUTCFullYear(), g0.getUTCMonth() - k + 1, 1));
    const inMonth = [dateCmp('Created', '>=', from), dateCmp('Created', '<', to)];
    const total = countIfs(c, ...inMonth);
    const solved = countIfs(c, ...inMonth, eq('Status', 'Resolved'));
    ws.getCell(r, 1).value = from.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    ws.getCell(r, 2).value = total;
    ws.getCell(r, 3).value = solved;
    ws.getCell(r, 4).value = { formula: `IF(B${r}=0,0,C${r}/B${r})`, result: total.result ? solved.result / total.result : 0 };
    ws.getCell(r, 4).numFmt = '0.0%';
    ws.getCell(r, 5).value = avgIfs(c, 'First Response (min)', ...inMonth);
    ws.getCell(r, 5).numFmt = '0.0';
    bodyRow(ws, r, 5, 11 - k);
    r += 1;
  }
  return { nature, subCounty };
}

// ── Time Patterns ────────────────────────────────────────────────────────────

export function timePatterns(ws: Worksheet, d: SystemReport, g: Regs) {
  ws.properties.tabColor = { argb: TAB.analysis };
  banner(ws, 'Time Patterns', d.generatedAt, 26,
    `When cases come in (Nairobi time) - plan shifts around the dark cells. Counts over the ${S.cases} sheet.`);
  ws.getColumn(1).width = 22;
  for (let i = 2; i <= 26; i++) ws.getColumn(i).width = 5.5;
  ws.getColumn(26).width = 7;
  const c = g.cases;

  let r = 4;
  section(ws, r, 'Cases by Weekday x Hour of Day', 26);
  r += 1;
  tableHead(ws, r, ['Day \\ Hour', ...Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')), 'Total']);
  const headRow = r;
  r += 1;
  const gridTop = r;
  const rowTotals: number[] = [];
  const colTotals: number[] = Array(24).fill(0);
  WEEKDAYS.forEach((w, wi) => {
    ws.getCell(r, 1).value = w;
    let sum = 0;
    for (let h = 0; h < 24; h++) {
      const f = countIfs(c, eq('Weekday', w), numEq('Hour', h));
      ws.getCell(r, h + 2).value = f;
      ws.getCell(r, h + 2).alignment = { horizontal: 'center' };
      sum += f.result;
      colTotals[h] += f.result;
    }
    ws.getCell(r, 26).value = { formula: `SUM(B${r}:Y${r})`, result: sum };
    rowTotals.push(sum);
    bodyRow(ws, r, 26, wi);
    r += 1;
  });
  const gridBottom = r - 1;
  ws.getCell(r, 1).value = 'Total';
  for (let h = 0; h < 24; h++) {
    const L = colLetter(h + 2);
    ws.getCell(r, h + 2).value = { formula: `SUM(${L}${gridTop}:${L}${gridBottom})`, result: colTotals[h] };
    ws.getCell(r, h + 2).alignment = { horizontal: 'center' };
  }
  const grand = rowTotals.reduce((a, b) => a + b, 0);
  ws.getCell(r, 26).value = { formula: `SUM(Z${gridTop}:Z${gridBottom})`, result: grand };
  totalStyle(ws, r, 26);
  const totalRow = r;
  ws.addConditionalFormatting({
    ref: `B${gridTop}:Y${gridBottom}`,
    rules: [{
      type: 'colorScale', priority: 1,
      cfvo: [{ type: 'min' }, { type: 'max' }],
      color: [{ argb: 'FFFFFFFF' }, { argb: BRAND }],
    } as any],
  });
  r += 2;

  // Peak weekday / hour for the Insights sheet.
  const peakDay = pickExtreme(WEEKDAYS, rowTotals, `'${ws.name}'!$A$${gridTop}:$A$${gridBottom}`, `'${ws.name}'!$Z$${gridTop}:$Z$${gridBottom}`, 'MAX');
  const hourLabels = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
  const hourRange = `'${ws.name}'!$B$${totalRow}:$Y$${totalRow}`;
  const hourLabelRange = `'${ws.name}'!$B$${headRow}:$Y$${headRow}`;
  const peakHour = pickExtreme(hourLabels, colTotals, hourLabelRange, hourRange, 'MAX');

  // Hour bands - the shift view.
  section(ws, r, 'Cases by Shift Band', 4);
  r += 1;
  tableHead(ws, r, ['Band', 'Cases', 'Share']);
  ws.getColumn(2).width = 5.5;
  r += 1;
  const bands: [string, number, number][] = [
    ['Night (00:00-05:59)', 0, 6], ['Morning (06:00-11:59)', 6, 12],
    ['Afternoon (12:00-17:59)', 12, 18], ['Evening (18:00-23:59)', 18, 24],
  ];
  const bandTop = r;
  bands.forEach(([label, from, to], i) => {
    const f = countIfs(c, cmp('Hour', '>=', from), cmp('Hour', '<', to));
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 2).value = f;
    ws.getCell(r, 3).value = { formula: `IF($Z$${totalRow}=0,0,B${r}/$Z$${totalRow})`, result: grand ? f.result / grand : 0 };
    ws.getCell(r, 3).numFmt = '0%';
    bodyRow(ws, r, 3, i);
    r += 1;
  });
  ws.mergeCells(bandTop, 4, bandTop + 3, 12);
  const note = ws.getCell(bandTop, 4);
  note.value = 'Read across a row to see the busy hours on that day; read down a column to compare days at the same hour.';
  note.font = { italic: true, color: { argb: MUTED } };
  note.alignment = { wrapText: true, vertical: 'middle' };
  printSetup(ws);
  return { peakDay, peakHour };
}

// ── Response Performance ─────────────────────────────────────────────────────

export const TARGET_CELL = '$B$5';
export const DEFAULT_TARGET = 15;

export function responsePerformance(wb: Workbook, ws: Worksheet, d: SystemReport, g: Regs) {
  analysisSheet(ws, d, 'Response Performance',
    `Minutes from task received to arrival at scene. Change the yellow target cell and every % below recalculates.`,
    [30, 12, 12, 13, 13, 13, 12]);
  const t = g.tasks;
  const c = g.cases;
  const target = DEFAULT_TARGET;

  section(ws, 4, 'Response Target', 3);
  ws.getCell('A5').value = 'Target: minutes to reach scene';
  inputCell(ws, 'B5', target, 'Edit this target; within-target figures on this sheet and Insights recalculate.');
  ws.getCell('C5').value = 'minutes (edit me)';
  ws.getCell('C5').font = { italic: true, color: { argb: MUTED } };

  const timed = countIfs(t, cmp('Min to Scene', '>=', 0));
  const within = countIfs(t, cmpCell('Min to Scene', '<=', TARGET_CELL, target));
  const withinPct = pctOf(within, timed);

  let r = 7;
  section(ws, r, 'Headline', 2);
  r += 1;
  const head: [string, F<number | string>, string][] = [
    ['Tasks with a scene-arrival time', timed, '#,##0'],
    ['Reached scene within target', within, '#,##0'],
    ['% within target', withinPct, '0.0%'],
    ['Over target', countIfs(t, cmpCell('Min to Scene', '>', TARGET_CELL, target)), '#,##0'],
    ['Average minutes to scene', avgIfs(t, 'Min to Scene'), '0.0'],
    ['Median minutes to scene', median(t, 'Min to Scene'), '0.0'],
    ['90th percentile minutes to scene', percentile(t, 'Min to Scene', 0.9), '0.0'],
    ['Fastest response (min)', extreme(t, 'Min to Scene', 'MIN'), '0.0'],
    ['Slowest response (min)', extreme(t, 'Min to Scene', 'MAX'), '0.0'],
    ['Average minutes on scene', avgIfs(t, 'Min on Scene'), '0.0'],
    ['Average scene to facility', avgIfs(t, 'Min to Facility'), '0.0'],
    ['Average task duration', avgIfs(t, 'Min Total'), '0.0'],
  ];
  const withinPctAddr = `'${ws.name}'!$B$${r + 2}`;
  head.forEach(([label, f, fmt], i) => {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 2).value = f as any;
    ws.getCell(r, 2).numFmt = fmt;
    bodyRow(ws, r, 2, i);
    r += 1;
  });
  r += 1;

  r = countTable(wb, ws, r, 'Response Time Distribution', 'Minutes to scene', [
    { label: 'Under 10 min', cell: countIfs(t, cmp('Min to Scene', '>=', 0), cmp('Min to Scene', '<', 10)) },
    { label: '10-20 min', cell: countIfs(t, cmp('Min to Scene', '>=', 10), cmp('Min to Scene', '<', 20)) },
    { label: '20-30 min', cell: countIfs(t, cmp('Min to Scene', '>=', 20), cmp('Min to Scene', '<', 30)) },
    { label: '30-60 min', cell: countIfs(t, cmp('Min to Scene', '>=', 30), cmp('Min to Scene', '<', 60)) },
    { label: '60 min or more', cell: countIfs(t, cmp('Min to Scene', '>=', 60)) },
    { label: 'Not recorded', cell: countIfs(t, isBlank('Min to Scene')) },
  ], { title: 'Minutes to scene', caption: 'tasks', categorical: true }).next;

  const vehicles = distinct(t, 'Vehicle Plate');
  const byVehicle = metricTable(ws, r, 'By Ambulance (plate)', 'Plate', [
    { header: 'Tasks', fmt: '#,##0' },
    { header: 'Completed', fmt: '#,##0' },
    { header: 'Avg to Scene', fmt: '0.0', scale: 'lowGood' },
    { header: '% in Target', fmt: '0%', scale: 'highGood' },
    { header: 'Avg Task Min', fmt: '0.0', scale: 'lowGood' },
    { header: 'Km on Cases', fmt: '#,##0.0' },
  ], vehicles.map(({ label }) => {
    const v = eq('Vehicle Plate', label);
    return {
      label,
      cells: [
        countIfs(t, v),
        countIfs(t, v, eq('Task Status', 'Completed')),
        avgIfs(t, 'Min to Scene', v),
        pctOf(countIfs(t, v, cmpCell('Min to Scene', '<=', TARGET_CELL, target)), countIfs(t, v, cmp('Min to Scene', '>=', 0))),
        avgIfs(t, 'Min Total', v),
        roundF(plus(sumIfs(t, 'Km to Scene', v), sumIfs(t, 'Km to Facility', v))),
      ],
    };
  }));
  r = byVehicle.next;

  const byDriver = metricTable(ws, r, 'By Driver', 'Driver', [
    { header: 'Tasks', fmt: '#,##0' },
    { header: 'Completed', fmt: '#,##0' },
    { header: 'Avg to Scene', fmt: '0.0', scale: 'lowGood' },
    { header: '% in Target', fmt: '0%', scale: 'highGood' },
    { header: 'Handovers', fmt: '#,##0' },
  ], distinct(t, 'Driver').map(({ label }) => {
    const v = eq('Driver', label);
    return {
      label,
      cells: [
        countIfs(t, v),
        countIfs(t, v, eq('Task Status', 'Completed')),
        avgIfs(t, 'Min to Scene', v),
        pctOf(countIfs(t, v, cmpCell('Min to Scene', '<=', TARGET_CELL, target)), countIfs(t, v, cmp('Min to Scene', '>=', 0))),
        countIfs(t, v, eq('Task Status', 'Handed over')),
      ],
    };
  }));
  r = byDriver.next;

  const bySub = metricTable(ws, r, 'By Sub-County (first ambulance)', 'Sub-County', [
    { header: 'Cases', fmt: '#,##0' },
    { header: 'Avg First Response', fmt: '0.0', scale: 'lowGood' },
    { header: '% in Target', fmt: '0%', scale: 'highGood' },
  ], distinct(c, 'Sub-County').map(({ label }) => {
    const v = label === 'Not recorded' ? isBlank('Sub-County') : eq('Sub-County', label);
    return {
      label,
      cells: [
        countIfs(c, v),
        avgIfs(c, 'First Response (min)', v),
        pctOf(countIfs(c, v, cmpCell('First Response (min)', '<=', TARGET_CELL, target)), countIfs(c, v, cmp('First Response (min)', '>=', 0))),
      ],
    };
  }));
  r = bySub.next;

  metricTable(ws, r, 'By Nature of Case', 'Nature', [
    { header: 'Cases', fmt: '#,##0' },
    { header: 'Avg First Response', fmt: '0.0', scale: 'lowGood' },
    { header: '% in Target', fmt: '0%', scale: 'highGood' },
  ], distinct(c, 'Nature').map(({ label }) => {
    const v = label === 'Not recorded' ? isBlank('Nature') : eq('Nature', label);
    return {
      label,
      cells: [
        countIfs(c, v),
        avgIfs(c, 'First Response (min)', v),
        pctOf(countIfs(c, v, cmpCell('First Response (min)', '<=', TARGET_CELL, target)), countIfs(c, v, cmp('First Response (min)', '>=', 0))),
      ],
    };
  }));

  return { withinPct, withinPctAddr, byVehicle, byDriver, target };
}

function numbersOf(reg: Reg, header: string) {
  return reg.values[header].filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
}
function median(reg: Reg, header: string): F<number | string> {
  return percentile(reg, header, 0.5, 'MEDIAN');
}
/** Excel PERCENTILE (inclusive, linear interpolation). */
function percentile(reg: Reg, header: string, p: number, fn: 'PERCENTILE' | 'MEDIAN' = 'PERCENTILE'): F<number | string> {
  const v = numbersOf(reg, header);
  const range = `'${reg.sheet}'!$${reg.letter[header]}$${reg.first}:$${reg.letter[header]}$${reg.last}`;
  const formula = fn === 'MEDIAN' ? `IFERROR(MEDIAN(${range}),"-")` : `IFERROR(PERCENTILE(${range},${p}),"-")`;
  if (!v.length) return { formula, result: '-' };
  const k = (v.length - 1) * p;
  const lo = Math.floor(k);
  const hi = Math.ceil(k);
  return { formula, result: v[lo] + (v[hi] - v[lo]) * (k - lo) };
}
function extreme(reg: Reg, header: string, fn: 'MIN' | 'MAX'): F<number | string> {
  const v = numbersOf(reg, header);
  const range = `'${reg.sheet}'!$${reg.letter[header]}$${reg.first}:$${reg.letter[header]}$${reg.last}`;
  return { formula: `IF(COUNT(${range})=0,"-",${fn}(${range}))`, result: v.length ? (fn === 'MIN' ? v[0] : v[v.length - 1]) : '-' };
}
const roundF = (f: F): F => ({ formula: `ROUND(${f.formula},1)`, result: round1(f.result) });

// ── Facility Analysis ────────────────────────────────────────────────────────

export function facilityAnalysis(wb: Workbook, ws: Worksheet, d: SystemReport, g: Regs) {
  analysisSheet(ws, d, 'Facility Analysis', `Live counts over the ${S.facilities} and ${S.ratings} sheets.`, [32, 11, 10, 12, 12]);
  const f = g.facilities;
  const rt = g.ratings;
  let r = 4;
  r = countTable(wb, ws, r, 'Ownership - Public vs Private', 'Ownership', [
    { label: 'Public', cell: countIfs(f, eq('Ownership', 'Public')), color: OWNERSHIP_COLORS.PUBLIC },
    { label: 'Private', cell: countIfs(f, eq('Ownership', 'Private')), color: OWNERSHIP_COLORS.PRIVATE },
  ], { title: 'Public vs Private', caption: 'facilities' }).next;

  r = metricTable(ws, r, 'Public vs Private - Workload', 'Ownership', [
    { header: 'Facilities', fmt: '#,##0' },
    { header: 'Cases Received', fmt: '#,##0' },
    { header: 'Avg Rating', fmt: '0.0' },
  ], ['Public', 'Private'].map((o) => ({
    label: o,
    cells: [countIfs(f, eq('Ownership', o)), sumIfs(f, 'Cases Received', eq('Ownership', o)), avgIfs(f, 'Crew Rating', eq('Ownership', o))],
  }))).next;

  r = countTable(wb, ws, r, 'Facilities by Type', 'Type', distinct(f, 'Type'),
    { title: 'Facilities by type', caption: 'facilities', categorical: true }).next;
  const levels = [...new Set(f.values['KEPH Level'].filter((v): v is number => typeof v === 'number'))].sort();
  r = countTable(wb, ws, r, 'Facilities by KEPH Level', 'KEPH Level',
    levels.map((l) => ({ label: `Level ${l}`, cell: countIfs(f, numEq('KEPH Level', l)) }))).next;
  r = countTable(wb, ws, r, 'Facilities by Sub-County', 'Sub-County', distinct(f, 'Sub-County')).next;

  const names = f.values['Facility Name'].slice(0, f.count).map(String);
  const busiest = metricTable(ws, r, 'Referral Load & Crew Ratings by Facility', 'Facility', [
    { header: 'Cases Received', fmt: '#,##0', scale: 'highGood' },
    { header: 'Ratings', fmt: '#,##0' },
    { header: 'Avg Stars', fmt: '0.0', scale: 'highGood' },
    { header: '1-2 Star', fmt: '#,##0' },
  ], names
    .map((name) => ({
      name,
      received: sumIfs(f, 'Cases Received', eq('Facility Name', name)),
    }))
    .sort((a, b) => b.received.result - a.received.result)
    .map(({ name, received }) => {
      const v = eq('Facility', name);
      return {
        label: name,
        cells: [received, countIfs(rt, v), avgIfs(rt, 'Stars', v), countIfs(rt, v, cmp('Stars', '<=', 2))],
      };
    }));
  r = busiest.next;

  // Tag frequency: tags are stored comma-joined, so count rows containing each tag.
  const tags = new Map<string, string>();
  for (const v of rt.values['Tags'].slice(0, rt.count)) {
    if (typeof v !== 'string') continue;
    v.split(',').map((s) => s.trim()).filter(Boolean).forEach((tag) => tags.set(tag.toLowerCase(), tag));
  }
  countTable(wb, ws, r, 'What Crews Say (rating tags)', 'Tag',
    [...tags.values()].map((tag) => ({ label: tag, cell: countIfs(rt, contains('Tags', tag)) }))
      .sort((a, b) => b.cell.result - a.cell.result),
    { title: 'Rating tags', caption: 'mentions', categorical: true });

  return { busiest };
}

// ── People & Fleet ───────────────────────────────────────────────────────────

export function peopleFleet(wb: Workbook, ws: Worksheet, d: SystemReport, g: Regs) {
  analysisSheet(ws, d, 'People & Fleet', `Live counts over the ${S.users}, ${S.fleet}, ${S.tasks} and ${S.standby} sheets.`, [30, 11, 10, 12, 12]);
  let r = 4;
  r = countTable(wb, ws, r, 'Users by Role', 'Role', distinct(g.users, 'Primary Role'),
    { title: 'Users by role', caption: 'users', categorical: true }).next;
  r = countTable(wb, ws, r, 'Users by Agency', 'Agency', distinct(g.users, 'Agency')).next;
  r = countTable(wb, ws, r, 'Account Status', 'Active', [
    { label: 'Yes', cell: countIfs(g.users, eq('Active', 'Yes')) },
    { label: 'No', cell: countIfs(g.users, eq('Active', 'No')) },
  ]).next;
  r = metricTable(ws, r, 'Most Active Staff', 'Name', [
    { header: 'Cases Logged', fmt: '#,##0' },
    { header: 'Dispatched', fmt: '#,##0' },
    { header: 'Crew Tasks', fmt: '#,##0', scale: 'highGood' },
  ], g.users.values['Name'].slice(0, g.users.count).map(String)
    .map((name) => {
      const v = eq('Name', name);
      return { label: name, cells: [sumIfs(g.users, 'Cases Logged', v), sumIfs(g.users, 'Cases Dispatched', v), sumIfs(g.users, 'Crew Tasks', v)] };
    })
    .filter((x) => x.cells.some((c) => c.result > 0))
    .sort((a, b) => b.cells.reduce((s, c) => s + c.result, 0) - a.cells.reduce((s, c) => s + c.result, 0))
    .slice(0, 20)).next;
  r = countTable(wb, ws, r, 'Fleet by Status', 'Status', distinct(g.fleet, 'Status'),
    { title: 'Fleet status', caption: 'vehicles', categorical: true }).next;
  r = countTable(wb, ws, r, 'Tasks by Status', 'Task Status', distinct(g.tasks, 'Task Status'),
    { title: 'Tasks by status', caption: 'tasks', categorical: true }).next;
  metricTable(ws, r, 'Standby Deployments by Ambulance', 'Plate', [
    { header: 'Deployments', fmt: '#,##0' },
    { header: 'Minutes', fmt: '#,##0' },
    { header: 'Still Out', fmt: '#,##0' },
  ], distinct(g.standby, 'Vehicle Plate').map(({ label }) => {
    const v = eq('Vehicle Plate', label);
    return { label, cells: [countIfs(g.standby, v), sumIfs(g.standby, 'Minutes', v), countIfs(g.standby, v, isBlank('Ended'))] };
  }));
}

// ── Crew Accountability ──────────────────────────────────────────────────────

export function crewAccountability(wb: Workbook, ws: Worksheet, d: SystemReport, g: Regs) {
  analysisSheet(ws, d, 'Crew Accountability',
    `Shift check-ins: does the crew phone's GPS agree with the ambulance tracker? Counts over the ${S.checkIns} sheet.`,
    [30, 11, 10, 12, 12]);
  const k = g.checkIns;
  const total = countAll(k, 'Crew Member');
  const mismatch = countIfs(k, eq('GPS Match', 'Mismatch'));
  let r = 4;
  r = countTable(wb, ws, r, 'Check-ins by GPS Match', 'Result', [
    { label: 'Matched', cell: countIfs(k, eq('GPS Match', 'Matched')), color: '#0ca30c' },
    { label: 'Mismatch', cell: mismatch, color: '#d03b3b' },
    { label: 'Unverified', cell: countIfs(k, eq('GPS Match', 'Unverified')), color: '#898781' },
  ], { title: 'Check-in GPS match', caption: 'check-ins' }).next;
  r = countTable(wb, ws, r, 'Red Flags', 'Flag', [
    { label: 'Mock (fake) GPS location reported', cell: countIfs(k, eq('Mock Location', 'Yes')) },
    { label: 'Phone over 500 m from ambulance', cell: countIfs(k, cmp('Phone-to-Tracker (m)', '>', 500)) },
    { label: 'Poor GPS accuracy (over 100 m)', cell: countIfs(k, cmp('GPS Accuracy (m)', '>', 100)) },
  ]).next;
  r = metricTable(ws, r, 'By Crew Member', 'Crew Member', [
    { header: 'Check-ins', fmt: '#,##0' },
    { header: 'Mismatch', fmt: '#,##0' },
    { header: 'Mock GPS', fmt: '#,##0' },
    { header: 'Mismatch %', fmt: '0%', scale: 'lowGood' },
  ], distinct(k, 'Crew Member').map(({ label }) => {
    const v = eq('Crew Member', label);
    const n = countIfs(k, v);
    const m = countIfs(k, v, eq('GPS Match', 'Mismatch'));
    return { label, cells: [n, m, countIfs(k, v, eq('Mock Location', 'Yes')), pctOf(m, n)] };
  })).next;
  metricTable(ws, r, 'By Ambulance', 'Plate', [
    { header: 'Check-ins', fmt: '#,##0' },
    { header: 'Mismatch', fmt: '#,##0' },
    { header: 'Avg Distance (m)', fmt: '#,##0' },
  ], distinct(k, 'Vehicle Plate').map(({ label }) => {
    const v = eq('Vehicle Plate', label);
    return { label, cells: [countIfs(k, v), countIfs(k, v, eq('GPS Match', 'Mismatch')), avgIfs(k, 'Phone-to-Tracker (m)', v)] };
  }));
  return { mismatchPct: pctOf(mismatch, total) };
}

// ── Stock Movements ──────────────────────────────────────────────────────────

export function stockMovements(wb: Workbook, ws: Worksheet, d: SystemReport, g: Regs) {
  analysisSheet(ws, d, 'Stock Movements',
    `Store stock, stock out on ambulances and equipment checks. Over the ${S.inventory}, ${S.checkouts} and ${S.checklist} sheets.`,
    [30, 11, 10, 12, 12]);
  const inv = g.inventory;
  const co = g.checkouts;
  const out = eq('Checkout Status', 'Checked out');
  let r = 4;
  r = countTable(wb, ws, r, 'Store Stock Health', 'Flag', [
    { label: 'OK', cell: countIfs(inv, eq('Stock Flag', 'OK')), color: '#0ca30c' },
    { label: 'Low', cell: countIfs(inv, eq('Stock Flag', 'Low')), color: '#fab219' },
    { label: 'Out of stock', cell: countIfs(inv, eq('Stock Flag', 'Out of stock')), color: '#d03b3b' },
  ], { title: 'Store stock health', caption: 'items' }).next;
  r = metricTable(ws, r, 'Store Stock by Category', 'Category', [
    { header: 'Items', fmt: '#,##0' },
    { header: 'Units', fmt: '#,##0' },
    { header: 'Low', fmt: '#,##0' },
    { header: 'Out', fmt: '#,##0', scale: 'lowGood' },
  ], distinct(inv, 'Category').map(({ label }) => {
    const v = eq('Category', label);
    return {
      label,
      cells: [countIfs(inv, v), sumIfs(inv, 'In Stock', v), countIfs(inv, v, eq('Stock Flag', 'Low')), countIfs(inv, v, eq('Stock Flag', 'Out of stock'))],
    };
  })).next;

  const outstanding = minus(sumIfs(co, 'Qty Out', out), sumIfs(co, 'Qty Returned', out));
  r = metricTable(ws, r, 'Stock Currently on Ambulances', 'Plate', [
    { header: 'Open Checkouts', fmt: '#,##0' },
    { header: 'Units Out', fmt: '#,##0', scale: 'lowGood' },
  ], distinct(co, 'Vehicle Plate', out).map(({ label }) => {
    const v = eq('Vehicle Plate', label);
    return { label, cells: [countIfs(co, v, out), minus(sumIfs(co, 'Qty Out', v, out), sumIfs(co, 'Qty Returned', v, out))] };
  })).next;
  r = metricTable(ws, r, 'Most Issued Items (top 15)', 'Item', [
    { header: 'Checkouts', fmt: '#,##0' },
    { header: 'Units Issued', fmt: '#,##0', scale: 'highGood' },
    { header: 'Units Returned', fmt: '#,##0' },
  ], distinct(co, 'Item')
    .map(({ label }) => {
      const v = eq('Item', label);
      return { label, cells: [countIfs(co, v), sumIfs(co, 'Qty Out', v), sumIfs(co, 'Qty Returned', v)] };
    })
    .sort((a, b) => b.cells[1].result - a.cells[1].result)
    .slice(0, 15)).next;
  r = countTable(wb, ws, r, 'Checkouts by Status', 'Status', distinct(co, 'Checkout Status')).next;
  r = countTable(wb, ws, r, 'Equipment Checks by Result', 'Result', distinct(g.checklist, 'Result')).next;
  metricTable(ws, r, 'Equipment Checks by Ambulance', 'Plate', [
    { header: 'Items Checked', fmt: '#,##0' },
    { header: 'OK', fmt: '#,##0' },
    { header: 'Not OK', fmt: '#,##0', scale: 'lowGood' },
  ], distinct(g.checklist, 'Vehicle Plate').map(({ label }) => {
    const v = eq('Vehicle Plate', label);
    const n = countIfs(g.checklist, v);
    const ok = countIfs(g.checklist, v, eq('Result', 'Ok'));
    return { label, cells: [n, ok, { formula: `(${n.formula})-(${ok.formula})`, result: n.result - ok.result }] };
  }));
  return { outstanding };
}

function minus(a: F, b: F): F {
  return { formula: `(${a.formula})-(${b.formula})`, result: round1(a.result - b.result) };
}

// ── Data Quality ─────────────────────────────────────────────────────────────

export function dataQuality(ws: Worksheet, d: SystemReport, g: Regs) {
  analysisSheet(ws, d, 'Data Quality', 'How complete the records are, and what to fix first. Green = complete.', [44, 11, 11, 12, 50]);
  const c = g.cases;
  const t = g.tasks;
  let r = 4;

  section(ws, r, 'Case Field Completeness', 4);
  r += 1;
  ws.getCell(r, 1).value = 'Cases in register';
  const total = countAll(c, 'Case No');
  ws.getCell(r, 2).value = total;
  const totalAddr = `$B$${r}`;
  r += 1;
  tableHead(ws, r, ['Field', 'Filled', 'Missing', 'Complete']);
  r += 1;
  const fields = [
    'Nature', 'Nature Detail', 'Alert Mode', 'Origin of Alert', 'Sub-County', 'Latitude', 'Patient Name', 'Age',
    'Gender', 'Patient Contact', 'Next of Kin', 'Vitals', 'Pre-Hospital Management', 'Target Facility',
    'Dispatcher', 'First Response (min)', 'Closure Reason',
  ];
  const top = r;
  fields.forEach((h, i) => {
    const filled = countAll(c, h);
    ws.getCell(r, 1).value = h === 'Latitude' ? 'Coordinates' : h;
    ws.getCell(r, 2).value = filled;
    ws.getCell(r, 3).value = { formula: `${totalAddr}-B${r}`, result: total.result - filled.result };
    ws.getCell(r, 4).value = { formula: `IF(${totalAddr}=0,0,B${r}/${totalAddr})`, result: total.result ? filled.result / total.result : 0 };
    ws.getCell(r, 4).numFmt = '0%';
    bodyRow(ws, r, 4, i);
    r += 1;
  });
  ws.addConditionalFormatting({
    ref: `D${top}:D${r - 1}`,
    rules: [{
      type: 'colorScale', priority: 1,
      cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 0.5 }, { type: 'num', value: 1 }],
      color: [{ argb: 'FFF8696B' }, { argb: 'FFFFEB84' }, { argb: 'FF63BE7B' }],
    } as any],
  });
  r += 1;

  section(ws, r, 'Things to Fix', 5);
  r += 1;
  tableHead(ws, r, ['Check', 'Count', '', '', 'Why it matters']);
  r += 1;
  const lastSeenCut = new Date(nairobiNow(d).getTime() - 86_400_000);
  const outside = countIfs(c, eq('Official Sub-County', 'No'));
  const checks: [string, F, string][] = [
    ['Cases outside the official sub-county list', outside, 'Out-of-county or mistyped sub-counties distort every map and per-sub-county figure.'],
    ['Cases with no coordinates', countIfs(c, isBlank('Latitude')), 'No map pin and no distance-based routing for these cases.'],
    ['Cases with no patient gender', countIfs(c, isBlank('Gender')), 'Gender breakdowns undercount.'],
    ['Resolved cases with no closure reason', countIfs(c, eq('Status', 'Resolved'), isBlank('Closure Reason')), 'Outcome of the case cannot be audited.'],
    ['Cases with no dispatcher recorded', countIfs(c, isBlank('Dispatcher')), 'Dispatcher workload figures undercount.'],
    ['Completed tasks missing scene-arrival time', countIfs(t, eq('Task Status', 'Completed'), isBlank('At Scene')), 'Response time cannot be measured for these tasks.'],
    ['Completed tasks missing facility-arrival time', countIfs(t, eq('Task Status', 'Completed'), isBlank('At Facility')), 'Transport time to facility is unknown.'],
    ['Completed tasks with no distance', countIfs(t, eq('Task Status', 'Completed'), isBlank('Km to Scene')), 'Km and fuel figures undercount.'],
    ['Ambulances with no GPS fix in 24 h', plus(countIfs(g.fleet, dateCmp('Last Seen', '<', lastSeenCut)), countIfs(g.fleet, isBlank('Last Seen'))), 'Tracker offline - dispatch cannot see where they are.'],
    ['Facilities never rated by crews', countIfs(g.facilities, numEq('Ratings', 0)), 'No crew feedback on these facilities.'],
    ['Inactive user accounts', countIfs(g.users, eq('Active', 'No')), 'Review and remove if no longer needed.'],
    ['Check-ins failing the GPS match', countIfs(g.checkIns, eq('GPS Match', 'Mismatch')), 'Crew may not have been at the ambulance at check-in.'],
  ];
  checks.forEach(([label, f, why], i) => {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 2).value = f;
    ws.getCell(r, 5).value = why;
    ws.getCell(r, 5).alignment = { wrapText: true, vertical: 'top' };
    ws.getCell(r, 5).font = { color: { argb: MUTED } };
    bodyRow(ws, r, 5, i);
    r += 1;
  });
  ws.addConditionalFormatting({
    ref: `B${r - checks.length}:B${r - 1}`,
    rules: [{
      type: 'cellIs', operator: 'greaterThan', formulae: ['0'], priority: 1,
      style: { font: { color: { argb: 'FFB42020' }, bold: true } },
    } as any],
  });
  r += 1;

  section(ws, r, 'Sub-County Values Not on the Official List', 3);
  r += 1;
  tableHead(ws, r, ['Value entered', 'Cases', '']);
  r += 1;
  const odd = distinct(c, 'Sub-County', eq('Official Sub-County', 'No'));
  odd.forEach((o, i) => {
    ws.getCell(r, 1).value = o.label;
    ws.getCell(r, 2).value = o.cell;
    bodyRow(ws, r, 2, i);
    r += 1;
  });
  if (!odd.length) {
    ws.getCell(r, 1).value = 'None - every case uses an official sub-county.';
    ws.getCell(r, 1).font = { italic: true, color: { argb: MUTED } };
  }
  return { outside };
}

// ── Insights ─────────────────────────────────────────────────────────────────

export interface InsightInputs {
  cases: ReturnType<typeof caseAnalysis>;
  time: ReturnType<typeof timePatterns>;
  response: ReturnType<typeof responsePerformance>;
  facility: ReturnType<typeof facilityAnalysis>;
  crew: ReturnType<typeof crewAccountability>;
  stock: ReturnType<typeof stockMovements>;
  quality: ReturnType<typeof dataQuality>;
}

export function insights(ws: Worksheet, d: SystemReport, g: Regs, x: InsightInputs) {
  ws.properties.tabColor = { argb: TAB.overview };
  banner(ws, 'Key Insights', d.generatedAt, 5, 'Each answer is a live formula over the analysis and register sheets.');
  [5, 46, 30, 14, 22].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const c = g.cases;
  const st = (l: string) => countIfs(c, eq('Status', l));
  const total = countAll(c, 'Case No');
  const solved = st('Resolved');
  const drafts = st('Draft');
  const pending = plus(st('Submitted'), st('Dispatch handling'), st('Dispatch on hold'));
  const vehAvg = 2; // "Avg to Scene" column index in the by-vehicle table
  const busiestVeh = pickExtreme(x.response.byVehicle.labels, x.response.byVehicle.values(0), x.response.byVehicle.labelRange, x.response.byVehicle.colRange(0), 'MAX');
  const fastestVeh = pickExtreme(x.response.byVehicle.labels, x.response.byVehicle.values(vehAvg), x.response.byVehicle.labelRange, x.response.byVehicle.colRange(vehAvg), 'MIN');
  const slowestVeh = pickExtreme(x.response.byVehicle.labels, x.response.byVehicle.values(vehAvg), x.response.byVehicle.labelRange, x.response.byVehicle.colRange(vehAvg), 'MAX');
  const busiestDriver = pickExtreme(x.response.byDriver.labels, x.response.byDriver.values(0), x.response.byDriver.labelRange, x.response.byDriver.colRange(0), 'MAX');
  const sub = fromBlock(x.cases.subCounty);
  const nature = fromBlock(x.cases.nature);
  const busiestFac = pickExtreme(x.facility.busiest.labels, x.facility.busiest.values(0), x.facility.busiest.labelRange, x.facility.busiest.colRange(0), 'MAX');
  const topRated = pickExtreme(x.facility.busiest.labels, x.facility.busiest.values(2), x.facility.busiest.labelRange, x.facility.busiest.colRange(2), 'MAX');

  type Row = [string, F<string | number> | string, F<string | number> | string, string, string];
  const rows: Row[] = [
    ['Cases handled', 'Total cases', total, '#,##0', S.cases],
    ['Resolution rate (of submitted cases)', 'Solved / (total - drafts)', pctOf(solved, minusF(total, drafts)), '0.0%', S.caseAnalysis],
    ['Cases still waiting on dispatch', 'Pending now', pending, '#,##0', S.cases],
    ['Busiest sub-county', sub.label, sub.value, '#,##0', S.caseAnalysis],
    ['Most common nature of case', nature.label, nature.value, '#,##0', S.caseAnalysis],
    ['Busiest day of the week', x.time.peakDay.label, x.time.peakDay.value, '#,##0', S.timePatterns],
    ['Busiest hour of the day (starts at)', hourText(x.time.peakHour.label), x.time.peakHour.value, '#,##0', S.timePatterns],
    [`Tasks reaching scene within target`, 'Share of timed tasks', { formula: x.response.withinPctAddr, result: x.response.withinPct.result }, '0.0%', S.response],
    ['Busiest ambulance', busiestVeh.label, busiestVeh.value, '#,##0" tasks"', S.response],
    ['Fastest ambulance (avg minutes to scene)', fastestVeh.label, fastestVeh.value, '0.0" min"', S.response],
    ['Slowest ambulance (avg minutes to scene)', slowestVeh.label, slowestVeh.value, '0.0" min"', S.response],
    ['Busiest driver', busiestDriver.label, busiestDriver.value, '#,##0" tasks"', S.response],
    ['Facility receiving the most cases', busiestFac.label, busiestFac.value, '#,##0', S.facilityAnalysis],
    ['Top-rated facility by crews', topRated.label, topRated.value, '0.0" stars"', S.facilityAnalysis],
    ['Check-ins failing the GPS match', 'Share of check-ins', x.crew.mismatchPct, '0.0%', S.crew],
    ['Stock units currently out on ambulances', 'Units not yet returned', x.stock.outstanding, '#,##0', S.stock],
    ['Store items out of stock', 'Items at zero', countIfs(g.inventory, eq('Stock Flag', 'Out of stock')), '#,##0', S.inventory],
    ['Cases with a sub-county off the official list', 'Data to correct', x.quality.outside, '#,##0', S.quality],
  ];

  let r = 4;
  tableHead(ws, r, ['#', 'Insight', 'Answer', 'Figure', 'See sheet']);
  r += 1;
  rows.forEach(([q, answer, figure, fmt, sheet], i) => {
    ws.getCell(r, 1).value = i + 1;
    ws.getCell(r, 2).value = q;
    ws.getCell(r, 2).font = { bold: true, color: { argb: INK } };
    ws.getCell(r, 3).value = answer as any;
    ws.getCell(r, 4).value = figure as any;
    ws.getCell(r, 4).numFmt = fmt;
    link(ws, `E${r}`, sheet);
    bodyRow(ws, r, 5, i);
    ws.getCell(r, 3).alignment = { horizontal: 'left' };
    r += 1;
  });
  ws.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
  printSetup(ws);
}

function fromBlock(b: BlockRef) {
  return pickExtreme(b.labels, b.counts, b.labelRange, b.countRange, 'MAX');
}
function minusF(a: F, b: F): F {
  return { formula: `(${a.formula})-(${b.formula})`, result: a.result - b.result };
}
/** "14" -> "14:00 - 14:59" (formula and cached text). */
function hourText(h: F<string>): F<string> {
  if (h.result === '-') return h;
  return { formula: `IFERROR(${h.formula.replace(/^IFERROR\((.*),"-"\)$/, '$1')}&":00 - "&${h.formula.replace(/^IFERROR\((.*),"-"\)$/, '$1')}&":59","-")`, result: `${h.result}:00 - ${h.result}:59` };
}

// ── Summary ──────────────────────────────────────────────────────────────────

export function summary(
  wb: Workbook, ws: Worksheet, d: SystemReport, g: Regs, within: { addr: string; result: number | string },
) {
  ws.properties.tabColor = { argb: TAB.overview };
  banner(ws, 'System Report Summary', d.generatedAt, 12, 'Every figure is a formula over the register sheets.');
  [38, 14, 3, 3, 3].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const c = g.cases;
  const st = (label: string) => countIfs(c, eq('Status', label));
  const total = countAll(c, 'Case No');
  const solved = st('Resolved');
  const drafts = st('Draft');
  const pending = plus(st('Submitted'), st('Dispatch handling'), st('Dispatch on hold'));
  const inProgress = st('Dispatched');
  const inv = g.inventory;
  const t = g.tasks;

  type Line = [string, unknown, string?];
  const blocks: [string, Line[]][] = [
    ['Cases', [
      ['Total cases', total],
      ['Solved (resolved)', solved],
      ['Pending (awaiting dispatch)', pending],
      ['In progress (crew dispatched)', inProgress],
      ['Drafts (not submitted)', drafts],
      ['Resolution rate (of submitted cases)', pctOf(solved, minusF(total, drafts)), '0.0%'],
      ['Cases today', countIfs(c, dateCmp('Created', '>=', dayStart(d, 0)))],
      ['Cases - last 7 days', countIfs(c, dateCmp('Created', '>=', dayStart(d, 6)))],
      ['Cases - last 30 days', countIfs(c, dateCmp('Created', '>=', dayStart(d, 29)))],
      ['Mass casualty incidents', countIfs(c, eq('Mass Casualty', 'Yes'))],
      ['GBV-flagged cases', countIfs(c, eq('GBV Case', 'Yes'))],
      ['Cases needing more than one ambulance', countIfs(c, cmp('Tasks', '>', 1))],
    ]],
    ['Response (minutes, all tasks)', [
      ['Avg time to accept', avgIfs(t, 'Min to Accept'), '0.0'],
      ['Avg time to reach scene', avgIfs(t, 'Min to Scene'), '0.0'],
      ['% reaching scene within target', { formula: within.addr, result: within.result }, '0.0%'],
      ['Avg time on scene', avgIfs(t, 'Min on Scene'), '0.0'],
      ['Avg scene to facility', avgIfs(t, 'Min to Facility'), '0.0'],
      ['Avg task duration (received to complete)', avgIfs(t, 'Min Total'), '0.0'],
      ['Completed tasks', countIfs(t, eq('Task Status', 'Completed'))],
      ['Handovers between ambulances', countIfs(t, eq('Task Status', 'Handed over'))],
      ['Km driven on cases', roundF(plus(sumIfs(t, 'Km to Scene'), sumIfs(t, 'Km to Facility'))), '#,##0.0'],
    ]],
    ['Facilities', [
      ['Total facilities', countAll(g.facilities, 'Facility Name')],
      ['Public', countIfs(g.facilities, eq('Ownership', 'Public'))],
      ['Private', countIfs(g.facilities, eq('Ownership', 'Private'))],
      ['Active', countIfs(g.facilities, eq('Status', 'Active'))],
      ['Inactive', countIfs(g.facilities, eq('Status', 'Inactive'))],
      ['Crew ratings', countAll(g.ratings, 'Facility')],
      ['Average crew rating (stars)', avgIfs(g.ratings, 'Stars'), '0.0'],
    ]],
    ['People', [
      ['Total users', countAll(g.users, 'Name')],
      ['Active users', countIfs(g.users, eq('Active', 'Yes'))],
      ['Inactive users', countIfs(g.users, eq('Active', 'No'))],
      ...distinct(g.users, 'Primary Role').map((i): Line => [`- ${i.label}`, i.cell]),
      ['Shift check-ins', countAll(g.checkIns, 'Crew Member')],
      ['Check-ins failing GPS match', countIfs(g.checkIns, eq('GPS Match', 'Mismatch'))],
    ]],
    ['Fleet', [
      ['Vehicles (plates)', countAll(g.fleet, 'Plate')],
      ...distinct(g.fleet, 'Status').map((i): Line => [`- ${i.label}`, i.cell]),
      ['GPS km logged', sumIfs(g.fleet, 'GPS Km Logged'), '#,##0.0'],
      ['Standby deployments', countAll(g.standby, 'Vehicle Plate')],
      ['Partner ambulances (active / total)', `${d.summary.activePartnerAmbulances} / ${d.summary.partnerAmbulances}`],
    ]],
    ['Stock', [
      ['Store items', countAll(inv, 'Item')],
      ['Low or out of stock', plus(countIfs(inv, eq('Stock Flag', 'Low')), countIfs(inv, eq('Stock Flag', 'Out of stock')))],
      ['Out of stock', countIfs(inv, eq('Stock Flag', 'Out of stock'))],
      ['Units in store', sumIfs(inv, 'In Stock'), '#,##0'],
      ['Units out on ambulances', minus(sumIfs(g.checkouts, 'Qty Out', eq('Checkout Status', 'Checked out')), sumIfs(g.checkouts, 'Qty Returned', eq('Checkout Status', 'Checked out'))), '#,##0'],
      ['Equipment checks recorded', countAll(g.checklist, 'Item')],
    ]],
    ['Other Records', [
      ['Calls logged', countAll(g.calls, 'Direction')],
      ['PCR files uploaded', countAll(g.pcr, 'Case No')],
      ['Audit-trail actions', countAll(g.activity, 'Action')],
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

  placePie(wb, ws, pieAt['Cases'], 'Case outcomes', [
    { label: 'Solved', value: solved.result, color: CASE_COLORS.resolved },
    { label: 'Pending', value: pending.result, color: CASE_COLORS.pending },
    { label: 'In progress', value: inProgress.result, color: CASE_COLORS.inProgress },
    { label: 'Drafts', value: drafts.result, color: CASE_COLORS.drafts },
  ], 'cases', 3);
  placePie(wb, ws, pieAt['Facilities'], 'Facilities - Public vs Private', [
    { label: 'Public', value: countIfs(g.facilities, eq('Ownership', 'Public')).result, color: OWNERSHIP_COLORS.PUBLIC },
    { label: 'Private', value: countIfs(g.facilities, eq('Ownership', 'Private')).result, color: OWNERSHIP_COLORS.PRIVATE },
  ], 'facilities', 3);
  ws.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }];
  printSetup(ws);
}

// ── Contents ─────────────────────────────────────────────────────────────────

export function contents(ws: Worksheet, d: SystemReport, counts: Record<string, number>, target: number) {
  ws.properties.tabColor = { argb: TAB.overview };
  banner(ws, 'System Report', d.generatedAt, 3, 'Click a sheet name to jump to it. Tab colours: blue = overview, teal = analysis, grey = records.');
  [26, 78, 10].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const groups: [string, [string, string][]][] = [
    ['Overview', [
      [S.insights, 'Auto-generated key findings: busiest sub-county, peak hour, fastest ambulance, data to fix'],
      [S.summary, 'Headline figures: cases, response, facilities, people, fleet, stock'],
    ]],
    ['Analysis', [
      [S.caseAnalysis, 'Outcomes, status, nature, sub-county, gender, alert mode and origin, facility, staff, 12-month trend'],
      [S.timePatterns, 'Weekday x hour heat-map and shift bands - for rostering'],
      [S.response, `Response vs an editable target (default ${target} min), distribution, by plate, driver, sub-county, nature`],
      [S.facilityAnalysis, 'Public vs private, type, KEPH, referral load and crew ratings per facility, rating tags'],
      [S.peopleFleet, 'Users by role and agency, most active staff, fleet and task status, standby'],
      [S.crew, 'Check-in GPS match vs ambulance tracker, mock-location flags, by crew member and ambulance'],
      [S.stock, 'Store stock health, stock out on each ambulance, most-issued items, equipment checks'],
      [S.quality, 'Field completeness and a prioritised list of records to fix'],
    ]],
    ['Records', [
      [S.cases, 'Full case register - every field captured for each case'],
      [S.tasks, 'Every ambulance task: plate, crew, all timestamps, intervals, distances, handovers'],
      [S.calls, 'PBX call log (numbers masked)'],
      [S.facilities, 'Facility register with ownership, cases received and ratings'],
      [S.ratings, 'Every crew rating of a receiving facility'],
      [S.users, 'Staff register with roles and activity (contacts masked)'],
      [S.checkIns, 'Every shift check-in with the GPS verification result'],
      [S.fleet, 'Ambulances by plate with crew, location, fuel, tasks and km'],
      [S.standby, 'Standby deployments'],
      [S.inventory, 'Store stock register with low / out-of-stock flags'],
      [S.checkouts, 'Stock issued to ambulances and returns'],
      [S.checklist, 'Latest equipment check per ambulance and item'],
      [S.pcr, 'Patient Care Report uploads per case'],
      [S.activity, 'System audit trail'],
    ]],
  ];
  let r = 4;
  for (const [group, sheets] of groups) {
    section(ws, r, group, 3);
    r += 1;
    tableHead(ws, r, ['Sheet', 'What it holds', 'Rows']);
    r += 1;
    sheets.forEach(([name, desc], i) => {
      link(ws, `A${r}`, name);
      ws.getCell(r, 1).font = { color: { argb: BRAND }, underline: true, bold: true };
      ws.getCell(r, 2).value = desc;
      if (counts[name] !== undefined) {
        ws.getCell(r, 3).value = counts[name];
        ws.getCell(r, 3).numFmt = '#,##0';
      }
      bodyRow(ws, r, 3, i);
      r += 1;
    });
    r += 1;
  }

  section(ws, r, 'Definitions & Notes', 3);
  r += 1;
  const notes: [string, string][] = [
    ['Solved', 'Case status Resolved.'],
    ['Pending', 'Waiting on dispatch: Submitted, Dispatch handling or Dispatch on hold.'],
    ['In progress', 'Status Dispatched - a crew is assigned and working the case.'],
    ['Drafts', 'Logged by a watcher but never submitted; excluded from the resolution rate.'],
    ['Response time', 'Minutes from an ambulance task being received to the crew marking arrival at scene.'],
    ['First response', 'Response time of the first ambulance sent to a case.'],
    ['Response target', `Editable yellow cell on ${S.response} (default ${target} min, an assumption - set your county standard).`],
    ['Official sub-counties', 'The list maintained under Admin > Sub-Counties at export time.'],
    ['Times', 'All dates and times are Africa/Nairobi (EAT, UTC+3).'],
    ['Masking', 'Phone numbers, emails, ID/NHIF numbers, tracker IMEIs and IP addresses are masked. Passwords are never exported.'],
    ['Formulas', 'Analysis figures are live formulas over the record sheets. Rows added below a record sheet\'s current range are not picked up.'],
    ['Pie charts', 'Images captured at export time; they do not update when the data changes.'],
    ['Limits', 'Calls, check-ins, stock checkouts and the audit trail include the latest 5,000 rows each.'],
    ['Source', `Machakos County EOC system database, snapshot ${new Date(d.generatedAt).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' })}.`],
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

export type { MetricRef };
