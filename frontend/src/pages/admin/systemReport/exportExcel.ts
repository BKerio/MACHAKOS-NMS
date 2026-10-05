import type { Worksheet } from 'exceljs';
import type { SystemReport, SystemReportDetails } from './types';
import { finishSheet } from './excel/core';
import * as R from './excel/registers';
import * as A from './excel/analysis';

const { S } = A;

/**
 * Builds the System Report workbook: overview, analysis and record sheets.
 * See excel/core.ts for how the formulas and cached results fit together.
 */
export async function buildSystemReportWorkbook(data: SystemReport, details: SystemReportDetails) {
  // Loaded on demand: ExcelJS is large and only needed when someone exports.
  const mod = await import('exceljs');
  const ExcelJS = ((mod as any).default ?? mod) as typeof import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Machakos County EOC';
  wb.title = 'EOC System Report';
  wb.created = new Date(data.generatedAt);
  wb.calcProperties = { fullCalcOnLoad: true };

  // Create every sheet up front so the tab order is fixed, then fill them.
  const ws = Object.fromEntries(
    Object.entries(S).map(([k, name]) => [k, wb.addWorksheet(name, { views: [{ showGridLines: false }] })])
  ) as Record<keyof typeof S, Worksheet>;

  const regs: A.Regs = {
    cases: R.casesRegister(ws.cases, data, details),
    tasks: R.tasksRegister(ws.tasks, data, details),
    calls: R.callsRegister(ws.calls, data, details),
    facilities: R.facilitiesRegister(ws.facilities, data, details),
    ratings: R.ratingsRegister(ws.ratings, data, details),
    users: R.usersRegister(ws.users, data, details),
    checkIns: R.checkInsRegister(ws.checkIns, data, details),
    fleet: R.fleetRegister(ws.fleet, data, details),
    standby: R.standbyRegister(ws.standby, data, details),
    inventory: R.inventoryRegister(ws.inventory, data, details),
    checkouts: R.checkoutsRegister(ws.checkouts, data, details),
    checklist: R.checklistRegister(ws.checklist, data, details),
    pcr: R.pcrRegister(ws.pcr, data, details),
    activity: R.activityRegister(ws.activity, data, details),
  };

  const cases = A.caseAnalysis(wb, ws.caseAnalysis, data, regs);
  const time = A.timePatterns(ws.timePatterns, data, regs);
  const response = A.responsePerformance(wb, ws.response, data, regs);
  const facility = A.facilityAnalysis(wb, ws.facilityAnalysis, data, regs);
  A.peopleFleet(wb, ws.peopleFleet, data, regs);
  const crew = A.crewAccountability(wb, ws.crew, data, regs);
  const stock = A.stockMovements(wb, ws.stock, data, regs);
  const quality = A.dataQuality(ws.quality, data, regs);
  A.insights(ws.insights, data, regs, { cases, time, response, facility, crew, stock, quality });
  A.summary(wb, ws.summary, data, regs, { addr: response.withinPctAddr, result: response.withinPct.result });

  const counts: Record<string, number> = {
    [S.cases]: details.cases.length,
    [S.tasks]: details.tasks.length,
    [S.calls]: details.calls.length,
    [S.facilities]: details.facilities.length,
    [S.ratings]: details.ratings.length,
    [S.users]: details.users.length,
    [S.checkIns]: details.checkIns.length,
    [S.fleet]: details.fleet.length,
    [S.standby]: details.standbys.length,
    [S.inventory]: details.inventory.length,
    [S.checkouts]: details.checkouts.length,
    [S.checklist]: details.checklist.length,
    [S.pcr]: details.pcrs.length,
    [S.activity]: details.activity.length,
  };
  A.contents(ws.contents, data, counts, response.target);

  wb.eachSheet(finishSheet);
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
