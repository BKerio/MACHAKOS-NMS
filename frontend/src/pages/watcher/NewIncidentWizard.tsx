import { useState, useEffect, useRef, Fragment, type ReactNode, type ElementType } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CircleCheck as CheckCircle,
  MapPin,
  Send as PaperPlaneRight,
  ClipboardList as ClipboardText,
  X,
  Phone,
  User,
  CircleAlert as WarningCircle,
  Cross as FirstAid,
  ListChecks,
  CircleX as XCircle,
  ArrowRight,
  ArrowLeft,
  Pencil as PencilSimple,
  Eye,
  ShieldAlert as ShieldWarning,
  Baby,
  Check,
} from 'lucide-react';
import api from '@/api/client';
import Map from '@/components/shared/Map';
import CreatableCombobox from '@/components/shared/CreatableCombobox';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePlacesAutocomplete } from '@/hooks/usePlacesAutocomplete';
import { toNairobiInput, nairobiInputToISO } from '@/lib/datetime';
import type { Facility } from '@/types/api';

// ── Constants ────────────────────────────────────────────────────────────────

const SUB_COUNTIES = [
  'Dagoretti North','Dagoretti South','Embakasi Central','Embakasi East',
  'Embakasi North','Embakasi South','Embakasi West','Kamukunji','Kasarani',
  'Kibra',"Lang'ata",'Makadara','Mathare','Roysambu','Ruaraka','Starehe','Westlands',
];

const ALERT_MODES = ['Phone', 'Radio', 'Walk-in', 'Other'];

const ORIGIN_OPTIONS = [
  'Community', 'Hospital', 'Police', 'Fire Department', 'Other EMS', 'Self-referral', 'Other',
];

// ── Style tokens ─────────────────────────────────────────────────────────────

const inputCls = [
  'w-full h-10 px-3.5 rounded-lg text-sm font-semibold outline-none transition-colors',
  'border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]',
  'placeholder:text-[var(--muted-2)] placeholder:font-medium',
  'focus:border-[var(--ink)] focus:ring-1 focus:ring-[var(--ink)]',
].join(' ');

const selectCls = inputCls;

const textareaCls = [
  'w-full px-3.5 py-2.5 rounded-lg text-sm font-semibold outline-none resize-none transition-colors',
  'border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]',
  'placeholder:text-[var(--muted-2)] placeholder:font-medium',
  'focus:border-[var(--ink)] focus:ring-1 focus:ring-[var(--ink)]',
].join(' ');

const Label = ({ children, required }: { children: ReactNode; required?: boolean }) => (
  <label className="block text-[10px] font-black tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>
    {children}
    {required && <span className="ml-1" style={{ color: 'var(--red)' }}>*</span>}
  </label>
);

const Field = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={className ?? 'flex flex-col'}>{children}</div>
);

const Hint = ({ children }: { children: ReactNode }) => (
  <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--muted)' }}>{children}</p>
);

// ── Review row ────────────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value?: string | boolean }) {
  if (!value && value !== false) return null;
  return (
    <div className="flex gap-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-[10px] font-black tracking-widest w-28 shrink-0 pt-0.5" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{String(value)}</span>
    </div>
  );
}

// ── Wizard stepper ────────────────────────────────────────────────────────────

const STEPS = ['Alert & Location', 'Patient & Incident', 'Review'];

function WizardStepper({ current }: { current: number }) {
  return (
    <div
      className="px-5 py-3.5 border-b shrink-0"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="max-w-3xl mx-auto flex items-center gap-2">
        {STEPS.map((label, i) => {
          const num = i + 1;
          const done = num < current;
          const active = num === current;
          return (
            <Fragment key={label}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0"
                  style={
                    done || active
                      ? { background: 'var(--ink)', color: 'var(--surface)' }
                      : { background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }
                  }
                >
                  {done ? <Check size={13} strokeWidth={3} /> : num}
                </div>
                <span
                  className="text-[11px] font-bold truncate hidden sm:block"
                  style={{ color: active || done ? 'var(--ink)' : 'var(--muted)' }}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className="flex-1 h-px mx-1"
                  style={{ background: done ? 'var(--ink)' : 'var(--border)' }}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({
  title, icon: Icon, children, accent,
}: {
  title: string;
  icon: ElementType;
  children: ReactNode;
  accent?: string;
}) {
  return (
    <div
      className="rounded-xl border shadow-sm overflow-hidden"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="h-1 w-full" style={{ background: accent || 'var(--green)' }} />
      <div
        className="px-4 py-3 flex items-center gap-2.5"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
        >
          <Icon size={15} />
        </div>
        <h3 className="text-sm font-bold tracking-tight" style={{ color: 'var(--ink)' }}>{title}</h3>
      </div>
      <div className="p-4 sm:p-5 space-y-4">{children}</div>
    </div>
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
      className={`rounded-xl border shadow-sm overflow-hidden${className ? ` ${className}` : ''}`}
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-[10px] font-black tracking-widest" style={{ color: 'var(--muted)' }}>
          {title}
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest px-2 py-1 rounded-md border transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface)' }}
        >
          <PencilSimple size={11} /> Edit
        </button>
      </div>
      <div className="px-4 py-1">{children}</div>
    </div>
  );
}

// ── Patient vitals ────────────────────────────────────────────────────────────

type VitalsForm = {
  temperature: string;
  pulseRate: string;
  respirationRate: string;
  bp: string;
  spo2: string;
  gcs: string;
};

const defaultVitals: VitalsForm = {
  temperature: '',
  pulseRate: '',
  respirationRate: '',
  bp: '',
  spo2: '',
  gcs: '',
};

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
  watcherComments: string;
  preHospitalManagement: string;
  placeOfReferral: string;
  targetFacilityId: string;
  healthcareWorkerName: string;
  healthcareWorkerContact: string;
  isGbvCase: boolean;
};

const defaultForm: FormState = {
  alertAt: toNairobiInput(),
  alertMode: 'Phone',
  notifierName: '',
  notifierPhone: '',
  originOfAlert: '',
  locationName: '',
  subCounty: '',
  lat: -1.2921,
  lng: 36.8219,
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
  watcherComments: '',
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
  const [vitals, setVitals] = useState<VitalsForm>(defaultVitals);
  const setVit = (u: Partial<VitalsForm>) => setVitals(p => ({ ...p, ...u }));
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



  // ── Step validation (Screen 1: Alert + Location · Screen 2: Patient + Incident · Screen 3: Review) ──
  const alertOk    = !!form.alertAt && !!form.alertMode;                 // Alert
  const locationOk = !!form.locationName.trim() && !!form.subCounty;     // Location
  const incidentOk = !!form.alertNature && !!form.chiefComplaint.trim(); // Incident (Patient has no required fields)
  const step1Ok = alertOk && locationOk;    // Screen 1: Alert & Location
  const step2Ok = incidentOk;               // Screen 2: Patient & Incident
  const canSubmit = step1Ok && step2Ok;

  const stepOk: Record<number, boolean> = { 1: step1Ok, 2: step2Ok, 3: canSubmit };
  const missingByStep: Record<number, string[]> = {
    1: [
      !form.alertAt && 'date & time', !form.alertMode && 'alert mode',
      !form.locationName && 'location', !form.subCounty && 'sub-county',
    ].filter(Boolean) as string[],
    2: [!form.alertNature && 'nature of alert', !form.chiefComplaint && 'chief complaint'].filter(Boolean) as string[],
    3: [],
  };

  // ── Sub-county detection ───────────────────────────────────────────────────
  // Bare direction words are NEVER enough to pick a sub-county on their own.
  // Google frequently returns a component of just "North" / "West" for Nairobi
  // addresses; matching that loosely used to select "Dagoretti North" for
  // incidents anywhere in the city.
  const DIRECTION_WORDS = new Set(['north', 'south', 'east', 'west', 'central']);

  const normalizePlace = (s: string) =>
    s.toLowerCase().replace(/[^a-z\s']/g, ' ').replace(/\s+/g, ' ').trim();

  const hasWholeWord = (haystack: string, needle: string) =>
    new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`).test(haystack);

  // Match any of the given place strings against the known Nairobi sub-counties,
  // strongest signal first.
  function matchSubCounty(candidates: string[]): string {
    const lowered = candidates.filter(Boolean).map(normalizePlace).filter(Boolean);
    if (lowered.length === 0) return '';

    // 1. Exact match - "Embakasi Central" === "Embakasi Central"
    for (const sub of SUB_COUNTIES) {
      const s = normalizePlace(sub);
      if (lowered.some(c => c === s)) return sub;
    }

    // 2. A candidate contains the FULL sub-county name as whole words -
    //    e.g. "Embakasi Central Constituency" → Embakasi Central
    for (const sub of SUB_COUNTIES) {
      const s = normalizePlace(sub);
      if (lowered.some(c => hasWholeWord(c, s))) return sub;
    }

    // 3. A distinctive candidate word appears in the sub-county name -
    //    e.g. "Kasarani" → Kasarani. Direction words and very short tokens are
    //    excluded so "North" can never decide the sub-county by itself.
    for (const sub of SUB_COUNTIES) {
      const s = normalizePlace(sub);
      if (lowered.some(c => c.length >= 4 && !DIRECTION_WORDS.has(c) && hasWholeWord(s, c))) {
        return sub;
      }
    }

    return '';
  }

  function detectSubCounty(address: Record<string, string>): string {
    const canonical = matchSubCounty([
      address.city_district,
      address.suburb,
      address.county,
      address.state_district,
      address.municipality,
      address.neighbourhood,
      address.town,
    ]);
    if (canonical) return canonical;
    // No official sub-county matched - fall back to the most specific area name
    // so the field still auto-fills (it's free-text; the watcher can adjust).
    // A bare direction word is useless here, so skip it.
    const fallback = [address.city_district, address.suburb, address.neighbourhood, address.municipality]
      .filter(Boolean)
      .find(v => !DIRECTION_WORDS.has(normalizePlace(v)));
    return fallback ?? '';
  }

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
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(form.locationName + ', Nairobi, Kenya')}&limit=5&addressdetails=1`
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
      return detectSubCounty(data.address ?? {});
    } catch {
      return '';
    }
  }

  const selectGoogleSuggestion = async (placeId: string, description: string) => {
    try {
      const details = await places.getDetails(placeId);
      // Prefer Google's own components; fall back to a reverse geocode of the
      // coordinates (Google is unreliable for Nairobi constituencies).
      let detectedSub = matchSubCounty(details.subCountyCandidates);
      if (!detectedSub) {
        setIsReverseGeocoding(true);
        detectedSub = await reverseDetectSubCounty(details.lat, details.lng);
        setIsReverseGeocoding(false);
      }
      set({
        locationName: details.name || description.split(',').slice(0, 2).join(',').trim(),
        lat: details.lat,
        lng: details.lng,
        ...(detectedSub ? { subCounty: detectedSub } : {}),
      });
      if (detectedSub) setSubCountySource('AUTO');
    } catch {
      set({ locationName: description.split(',').slice(0, 2).join(',').trim() });
    }
    places.clear();
    setShowSuggestions(false);
  };

  const selectSuggestion = (s: { display_name: string; lat: string; lon: string; address?: Record<string, string> }) => {
    const name        = s.display_name.split(',').slice(0, 2).join(',').trim();
    const detectedSub = detectSubCounty(s.address ?? {});
    set({ locationName: name, lat: parseFloat(s.lat), lng: parseFloat(s.lon), ...(detectedSub ? { subCounty: detectedSub } : {}) });
    if (detectedSub) setSubCountySource('AUTO');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // ── Map click reverse geocode ──────────────────────────────────────────────
  const handleMapClick = async (lat: number, lng: number) => {
    set({ lat, lng });
    setSuggestions([]);
    setShowSuggestions(false);
    setIsReverseGeocoding(true);
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`);
      const data = await res.json();
      if (data?.display_name) {
        const name        = data.display_name.split(',').slice(0, 2).join(',').trim();
        const detectedSub = detectSubCounty(data.address ?? {});
        set({ locationName: name, ...(detectedSub ? { subCounty: detectedSub } : {}) });
        if (detectedSub) setSubCountySource('AUTO');
      }
    } catch {} finally {
      setIsReverseGeocoding(false);
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
    alertMode:             form.alertMode,
    alertAt:               nairobiInputToISO(form.alertAt),
    originOfAlert:         form.originOfAlert || undefined,
    notifierDetails:       form.notifierName ? [{ name: form.notifierName, phone: form.notifierPhone }] : undefined,
    locationName:          form.locationName,
    subCounty:             form.subCounty,
    subCountySource:       subCountySource || undefined,
    lat:                   form.lat,
    lng:                   form.lng,
    patientName:           form.patientName  || undefined,
    patientContact:        form.patientContact || undefined,
    patientNationalId:     form.patientNationalId || undefined,
    patientAge:            form.patientAge   || undefined,
    patientGender:         form.patientGender || undefined,
    nextOfKin:             form.nextOfKin    || undefined,
    nextOfKinPhone:        form.nextOfKinPhone || undefined,
    massCasualty:          form.massCasualty,
    massCasualtyCount:     form.massCasualtyCount ? parseInt(form.massCasualtyCount, 10) : undefined,
    chiefComplaint:        form.chiefComplaint,
    alertNature:           form.alertNature  || undefined,
    alertNatureDetail:     form.alertNatureDetail || undefined,
    watcherComments:       form.watcherComments || undefined,
    preHospitalManagement: form.preHospitalManagement || undefined,
    placeOfReferral:       form.placeOfReferral || undefined,
    targetFacilityId:      form.targetFacilityId || undefined,
    healthcareWorkerName:    form.healthcareWorkerName || undefined,
    healthcareWorkerContact: form.healthcareWorkerContact || undefined,
    isGbvCase:             form.isGbvCase || undefined,
    vitals:                vitals,
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
          className="w-full max-w-md rounded-2xl border shadow-sm overflow-hidden"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div
            className="h-1 w-full"
            style={{
              background: ended ? 'var(--red)' : surveillance ? '#B45309' : 'var(--green)',
            }}
          />
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
              <h2 className="text-xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>
                {ended ? 'Case Ended' : surveillance ? 'Surveillance Alert Sent' : 'Alert Submitted'}
              </h2>
              {submittedCase && (
                <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
                  Case{' '}
                  <span className="font-black" style={{ color: 'var(--ink)' }}>#{submittedCase}</span>{' '}
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
                  setForm(defaultForm); setVitals(defaultVitals); setMV(defaultMV);
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

  // ── Step titles ────────────────────────────────────────────────────────────
  const stepTitle =
    step === 1 ? 'Alert & Location'
    : step === 2 ? 'Patient & Incident Details'
    : 'Review & Submit';

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Wizard header ── */}
      <div
        className="border-b shrink-0 overflow-hidden"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="h-1 w-full bg-brand-green" />
        <div className="px-5 py-3.5 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-1.5 h-4 bg-brand-green rounded-full" />
              <p className="text-[10px] font-black tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
                New Incident · Step {step} of {STEPS.length}
              </p>
            </div>
            <h1 className="text-lg font-black tracking-tight truncate" style={{ color: 'var(--ink)' }}>
              {stepTitle}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--muted)' }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── Step indicator ── */}
      <WizardStepper current={step} />

      {/* ── Step content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-5">

        {/* ─────────────── STEP 1: Alert ─────────────── */}
        {step === 1 && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

              {/* ── Card 1: Alert ── */}
              <SectionCard title="Alert" icon={Phone}>
                <Field>
                  <Label required>Alert Date &amp; Time</Label>
                  <input
                    type="datetime-local"
                    className={inputCls}
                    value={form.alertAt}
                    onChange={e => set({ alertAt: e.target.value })}
                  />
                  <Hint>When was the alert received?</Hint>
                </Field>

                <Field>
                  <Label required>Mode of Alert</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALERT_MODES.map((m) => {
                      const on = form.alertMode === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => set({ alertMode: m })}
                          className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-[11px] font-black tracking-wide transition-colors"
                          style={
                            on
                              ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: 'var(--surface)' }
                              : { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--muted)' }
                          }
                        >
                          {on && <Check size={11} strokeWidth={3} />}
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Field>
                  <Label>Origin of Alert</Label>
                  <select className={selectCls} value={form.originOfAlert} onChange={e => set({ originOfAlert: e.target.value })}>
                    <option value="">Select origin...</option>
                    {ORIGIN_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <Label>Notifier Name</Label>
                    <input type="text" placeholder="Full name" className={inputCls} value={form.notifierName} onChange={e => set({ notifierName: e.target.value })} />
                  </Field>
                  <Field>
                    <Label>Notifier Phone</Label>
                    <input type="tel" placeholder="07XXXXXXXX" className={inputCls} value={form.notifierPhone} onChange={e => set({ notifierPhone: e.target.value })} />
                  </Field>
                </div>

                <Field>
                  <Label>Referral Facility</Label>
                  <select
                    className={selectCls}
                    value={form.targetFacilityId}
                    onChange={e => {
                      const id = e.target.value;
                      const f = facilities.find(x => x.id === id);
                      set({ targetFacilityId: id, placeOfReferral: f?.name ?? '' });
                    }}
                  >
                    <option value="">No referral facility</option>
                    {facilityOptions.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                        {f.type ? ` · ${f.type}` : ''}
                        {f.subCounty ? ` · ${f.subCounty}` : ''}
                      </option>
                    ))}
                  </select>
                  <Hint>
                    {facilities.length === 0
                      ? 'No facilities configured yet. Add them under Admin → Facilities.'
                      : 'Facilities in the selected sub-county are listed first.'}
                  </Hint>
                </Field>
              </SectionCard>

              {/* ── Card 2: Location ── */}
              <SectionCard title="Incident Location" icon={MapPin}>
                <Field>
                  <Label required>Location of Incident</Label>
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
                      <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-[var(--ink)] border-t-transparent rounded-full animate-spin" />
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
                      className="inline-flex items-center gap-1.5 text-[11px] font-black tracking-wide px-3 py-2 rounded-lg border transition-colors disabled:opacity-50"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface-2)' }}
                    >
                      <MapPin size={13} />
                      {gpsBusy ? 'Locating...' : 'Use my current location'}
                    </button>
                    {gpsError && <span className="text-xs" style={{ color: 'var(--red)' }}>{gpsError}</span>}
                  </div>
                </Field>

                {/* Map */}
                <div
                  className="rounded-xl border overflow-hidden"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div
                    className="px-3 py-2 flex items-center gap-2"
                    style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
                  >
                    <MapPin size={12} className="shrink-0" style={{ color: 'var(--muted)' }} />
                    <span className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
                      Click the map to pin the scene. Address fills automatically.
                    </span>
                  </div>
                  <Map
                    center={[form.lat, form.lng]}
                    zoom={14}
                    markers={[{ id: 'scene', lat: form.lat, lng: form.lng, title: form.locationName || 'Scene', type: 'incident' }]}
                    onLocationSelect={handleMapClick}
                    layerType="street"
                    className="h-72 w-full"
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
                      <div className="w-3 h-3 border-2 border-[var(--ink)] border-t-transparent rounded-full animate-spin" />
                      Getting address...
                    </div>
                  )}
                </div>

                <Field>
                  <div className="flex items-center gap-2 mb-1">
                    <Label required>Sub-County</Label>
                    {form.subCounty && subCountySource === 'AUTO' && (
                      <span
                        className="text-[9px] font-black tracking-wide px-2 py-0.5 rounded-md"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                      >
                        Auto-filled
                      </span>
                    )}
                    {form.subCounty && subCountySource === 'MANUAL' && (
                      <span
                        className="text-[9px] font-black tracking-wide px-2 py-0.5 rounded-md"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                      >
                        Manual
                      </span>
                    )}
                  </div>
                  <CreatableCombobox
                    options={SUB_COUNTIES}
                    value={form.subCounty}
                    onChange={(v) => { set({ subCounty: v }); setSubCountySource(v ? 'MANUAL' : ''); }}
                    onCreateOption={() => {}}
                    placeholder="Auto-fills from location, or type to search / add"
                  />
                </Field>
              </SectionCard>
          </div>
        )}

        {/* ─────────────── STEP 2: Patient ─────────────── */}
        {step === 2 && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <SectionCard title="Patient" icon={User}>
                <Field>
                  <Label>Patient Name</Label>
                  <input type="text" placeholder="Full name" className={inputCls} value={form.patientName} onChange={e => set({ patientName: e.target.value })} />
                </Field>
                <Field>
                  <Label>Patient Phone Number</Label>
                  <input
                    type="tel"
                    inputMode="tel"
                    pattern="[0-9+\-\s]*"
                    placeholder="07XXXXXXXX"
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

                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <Label>Age</Label>
                    <select className={selectCls} value={form.patientAge} onChange={e => set({ patientAge: e.target.value })}>
                      <option value="">Select age...</option>
                      <option value="Below 1 Month">Below 1 Month</option>
                      <option value="1-6 Months">1-6 Months</option>
                      <option value="6-12 Months">6-12 Months</option>
                      {Array.from({ length: 149 }, (_, i) => i + 2).map(yr => (
                        <option key={yr} value={String(yr)}>{yr}</option>
                      ))}
                    </select>
                  </Field>
                  <Field>
                    <Label>Sex</Label>
                    <select className={selectCls} value={form.patientGender} onChange={e => set({ patientGender: e.target.value })}>
                      <option value="">Select...</option>
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <Label>Next of Kin</Label>
                    <input type="text" placeholder="Full name" className={inputCls} value={form.nextOfKin} onChange={e => set({ nextOfKin: e.target.value })} />
                  </Field>
                  <Field>
                    <Label>Next of Kin Phone</Label>
                    <input
                      type="tel"
                      inputMode="tel"
                      pattern="[0-9+\-\s]*"
                      placeholder="07XXXXXXXX"
                      className={inputCls}
                      value={form.nextOfKinPhone}
                      onChange={e => { const v = e.target.value.replace(/[^0-9+\-\s]/g, ''); set({ nextOfKinPhone: v }); }}
                    />
                  </Field>
                </div>

                <label
                  className="flex items-start gap-3 p-3.5 border rounded-xl cursor-pointer transition-colors"
                  style={{
                    borderColor: form.massCasualty ? 'var(--red)' : 'var(--border)',
                    background: form.massCasualty ? 'var(--red-soft)' : 'var(--surface-2)',
                  }}
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 mt-0.5 accent-red-500 shrink-0"
                    checked={form.massCasualty}
                    onChange={e => set({ massCasualty: e.target.checked })}
                  />
                  <div>
                    <p className="font-bold text-sm flex items-center gap-1.5" style={{ color: 'var(--red)' }}>
                      <WarningCircle size={15} /> Mass Casualty Incident (MCI)
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>Multiple victims requiring heavy response.</p>
                  </div>
                </label>

                {form.massCasualty && (
                  <Field>
                    <Label>Approximate Number of Casualties</Label>
                    <input type="number" min="2" inputMode="numeric" placeholder="e.g. 5" className={inputCls} value={form.massCasualtyCount}
                      onKeyDown={e => ['e','E','+','-','.'].includes(e.key) && e.preventDefault()}
                      onChange={e => set({ massCasualtyCount: e.target.value.replace(/[^0-9]/g, '') })} />
                  </Field>
                )}

                <label
                  className="flex items-start gap-3 p-3.5 border rounded-xl cursor-pointer transition-colors"
                  style={{
                    borderColor: form.isGbvCase ? '#7e22ce' : 'var(--border)',
                    background: form.isGbvCase ? 'rgba(147,51,234,0.06)' : 'var(--surface-2)',
                  }}
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 mt-0.5 shrink-0"
                    style={{ accentColor: '#7e22ce' }}
                    checked={form.isGbvCase}
                    onChange={e => set({ isGbvCase: e.target.checked })}
                  />
                  <div>
                    <p className="font-bold text-sm flex items-center gap-1.5" style={{ color: '#7e22ce' }}>
                      <ShieldWarning size={15} color="#7e22ce" /> Gender-Based Violence (GBV)
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>Flag for GBV handling. Appears in the GBV Register.</p>
                  </div>
                </label>
              </SectionCard>

              <SectionCard title="Incident Details" icon={FirstAid}>
                <div className="grid grid-cols-2 gap-3">
                  {/* Nature of Alert */}
                  <Field>
                    <Label required>Nature of Alert</Label>
                    <select
                      className={selectCls}
                      value={form.alertNature}
                      onChange={e => set({ alertNature: e.target.value, alertNatureDetail: '' })}
                    >
                      <option value="">Select nature...</option>
                      {uniqueNatures.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </Field>

                  {/* Specific Nature - dropdown if DB has details, else free text */}
                  <Field>
                    <Label>Specific Nature</Label>
                    {detailsForNature.length > 0 ? (
                      <select
                        className={selectCls}
                        value={form.alertNatureDetail}
                        disabled={!form.alertNature}
                        onChange={e => set({ alertNatureDetail: e.target.value })}
                      >
                        <option value="">Select specific...</option>
                        {detailsForNature.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className={inputCls}
                        placeholder={form.alertNature ? 'Describe further...' : 'Pick nature first'}
                        disabled={!form.alertNature}
                        value={form.alertNatureDetail}
                        onChange={e => set({ alertNatureDetail: e.target.value })}
                      />
                    )}
                  </Field>
                </div>

                <Field>
                  <Label required>Chief Complaint</Label>
                  <textarea
                    rows={3}
                    placeholder="Describe the primary complaint / reason for call..."
                    className={textareaCls}
                    value={form.chiefComplaint}
                    onChange={e => set({ chiefComplaint: e.target.value })}
                  />
                  <Hint>Be as specific as possible. This is what dispatchers see first.</Hint>
                </Field>

                {/* ── Patient Vitals ── */}
                <div className="rounded-xl border p-3.5" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                  <p className="text-[10px] font-black tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Patient Vitals</p>
                  <div className="grid grid-cols-3 gap-3">
                    <Field>
                      <Label>Temperature</Label>
                      <input type="text" placeholder="°C" className={inputCls} value={vitals.temperature} onChange={e => setVit({ temperature: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Pulse Rate</Label>
                      <input type="text" placeholder="bpm" className={inputCls} value={vitals.pulseRate} onChange={e => setVit({ pulseRate: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>Respiration Rate</Label>
                      <input type="text" placeholder="/min" className={inputCls} value={vitals.respirationRate} onChange={e => setVit({ respirationRate: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>BP</Label>
                      <input type="text" placeholder="mmHg" className={inputCls} value={vitals.bp} onChange={e => setVit({ bp: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>SPO₂</Label>
                      <input type="text" placeholder="%" className={inputCls} value={vitals.spo2} onChange={e => setVit({ spo2: e.target.value })} />
                    </Field>
                    <Field>
                      <Label>GCS</Label>
                      <input type="text" placeholder="/15" className={inputCls} value={vitals.gcs} onChange={e => setVit({ gcs: e.target.value })} />
                    </Field>
                  </div>
                </div>

                <Field>
                  <Label>Caller / Watcher Notes</Label>
                  <textarea
                    rows={3}
                    placeholder="Any additional observations from the caller..."
                    className={textareaCls}
                    value={form.watcherComments}
                    onChange={e => set({ watcherComments: e.target.value })}
                  />
                </Field>

                <Field>
                  <Label>Pre-Hospital Management Given</Label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Tourniquet applied, IV access obtained..."
                    className={textareaCls}
                    value={form.preHospitalManagement}
                    onChange={e => set({ preHospitalManagement: e.target.value })}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <Label>Healthcare Worker Contacted</Label>
                    <input
                      type="text"
                      placeholder="Name of HCW contacted"
                      className={inputCls}
                      value={form.healthcareWorkerName}
                      onChange={e => set({ healthcareWorkerName: e.target.value })}
                    />
                  </Field>
                  <Field>
                    <Label>HCW Phone</Label>
                    <input
                      type="tel"
                      placeholder="e.g. 0712 345 678"
                      className={inputCls}
                      value={form.healthcareWorkerContact}
                      onChange={e => set({ healthcareWorkerContact: e.target.value })}
                    />
                  </Field>
                </div>

              </SectionCard>

              {/* ── Maternity Vitals - only when nature is Maternity ── */}
              {isMaternity && (
                <div className="lg:col-span-2">
                <SectionCard title="Maternity Vitals" icon={Baby}>

                  {/* Mother Information */}
                  <p className="text-[10px] font-black tracking-widest" style={{ color: 'var(--muted)' }}>Mother Information</p>
                  <div className="grid grid-cols-2 gap-3">
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
                  </div>

                  <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[10px] font-black tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Fetal Well-being</p>
                    <div className="grid grid-cols-2 gap-3">
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
                    </div>
                  </div>

                  <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[10px] font-black tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Maternal Well-being</p>
                    <div className="grid grid-cols-3 gap-3">
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
                    </div>
                  </div>

                  <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[10px] font-black tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Newborn</p>
                    <div className="grid grid-cols-2 gap-3">
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
                    </div>
                  </div>

                </SectionCard>
                </div>
              )}
          </div>
        )}


        {/* ─────────────── STEP 5: Review & Submit ─────────────── */}
        {step === 3 && (
          <div className="max-w-4xl mx-auto space-y-4">

            {/* Bento review grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ReviewCard title="Alert" onEdit={() => setStep(1)}>
                <ReviewRow label="Alert Time" value={form.alertAt} />
                <ReviewRow label="Mode"       value={form.alertMode} />
                <ReviewRow label="Origin"     value={form.originOfAlert} />
                <ReviewRow label="Notifier"   value={form.notifierName ? `${form.notifierName} · ${form.notifierPhone}` : undefined} />
              </ReviewCard>

              <ReviewCard title="Location" onEdit={() => setStep(1)}>
                <ReviewRow label="Location"   value={form.locationName} />
                <ReviewRow label="Sub-County" value={form.subCounty ? `${form.subCounty}${subCountySource ? ` (${subCountySource === 'AUTO' ? 'auto-filled' : 'manual'})` : ''}` : undefined} />
                <ReviewRow label="Coords"     value={form.lat ? `${form.lat.toFixed(4)}, ${form.lng.toFixed(4)}` : undefined} />
              </ReviewCard>

              <ReviewCard title="Patient" onEdit={() => setStep(2)}>
                <ReviewRow label="Name"        value={form.patientName} />
                <ReviewRow label="Patient Phone" value={form.patientContact} />
                <ReviewRow label="Age / Sex"   value={[form.patientAge, form.patientGender].filter(Boolean).join(' · ') || undefined} />
                <ReviewRow label="Next of Kin" value={form.nextOfKin ? `${form.nextOfKin} · ${form.nextOfKinPhone}` : undefined} />
                <ReviewRow label="MCI"         value={form.massCasualty ? `Yes (${form.massCasualtyCount || '?'} casualties)` : undefined} />
              </ReviewCard>

              <ReviewCard title="Incident Details" onEdit={() => setStep(2)}>
                <ReviewRow label="Nature"    value={[form.alertNature, form.alertNatureDetail].filter(Boolean).join(' → ') || undefined} />
                <ReviewRow label="Complaint" value={form.chiefComplaint} />
                <ReviewRow label="Temp"      value={vitals.temperature} />
                <ReviewRow label="Pulse"     value={vitals.pulseRate} />
                <ReviewRow label="Resp. Rate" value={vitals.respirationRate} />
                <ReviewRow label="BP"        value={vitals.bp} />
                <ReviewRow label="SPO₂"      value={vitals.spo2} />
                <ReviewRow label="GCS"       value={vitals.gcs} />
                <ReviewRow label="Pre-hosp." value={form.preHospitalManagement} />
                <ReviewRow label="Referral"  value={form.placeOfReferral} />
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
                <p className="text-[10px] font-black tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                  Chief Complaint
                </p>
                <div className="pl-3 py-1" style={{ borderLeft: '3px solid var(--green)' }}>
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
              <p className="text-xs font-bold text-amber-600 tracking-widest mb-2 flex items-center gap-1.5">
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
                <Eye size={14} />
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
              <p className="text-xs font-bold text-status-danger tracking-widest mb-2">
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
                <XCircle size={14} />
                {endCaseMutation.isPending ? 'Ending...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky footer ── */}
      <div
        className="border-t px-4 sm:px-5 py-3 flex items-center justify-between gap-3 shrink-0"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <button
          type="button"
          onClick={() => step === 1 ? navigate(-1) : setStep((s) => (s - 1) as 1 | 2 | 3)}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl border transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}
        >
          {step === 1 ? (
            'Cancel'
          ) : (
            <><ArrowLeft size={15} /> Previous</>
          )}
        </button>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {step < 3 && (
            <>
              {!stepOk[step] && missingByStep[step].length > 0 && (
                <p className="text-[11px] max-w-[200px] text-right hidden md:block" style={{ color: 'var(--muted)' }}>
                  Required: {missingByStep[step].join(', ')}
                </p>
              )}
              <button
                type="button"
                onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                disabled={!stepOk[step]}
                className="btn btn-primary flex items-center gap-1.5 disabled:opacity-40"
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
                className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold rounded-xl border transition-colors disabled:opacity-40"
                style={{ borderColor: 'var(--border)', color: 'var(--red)', background: 'var(--surface)' }}
              >
                <XCircle size={15} />
                <span className="hidden sm:inline">End Case</span>
              </button>
              <button
                type="button"
                onClick={() => { setShowSurveillance(v => !v); setShowEndReason(false); setSurveillanceNote(''); }}
                disabled={!canSubmit}
                className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold rounded-xl border transition-colors disabled:opacity-40"
                style={{ borderColor: 'var(--border)', color: '#B45309', background: 'var(--surface)' }}
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
                <ClipboardText size={16} />
                {mutation.isPending ? 'Submitting...' : 'Submit Alert'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export default NewIncidentWizard;
