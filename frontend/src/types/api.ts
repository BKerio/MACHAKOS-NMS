export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'WATCHER' | 'DISPATCHER' | 'PARTNER' | 'DRIVER' | 'EMT' | 'NURSE';
export type AgencyType = 'INTERNAL' | 'PARTNER';

export type IncidentStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'DISPATCH_HANDLING'
  | 'DISPATCH_ON_HOLD'
  | 'DISPATCHED'
  | 'RESOLVED';

export type TaskStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'AT_SCENE'
  | 'PATIENT_PICKED'
  | 'AT_HOSPITAL'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'HANDED_OVER';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: Role;
  roles?: Role[];
  activeRole?: Role;
  agencyId: string | null;
  agency?: Agency;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Agency {
  id: string;
  name: string;
  type: AgencyType;
  location?: string;
  contactInfo?: Record<string, unknown>;
  isActive: boolean;
}

export interface CrewMember {
  id: string;
  name: string;
  phone?: string | null;
}

export interface Vehicle {
  id: string;
  registrationNumber: string;
  imei: string;
  isActive: boolean;
  status?: 'READY' | 'BUSY' | 'MAINTENANCE';
  lastLat?: number | null;
  lastLng?: number | null;
  lastLocationAt?: string | null;
  lastLocationName?: string | null;
  checkInLocationName?: string | null;
  checkInLat?: number | null;
  checkInLng?: number | null;
  checkedInAt?: string | null;
  /** Present on nearby handover candidates (km from releasing unit / scene). */
  distanceKm?: number | null;
  updatedAt?: string;
  createdAt?: string;
  agencyId: string;
  currentDriver?: CrewMember | null;
  currentEmt?: CrewMember | null;
  currentNurse?: CrewMember | null;
}

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginatedMeta;
}

export interface Facility {
  id: string;
  name: string;
  type: string;
  kephLevel: number;
  subCounty: string;
  lat: number;
  lng: number;
  isActive: boolean;
}

export type InventoryCategory =
  | 'VITALS'
  | 'CONSUMABLES'
  | 'MEDICATION'
  | 'AIRWAY'
  | 'WOUND_CARE'
  | 'OTHER';

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory | string;
  unit: string;
  quantityStock: number;
  reorderLevel: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryCheckout {
  id: string;
  quantity: number;
  returnedQuantity: number;
  status: 'CHECKED_OUT' | 'RETURNED';
  checkedOutAt: string;
  returnedAt: string | null;
  item: InventoryItem;
  user?: { id: string; name: string; role?: string };
  vehicle?: { id: string; registrationNumber: string };
}

export interface PatientVitals {
  temperature?: string;
  pulseRate?: string;
  respirationRate?: string;
  bp?: string;
  spo2?: string;
  fh?: string;
}

export interface MaternityVitals {
  admissionDateTime?: string;
  parity?: string;
  gravid?: string;
  fetalHeartRate?: string;
  membranes?: string;
  characterOfLiquor?: string;
  moulding?: string;
  cervicalDilatation?: string;
  descent?: string;
  uterineContraction?: string;
  medicationsFetal?: string;
  bp?: string;
  pulse?: string;
  temperature?: string;
  rbs?: string;
  spo2?: string;
  gcs?: string;
  proteinInUrine?: string;
  glucoseInUrine?: string;
  urineOutput?: string;
  deliveryDateTime?: string;
  modeOfDelivery?: string;
  newbornGender?: string;
  birthWeight?: string;
  conditionOfBaby?: string;
  apgar1Min?: string;
  apgar5Min?: string;
  apgar10Min?: string;
  medicationNewborn?: string;
}

export interface GbvReport {
  id: string;
  incidentId: string;
  survivorResidence?: string | null;
  hasDisability?: boolean | null;
  gbvTypes: string[];
  violationLocation?: string | null;
  referredFor: string[];
  referralFacility?: string | null;
  firstDisclosedTo?: string | null;
  challenges?: string | null;
  recommendations?: string | null;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Incident {
  id: string;
  caseNumber: string;
  status: IncidentStatus;
  isGbvCase?: boolean;
  chiefComplaint: string;
  locationName: string;
  subCounty: string;
  subCountySource?: 'AUTO' | 'MANUAL' | null;
  lat?: number;
  lng?: number;
  alertMode?: string;
  alertAt?: string;
  notifierDetails?: Array<Record<string, string>>;
  patientName?: string;
  patientAge?: string;
  patientGender?: string;
  patientNhif?: string;
  patientNationalId?: string;
  patientContact?: string;
  nextOfKin?: string;
  nextOfKinPhone?: string;
  alertNature?: string;
  alertNatureDetail?: string;
  originOfAlert?: string;
  placeOfReferral?: string;
  healthcareWorkerName?: string;
  healthcareWorkerContact?: string;
  targetFacilityId?: string | null;
  targetFacility?: Facility | null;
  massCasualty: boolean;
  massCasualtyCount?: number;
  watcherComments?: string;
  dispatcherComments?: string;
  dispatcherChallenges?: string;
  preHospitalManagement?: string;
  partnerNotes?: string;
  pcrUrl?: string;
  closureReason?: string;
  closedById?: string;
  createdAt: string;
  watcher?: Pick<User, 'id' | 'name' | 'phone'>;
  dispatcher?: Pick<User, 'id' | 'name' | 'phone'>;
  tasks?: Task[];
  forwardingLogs?: ForwardingLog[];
  gbvReport?: GbvReport | null;
  maternityVitals?: MaternityVitals | null;
  vitals?: PatientVitals | null;
}

export interface ForwardingLog {
  id: string;
  incidentId: string;
  reason: string;
  createdAt: string;
  fromAgency: { id: string; name: string };
  toAgency: { id: string; name: string };
}

export interface Task {
  id: string;
  status: TaskStatus;
  receivedAt: string;
  acceptedAt?: string;
  sceneArrivalAt?: string;
  patientPickAt?: string;
  facilityArrivalAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  handedOverAt?: string | null;
  handoverReason?: string | null;
  previousTaskId?: string | null;
  handoverVitals?: Record<string, string> | null;
  incidentId: string;
  vehicleId: string;
  vehicle?: Vehicle;
  driverId: string;
  emtId?: string | null;
  nurseId?: string | null;
  driver?: Pick<User, 'id' | 'name' | 'phone'> | null;
  emt?: Pick<User, 'id' | 'name' | 'phone'> | null;
  nurse?: Pick<User, 'id' | 'name' | 'phone'> | null;
  incident?: Incident;
}

/** Active or ended task, as returned to the crew (driver/EMT/nurse) - always carries its incident + vehicle. */
export interface CrewTask extends Omit<Task, 'incident' | 'vehicle'> {
  incident: Incident;
  vehicle: Vehicle;
}

/** One row of a responder's ended-task history (GET /tasks/history). */
export interface TaskHistoryItem {
  id: string;
  status: TaskStatus;
  receivedAt: string;
  acceptedAt?: string | null;
  sceneArrivalAt?: string | null;
  patientPickAt?: string | null;
  facilityArrivalAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  handedOverAt?: string | null;
  handoverReason?: string | null;
  pcrCount?: number;
  lastPcrAt?: string | null;
  incidentId: string;
  vehicleId: string;
  incident: Pick<Incident, 'id' | 'caseNumber' | 'chiefComplaint' | 'locationName' | 'subCounty'>;
  vehicle: Pick<Vehicle, 'id' | 'registrationNumber'>;
}

/** EMT/nurse in the driver's agency, for the crew-assignment picker (GET /fleet/crew-members). */
export interface AssignableCrewMember {
  id: string;
  name: string;
  phone?: string | null;
  role: 'EMT' | 'NURSE';
  /** AVAILABLE = free to assign; TAKEN = already on another (or this) vehicle */
  status?: 'AVAILABLE' | 'TAKEN';
  assignedVehicleId?: string | null;
  assignedVehicleRegistration?: string | null;
}

export interface TaskStop {
  id: string;
  taskId: string;
  name: string;
  facilityId?: string | null;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
  sequence: number;
  arrivedAt?: string | null;
  createdAt: string;
}

export interface PartnerAmbulance {
  id: string;
  agencyId?: string | null;
  agency?: { id: string; name: string } | null;
  registrationNumber: string;
  vehicleType?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  baseLocation?: string | null;
  capacity?: string | null;
  notes?: string | null;
  isActive: boolean;
}

export interface PatientCareReport {
  id: string;
  taskId: string;
  uploaderId: string;
  note: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface SmsMessage {
  id: string;
  recipient: string;
  message: string;
  channel?: string; // SMS | WHATSAPP
  category: string;
  status: string;
  providerMessageId?: string | null;
  error?: string | null;
  groupLabel?: string | null;
  incidentId?: string | null;
  createdAt: string;
}

export interface SmsContact {
  id: string;
  name: string;
  phone: string;
  group: string;
  isActive: boolean;
}

export interface SmsTemplate {
  id: string;
  key: string;
  label: string;
  body: string;
}

export interface AuditLog {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'STATUS_CHANGE' | string;
  subjectType: string;
  subjectId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  createdAt: string;
  user: Pick<User, 'id' | 'name' | 'role'>;
}

export type CallDirection = 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
export type CallStatus = 'RINGING' | 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'FAILED';

export interface CallLog {
  id: string;
  callId: string;
  direction: CallDirection;
  callFrom: string;
  callTo: string;
  startedAt: string;
  endedAt?: string;
  duration: number;
  talkDuration: number;
  status: CallStatus;
  recording?: string;
  trunkName?: string;
  didNumber?: string;
  notes?: string;
  createdAt: string;
  incidentId?: string;
  incident?: { id: string; caseNumber: string };
}

export interface ActiveCall {
  callId: string;
  direction: CallDirection;
  callFrom: string;
  callTo: string;
  status: 'RINGING' | 'ANSWERED';
  startedAt: string;
}
