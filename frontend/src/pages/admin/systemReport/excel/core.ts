import type { Workbook, Worksheet } from 'exceljs';
import { renderPie } from '../pieImage';
import { labelize, toSlices, type Slice, type SystemReport } from '../types';

/*
 * Building blocks for the System Report workbook.
 *
 * Register sheets hold one row per record as an Excel Table. Analysis sheets
 * point at them with COUNTIF/COUNTIFS/AVERAGEIFS/SUMIFS/INDEX-MATCH formulas.
 * Every formula is written with its result computed here from the same cell
 * values, so the file reads correctly before Excel recalculates; Excel then
 * recalculates on open (fullCalcOnLoad).
 */

export const FONT = 'Arial';
export const BRAND = 'FF1B5FAC';
export const INK = 'FF15211B';
export const MUTED = 'FF6B7670';
export const LINE = 'FFE1E0D9';
export const SECTION_FILL = 'FFEEF3FA';
export const INPUT_FILL = 'FFFFF2CC';
export const INPUT_FONT = 'FF0000FF';
export const TABLE_STYLE = 'TableStyleMedium2';
export const HEAD_ROW = 4; // register header row; data starts on 5
export const PIE_ROWS = 16;
export const PIE_COL = 5; // zero-based column F on analysis sheets
export const NAIROBI_MS = 3 * 3600_000;

export const TAB = { overview: 'FF1B5FAC', analysis: 'FF0F766E', register: 'FF8A8F8C' };

// Status colours for conditional formatting: [fill, text].
export const GOOD = ['FFE3F5E3', 'FF0A6B0A'];
export const WARN = ['FFFDF1D6', 'FF8A5A00'];
export const INFO = ['FFE3EEFB', 'FF1C5CAB'];
export const BAD = ['FFFBE3E3', 'FFB42020'];
export const NEUTRAL = ['FFEFEFEF', 'FF555555'];

export type Kind = 'text' | 'wrap' | 'int' | 'num1' | 'coord' | 'date' | 'yesno' | 'label';

export interface Col<R> {
  header: string;
  width: number;
  kind: Kind;
  get: (r: R) => unknown;
}

/** Where a register's data sits, so analysis formulas can point at it. */
export interface Reg {
  sheet: string;
  first: number;
  last: number;
  count: number;
  letter: Record<string, string>;
  values: Record<string, unknown[]>;
}

/** A formula plus the value it evaluates to right now. */
export interface F<T = number> {
  formula: string;
  result: T;
}

export const nairobi = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' });

/** Excel stores wall-clock time with no zone, so shift UTC to Nairobi before writing. */
export const toExcelDate = (iso: string | null | undefined) => (iso ? new Date(Date.parse(iso) + NAIROBI_MS) : null);

export const round1 = (n: number) => Math.round(n * 10) / 10;
const blank = (v: unknown) => v === null || v === undefined || v === '';
const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

// ── Registers ────────────────────────────────────────────────────────────────

/** Writes a titled Excel Table at row 4 with typed columns, freeze panes and print setup. */
export function register<R>(
  ws: Worksheet, d: SystemReport, title: string, tableName: string,
  cols: Col<R>[], rows: R[], freezeCols: number, note: string,
): Reg {
  ws.properties.tabColor = { argb: TAB.register };
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
    // Note goes above the header so COUNTA over the (empty) data row stays 0.
    ws.getCell(3, 1).value = 'No records yet.';
    ws.getCell(3, 1).font = { italic: true, color: { argb: MUTED } };
  }

  // Direct cell formatting beats the table style, so restate the header look
  // explicitly; the Arial pass at the end would otherwise turn it black.
  const head = ws.getRow(HEAD_ROW);
  head.height = 30;
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.alignment = { wrapText: true, vertical: 'middle' };
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
  // An empty register still gets one (blank) data row so formula ranges stay valid.
  return { sheet: ws.name, first, last: rows.length ? last : first, count: rows.length, letter, values };
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

export function statusFormats(ws: Worksheet, reg: Reg, header: string, rules: [string, string[]][]) {
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

// ── Criteria & formulas ──────────────────────────────────────────────────────

export function rng(reg: Reg, header: string) {
  const L = reg.letter[header];
  if (!L) throw new Error(`No column "${header}" on ${reg.sheet}`);
  return `'${reg.sheet}'!$${L}$${reg.first}:$${L}$${reg.last}`;
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
const escWild = (s: string) => s.replace(/[~*?]/g, '~$&');

/** One condition, as Excel criteria text plus the same test in JS. */
export interface Crit {
  header: string;
  excel: string;
  test: (v: unknown) => boolean;
}

export const eq = (header: string, label: string): Crit => ({
  header,
  excel: quote(`=${escWild(label)}`),
  test: (v) => same(v, label),
});
export const isBlank = (header: string): Crit => ({ header, excel: '"="', test: blank });
export const numEq = (header: string, n: number): Crit => ({ header, excel: String(n), test: (v) => v === n });
export const contains = (header: string, text: string): Crit => ({
  header,
  excel: quote(`*${escWild(text)}*`),
  test: (v) => typeof v === 'string' && v.toLowerCase().includes(text.toLowerCase()),
});
/** Numeric comparison against a constant: gte('Hour', 6) -> ">=6". */
export const cmp = (header: string, op: '>=' | '<' | '<=' | '>', n: number): Crit => ({
  header,
  excel: quote(`${op}${n}`),
  test: (v) => typeof v === 'number' && compare(v, op, n),
});
/** Numeric comparison against a cell on the analysis sheet, e.g. an editable target. */
export const cmpCell = (header: string, op: '<=' | '>', cell: string, current: number): Crit => ({
  header,
  excel: `"${op}"&${cell}`,
  test: (v) => typeof v === 'number' && compare(v, op, current),
});
/** Dates on/after (or before) a Nairobi wall-clock moment. */
export const dateCmp = (header: string, op: '>=' | '<', at: Date): Crit => {
  const [y, m, d] = [at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate()];
  const frac = (at.getUTCHours() * 60 + at.getUTCMinutes()) / 1440;
  const when = frac ? `(DATE(${y},${m},${d})+${round6(frac)})` : `DATE(${y},${m},${d})`;
  const cut = Date.UTC(y, m - 1, d) + Math.round(frac * 1440) * 60_000;
  return {
    header,
    excel: `"${op}"&${when}`,
    test: (v) => v instanceof Date && (op === '>=' ? v.getTime() >= cut : v.getTime() < cut),
  };
};
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const compare = (v: number, op: string, n: number) =>
  op === '>=' ? v >= n : op === '<' ? v < n : op === '<=' ? v <= n : v > n;

function matching(reg: Reg, crits: Crit[]) {
  const idx: number[] = [];
  for (let i = 0; i < reg.count; i++) {
    if (crits.every((c) => c.test(reg.values[c.header][i]))) idx.push(i);
  }
  return idx;
}

export function countIfs(reg: Reg, ...crits: Crit[]): F {
  // An empty register's placeholder row is blank, so a "blank" criterion would count it.
  if (!reg.count) return { formula: '0', result: 0 };
  const parts = crits.map((c) => `${rng(reg, c.header)},${c.excel}`).join(',');
  const fn = crits.length === 1 ? 'COUNTIF' : 'COUNTIFS';
  return { formula: `${fn}(${parts})`, result: matching(reg, crits).length };
}

export function countAll(reg: Reg, header: string): F {
  return { formula: `COUNTA(${rng(reg, header)})`, result: reg.values[header].filter((v) => !blank(v)).length };
}

export function sumIfs(reg: Reg, valueHeader: string, ...crits: Crit[]): F {
  const vals = matching(reg, crits).map((i) => reg.values[valueHeader][i]).filter((v): v is number => typeof v === 'number');
  const result = round1(vals.reduce((a, b) => a + b, 0));
  if (!crits.length) return { formula: `SUM(${rng(reg, valueHeader)})`, result };
  const parts = crits.map((c) => `${rng(reg, c.header)},${c.excel}`).join(',');
  return { formula: `SUMIFS(${rng(reg, valueHeader)},${parts})`, result };
}

/** Mean of a numeric column over matching rows; "-" when there is nothing to average. */
export function avgIfs(reg: Reg, valueHeader: string, ...crits: Crit[]): F<number | string> {
  const vals = matching(reg, crits).map((i) => reg.values[valueHeader][i]).filter((v): v is number => typeof v === 'number');
  const result = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : '-';
  if (!crits.length) return { formula: `IFERROR(AVERAGE(${rng(reg, valueHeader)}),"-")`, result };
  const parts = crits.map((c) => `${rng(reg, c.header)},${c.excel}`).join(',');
  return { formula: `IFERROR(AVERAGEIFS(${rng(reg, valueHeader)},${parts}),"-")`, result };
}

export function plus(...parts: F[]): F {
  return { formula: parts.map((p) => p.formula).join('+'), result: parts.reduce((a, p) => a + p.result, 0) };
}
export function minus(a: F, b: F): F {
  return { formula: `${a.formula}-(${b.formula})`, result: round1(a.result - b.result) };
}

/** Distinct non-blank values of a column, most frequent first, blanks last as "Not recorded". */
export function distinct(reg: Reg, header: string, ...extra: Crit[]): { label: string; cell: F }[] {
  const seen = new Map<string, string>();
  for (const v of reg.values[header].slice(0, reg.count)) {
    if (blank(v)) continue;
    const key = String(v).toLowerCase();
    if (!seen.has(key)) seen.set(key, String(v));
  }
  const items = [...seen.values()].map((label) => ({ label, cell: countIfs(reg, eq(header, label), ...extra) }));
  const blanks = countIfs(reg, isBlank(header), ...extra);
  if (reg.count && blanks.result > 0) items.push({ label: 'Not recorded', cell: blanks });
  return items.filter((i) => i.cell.result > 0).sort((a, b) => b.cell.result - a.cell.result);
}

export const shortRange = (sheet: string, col: string, from: number, to: number) =>
  `'${sheet}'!$${col}$${from}:$${col}$${Math.max(from, to)}`;

/** INDEX/MATCH of the largest (or smallest) value in a column of a block. */
export function pickExtreme(
  labels: string[], values: (number | string)[], labelRange: string, valueRange: string, mode: 'MAX' | 'MIN',
): { label: F<string>; value: F<number | string> } {
  const nums = values.map((v) => (typeof v === 'number' ? v : null));
  const valid = nums.filter((v): v is number => v !== null);
  if (!valid.length) {
    return { label: { formula: '"-"', result: '-' }, value: { formula: '"-"', result: '-' } };
  }
  const best = mode === 'MAX' ? Math.max(...valid) : Math.min(...valid);
  const at = nums.findIndex((v) => v === best);
  return {
    label: {
      formula: `IFERROR(INDEX(${labelRange},MATCH(${mode}(${valueRange}),${valueRange},0)),"-")`,
      result: labels[at],
    },
    value: { formula: `IFERROR(${mode}(${valueRange}),"-")`, result: best },
  };
}

// ── Analysis blocks ──────────────────────────────────────────────────────────

export interface CountItem {
  label: string;
  cell: F;
  color?: string;
}

export interface BlockRef {
  next: number;
  labelRange: string;
  countRange: string;
  labels: string[];
  counts: number[];
}

/**
 * Label | Count (formula) | Share (formula) with a SUM total, and an optional
 * pie to the right. Returns where it ended and the ranges it wrote.
 */
export function countTable(
  wb: Workbook, ws: Worksheet, row: number, title: string, labelHeader: string,
  items: CountItem[], pie?: { title: string; caption: string; categorical?: boolean },
): BlockRef {
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
  let next = tr + 2;

  if (pie && total > 0) {
    const slices: Slice[] = pie.categorical
      ? toSlices(items, (i) => i.label, (i) => i.cell.result)
      : items.map((i) => ({ label: i.label, value: i.cell.result, color: i.color ?? '#898781' }));
    placePie(wb, ws, top, pie.title, slices, pie.caption);
    next = Math.max(next, top + PIE_ROWS + 1);
  }
  const lastItem = Math.max(first, first + items.length - 1);
  return {
    next,
    labelRange: shortRange(ws.name, 'A', first, lastItem),
    countRange: shortRange(ws.name, 'B', first, lastItem),
    labels: items.map((i) => i.label),
    counts: items.map((i) => i.cell.result),
  };
}

export interface MetricCol {
  header: string;
  fmt: string;
  /** Colour scale over the column: low-good (green->red) or high-good. */
  scale?: 'lowGood' | 'highGood';
}

export interface MetricRef {
  next: number;
  labelRange: string;
  colRange: (i: number) => string;
  labels: string[];
  values: (i: number) => (number | string)[];
}

/** A leaderboard: label column plus several formula columns, optional colour scales. */
export function metricTable(
  ws: Worksheet, row: number, title: string, labelHeader: string, cols: MetricCol[],
  rows: { label: string; cells: (F<number | string> | number | string)[] }[],
): MetricRef {
  section(ws, row, title, cols.length + 1);
  row += 1;
  tableHead(ws, row, [labelHeader, ...cols.map((c) => c.header)]);
  row += 1;
  const first = row;
  rows.forEach((r, i) => {
    ws.getCell(row, 1).value = r.label;
    r.cells.forEach((c, j) => {
      const cell = ws.getCell(row, j + 2);
      cell.value = c as any;
      cell.numFmt = cols[j].fmt;
    });
    bodyRow(ws, row, cols.length + 1, i);
    row += 1;
  });
  if (!rows.length) {
    ws.getCell(row, 1).value = 'No records';
    ws.getCell(row, 1).font = { italic: true, color: { argb: MUTED } };
    row += 1;
  }
  const last = Math.max(first, first + rows.length - 1);
  cols.forEach((c, j) => {
    if (!c.scale || rows.length < 2) return;
    const L = colLetter(j + 2);
    const [lo, hi] = c.scale === 'lowGood' ? ['FF63BE7B', 'FFF8696B'] : ['FFF8696B', 'FF63BE7B'];
    ws.addConditionalFormatting({
      ref: `${L}${first}:${L}${last}`,
      rules: [{
        type: 'colorScale',
        priority: 1,
        cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
        color: [{ argb: lo }, { argb: 'FFFFEB84' }, { argb: hi }],
      } as any],
    });
  });
  const value = (r: { cells: (F<number | string> | number | string)[] }, j: number) => {
    const c = r.cells[j];
    return typeof c === 'object' ? c.result : c;
  };
  return {
    next: row + 1,
    labelRange: shortRange(ws.name, 'A', first, last),
    colRange: (j) => shortRange(ws.name, colLetter(j + 2), first, last),
    labels: rows.map((r) => r.label),
    values: (j) => rows.map((r) => value(r, j)),
  };
}

// ── Styling ──────────────────────────────────────────────────────────────────

export function banner(ws: Worksheet, title: string, generatedAt: string, span: number, note: string) {
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

export function analysisSheet(ws: Worksheet, d: SystemReport, title: string, note: string, colWidths: number[]) {
  ws.properties.tabColor = { argb: TAB.analysis };
  banner(ws, title, d.generatedAt, 10, note);
  colWidths.forEach((x, i) => (ws.getColumn(i + 1).width = x));
  ws.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }];
  printSetup(ws);
}

export function section(ws: Worksheet, row: number, title: string, span: number) {
  for (let c = 1; c <= span; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_FILL } };
    cell.border = { bottom: { style: 'medium', color: { argb: BRAND } } };
  }
  const cell = ws.getCell(row, 1);
  cell.value = title;
  cell.font = { bold: true, size: 11, color: { argb: BRAND } };
}

export function tableHead(ws: Worksheet, row: number, headers: string[]) {
  headers.forEach((h, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle', wrapText: true };
  });
}

export function bodyRow(ws: Worksheet, row: number, span: number, index: number) {
  for (let c = 1; c <= span; c++) {
    const cell = ws.getCell(row, c);
    cell.border = { bottom: { style: 'hair', color: { argb: LINE } } };
    if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F8FA' } };
    if (c > 1 && !cell.alignment?.horizontal) cell.alignment = { ...cell.alignment, horizontal: 'right' };
  }
}

export function totalStyle(ws: Worksheet, row: number, span: number) {
  for (let c = 1; c <= span; c++) {
    const cell = ws.getCell(row, c);
    cell.font = { bold: true, color: { argb: INK } };
    cell.border = { top: { style: 'thin', color: { argb: INK } } };
    if (c > 1) cell.alignment = { horizontal: 'right' };
  }
}

/** A blue-on-yellow cell the reader is meant to change; formulas reference it. */
export function inputCell(ws: Worksheet, addr: string, value: number, note: string) {
  const c = ws.getCell(addr);
  c.value = value;
  c.font = { bold: true, color: { argb: INPUT_FONT } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } };
  c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  c.alignment = { horizontal: 'center' };
  c.note = note;
}

export function placePie(wb: Workbook, ws: Worksheet, row: number, title: string, slices: Slice[], caption: string, col = PIE_COL) {
  if (!slices.some((s) => s.value > 0)) return;
  const img = renderPie(title, slices, caption);
  const id = wb.addImage({ base64: img.dataUrl, extension: 'png' });
  ws.addImage(id, { tl: { col, row: row - 1 }, ext: { width: img.width, height: img.height } });
}

export function link(ws: Worksheet, addr: string, sheet: string, text = sheet) {
  const c = ws.getCell(addr);
  c.value = { text, hyperlink: `#'${sheet}'!A1` };
  c.font = { color: { argb: BRAND }, underline: true };
}

export function printSetup(ws: Worksheet, titleRows?: string) {
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

/**
 * Final pass: Arial everywhere (keeping size, weight and colour), and drop any
 * cached formula result that is not a finite number or text - "NaN" in the XML
 * makes Excel report the file as corrupt. Excel recalculates those on open.
 */
export function finishSheet(ws: Worksheet) {
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { size: 10, ...cell.font, name: FONT };
      // Read model.result: ExcelJS's .value getter drops falsy results such as 0.
      const model = cell.model as { formula?: string; result?: unknown };
      if (model.formula && typeof model.result === 'number' && !Number.isFinite(model.result)) {
        console.warn(`System report: no cached result for ${ws.name}!${cell.address}`);
        cell.value = { formula: model.formula } as any;
      }
    });
  });
}

export function colLetter(n: number) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
