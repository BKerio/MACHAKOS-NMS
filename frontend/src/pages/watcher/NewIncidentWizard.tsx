import { useState, useEffect, useRef, Fragment, type ReactNode, type ElementType } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CircleCheck as CheckCircle,
  MapPin,
  Send as PaperPlaneRight,
  ClipboardList as ClipboardText,
  Phone,
  User,
  Cross as FirstAid,
  ListChecks,
  CircleX as XCircle,
  ArrowRight,
  ArrowLeft,
  Pencil as PencilSimple,
  Eye,
  Baby,
  Check,
  RadioTower,
  Footprints,
  MoreHorizontal,
  Siren,
  ArrowRightLeft,
  Hospital,
  UserX,
  HeartPulse,
  Scissors,
  Stethoscope,
  CarFront,
  ShieldAlert,
  HeartCrack,
  Headphones,
  Video,
  MessageCircleQuestion,
  Megaphone,
  MessageSquareWarning,
  Info,
  Mars,
  Venus,
  Users,
} from 'lucide-react';
import AppLoader from '@/components/shared/AppLoader';
import api from '@/api/client';
import Map from '@/components/shared/Map';
import CreatableCombobox from '@/components/shared/CreatableCombobox';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePlacesAutocomplete } from '@/hooks/usePlacesAutocomplete';
import { toNairobiInput, nairobiInputToISO } from '@/lib/datetime';
import { fetchDrivingRoute, type DrivingRoute } from '@/lib/directions';
import { inMachakos, nearestSubCounty, subCountyFromText } from '@/lib/machakosPlaces';
import type { Facility } from '@/types/api';

// ── Constants ────────────────────────────────────────────────────────────────

const ORIGIN_OPTIONS = [
  'Community', 'Hospital', 'Police', 'Fire Department', 'Other EMS', 'Self-referral', 'Other',
];

type IncidentType = 'EMERGENCY' | 'REFERRAL';

const facilityLabel = (f: Facility) =>
  [f.name, f.type, f.subCounty].filter(Boolean).join(' · ');

/** Great-circle distance in km - a fallback while the road route loads. */
function straightKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2
    + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Placeholder name for an unidentified patient, by recorded sex. */
function unknownPatientName(gender: string) {
  if (gender === 'Male') return 'John Doe';
  if (gender === 'Female') return 'Jane Doe';
  return 'Unknown person';
}

// ── Style tokens ─────────────────────────────────────────────────────────────

const inputCls = [
  'w-full h-[42px] px-3 rounded-lg text-sm outline-none transition-[border-color,box-shadow]',
  'border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--ink)]',
  'placeholder:text-[var(--muted-2)]',
  'focus:border-[var(--green)] focus:shadow-[0_0_0_3px_var(--ring)]',
].join(' ');

const selectCls = inputCls;

const textareaCls = [
  'w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none transition-[border-color,box-shadow]',
  'border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--ink)]',
  'placeholder:text-[var(--muted-2)]',
  'focus:border-[var(--green)] focus:shadow-[0_0_0_3px_var(--ring)]',
].join(' ');

const Label = ({ children, required }: { children: ReactNode; required?: boolean }) => (
  <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--ink)' }}>
    {children}
    {required && <span className="ml-0.5" style={{ color: 'var(--red)' }}>*</span>}
  </label>
);

/** One form row. Directly inside a section it lays out label-left (see
 *  .iw-rows in index.css); nested inside a Row it stays stacked. */
const Field = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={`iw-field${className ? ` ${className}` : ' flex flex-col'}`}>{children}</div>
);

const Hint = ({ children }: { children: ReactNode }) => (
  <p className="iw-hint text-[11.5px] mt-1.5 leading-relaxed" style={{ color: 'var(--muted)' }}>{children}</p>
);

/** A row holding several controls on the right (like City / State / Zip):
 *  one label + helper on the left, compact stacked fields side by side. */
function Row({
  label, hint, required, cols = 2, children,
}: { label: string; hint?: ReactNode; required?: boolean; cols?: 2 | 3; children: ReactNode }) {
  return (
    <div className="iw-row">
      <div className="iw-label">
        <span className="block text-[13px] font-medium" style={{ color: 'var(--ink)' }}>
          {label}
          {required && <span className="ml-0.5" style={{ color: 'var(--red)' }}>*</span>}
        </span>
      </div>
      {hint && <p className="iw-hint text-[11.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>{hint}</p>}
      <div className={`iw-pair grid gap-3 grid-cols-1 ${cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>{children}</div>
    </div>
  );
}

/** Pick-one tiles with an icon (the design's "Number of employees" tiles). */
function TileGroup<T extends string>({
  options, value, onChange, cols = 'grid-cols-2 sm:grid-cols-4',
}: { options: { value: T; label: string; Icon: ElementType; sub?: string }[]; value: T; onChange: (v: T) => void; cols?: string }) {
  return (
    <div role="radiogroup" className={`grid ${cols} gap-2.5`}>
      {options.map(({ value: v, label, Icon, sub }) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className="h-[74px] rounded-lg border flex flex-col items-center justify-center gap-1.5 text-[13px] font-semibold transition-colors"
            style={
              on
                ? { borderColor: 'var(--green)', background: 'var(--green-light)', color: 'var(--green)', boxShadow: '0 0 0 1px var(--green)' }
                : { borderColor: 'var(--border-strong)', background: 'var(--surface)', color: 'var(--ink-2)' }
            }
          >
            <Icon size={18} />
            {label}
            {sub && <span className="text-[11px] font-normal -mt-1" style={{ color: 'var(--muted)' }}>{sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Fast inputs: one tap instead of open-scroll-pick ──────────────────────────

/** Icon for a nature-of-alert category, matched on its name (categories are admin-configured). */
const NATURE_ICONS: [RegExp, ElementType][] = [
  [/maternity|neonat/i, Baby],
  [/gyn/i, HeartPulse],
  [/surgical/i, Scissors],
  [/medical\)|illness/i, Stethoscope],
  [/accident/i, CarFront],
  [/violence/i, ShieldAlert],
  [/self/i, HeartCrack],
  [/tele ?counsel/i, Headphones],
  [/telemed/i, Video],
  [/advice/i, MessageCircleQuestion],
  [/public/i, Megaphone],
  [/complain|compliment/i, MessageSquareWarning],
  [/inquiry|enquiry/i, Info],
];
const natureIcon = (n: string): ElementType => NATURE_ICONS.find(([re]) => re.test(n))?.[1] ?? MoreHorizontal;
/** "Maternity (maternal & neonatal disorders)" -> "Maternity" for the chip face. */
const chipLabel = (n: string) => n.replace(/\s*\(.*\)\s*$/, '').trim() || n;

/** Wrap of selectable chips; tapping the selected chip again clears it. */
function ChipPicker({
  options, value, onChange, icon, label = (o: string) => o, columns,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  icon?: (o: string) => ElementType;
  label?: (o: string) => string;
  /** Equal-width grid instead of a free wrap. */
  columns?: string;
}) {
  return (
    <div role="radiogroup" className={columns ? `grid ${columns} gap-2` : 'flex flex-wrap gap-2'}>
      {options.map((o) => {
        const on = value === o;
        const Icon = icon?.(o);
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={on}
            title={o}
            onClick={() => onChange(on ? '' : o)}
            className="inline-flex items-center gap-2 min-h-[40px] px-3 rounded-lg border text-[13px] font-medium transition-all text-left"
            style={on
              ? { borderColor: 'var(--green)', background: 'var(--green-light)', color: 'var(--green)', boxShadow: '0 0 0 1px var(--green)' }
              : { borderColor: 'var(--border-strong)', background: 'var(--surface)', color: 'var(--ink-2)' }}
          >
            {Icon && <Icon size={15} className="shrink-0" />}
            <span className="leading-tight">{label(o)}</span>
            {on && <Check size={13} className="ml-auto shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

const AGE_PRESETS = ['Below 1 Month', '1-6 Months', '6-12 Months', 'Unknown'] as const;

/** Type years, or tap an infant / unknown preset. Stores the same strings as before. */
function AgePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const years = /^\d+$/.test(value) ? value : '';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-[120px]">
        <input
          type="text"
          inputMode="numeric"
          aria-label="Age in years"
          placeholder="Age"
          className={`${inputCls} pr-12 text-[15px] font-semibold`}
          value={years}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 3);
            onChange(v && Number(v) > 150 ? '150' : v);
          }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: 'var(--muted)' }}>yrs</span>
      </div>
      <span className="text-[12px] px-1" style={{ color: 'var(--muted-2)' }}>or</span>
      <ChipPicker options={[...AGE_PRESETS]} value={value} onChange={onChange} label={(o) => (o === 'Below 1 Month' ? '< 1 month' : o.replace(' Months', ' mo'))} />
    </div>
  );
}

/** A flag the watcher switches on: big, colour-coded when active. */
function ToggleCard({
  on, onChange, title, sub, color, Icon, children,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  title: string;
  sub: string;
  color: string;
  Icon: ElementType;
  children?: ReactNode;
}) {
  return (
    <div
      className="rounded-xl border transition-all"
      style={on
        ? { borderColor: color, background: `color-mix(in srgb, ${color} 8%, var(--surface))`, boxShadow: `0 0 0 1px ${color}` }
        : { borderColor: 'var(--border-strong)', background: 'var(--surface)' }}
    >
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left">
        <span
          className="w-9 h-9 rounded-lg grid place-items-center shrink-0"
          style={on ? { background: color, color: '#fff' } : { background: 'var(--surface-3)', color: 'var(--muted)' }}
        >
          <Icon size={17} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-semibold" style={{ color: on ? color : 'var(--ink)' }}>{title}</span>
          <span className="block text-[12px]" style={{ color: 'var(--muted)' }}>{sub}</span>
        </span>
        {/* Switch track */}
        <span className="w-10 h-6 rounded-full relative shrink-0 transition-colors" style={{ background: on ? color : 'var(--border-strong)' }}>
          <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: on ? 18 : 2 }} />
        </span>
      </button>
      {on && children && <div className="px-3.5 pb-3.5 pl-[60px]">{children}</div>}
    </div>
  );
}


// ── Review row ────────────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value?: string | boolean }) {
  if (!value && value !== false) return null;
  return (
    <div className="flex gap-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-[13px] font-medium w-32 shrink-0 pt-0.5" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{String(value)}</span>
    </div>
  );
}

// ── Wizard stepper ────────────────────────────────────────────────────────────

const STEPS = ['Alert & location', 'Patient & incident', 'Review & submit'];

/** Dots joined by a line; done = ticked, current = ringed with its name below. */
function WizardStepper({ current }: { current: number }) {
  return (
    <ol className="flex items-start justify-center" aria-label={`Step ${current} of ${STEPS.length}: ${STEPS[current - 1]}`}>
      {STEPS.map((label, i) => {
        const num = i + 1;
        const done = num < current;
        const active = num === current;
        return (
          <Fragment key={label}>
            <li className="flex flex-col items-center w-6 relative" aria-current={active ? 'step' : undefined}>
              <span
                className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0"
                style={
                  done
                    ? { border: '1.5px solid var(--green)', color: 'var(--green)', background: 'var(--surface)' }
                    : active
                      ? { background: 'var(--green)', boxShadow: '0 0 0 4px var(--green-light)' }
                      : { border: '1.5px solid var(--border-strong)', background: 'var(--surface)' }
                }
              >
                {done ? <Check size={11} strokeWidth={3} /> : active ? <span className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
              </span>
              <span
                className={`absolute top-6 whitespace-nowrap text-[11.5px] sm:text-[12px] ${active ? '' : 'hidden sm:block'}`}
                style={{ color: active ? 'var(--ink)' : 'var(--muted-2)', fontWeight: active ? 700 : 500 }}
              >
                {label}
              </span>
            </li>
            {i < STEPS.length - 1 && (
              <li aria-hidden className="w-16 sm:w-36 h-[1.5px] mt-[8px]" style={{ background: done ? 'var(--green)' : 'var(--border-strong)' }} />
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

/** A titled block of label-left rows (the design's "About your business"). */
function SectionCard({
  title, description, children,
}: {
  title: string;
  description?: string;
  icon?: ElementType;
  children: ReactNode;
}) {
  return (
    <section className="pt-2">
      <h2 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>{title}</h2>
      {description && <p className="text-[13px] mt-1" style={{ color: 'var(--muted)' }}>{description}</p>}
      <div className="iw-rows mt-6">{children}</div>
    </section>
  );
}

// ── Review card ───────────────────────────────────────────────────────────────

function ReviewCard({
  title, onEdit, children, className,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border overflow-hidden${className ? ` ${className}` : ''}`}
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
      }}
    >
      <div
        className="px-5 py-3.5 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
          {title}
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-lg border transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface)' }}
        >
          <PencilSimple size={12} /> Edit
        </button>
      </div>
      <div className="px-5 py-1">{children}</div>
    </div>
  );
}

// ── Maternity vitals ──────────────────────────────────────────────────────────

type MaternityVitalsForm = {
  admissionDateTime: string; parity: string; gravid: string;
  fetalHeartRate: string; membranes: string; characterOfLiquor: string;
  moulding: string; cervicalDilatation: string; descent: string;
  uterineContraction: string; medicationsFetal: string;
  bp: string; pulse: string; temperature: string; rbs: string;
  spo2: string; gcs: string; proteinInUrine: string;
  glucoseInUrine: string; urineOutput: string;
  deliveryDateTime: string; modeOfDelivery: string; newbornGender: string;
  birthWeight: string; conditionOfBaby: string; medicationNewborn: string;
  apgar1Min: string; apgar5Min: string; apgar10Min: string;
};

const defaultMV: MaternityVitalsForm = {
  admissionDateTime: '', parity: '', gravid: '',
  fetalHeartRate: '', membranes: '', characterOfLiquor: '',
  moulding: '', cervicalDilatation: '', descent: '',
  uterineContraction: '', medicationsFetal: '',
  bp: '', pulse: '', temperature: '', rbs: '',
  spo2: '', gcs: '', proteinInUrine: '',
  glucoseInUrine: '', urineOutput: '',
  deliveryDateTime: '', modeOfDelivery: '', newbornGender: '',
  birthWeight: '', conditionOfBaby: '', medicationNewborn: '',
  apgar1Min: '', apgar5Min: '', apgar10Min: '',
};

// ── Form state ────────────────────────────────────────────────────────────────

type FormState = {
  incidentType: IncidentType;
  originFacilityId: string;
  patientUnknown: boolean;
  patientDescription: string;
  alertAt: string;
  alertMode: string;
  notifierName: string;
  notifierPhone: string;
  originOfAlert: string;
  locationName: string;
  subCounty: string;
  lat: number;
  lng: number;
  patientName: string;
  patientContact: string;
  patientNationalId: string;
  patientAge: string;
  patientGender: string;
  nextOfKin: string;
  nextOfKinPhone: string;
  massCasualty: boolean;
  massCasualtyCount: string;
  chiefComplaint: string;
  alertNature: string;
  alertNatureDetail: string;
  preHospitalManagement: string;
  placeOfReferral: string;
  targetFacilityId: string;
  healthcareWorkerName: string;
  healthcareWorkerContact: string;
  isGbvCase: boolean;
};

const defaultForm: FormState = {
  incidentType: 'EMERGENCY',
  originFacilityId: '',
  patientUnknown: false,
  patientDescription: '',
  alertAt: toNairobiInput(),
  alertMode: 'Phone',
  notifierName: '',
  notifierPhone: '',
  originOfAlert: '',
  locationName: '',
  subCounty: '',
  lat: -1.5177,
  lng: 37.2634,
  patientName: '',
  patientContact: '',
  patientNationalId: '',
  patientAge: '',
  patientGender: '',
  nextOfKin: '',
  nextOfKinPhone: '',
  massCasualty: false,
  massCasualtyCount: '',
  chiefComplaint: '',
  alertNature: '',
  alertNatureDetail: '',
  preHospitalManagement: '',
  placeOfReferral: '',
  targetFacilityId: '',
  healthcareWorkerName: '',
  healthcareWorkerContact: '',
  isGbvCase: false,
};

// ── Main Component ────────────────────────────────────────────────────────────

function NewIncidentWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addNotification } = useNotificationStore();

  const submitted     = (location.state as any)?.submitted;
  const submittedCase = (location.state as any)?.caseNumber;
  const ended         = (location.state as any)?.ended;
  const surveillance  = (location.state as any)?.surveillance;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [mv, setMV] = useState<MaternityVitalsForm>(defaultMV);
  const setMat = (u: Partial<MaternityVitalsForm>) => setMV(p => ({ ...p, ...u }));
  const [suggestions, setSuggestions]           = useState<Array<{ display_name: string; lat: string; lon: string; address?: Record<string, string> }>>([]);
  const [showSuggestions, setShowSuggestions]   = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState('');
  // Idempotency key for this capture - protects against double-submit / retry
  // creating duplicate incidents (the backend dedups on clientRef).
  const clientRef = useRef(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const places = usePlacesAutocomplete();
  const [showEndReason, setShowEndReason]         = useState(false);
  const [endReason, setEndReason]                 = useState('');
  const [showSurveillance, setShowSurveillance]   = useState(false);
  const [surveillanceNote, setSurveillanceNote]   = useState('');
  const set = (updates: Partial<FormState>) => setForm(prev => ({ ...prev, ...updates }));
  // Provenance of the sub-county: AUTO when detected from the location, MANUAL when the watcher sets it.
  const [subCountySource, setSubCountySource] = useState<'AUTO' | 'MANUAL' | ''>('');

  // ── Nature of alert options (accessible to all roles) ────────────────────
  const { data: natureOptions = [] } = useQuery<{ nature: string; details: string[] }[]>({
    queryKey: ['nature-options'],
    queryFn: async () => {
      const res = await api.get('/incidents/nature-options');
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });

  const uniqueNatures = natureOptions.map(o => o.nature);
  const detailsForNature = natureOptions.find(o => o.nature === form.alertNature)?.details ?? [];
  const isMaternity = form.alertNature?.toLowerCase().includes('maternity');

  // ── Sub-counties (accessible to all roles) ─────────────────────────────────
  const { data: subCounties = [] } = useQuery<string[]>({
    queryKey: ['sub-counties'],
    queryFn: async () => {
      const res = await api.get('/incidents/sub-counties');
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });

  // ── Referral facilities - same source as the dispatcher's dropdown ─────────
  const { data: facilities = [] } = useQuery<Facility[]>({
    queryKey: ['facilities'],
    queryFn: async () => {
      const res = await api.get('/incidents/facilities');
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });

  // Facilities in the incident's sub-county float to the top, then alphabetical.
  const facilityOptions = [...facilities].sort((a, b) => {
    const region = form.subCounty.trim().toLowerCase();
    const aIn = !!region && a.subCounty?.trim().toLowerCase() === region;
    const bIn = !!region && b.subCounty?.trim().toLowerCase() === region;
    if (aIn !== bIn) return aIn ? -1 : 1;
    return a.name.localeCompare(b.name);
  });



  // ── Referral (facility A -> facility B) ────────────────────────────────────
  const isReferral = form.incidentType === 'REFERRAL';
  const originFacility = facilities.find(f => f.id === form.originFacilityId);
  const targetFacility = facilities.find(f => f.id === form.targetFacilityId);
  const sameFacility = !!form.originFacilityId && form.originFacilityId === form.targetFacilityId;
  const patientDisplayName = form.patientUnknown ? unknownPatientName(form.patientGender) : form.patientName;

  // The referring facility is the pickup point, so it becomes the case location.
  const pickOriginFacility = (id: string) => {
    const f = facilities.find(x => x.id === id);
    set(f
      ? { originFacilityId: id, locationName: f.name, subCounty: f.subCounty, lat: f.lat, lng: f.lng }
      : { originFacilityId: '', locationName: '', subCounty: '' });
    setSubCountySource(f ? 'AUTO' : '');
  };

  const switchIncidentType = (t: IncidentType) => {
    if (t === form.incidentType) return;
    // Facility-filled location must not leak into an emergency scene, or vice versa.
    set({
      incidentType: t, originFacilityId: '', targetFacilityId: '', placeOfReferral: '',
      locationName: '', subCounty: '', lat: defaultForm.lat, lng: defaultForm.lng,
    });
    setSubCountySource('');
  };

  // Road route A -> B for the transfer summary (Google, falling back to OSRM).
  const [referralRoute, setReferralRoute] = useState<DrivingRoute | null>(null);
  useEffect(() => {
    setReferralRoute(null);
    if (!isReferral || !originFacility || !targetFacility || sameFacility) return;
    let cancelled = false;
    fetchDrivingRoute(
      { lat: originFacility.lat, lng: originFacility.lng },
      { lat: targetFacility.lat, lng: targetFacility.lng },
    ).then(r => { if (!cancelled) setReferralRoute(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isReferral, originFacility?.id, targetFacility?.id]);

  // ── Step validation (Screen 1: Alert + Location · Screen 2: Patient + Incident · Screen 3: Review) ──
  const alertOk    = !!form.alertAt && !!form.alertMode;                 // Alert
  const locationOk = isReferral                                          // Location / transfer
    ? !!form.originFacilityId && !!form.targetFacilityId && !sameFacility
    : !!form.locationName.trim() && !!form.subCounty;
  const incidentOk = !!form.alertNature && !!form.chiefComplaint.trim(); // Incident (Patient has no required fields)
  const step1Ok = alertOk && locationOk;    // Screen 1: Alert & Location
  const step2Ok = incidentOk;               // Screen 2: Patient & Incident
  const canSubmit = step1Ok && step2Ok;

  const stepOk: Record<number, boolean> = { 1: step1Ok, 2: step2Ok, 3: canSubmit };
  const missingByStep: Record<number, string[]> = {
    1: [
      !form.alertAt && 'date & time', !form.alertMode && 'alert mode',
      ...(isReferral
        ? [
            !form.originFacilityId && 'referring facility',
            !form.targetFacilityId && 'receiving facility',
            sameFacility && 'two different facilities',
          ]
        : [!form.locationName && 'location', !form.subCounty && 'sub-county']),
    ].filter(Boolean) as string[],
    2: [
      !form.alertNature && 'nature of alert',
      !form.chiefComplaint && (isReferral ? 'reason for referral' : 'chief complaint'),
    ].filter(Boolean) as string[],
    3: [],
  };

  // ── Sub-county detection ───────────────────────────────────────────────────
  // Bare direction words are NEVER enough to pick a sub-county on their own.
  // Google frequently returns a component of just "North" / "West" in an
  // address; matching that loosely could otherwise wrongly select a
  // directional sub-county for incidents anywhere in the county.
  const DIRECTION_WORDS = new Set(['north', 'south', 'east', 'west', 'central']);

  const normalizePlace = (s: string) =>
    s.toLowerCase().replace(/[^a-z\s']/g, ' ').replace(/\s+/g, ' ').trim();

  const hasWholeWord = (haystack: string, needle: string) =>
    new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`).test(haystack);

  // Match any of the given place strings against the known Machakos sub-counties,
  // strongest signal first.
  function matchSubCounty(candidates: string[]): string {
    const lowered = candidates.filter(Boolean).map(normalizePlace).filter(Boolean);
    if (lowered.length === 0) return '';

    // 1. Exact match - "Kathiani" === "Kathiani"
    for (const sub of subCounties) {
      const s = normalizePlace(sub);
      if (lowered.some(c => c === s)) return sub;
    }

    // 2. A candidate contains the FULL sub-county name as whole words -
    //    e.g. "Kathiani Constituency" → Kathiani
    for (const sub of subCounties) {
      const s = normalizePlace(sub);
      if (lowered.some(c => hasWholeWord(c, s))) return sub;
    }

    // 3. A distinctive candidate word appears in the sub-county name -
    //    e.g. "Mavoko" → Mavoko. Direction words and very short tokens are
    //    excluded so "North" can never decide the sub-county by itself.
    for (const sub of subCounties) {
      const s = normalizePlace(sub);
      if (lowered.some(c => c.length >= 4 && !DIRECTION_WORDS.has(c) && hasWholeWord(s, c))) {
        return sub;
      }
    }

    return '';
  }

  /**
   * Official sub-county for a geocoded address, strongest signal first:
   * an official name in the address -> a known Machakos place in it (Syokimau,
   * Tala...) -> the sub-county nearest the pin. Never an arbitrary area name:
   * that is how "Westlands" / "Add" ended up stored as sub-counties.
   */
  function detectSubCounty(address: Record<string, string>, lat?: number, lng?: number): string {
    const parts = [
      address.city_district,
      address.suburb,
      address.county,
      address.state_district,
      address.municipality,
      address.neighbourhood,
      address.town,
      address.village,
      address.city,
    ].filter(Boolean) as string[];
    return matchSubCounty(parts)
      || subCountyFromText(parts.join(' , '), subCounties)
      || (lat != null && lng != null ? nearestSubCounty(lat, lng, subCounties) : '');
  }

  // ── Auto-fill from what was typed (no paid API needed) ─────────────────────
  // Where the pin came from: only a pin the watcher placed is never moved for them.
  const pinSource = useRef<'default' | 'auto' | 'user'>('default');
  // locationName values set by picking a suggestion / the map - already resolved.
  const resolvedName = useRef('');
  const [autoFillNote, setAutoFillNote] = useState('');

  useEffect(() => {
    const name = form.locationName.trim();
    if (isReferral || name.length < 3 || name === resolvedName.current) return;
    const keepSub = subCountySource === 'MANUAL';

    // 1. Instant and offline: a Machakos town / ward / estate in the text.
    const fromText = subCountyFromText(name, subCounties);
    if (fromText && !keepSub) {
      set({ subCounty: fromText });
      setSubCountySource('AUTO');
      setAutoFillNote(`From "${name}"`);
    }

    // 2. Free OpenStreetMap lookup: pin the place (unless the watcher pinned it)
    //    and, if the text alone didn't say, read the sub-county from the result.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&countrycodes=ke` +
          `&viewbox=36.85,-0.75,37.85,-1.9&q=${encodeURIComponent(`${name}, Machakos County`)}`,
        );
        const [hit] = (await res.json()) as Array<{ lat: string; lon: string; address?: Record<string, string> }>;
        if (!hit || form.locationName.trim() !== name) return;
        const lat = parseFloat(hit.lat);
        const lng = parseFloat(hit.lon);
        if (pinSource.current !== 'user' && inMachakos(lat, lng)) {
          set({ lat, lng });
          pinSource.current = 'auto';
        }
        if (!fromText && !keepSub) {
          const sub = detectSubCounty(hit.address ?? {}, lat, lng);
          if (sub) {
            set({ subCounty: sub });
            setSubCountySource('AUTO');
            setAutoFillNote(`From the map location of "${name}"`);
          }
        }
      } catch { /* offline: the text match above (if any) stands */ }
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.locationName, subCounties.length, isReferral]);

  // ── Location autocomplete - Google Places when key present, Nominatim fallback ──
  useEffect(() => {
    if (places.available) {
      places.search(form.locationName);
      setShowSuggestions(form.locationName.length >= 3);
    } else {
      if (form.locationName.length < 3) { setSuggestions([]); return; }
      const timer = setTimeout(async () => {
        try {
          const res  = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(form.locationName + ', Machakos, Kenya')}&limit=5&addressdetails=1`
          );
          const data = await res.json();
          setSuggestions(data ?? []);
          if (data?.length > 0) setShowSuggestions(true);
        } catch {}
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [form.locationName]);

  // Reliable sub-county detection from coordinates via Nominatim reverse geocode.
  async function reverseDetectSubCounty(lat: number, lng: number): Promise<string> {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`);
      const data = await res.json();
      return detectSubCounty(data.address ?? {}, lat, lng);
    } catch {
      return nearestSubCounty(lat, lng, subCounties);
    }
  }

  const selectGoogleSuggestion = async (placeId: string, description: string) => {
    try {
      const details = await places.getDetails(placeId);
      // Prefer Google's own components; fall back to a reverse geocode of the
      // coordinates (Google is unreliable for Machakos's constituencies).
      let detectedSub = matchSubCounty(details.subCountyCandidates);
      if (!detectedSub) {
        setIsReverseGeocoding(true);
        detectedSub = await reverseDetectSubCounty(details.lat, details.lng);
        setIsReverseGeocoding(false);
      }
      const pickedName = details.name || description.split(',').slice(0, 2).join(',').trim();
      resolvedName.current = pickedName;
      pinSource.current = 'user';
      set({
        locationName: pickedName,
        lat: details.lat,
        lng: details.lng,
        ...(detectedSub ? { subCounty: detectedSub } : {}),
      });
      if (detectedSub) { setSubCountySource('AUTO'); setAutoFillNote(`From "${pickedName}"`); }
    } catch {
      set({ locationName: description.split(',').slice(0, 2).join(',').trim() });
    }
    places.clear();
    setShowSuggestions(false);
  };

  const selectSuggestion = (s: { display_name: string; lat: string; lon: string; address?: Record<string, string> }) => {
    const name        = s.display_name.split(',').slice(0, 2).join(',').trim();
    const lat         = parseFloat(s.lat);
    const lng         = parseFloat(s.lon);
    const detectedSub = detectSubCounty(s.address ?? {}, lat, lng) || subCountyFromText(s.display_name, subCounties);
    resolvedName.current = name;
    pinSource.current = 'user';
    set({ locationName: name, lat, lng, ...(detectedSub ? { subCounty: detectedSub } : {}) });
    if (detectedSub) { setSubCountySource('AUTO'); setAutoFillNote(`From "${name}"`); }
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // ── Map click reverse geocode ──────────────────────────────────────────────
  const handleMapClick = async (lat: number, lng: number) => {
    pinSource.current = 'user';
    set({ lat, lng });
    setSuggestions([]);
    setShowSuggestions(false);
    setIsReverseGeocoding(true);
    let detectedSub = '';
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`);
      const data = await res.json();
      if (data?.display_name) {
        const name  = data.display_name.split(',').slice(0, 2).join(',').trim();
        detectedSub = detectSubCounty(data.address ?? {}, lat, lng);
        resolvedName.current = name;
        set({ locationName: name });
      }
    } catch { /* offline - fall through to the nearest sub-county */ } finally {
      setIsReverseGeocoding(false);
    }
    // The pin itself always counts, even when the address lookup failed.
    detectedSub ||= nearestSubCounty(lat, lng, subCounties);
    if (detectedSub) {
      set({ subCounty: detectedSub });
      setSubCountySource('AUTO');
      setAutoFillNote('From the pin on the map');
    }
  };

  // Auto-capture the device GPS and pin the scene (#4). Useful when the reporter is
  // at the scene; falls back gracefully if permission is denied or unavailable.
  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setGpsError('Geolocation is not supported on this device.');
      return;
    }
    setGpsBusy(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsBusy(false);
        handleMapClick(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setGpsBusy(false);
        setGpsError(err.code === err.PERMISSION_DENIED ? 'Location permission denied.' : 'Could not get your location.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  };

  // ── Payload builder ────────────────────────────────────────────────────────
  const buildPayload = () => ({
    clientRef:             clientRef.current,
    incidentType:          form.incidentType,
    originFacilityId:      isReferral ? form.originFacilityId : undefined,
    patientUnknown:        form.patientUnknown || undefined,
    patientDescription:    form.patientUnknown ? (form.patientDescription.trim() || undefined) : undefined,
    alertMode:             form.alertMode,
    alertAt:               nairobiInputToISO(form.alertAt),
    originOfAlert:         form.originOfAlert || undefined,
    notifierDetails:       form.notifierName ? [{ name: form.notifierName, phone: form.notifierPhone }] : undefined,
    locationName:          form.locationName,
    subCounty:             form.subCounty,
    subCountySource:       subCountySource || undefined,
    lat:                   form.lat,
    lng:                   form.lng,
    patientName:           patientDisplayName || undefined,
    patientContact:        form.patientUnknown ? undefined : form.patientContact || undefined,
    patientNationalId:     form.patientUnknown ? undefined : form.patientNationalId || undefined,
    patientAge:            form.patientAge   || undefined,
    patientGender:         form.patientGender || undefined,
    nextOfKin:             form.nextOfKin    || undefined,
    nextOfKinPhone:        form.nextOfKinPhone || undefined,
    massCasualty:          form.massCasualty,
    massCasualtyCount:     form.massCasualtyCount ? parseInt(form.massCasualtyCount, 10) : undefined,
    chiefComplaint:        form.chiefComplaint,
    alertNature:           form.alertNature  || undefined,
    alertNatureDetail:     form.alertNatureDetail || undefined,
    preHospitalManagement: form.preHospitalManagement || undefined,
    // Emergencies get their facility from the dispatcher at dispatch; only a
    // referral names the receiving facility when it is logged.
    placeOfReferral:       isReferral ? form.placeOfReferral || undefined : undefined,
    targetFacilityId:      isReferral ? form.targetFacilityId || undefined : undefined,
    healthcareWorkerName:    form.healthcareWorkerName || undefined,
    healthcareWorkerContact: form.healthcareWorkerContact || undefined,
    isGbvCase:             form.isGbvCase || undefined,
    maternityVitals:       isMaternity ? mv : undefined,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () => api.post('/incidents', buildPayload()),
    onSuccess: (res) => {
      const caseNumber = res?.data?.data?.caseNumber ?? '';
      navigate('/watcher/new-incident', { state: { submitted: true, caseNumber } });
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Submission Failed',
        message: err?.response?.data?.message || 'Could not submit incident.',
      });
    },
  });

  const endCaseMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/incidents', buildPayload());
      const incidentId = res.data?.data?.id;
      const caseNumber = res.data?.data?.caseNumber ?? '';
      await api.post(`/incidents/${incidentId}/close`, { reason: endReason });
      return caseNumber;
    },
    onSuccess: (caseNumber) => {
      navigate('/watcher/new-incident', { state: { submitted: true, caseNumber, ended: true } });
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Failed to End Case',
        message: err?.response?.data?.message || 'Could not end the case.',
      });
    },
  });

  const surveillanceMutation = useMutation({
    mutationFn: () => api.post('/incidents', { ...buildPayload(), surveillanceNote }),
    onSuccess: (res) => {
      const caseNumber = res?.data?.data?.caseNumber ?? '';
      navigate('/watcher/new-incident', { state: { submitted: true, caseNumber, surveillance: true } });
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Surveillance Alert Failed',
        message: err?.response?.data?.message || 'Could not send surveillance alert.',
      });
    },
  });

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
        <div
          className="w-full max-w-md rounded-2xl border"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            boxShadow: '0 8px 30px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div className="p-8 text-center flex flex-col items-center gap-5">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: 'var(--surface-2)',
                color: ended ? 'var(--red)' : surveillance ? '#B45309' : 'var(--green)',
                border: '1px solid var(--border)',
              }}
            >
              {surveillance
                ? <Eye size={28} />
                : <CheckCircle size={28} />
              }
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>
                {ended ? 'Case Ended' : surveillance ? 'Surveillance Alert Sent' : 'Alert Submitted'}
              </h2>
              {submittedCase && (
                <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
                  Case{' '}
                  <span className="font-semibold" style={{ color: 'var(--ink)' }}>#{submittedCase}</span>{' '}
                  {ended
                    ? 'has been recorded and closed.'
                    : surveillance
                      ? 'has been flagged for surveillance.'
                      : 'is now in the dispatch queue.'}
                </p>
              )}
            </div>
            <div className="flex gap-2 w-full pt-1">
              <button
                type="button"
                onClick={() => {
                  clientRef.current = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
                    ? crypto.randomUUID()
                    : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                  setForm(defaultForm); setMV(defaultMV);
                  pinSource.current = 'default'; resolvedName.current = ''; setAutoFillNote(''); setSubCountySource('');
                  navigate('/watcher/new-incident', { replace: true, state: {} });
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface-2)' }}
              >
                <PaperPlaneRight size={15} /> New Alert
              </button>
              <button
                type="button"
                onClick={() => navigate('/watcher')}
                className="btn btn-primary flex-1"
              >
                My Alerts
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="incident-wizard flex-1 min-h-0 flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(180deg, var(--green-light) 0%, var(--bg) 360px)' }}
    >
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-4 sm:px-5 sm:pt-5">
        {/* Full width: on wide screens each step's sections sit side by side (.iw-grid). */}
        <div
          className="w-full rounded-2xl border flex flex-col mb-4 sm:mb-5"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 12px 40px rgba(16, 33, 26, 0.08)' }}
        >
          <div className="px-5 sm:px-10 pt-5">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 text-[13px] font-medium hover:underline"
              style={{ color: 'var(--ink-2)' }}
            >
              <ArrowLeft size={15} /> Back to dashboard
            </button>
          </div>

          <div className="px-5 sm:px-10 pt-7 pb-12 flex justify-center">
            <WizardStepper current={step} />
          </div>

          {/* ── Step content ── */}
          <div className="px-5 sm:px-10 pb-8">

        {/* ─────────────── STEP 1: Alert ─────────────── */}
        {step === 1 && (
          <div className="iw-grid">

              {/* ── Card 1: Alert ── */}
              <SectionCard title="About the alert" description="Who called, and how the alert came in." icon={Phone}>
                <Field>
                  <Label required>Type of case</Label>
                  <TileGroup<IncidentType>
                    cols="grid-cols-2"
                    value={form.incidentType}
                    onChange={switchIncidentType}
                    options={[
                      { value: 'EMERGENCY', label: 'Emergency', Icon: Siren, sub: 'Respond to a scene' },
                      { value: 'REFERRAL', label: 'Referral', Icon: ArrowRightLeft, sub: 'Facility A to facility B' },
                    ]}
                  />
                  <Hint>
                    {isReferral
                      ? 'An ambulance collects the patient at one facility and transfers them to another.'
                      : 'Someone needs help at a location in the community.'}
                  </Hint>
                </Field>

                <Field>
                  <Label required>Alert date &amp; time</Label>
                  <input
                    type="datetime-local"
                    className={inputCls}
                    value={form.alertAt}
                    onChange={e => set({ alertAt: e.target.value })}
                  />
                  <Hint>When was the alert received?</Hint>
                </Field>

                <Field>
                  <Label required>Mode of alert</Label>
                  <TileGroup
                    value={form.alertMode}
                    onChange={(m) => set({ alertMode: m })}
                    options={[
                      { value: 'Phone', label: 'Phone', Icon: Phone },
                      { value: 'Radio', label: 'Radio', Icon: RadioTower },
                      { value: 'Walk-in', label: 'Walk-in', Icon: Footprints },
                      { value: 'Other', label: 'Other', Icon: MoreHorizontal },
                    ]}
                  />
                  <Hint>How the alert reached the EOC.</Hint>
                </Field>

                <Field>
                  <Label>Origin of alert</Label>
                  <select className={selectCls} value={form.originOfAlert} onChange={e => set({ originOfAlert: e.target.value })}>
                    <option value="">Select origin...</option>
                    {ORIGIN_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>

                <Row label="Notifier" hint="Who reported the emergency.">
                  <Field>
                    <Label>Name</Label>
                    <input type="text" placeholder="Full name" className={inputCls} value={form.notifierName} onChange={e => set({ notifierName: e.target.value })} />
                  </Field>
                  <Field>
                    <Label>Phone</Label>
                    <input type="tel" inputMode="tel" placeholder="0712345678" className={inputCls} value={form.notifierPhone} onChange={e => set({ notifierPhone: e.target.value })} />
                  </Field>
                </Row>

              </SectionCard>

              {/* ── Card 2 (referral): the transfer ── */}
              {isReferral && (
                <SectionCard title="Referral transfer" description="Where the ambulance collects the patient, and where it takes them." icon={ArrowRightLeft}>
                  <Field>
                    <Label required>From (referring facility)</Label>
                    <select className={selectCls} value={form.originFacilityId} onChange={e => pickOriginFacility(e.target.value)}>
                      <option value="">Select the facility referring the patient...</option>
                      {facilityOptions.map(f => (
                        <option key={f.id} value={f.id}>{facilityLabel(f)}</option>
                      ))}
                    </select>
                    <Hint>The ambulance is dispatched here. This becomes the case location.</Hint>
                  </Field>

                  <Field>
                    <Label required>To (receiving facility)</Label>
                    <select
                      className={selectCls}
                      value={form.targetFacilityId}
                      onChange={e => {
                        const f = facilities.find(x => x.id === e.target.value);
                        set({ targetFacilityId: e.target.value, placeOfReferral: f?.name ?? '' });
                      }}
                    >
                      <option value="">Select the facility receiving the patient...</option>
                      {facilityOptions.filter(f => f.id !== form.originFacilityId).map(f => (
                        <option key={f.id} value={f.id}>{facilityLabel(f)}</option>
                      ))}
                    </select>
                    {sameFacility && <Hint><span style={{ color: 'var(--red)' }}>Pick two different facilities.</span></Hint>}
                  </Field>

                  <Row label="Referring clinician" hint="Who at the referring facility to call about the patient.">
                    <Field>
                      <Label>Name</Label>
                      <input type="text" placeholder="e.g. Dr. Mutua" className={inputCls} value={form.healthcareWorkerName} onChange={e => set({ healthcareWorkerName: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Phone</Label>
                      <input type="tel" inputMode="tel" placeholder="0712345678" className={inputCls} value={form.healthcareWorkerContact} onChange={e => set({ healthcareWorkerContact: e.target.value })} />
                    </Field>
                  </Row>

                  {originFacility && targetFacility && !sameFacility && (
                    <div className="iw-row">
                      <div className="iw-label">
                        <span className="block text-[13px] font-medium" style={{ color: 'var(--ink)' }}>Route</span>
                      </div>
                      <p className="iw-hint text-[11.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>Road route for the crew.</p>
                      <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                        <div className="px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                            <Hospital size={14} style={{ color: 'var(--green)' }} /> {originFacility.name}
                          </span>
                          <ArrowRight size={14} style={{ color: 'var(--muted)' }} />
                          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                            <Hospital size={14} style={{ color: 'var(--red)' }} /> {targetFacility.name}
                          </span>
                          <span className="ml-auto text-[12px] font-medium" style={{ color: 'var(--muted)' }}>
                            {referralRoute
                              ? `${referralRoute.distanceText} · about ${referralRoute.durationText}`
                              : `${straightKm(originFacility, targetFacility).toFixed(1)} km straight line`}
                          </span>
                        </div>
                        <Map
                          center={[(originFacility.lat + targetFacility.lat) / 2, (originFacility.lng + targetFacility.lng) / 2]}
                          zoom={11}
                          markers={[
                            { id: 'from', lat: originFacility.lat, lng: originFacility.lng, title: `From: ${originFacility.name}`, type: 'incident' },
                            { id: 'to', lat: targetFacility.lat, lng: targetFacility.lng, title: `To: ${targetFacility.name}`, type: 'facility' },
                          ]}
                          routePath={referralRoute?.path}
                          layerType="street"
                          className="h-72 w-full"
                        />
                      </div>
                    </div>
                  )}
                </SectionCard>
              )}

              {/* ── Card 2: Location ── */}
              {!isReferral && (
              <SectionCard title="Incident location" description="Pin the scene so a unit can be routed." icon={MapPin}>
                <Field>
                  <Label required>Location of incident</Label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search address or click the map to pin..."
                      className={`${inputCls} pr-10`}
                      value={form.locationName}
                      onChange={e => { set({ locationName: e.target.value }); if (!e.target.value) { setSuggestions([]); places.clear(); } }}
                      onFocus={() => (places.available ? places.suggestions.length > 0 : suggestions.length > 0) && setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      autoComplete="off"
                    />
                    {(isReverseGeocoding || places.isLoading) && (
                      <AppLoader size={16} color="var(--ink)" className="absolute right-3 top-2.5" />
                    )}
                    {/* Google Places suggestions */}
                    {places.available && showSuggestions && places.suggestions.length > 0 && (
                      <div
                        className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl shadow-lg overflow-hidden border"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                      >
                        {places.suggestions.map(s => (
                          <button
                            key={s.placeId}
                            type="button"
                            className="w-full text-left px-4 py-3 text-sm flex items-start gap-3 transition-colors"
                            style={{ borderBottom: '1px solid var(--border)', color: 'var(--ink)' }}
                            onMouseDown={() => selectGoogleSuggestion(s.placeId, s.description)}
                          >
                            <MapPin size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} />
                            <span className="font-semibold leading-snug">{s.description}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Nominatim fallback suggestions */}
                    {!places.available && showSuggestions && suggestions.length > 0 && (
                      <div
                        className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl shadow-lg overflow-hidden border"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                      >
                        {suggestions.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            className="w-full text-left px-4 py-3 text-sm flex items-start gap-3 transition-colors"
                            style={{ borderBottom: '1px solid var(--border)', color: 'var(--ink)' }}
                            onMouseDown={() => selectSuggestion(s)}
                          >
                            <MapPin size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} />
                            <span className="font-semibold leading-snug">
                              {s.display_name.split(',').slice(0, 3).join(',')}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Hint>
                    {isReverseGeocoding
                      ? 'Getting address for pinned location...'
                      : 'Type to search or click the map below to pin the scene'}
                  </Hint>
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      type="button"
                      onClick={useMyLocation}
                      disabled={gpsBusy}
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 h-9 rounded-lg border transition-colors disabled:opacity-50"
                      style={{ borderColor: 'var(--border)', color: 'var(--green)', background: 'var(--green-light)' }}
                    >
                      {gpsBusy ? <AppLoader size={17} /> : <MapPin size={13} />}
                      {gpsBusy ? 'Locating...' : 'Use my current location'}
                    </button>
                    {gpsError && <span className="text-xs" style={{ color: 'var(--red)' }}>{gpsError}</span>}
                  </div>
                {/* Map */}
                <div
                  className="rounded-lg border overflow-hidden mt-3"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <Map
                    center={[form.lat, form.lng]}
                    zoom={14}
                    markers={[{ id: 'scene', lat: form.lat, lng: form.lng, title: form.locationName || 'Scene', type: 'incident' }]}
                    onLocationSelect={handleMapClick}
                    layerType="street"
                    className="h-80 w-full"
                  />
                  {form.locationName && !isReverseGeocoding && (
                    <div
                      className="px-4 py-2.5 text-xs font-bold flex items-center gap-1.5"
                      style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--border)', color: 'var(--ink)' }}
                    >
                      <MapPin size={12} /> {form.locationName} · {form.lat.toFixed(4)}, {form.lng.toFixed(4)}
                    </div>
                  )}
                  {isReverseGeocoding && (
                    <div
                      className="px-4 py-2.5 text-xs flex items-center gap-2"
                      style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--border)', color: 'var(--muted)' }}
                    >
                      <AppLoader size={12} color="var(--ink)" />
                      Getting address...
                    </div>
                  )}
                </div>

                </Field>

                <Field>
                  <div className="iw-label flex items-center gap-2 flex-wrap">
                    <Label required>Sub-county</Label>
                    {form.subCounty && subCountySource === 'AUTO' && (
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--green-light)', color: 'var(--green)' }}
                        title={autoFillNote ? `${autoFillNote}. Pick another to change it.` : undefined}
                      >
                        Auto-filled{autoFillNote ? ` · ${autoFillNote.replace(/^From /, 'from ')}` : ''}
                      </span>
                    )}
                    {form.subCounty && subCountySource === 'MANUAL' && (
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}
                      >
                        Manual
                      </span>
                    )}
                  </div>
                  <CreatableCombobox
                    options={subCounties}
                    value={form.subCounty}
                    onChange={(v) => { set({ subCounty: v }); setSubCountySource(v ? 'MANUAL' : ''); }}
                    onCreateOption={() => {}}
                    placeholder="Auto-fills from location, or type to search / add"
                  />
                </Field>
              </SectionCard>
              )}
          </div>
        )}

        {/* ─────────────── STEP 2: Patient ─────────────── */}
        {step === 2 && (
          <div className="iw-grid">
              <SectionCard title="About the patient" description="Identity and who to contact. All optional." icon={User}>
                <div className="iw-row">
                  <div className="iw-label">
                    <span className="block text-[13px] font-medium" style={{ color: 'var(--ink)' }}>Identity</span>
                  </div>
                  <p className="iw-hint text-[11.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                    Unconscious, confused or no ID? Record them as unknown.
                  </p>
                  <label
                    className="flex items-start gap-3 rounded-lg border px-3.5 py-3 cursor-pointer transition-colors"
                    style={form.patientUnknown
                      ? { borderColor: 'var(--amber)', background: 'var(--amber-soft)' }
                      : { borderColor: 'var(--border-strong)', background: 'var(--surface)' }}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ accentColor: 'var(--amber)' }}
                      checked={form.patientUnknown}
                      onChange={e => set({ patientUnknown: e.target.checked })}
                    />
                    <span className="text-[13.5px]" style={{ color: 'var(--ink)' }}>
                      <b className="inline-flex items-center gap-1.5"><UserX size={15} /> Unknown person (John / Jane Doe)</b>
                      <span className="block text-[12px]" style={{ color: 'var(--muted)' }}>
                        Identity not known. The patient is recorded as{' '}
                        <b style={{ color: 'var(--ink)' }}>{unknownPatientName(form.patientGender)}</b>
                        {form.patientGender ? '' : ' (pick a sex below for John or Jane Doe)'} until identified.
                      </span>
                    </span>
                  </label>
                </div>

                {form.patientUnknown ? (
                  <Field>
                    <Label>Distinguishing features</Label>
                    <textarea
                      rows={3}
                      placeholder="Approximate age, build, clothing, scars or tattoos, belongings, where found..."
                      className={textareaCls}
                      value={form.patientDescription}
                      onChange={e => set({ patientDescription: e.target.value })}
                    />
                    <Hint>Helps the receiving facility and family identify the patient later.</Hint>
                  </Field>
                ) : (
                  <>
                    <Field>
                      <Label>Patient name</Label>
                      <input type="text" placeholder="Full name" className={inputCls} value={form.patientName} onChange={e => set({ patientName: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Patient phone</Label>
                      <input
                        type="tel"
                        inputMode="tel"
                        pattern="[0-9+\-\s]*"
                        placeholder="0712345678"
                        className={inputCls}
                        value={form.patientContact}
                        onChange={e => { const v = e.target.value.replace(/[^0-9+\-\s]/g, ''); set({ patientContact: v }); }}
                      />
                    </Field>
                    <Field>
                      <Label>National ID</Label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="National ID number"
                        className={inputCls}
                        value={form.patientNationalId}
                        onChange={e => set({ patientNationalId: e.target.value })}
                      />
                    </Field>
                  </>
                )}

                <Field>
                  <Label>Age</Label>
                  <AgePicker value={form.patientAge} onChange={(v) => set({ patientAge: v })} />
                </Field>

                <Field>
                  <Label>Sex</Label>
                  <TileGroup
                    cols="grid-cols-2 max-w-[340px]"
                    value={form.patientGender}
                    onChange={(v) => set({ patientGender: form.patientGender === v ? '' : v })}
                    options={[
                      { value: 'Male', label: 'Male', Icon: Mars },
                      { value: 'Female', label: 'Female', Icon: Venus },
                    ]}
                  />
                </Field>

                <Row label="Next of kin" hint="Someone to reach for the patient.">
                  <Field>
                    <Label>Name</Label>
                    <input type="text" placeholder="Full name" className={inputCls} value={form.nextOfKin} onChange={e => set({ nextOfKin: e.target.value })} />
                  </Field>
                  <Field>
                    <Label>Phone</Label>
                    <input
                      type="tel"
                      inputMode="tel"
                      pattern="[0-9+\-\s]*"
                      placeholder="0712345678"
                      className={inputCls}
                      value={form.nextOfKinPhone}
                      onChange={e => { const v = e.target.value.replace(/[^0-9+\-\s]/g, ''); set({ nextOfKinPhone: v }); }}
                    />
                  </Field>
                </Row>

                <div className="iw-row">
                  <div className="iw-label">
                    <span className="block text-[13px] font-medium" style={{ color: 'var(--ink)' }}>Flags</span>
                  </div>
                  <p className="iw-hint text-[11.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>Switch on any that apply.</p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <ToggleCard
                      on={form.massCasualty}
                      onChange={(on) => set({ massCasualty: on, ...(on ? {} : { massCasualtyCount: '' }) })}
                      title="Mass casualty (MCI)"
                      sub="Several victims, heavy response"
                      color="var(--red)"
                      Icon={Users}
                    >
                      <input
                        type="text"
                        inputMode="numeric"
                        autoFocus
                        placeholder="How many casualties? e.g. 5"
                        className={inputCls}
                        value={form.massCasualtyCount}
                        onChange={e => set({ massCasualtyCount: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })}
                      />
                    </ToggleCard>
                    <ToggleCard
                      on={form.isGbvCase}
                      onChange={(on) => set({ isGbvCase: on })}
                      title="Gender-based violence"
                      sub="Adds the case to the GBV Register"
                      color="#7e22ce"
                      Icon={ShieldAlert}
                    />
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Incident details" description="What happened, and the clinical picture." icon={FirstAid}>
                <div className="iw-row">
                  <div className="iw-label">
                    <Label required>Nature of alert</Label>
                  </div>
                  <p className="iw-hint text-[11.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>Tap the category, then the specific type.</p>
                  <div className="flex flex-col gap-3">
                    <ChipPicker
                      columns="grid-cols-2 sm:grid-cols-3"
                      options={uniqueNatures}
                      value={form.alertNature}
                      onChange={(v) => set({ alertNature: v, alertNatureDetail: '' })}
                      icon={natureIcon}
                      label={chipLabel}
                    />
                    {form.alertNature && (
                      <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <p className="text-[11.5px] font-medium mb-2" style={{ color: 'var(--muted)' }}>
                          Specific {chipLabel(form.alertNature).toLowerCase()}
                        </p>
                        {detailsForNature.length > 0 && detailsForNature.length <= 12 ? (
                          <ChipPicker options={detailsForNature} value={form.alertNatureDetail} onChange={(v) => set({ alertNatureDetail: v })} />
                        ) : detailsForNature.length > 12 ? (
                          <select className={selectCls} value={form.alertNatureDetail} onChange={e => set({ alertNatureDetail: e.target.value })}>
                            <option value="">Select specific type...</option>
                            {detailsForNature.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        ) : (
                          <input
                            type="text"
                            className={inputCls}
                            placeholder="Describe further..."
                            value={form.alertNatureDetail}
                            onChange={e => set({ alertNatureDetail: e.target.value })}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <Field>
                  <Label required>{isReferral ? 'Reason for referral' : 'Chief complaint'}</Label>
                  <textarea
                    rows={3}
                    placeholder={isReferral
                      ? 'Why the patient is being transferred, e.g. needs CT scan / specialist / ICU bed...'
                      : 'Describe the primary complaint / reason for call...'}
                    className={textareaCls}
                    value={form.chiefComplaint}
                    onChange={e => set({ chiefComplaint: e.target.value })}
                  />
                  <Hint>Be as specific as possible. This is what dispatchers see first.</Hint>
                </Field>


                <Field>
                  <Label>Pre-hospital management given</Label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Tourniquet applied, IV access obtained..."
                    className={textareaCls}
                    value={form.preHospitalManagement}
                    onChange={e => set({ preHospitalManagement: e.target.value })}
                  />
                </Field>


              </SectionCard>

              {/* ── Maternity Vitals - only when nature is Maternity ── */}
              {isMaternity && (
                <div>
                <SectionCard title="Maternity vitals" description="Mother, labour progress and newborn." icon={Baby}>

                  {/* Mother Information */}
                  <Row label="Mother">
                    <Field>
                      <Label>Date / Time of Admission</Label>
                      <input type="datetime-local" className={inputCls} value={mv.admissionDateTime} onChange={e => setMat({ admissionDateTime: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Parity</Label>
                      <input type="text" placeholder="e.g. P2" className={inputCls} value={mv.parity} onChange={e => setMat({ parity: e.target.value })} />
                    </Field>
                    <Field className="col-span-2 flex flex-col">
                      <Label>Gravida</Label>
                      <input type="text" placeholder="e.g. G3" className={inputCls} value={mv.gravid} onChange={e => setMat({ gravid: e.target.value })} />
                    </Field>
                  </Row>

                  <Row label="Fetal well-being" hint="Liquor, moulding, dilatation, contractions.">
                    <Field>
                      <Label>Fetal Heart Rate</Label>
                      <input type="text" placeholder="bpm" className={inputCls} value={mv.fetalHeartRate} onChange={e => setMat({ fetalHeartRate: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Membranes</Label>
                      <input type="text" placeholder="Intact / Ruptured" className={inputCls} value={mv.membranes} onChange={e => setMat({ membranes: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Character of Liquor</Label>
                      <input type="text" placeholder="Clear / Meconium stained..." className={inputCls} value={mv.characterOfLiquor} onChange={e => setMat({ characterOfLiquor: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Moulding</Label>
                      <input type="text" placeholder="0 / + / ++ / +++" className={inputCls} value={mv.moulding} onChange={e => setMat({ moulding: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Cervical Dilatation</Label>
                      <input type="text" placeholder="cm" className={inputCls} value={mv.cervicalDilatation} onChange={e => setMat({ cervicalDilatation: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Descent</Label>
                      <input type="text" placeholder="Fifths palpable" className={inputCls} value={mv.descent} onChange={e => setMat({ descent: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Uterine Contraction</Label>
                      <input type="text" placeholder="Frequency / Duration" className={inputCls} value={mv.uterineContraction} onChange={e => setMat({ uterineContraction: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Medications (Fetal)</Label>
                      <input type="text" placeholder="e.g. Betamethasone..." className={inputCls} value={mv.medicationsFetal} onChange={e => setMat({ medicationsFetal: e.target.value })} />
                    </Field>
                  </Row>

                  <Row label="Maternal well-being" hint="Observations and urinalysis." cols={3}>
                    <Field>
                      <Label>BP</Label>
                      <input type="text" placeholder="mmHg" className={inputCls} value={mv.bp} onChange={e => setMat({ bp: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Pulse</Label>
                      <input type="text" placeholder="bpm" className={inputCls} value={mv.pulse} onChange={e => setMat({ pulse: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Temperature</Label>
                      <input type="text" placeholder="°C" className={inputCls} value={mv.temperature} onChange={e => setMat({ temperature: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>RBS</Label>
                      <input type="text" placeholder="mmol/L" className={inputCls} value={mv.rbs} onChange={e => setMat({ rbs: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>SPO₂</Label>
                      <input type="text" placeholder="%" className={inputCls} value={mv.spo2} onChange={e => setMat({ spo2: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>GCS</Label>
                      <input type="text" placeholder="/15" className={inputCls} value={mv.gcs} onChange={e => setMat({ gcs: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Protein / Albumin in Urine</Label>
                      <input type="text" placeholder="Nil / + / ++" className={inputCls} value={mv.proteinInUrine} onChange={e => setMat({ proteinInUrine: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Glucose in Urine</Label>
                      <input type="text" placeholder="Nil / +" className={inputCls} value={mv.glucoseInUrine} onChange={e => setMat({ glucoseInUrine: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Urine Output</Label>
                      <input type="text" placeholder="ml/hr" className={inputCls} value={mv.urineOutput} onChange={e => setMat({ urineOutput: e.target.value })} />
                    </Field>
                  </Row>

                  <Row label="Newborn" hint="Delivery, condition and APGAR.">
                    <Field>
                      <Label>Date &amp; Time of Delivery</Label>
                      <input type="datetime-local" className={inputCls} value={mv.deliveryDateTime} onChange={e => setMat({ deliveryDateTime: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Mode of Delivery</Label>
                      <select className={selectCls} value={mv.modeOfDelivery} onChange={e => setMat({ modeOfDelivery: e.target.value })}>
                        <option value="">Select...</option>
                        <option>SVD</option>
                        <option>Caesarean Section</option>
                        <option>Assisted Vaginal (Forceps)</option>
                        <option>Assisted Vaginal (Vacuum)</option>
                        <option>Breech</option>
                        <option>Other</option>
                      </select>
                    </Field>
                    <Field>
                      <Label>Gender</Label>
                      <select className={selectCls} value={mv.newbornGender} onChange={e => setMat({ newbornGender: e.target.value })}>
                        <option value="">Select...</option>
                        <option>Male</option>
                        <option>Female</option>
                        <option>Indeterminate</option>
                      </select>
                    </Field>
                    <Field>
                      <Label>Birth Weight</Label>
                      <input type="text" placeholder="kg" className={inputCls} value={mv.birthWeight} onChange={e => setMat({ birthWeight: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Condition of Baby</Label>
                      <input type="text" placeholder="well / distressed..." className={inputCls} value={mv.conditionOfBaby} onChange={e => setMat({ conditionOfBaby: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>APGAR @ 1 min</Label>
                      <input type="number" min={0} max={10} placeholder="0-10" className={inputCls} value={mv.apgar1Min} onChange={e => setMat({ apgar1Min: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>APGAR @ 5 min</Label>
                      <input type="number" min={0} max={10} placeholder="0-10" className={inputCls} value={mv.apgar5Min} onChange={e => setMat({ apgar5Min: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>APGAR @ 10 min</Label>
                      <input type="number" min={0} max={10} placeholder="0-10" className={inputCls} value={mv.apgar10Min} onChange={e => setMat({ apgar10Min: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Medication (Newborn)</Label>
                      <input type="text" placeholder="e.g. Vitamin K, BCG..." className={inputCls} value={mv.medicationNewborn} onChange={e => setMat({ medicationNewborn: e.target.value })} />
                    </Field>
                  </Row>

                </SectionCard>
                </div>
              )}
          </div>
        )}


        {/* ─────────────── STEP 5: Review & Submit ─────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>Review &amp; submit</h2>
              <p className="text-[13px] mt-1" style={{ color: 'var(--muted)' }}>Check the details, then send the alert to dispatch.</p>
            </div>

            {/* Bento review grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ReviewCard title="Alert" onEdit={() => setStep(1)}>
                <ReviewRow label="Case Type"  value={isReferral ? 'Referral (facility to facility)' : 'Emergency'} />
                <ReviewRow label="Alert Time" value={form.alertAt} />
                <ReviewRow label="Mode"       value={form.alertMode} />
                <ReviewRow label="Origin"     value={form.originOfAlert} />
                <ReviewRow label="Notifier"   value={form.notifierName ? `${form.notifierName} · ${form.notifierPhone}` : undefined} />
              </ReviewCard>

              {isReferral ? (
                <ReviewCard title="Referral Transfer" onEdit={() => setStep(1)}>
                  <ReviewRow label="From"       value={originFacility?.name} />
                  <ReviewRow label="To"         value={targetFacility?.name} />
                  <ReviewRow label="Route"      value={referralRoute ? `${referralRoute.distanceText} · ~${referralRoute.durationText}` : undefined} />
                  <ReviewRow label="Clinician"  value={[form.healthcareWorkerName, form.healthcareWorkerContact].filter(Boolean).join(' · ') || undefined} />
                  <ReviewRow label="Sub-County" value={form.subCounty} />
                </ReviewCard>
              ) : (
                <ReviewCard title="Location" onEdit={() => setStep(1)}>
                  <ReviewRow label="Location"   value={form.locationName} />
                  <ReviewRow label="Sub-County" value={form.subCounty ? `${form.subCounty}${subCountySource ? ` (${subCountySource === 'AUTO' ? 'auto-filled' : 'manual'})` : ''}` : undefined} />
                  <ReviewRow label="Coords"     value={form.lat ? `${form.lat.toFixed(4)}, ${form.lng.toFixed(4)}` : undefined} />
                </ReviewCard>
              )}

              <ReviewCard title="Patient" onEdit={() => setStep(2)}>
                <ReviewRow label="Name"        value={form.patientUnknown ? `${patientDisplayName} (identity unknown)` : form.patientName} />
                {form.patientUnknown && <ReviewRow label="Features" value={form.patientDescription} />}
                <ReviewRow label="Patient Phone" value={form.patientContact} />
                <ReviewRow label="Age / Sex"   value={[form.patientAge, form.patientGender].filter(Boolean).join(' · ') || undefined} />
                <ReviewRow label="Next of Kin" value={form.nextOfKin ? `${form.nextOfKin} · ${form.nextOfKinPhone}` : undefined} />
                <ReviewRow label="MCI"         value={form.massCasualty ? `Yes (${form.massCasualtyCount || '?'} casualties)` : undefined} />
              </ReviewCard>

              <ReviewCard title="Incident Details" onEdit={() => setStep(2)}>
                <ReviewRow label="Nature"    value={[form.alertNature, form.alertNatureDetail].filter(Boolean).join(' → ') || undefined} />
                <ReviewRow label={isReferral ? 'Reason' : 'Complaint'} value={form.chiefComplaint} />
                <ReviewRow label="Pre-hosp." value={form.preHospitalManagement} />
              </ReviewCard>

              {isMaternity && (
                <ReviewCard title="Maternity Vitals" onEdit={() => setStep(2)} className="md:col-span-2">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8">
                    <ReviewRow label="Admission"       value={mv.admissionDateTime} />
                    <ReviewRow label="Parity"          value={mv.parity} />
                    <ReviewRow label="Gravida"         value={mv.gravid} />
                    <ReviewRow label="Fetal HR"        value={mv.fetalHeartRate} />
                    <ReviewRow label="Membranes"       value={mv.membranes} />
                    <ReviewRow label="Liquor"          value={mv.characterOfLiquor} />
                    <ReviewRow label="Moulding"        value={mv.moulding} />
                    <ReviewRow label="Cervix"          value={mv.cervicalDilatation} />
                    <ReviewRow label="Descent"         value={mv.descent} />
                    <ReviewRow label="Contractions"    value={mv.uterineContraction} />
                    <ReviewRow label="Meds (Fetal)"    value={mv.medicationsFetal} />
                    <ReviewRow label="BP"              value={mv.bp} />
                    <ReviewRow label="Pulse"           value={mv.pulse} />
                    <ReviewRow label="Temp"            value={mv.temperature} />
                    <ReviewRow label="RBS"             value={mv.rbs} />
                    <ReviewRow label="SPO₂"            value={mv.spo2} />
                    <ReviewRow label="GCS"             value={mv.gcs} />
                    <ReviewRow label="Protein"         value={mv.proteinInUrine} />
                    <ReviewRow label="Glucose"         value={mv.glucoseInUrine} />
                    <ReviewRow label="Urine Output"    value={mv.urineOutput} />
                    <ReviewRow label="Delivery Time"   value={mv.deliveryDateTime} />
                    <ReviewRow label="Mode"            value={mv.modeOfDelivery} />
                    <ReviewRow label="Gender"          value={mv.newbornGender} />
                    <ReviewRow label="Birth Weight"    value={mv.birthWeight} />
                    <ReviewRow label="Baby Condition"  value={mv.conditionOfBaby} />
                    <ReviewRow label="APGAR (1/5/10)"  value={[mv.apgar1Min, mv.apgar5Min, mv.apgar10Min].some(Boolean) ? `${mv.apgar1Min || '-'} / ${mv.apgar5Min || '-'} / ${mv.apgar10Min || '-'}` : undefined} />
                    <ReviewRow label="Meds (Newborn)"  value={mv.medicationNewborn} />
                  </div>
                </ReviewCard>
              )}
            </div>

            {/* Chief complaint highlight */}
            {form.chiefComplaint && (
              <div
                className="rounded-xl border p-4 shadow-sm"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--muted)' }}>
                  Chief Complaint
                </p>
                <div className="pl-3 py-1" style={{ borderLeft: '2px solid var(--border)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{form.chiefComplaint}</p>
                </div>
              </div>
            )}

            {mutation.isError && (
              <div
                className="px-4 py-3 rounded-xl text-sm font-semibold border"
                style={{ background: 'var(--red-soft)', borderColor: 'var(--red)', color: 'var(--red)' }}
              >
                Submission failed. Check your connection and try again.
              </div>
            )}

            {/* Confirmation notice */}
            <div
              className="rounded-xl border p-4 flex items-start gap-3 shadow-sm"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <ListChecks size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                By clicking <strong style={{ color: 'var(--ink)' }}>Submit Alert</strong>, you confirm all critical details are accurate.
                This action will trigger immediate dispatch routing.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Alert Surveillance panel (Step 3 only) ── */}
      {showSurveillance && step === 3 && (
        <div
          className="border-t-2 border-amber-500/30 px-6 py-4 shrink-0"
          style={{ background: 'var(--surface)' }}
        >
          <div className="flex items-start gap-3 max-w-2xl mx-auto">
            <div className="flex-1">
              <p className="text-[13px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: '#B45309' }}>
                <Eye size={14} /> Surveillance Alert Notes
              </p>
              <textarea
                autoFocus
                rows={2}
                placeholder="Describe the surveillance concern (e.g. suspected outbreak, unusual disease pattern)..."
                className={`${textareaCls} border-amber-500/40 focus:ring-amber-500 focus:border-amber-500`}
                value={surveillanceNote}
                onChange={e => setSurveillanceNote(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2 pt-6">
              <button
                type="button"
                onClick={() => { setShowSurveillance(false); setSurveillanceNote(''); }}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => surveillanceMutation.mutate()}
                disabled={surveillanceMutation.isPending}
                className="btn btn-sm flex items-center gap-1.5 text-amber-700 border-amber-400 hover:bg-amber-50"
                style={{ borderWidth: '1px', borderStyle: 'solid' }}
              >
                {surveillanceMutation.isPending ? <AppLoader size={18} /> : <Eye size={14} />}
                {surveillanceMutation.isPending ? 'Sending...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── End Case reason panel (Step 3 only) ── */}
      {showEndReason && step === 3 && (
        <div
          className="border-t-2 border-status-danger/30 px-6 py-4 shrink-0"
          style={{ background: 'var(--surface)' }}
        >
          <div className="flex items-start gap-3 max-w-2xl mx-auto">
            <div className="flex-1">
              <p className="text-[13px] font-semibold mb-2" style={{ color: 'var(--red)' }}>
                Reason for Ending Case <span className="text-status-danger">*</span>
              </p>
              <textarea
                autoFocus
                rows={2}
                placeholder="e.g. Caller confirmed false alarm, no response required..."
                className={`${textareaCls} border-status-danger/40 focus:ring-status-danger focus:border-status-danger`}
                value={endReason}
                onChange={e => setEndReason(e.target.value)}
              />
              <p className={`text-xs mt-1 ${endReason.trim().length < 10 && endReason.length > 0 ? 'text-status-danger' : ''}`}
                style={endReason.trim().length >= 10 || endReason.length === 0 ? { color: 'var(--muted)' } : {}}>
                {endReason.trim().length} / 10 characters minimum
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-6">
              <button
                type="button"
                onClick={() => { setShowEndReason(false); setEndReason(''); }}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => endCaseMutation.mutate()}
                disabled={endReason.trim().length < 10 || endCaseMutation.isPending}
                className="btn btn-danger btn-sm flex items-center gap-1.5"
              >
                {endCaseMutation.isPending ? <AppLoader size={18} /> : <XCircle size={14} />}
                {endCaseMutation.isPending ? 'Ending...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky footer ── */}
      <div
        className="sticky bottom-0 z-10 px-5 sm:px-10 py-4 rounded-b-2xl"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => step === 1 ? navigate(-1) : setStep((s) => (s - 1) as 1 | 2 | 3)}
          className="btn btn-ghost"
        >
          {step === 1 ? (
            'Cancel'
          ) : (
            <><ArrowLeft size={15} /> Previous</>
          )}
        </button>

        <div className="flex items-center gap-2 flex-wrap justify-center">
          {step < 3 && (
            <>
              <button
                type="button"
                onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                disabled={!stepOk[step]}
                className="btn btn-primary flex items-center justify-center gap-1.5 disabled:opacity-40 sm:min-w-[240px]"
              >
                {step === 2 ? 'Review' : 'Continue'} <ArrowRight size={15} />
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <button
                type="button"
                onClick={() => { setShowEndReason(v => !v); setShowSurveillance(false); setEndReason(''); }}
                disabled={!canSubmit}
                className="btn btn-ghost disabled:opacity-40"
                style={{ color: 'var(--red)' }}
              >
                <XCircle size={15} />
                <span className="hidden sm:inline">End Case</span>
              </button>
              <button
                type="button"
                onClick={() => { setShowSurveillance(v => !v); setShowEndReason(false); setSurveillanceNote(''); }}
                disabled={!canSubmit}
                className="btn btn-ghost disabled:opacity-40"
                style={{ color: '#B45309' }}
              >
                <Eye size={15} />
                <span className="hidden sm:inline">Surveillance</span>
              </button>
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !canSubmit}
                className="btn btn-primary flex items-center gap-1.5 disabled:opacity-40"
              >
                {mutation.isPending ? <AppLoader size={20} /> : <ClipboardText size={16} />}
                {mutation.isPending ? 'Submitting...' : 'Submit Alert'}
              </button>
            </>
          )}
        </div>
        </div>
        {step < 3 && !stepOk[step] && missingByStep[step].length > 0 && (
          <p className="text-[11.5px] text-center mt-2" style={{ color: 'var(--muted)' }}>
            Required: {missingByStep[step].join(', ')}
          </p>
        )}
      </div>
        </div>
      </div>
    </div>
  );
}
export default NewIncidentWizard;
