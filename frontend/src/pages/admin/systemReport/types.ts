import type { FacilityOwnership } from '@/types/api';

export interface SystemReport {
  generatedAt: string;
  summary: {
    users: number;
    activeUsers: number;
    inactiveUsers: number;
    incidents: number;
    vehicles: number;
    agencies: number;
    facilities: number;
    activeFacilities: number;
    publicFacilities: number;
    privateFacilities: number;
    inventoryItems: number;
    lowStockItems: number;
    partnerAmbulances: number;
    activePartnerAmbulances: number;
    gbvReports: number;
    natureOptions: number;
    tasks: number;
  };
  caseSummary: {
    total: number;
    resolved: number;
    pending: number;
    inProgress: number;
    drafts: number;
    /** % of submitted (non-draft) cases that are resolved. */
    resolutionRate: number;
    today: number;
    last7Days: number;
    last30Days: number;
    massCasualty: number;
    gbvFlagged: number;
  };
  responseTimes: {
    avgAcceptMinutes: number | null;
    avgResponseMinutes: number | null;
    avgCaseMinutes: number | null;
    totalDistanceKm: number;
    completedTasks: number;
  };
  incidentsByMonth: { month: string; total: number; resolved: number }[];
  incidentsByGender: { gender: string; count: number }[];
  usersByRole: { role: string; count: number }[];
  usersByStatus: { status: string; count: number }[];
  incidentsByStatus: { status: string; count: number }[];
  incidentsByNature: { nature: string; count: number }[];
  incidentsBySubCounty: { subCounty: string; count: number }[];
  vehiclesByStatus: { status: string; count: number }[];
  agenciesByType: { type: string; count: number }[];
  facilitiesByType: { type: string; count: number }[];
  facilitiesByOwnership: { ownership: FacilityOwnership; count: number }[];
  facilitiesByKeph: { level: number; count: number }[];
  facilityList: {
    name: string;
    type: string;
    ownership: FacilityOwnership;
    kephLevel: number;
    subCounty: string;
    isActive: boolean;
  }[];
  inventoryByCategory: { category: string; items: number; stock: number }[];
  inventoryLowStock: {
    name: string;
    category: string;
    quantityStock: number;
    reorderLevel: number;
    unit: string;
  }[];
  tasksByStatus: { status: string; count: number }[];
}

type Ts = string | null; // ISO timestamp

/** Record-level rows from GET /admin/system-report/details (contacts arrive masked). */
export interface SystemReportDetails {
  cases: {
    caseNumber: string; status: string; incidentType: 'EMERGENCY' | 'REFERRAL'; originFacility: string | null;
    patientUnknown: boolean; patientDescription: string | null; createdAt: string; alertAt: Ts; alertMode: string | null;
    originOfAlert: string | null; nature: string | null; natureDetail: string | null; chiefComplaint: string;
    location: string; subCounty: string; lat: number | null; lng: number | null;
    massCasualty: boolean; massCasualtyCount: number | null; gbv: boolean;
    patientName: string | null; patientAge: string | null; patientGender: string | null;
    patientContact: string | null; patientNationalId: string | null; patientNhif: string | null;
    nextOfKin: string | null; nextOfKinPhone: string | null;
    vitals: string | null; maternityVitals: string | null; preHospitalManagement: string | null;
    hospitalLevelRequired: number | null; targetFacility: string | null; placeOfReferral: string | null;
    ambulanceUsed: string | null; latestVehicle: string | null; latestTaskStatus: string | null; taskCount: number;
    watcher: string; dispatcher: string | null; agency: string; healthcareWorker: string | null;
    watcherComments: string | null; dispatcherComments: string | null; dispatcherChallenges: string | null;
    surveillanceNote: string | null; partnerNotes: string | null; closureReason: string | null; updatedAt: string;
  }[];
  tasks: {
    caseNumber: string; vehicle: string; status: string; driver: string; medics: string;
    receivedAt: string; acceptedAt: Ts; sceneArrivalAt: Ts; patientPickAt: Ts; sceneDepartureAt: Ts;
    facilityArrivalAt: Ts; completedAt: Ts;
    minToAccept: number | null; minToScene: number | null; minOnScene: number | null;
    minToFacility: number | null; minTotal: number | null;
    kmToScene: number | null; kmToFacility: number | null;
    cancelledAt: Ts; cancelReason: string | null; handedOverAt: Ts; handoverReason: string | null;
    handoverBy: string | null; handoverVitals: string | null;
  }[];
  users: {
    name: string; role: string; roles: string; agency: string; email: string | null; phone: string | null;
    isActive: boolean; createdAt: string; casesLogged: number; casesDispatched: number; crewTasks: number;
  }[];
  fleet: {
    plate: string; agency: string; status: string; isActive: boolean; trackerImei: string | null;
    currentDriver: string | null; currentMedics: string; lastLocation: string | null; lastSeenAt: Ts;
    fuelLitres: number | null; tasksTotal: number; tasksCompleted: number; distanceKm: number;
  }[];
  facilities: {
    name: string; type: string; ownership: FacilityOwnership; kephLevel: number; subCounty: string;
    isActive: boolean; casesReceived: number; ratingAverage: number | null; ratingCount: number;
    lat: number; lng: number;
  }[];
  inventory: { name: string; category: string; quantityStock: number; reorderLevel: number; unit: string }[];
  officialSubCounties: string[];
  checkIns: {
    checkedInAt: string; name: string; role: string; vehicle: string; location: string | null;
    locationMatch: 'MATCHED' | 'MISMATCH' | 'UNVERIFIED'; distanceM: number | null; accuracyM: number | null;
    mockLocation: boolean;
  }[];
  standbys: {
    vehicle: string; title: string; location: string | null; startedAt: string; endedAt: Ts;
    minutes: number | null; notes: string | null;
  }[];
  checkouts: {
    checkedOutAt: string; item: string; category: string; unit: string; quantity: number; returned: number;
    status: string; returnedAt: Ts; by: string; vehicle: string;
  }[];
  checklist: {
    checkedAt: string; vehicle: string; item: string; category: string; status: string; note: string | null; by: string;
  }[];
  ratings: {
    createdAt: string; facility: string; stars: number; tags: string; comment: string | null;
    by: string; role: string; caseNumber: string;
  }[];
  pcrs: { createdAt: string; caseNumber: string; uploader: string; mimeType: string; sizeKb: number; note: string | null }[];
  calls: {
    startedAt: string; direction: string; status: string; from: string | null; to: string | null;
    durationSec: number; talkSec: number; caseNumber: string | null; trunk: string | null; notes: string | null;
  }[];
  activity: { at: string; user: string; role: string; action: string; subject: string; subjectId: string; ip: string | null }[];
}

export interface Slice {
  label: string;
  value: number;
  color: string;
}

// Validated categorical order (dataviz reference palette, light): fixed order, never cycled.
// Three slots sit under 3:1 on white, so every pie ships with value + % labels.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
export const OTHER_GREY = '#898781';

// Case outcomes are states, so they use the reserved status colours (always labelled).
export const CASE_COLORS = {
  resolved: '#0ca30c',
  pending: '#fab219',
  inProgress: '#2a78d6',
  drafts: '#898781',
};

export const OWNERSHIP_COLORS: Record<FacilityOwnership, string> = {
  PUBLIC: '#2a78d6',
  PRIVATE: '#eb6834',
};

const ACRONYMS = new Set(['EMT', 'GBV', 'EOC', 'ICU', 'PCR']);

/** ENUM_VALUE -> "Enum value", keeping acronyms such as EMT intact. */
export function labelize(value: string) {
  const s = value
    .split('_')
    .map((w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w.toLowerCase()))
    .join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Categorical slices in fixed colour order; anything past 6 folds into "Other". */
export function toSlices<T>(rows: T[], label: (r: T) => string, value: (r: T) => number): Slice[] {
  const sorted = rows.filter((r) => value(r) > 0).sort((a, b) => value(b) - value(a));
  const head = sorted.slice(0, SERIES.length - (sorted.length > SERIES.length ? 1 : 0));
  const tail = sorted.slice(head.length);
  const slices = head.map((r, i) => ({ label: label(r), value: value(r), color: SERIES[i] }));
  if (tail.length) {
    slices.push({ label: `Other (${tail.length})`, value: tail.reduce((s, r) => s + value(r), 0), color: OTHER_GREY });
  }
  return slices;
}

export function caseSlices(r: SystemReport): Slice[] {
  const c = r.caseSummary;
  return [
    { label: 'Solved', value: c.resolved, color: CASE_COLORS.resolved },
    { label: 'Pending', value: c.pending, color: CASE_COLORS.pending },
    { label: 'In progress', value: c.inProgress, color: CASE_COLORS.inProgress },
    { label: 'Drafts', value: c.drafts, color: CASE_COLORS.drafts },
  ];
}

export function ownershipSlices(r: SystemReport): Slice[] {
  return r.facilitiesByOwnership.map((o) => ({
    label: o.ownership === 'PRIVATE' ? 'Private' : 'Public',
    value: o.count,
    color: OWNERSHIP_COLORS[o.ownership],
  }));
}

export function fmtMinutes(m: number | null) {
  if (m == null) return '-';
  if (m < 60) return `${m.toFixed(1)} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${Math.round(m - h * 60)} min`;
}

export function pct(part: number, whole: number) {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '0%';
}
