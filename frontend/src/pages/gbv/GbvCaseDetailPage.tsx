import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft as CaretLeft,
  Save as FloppyDisk,
  User,
  TriangleAlert as Warning,
  Cross as FirstAid,
  Handshake,
  Building,
} from 'lucide-react';
import api from '@/api/client';
import { Incident, GbvReport } from '@/types/api';
import { useNotificationStore } from '@/stores/notificationStore';

const GBV_TYPES = [
  'Physical',
  'Sexual',
  'Emotional',
  'Psychological',
  'Intimate Partner',
  'Violence',
  'FGM (Female Genital Mutilation)',
  'Technology Facilitated GBV',
  'Economic/Financial Violence',
];

const REFERRED_FOR = [
  'Medical Services',
  'Psychosocial Support',
  'Legal Aid/Assistance',
  'Protection/Shelter',
  'Economic Empowerment/Livelihoods',
];

interface GbvFormState {
  survivorResidence: string;
  hasDisability: '' | 'yes' | 'no';
  gbvTypes: string[];
  violationLocation: string;
  referredFor: string[];
  referralFacility: string;
  firstDisclosedTo: string;
  challenges: string;
  recommendations: string;
  comment: string;
}

const defaultForm: GbvFormState = {
  survivorResidence: '',
  hasDisability: '',
  gbvTypes: [],
  violationLocation: '',
  referredFor: [],
  referralFacility: '',
  firstDisclosedTo: '',
  challenges: '',
  recommendations: '',
  comment: '',
};

function toggleArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
}

function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-surface-border">
      <span className="text-brand-teal">{icon}</span>
      <h3 className="font-semibold text-brand-teal">{title}</h3>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-600 tracking-wide">
        {label}{required && <span className="text-status-danger ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full border border-surface-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20';
const textareaCls = `${inputCls} resize-none`;

function GbvCaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const [form, setForm] = useState<GbvFormState>(defaultForm);

  const { data: incident, isLoading: incidentLoading } = useQuery<Incident>({
    queryKey: ['incident', id],
    queryFn: async () => {
      const res = await api.get(`/incidents/${id}`);
      return res.data.data as Incident;
    },
    enabled: !!id,
  });

  const { data: report, isLoading: reportLoading } = useQuery<GbvReport | null>({
    queryKey: ['gbv', 'report', id],
    queryFn: async () => {
      const res = await api.get(`/gbv/cases/${id}/report`);
      return res.data.data as GbvReport | null;
    },
    enabled: !!id,
  });

  // Pre-fill form when report loads
  useEffect(() => {
    if (!report) return;
    setForm({
      survivorResidence: report.survivorResidence ?? '',
      hasDisability: report.hasDisability === true ? 'yes' : report.hasDisability === false ? 'no' : '',
      gbvTypes: report.gbvTypes ?? [],
      violationLocation: report.violationLocation ?? '',
      referredFor: report.referredFor ?? [],
      referralFacility: report.referralFacility ?? '',
      firstDisclosedTo: report.firstDisclosedTo ?? '',
      challenges: report.challenges ?? '',
      recommendations: report.recommendations ?? '',
      comment: report.comment ?? '',
    });
  }, [report]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/gbv/cases/${id}/report`, {
        survivorResidence: form.survivorResidence || undefined,
        hasDisability: form.hasDisability === 'yes' ? true : form.hasDisability === 'no' ? false : undefined,
        gbvTypes: form.gbvTypes,
        violationLocation: form.violationLocation || undefined,
        referredFor: form.referredFor,
        referralFacility: form.referralFacility || undefined,
        firstDisclosedTo: form.firstDisclosedTo || undefined,
        challenges: form.challenges || undefined,
        recommendations: form.recommendations || undefined,
        comment: form.comment || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gbv', 'report', id] });
      queryClient.invalidateQueries({ queryKey: ['gbv', 'cases'] });
      addNotification({ type: 'success', title: 'Saved', message: 'GBV report saved successfully.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Save Failed', message: err?.response?.data?.message || 'Could not save GBV report.' });
    },
  });

  if (incidentLoading || reportLoading) {
    return <div className="p-10 text-center text-slate-text font-bold">Loading…</div>;
  }
  if (!incident) {
    return <div className="p-10 text-center text-status-danger font-bold">Case not found.</div>;
  }

  const set = (key: keyof GbvFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/gbv/dashboard"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-teal transition-colors"
        >
          <CaretLeft size={16} /> GBV Register
        </Link>
        <span className="text-slate-300">/</span>
        <h2 className="text-xl font-bold text-brand-teal">GBV Case - {incident.caseNumber}</h2>
        <span className={`ml-auto px-2.5 py-1 rounded-full text-xs font-medium ${
          incident.status === 'RESOLVED' ? 'bg-slate-100 text-slate-500' : 'bg-status-danger/10 text-status-danger'
        }`}>
          {incident.status.replace('_', ' ')}
        </span>
      </div>

      {/* Survivor summary (read-only from incident) */}
      <div className="bg-white border border-surface-border rounded-xl shadow-sm p-6">
        <SectionHead icon={<User size={18} />} title="Survivor Information" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
          <div>
            <p className="text-xs text-slate-text tracking-wide font-semibold mb-1">Name of Survivor</p>
            <p className="text-sm font-medium text-slate-800">{incident.patientName || <span className="text-slate-400 italic">Not recorded</span>}</p>
          </div>
          <div>
            <p className="text-xs text-slate-text tracking-wide font-semibold mb-1">Age</p>
            <p className="text-sm font-medium text-slate-800">{incident.patientAge || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-text tracking-wide font-semibold mb-1">Gender</p>
            <p className="text-sm font-medium text-slate-800">{incident.patientGender || '-'}</p>
          </div>
        </div>

        <Field label="Residence of Survivor">
          <input
            className={inputCls}
            placeholder="e.g. Kibera, Nairobi"
            value={form.survivorResidence}
            onChange={set('survivorResidence')}
          />
        </Field>
      </div>

      {/* Disability */}
      <div className="bg-white border border-surface-border rounded-xl shadow-sm p-6">
        <SectionHead icon={<Warning size={18} />} title="Disability Status" />
        <Field label="Does the survivor have any disability?">
          <div className="flex gap-6 mt-1">
            {(['yes', 'no'] as const).map(v => (
              <label key={v} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="hasDisability"
                  value={v}
                  checked={form.hasDisability === v}
                  onChange={() => setForm(f => ({ ...f, hasDisability: v }))}
                  className="accent-brand-teal w-4 h-4"
                />
                <span className="text-sm font-medium capitalize">{v === 'yes' ? 'Yes' : 'No'}</span>
              </label>
            ))}
          </div>
        </Field>
      </div>

      {/* Type of GBV + violation location */}
      <div className="bg-white border border-surface-border rounded-xl shadow-sm p-6">
        <SectionHead icon={<Warning size={18} />} title="Nature of Violence" />
        <div className="flex flex-col gap-5">
          <Field label="Type of GBV (select all that apply)">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
              {GBV_TYPES.map(type => (
                <label key={type} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-surface-border hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={form.gbvTypes.includes(type)}
                    onChange={() => setForm(f => ({ ...f, gbvTypes: toggleArray(f.gbvTypes, type) }))}
                    className="accent-brand-teal w-4 h-4 flex-shrink-0"
                  />
                  <span className="text-sm">{type}</span>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Location Where Violation Occurred">
            <input
              className={inputCls}
              placeholder="e.g. Home, workplace, public space…"
              value={form.violationLocation}
              onChange={set('violationLocation')}
            />
          </Field>
        </div>
      </div>

      {/* Referral */}
      <div className="bg-white border border-surface-border rounded-xl shadow-sm p-6">
        <SectionHead icon={<FirstAid size={18} />} title="Referral Details" />
        <div className="flex flex-col gap-5">
          <Field label="Referred For (select all that apply)">
            <div className="flex flex-col gap-2 mt-1">
              {REFERRED_FOR.map(option => (
                <label key={option} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-surface-border hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={form.referredFor.includes(option)}
                    onChange={() => setForm(f => ({ ...f, referredFor: toggleArray(f.referredFor, option) }))}
                    className="accent-brand-teal w-4 h-4 flex-shrink-0"
                  />
                  <span className="text-sm">{option}</span>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Referral Facility">
            <input
              className={inputCls}
              placeholder="Name of facility referred to"
              value={form.referralFacility}
              onChange={set('referralFacility')}
            />
          </Field>
        </div>
      </div>

      {/* Disclosure + Narrative */}
      <div className="bg-white border border-surface-border rounded-xl shadow-sm p-6">
        <SectionHead icon={<Handshake size={18} />} title="Disclosure & Reporting" />
        <div className="flex flex-col gap-5">
          <Field label="Individual or Organisation the Case Was First Disclosed To">
            <textarea
              className={textareaCls}
              rows={3}
              placeholder="Who first received the disclosure that triggered this report/referral?"
              value={form.firstDisclosedTo}
              onChange={set('firstDisclosedTo')}
            />
          </Field>
        </div>
      </div>

      {/* Challenges, Recommendations, Comment */}
      <div className="bg-white border border-surface-border rounded-xl shadow-sm p-6">
        <SectionHead icon={<Building size={18} />} title="Case Notes" />
        <div className="flex flex-col gap-5">
          <Field label="Challenges Experienced">
            <textarea
              className={textareaCls}
              rows={3}
              placeholder="Document any challenges encountered in handling this case…"
              value={form.challenges}
              onChange={set('challenges')}
            />
          </Field>

          <Field label="Recommendations">
            <textarea
              className={textareaCls}
              rows={3}
              placeholder="Recommendations for follow-up or systemic improvement…"
              value={form.recommendations}
              onChange={set('recommendations')}
            />
          </Field>

          <Field label="Comment">
            <textarea
              className={textareaCls}
              rows={3}
              placeholder="Any additional notes or observations…"
              value={form.comment}
              onChange={set('comment')}
            />
          </Field>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end pb-8">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-6 py-3 bg-brand-teal text-white font-semibold rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
        >
          <FloppyDisk size={18} />
          {saveMutation.isPending ? 'Saving…' : 'Save GBV Report'}
        </button>
      </div>
    </div>
  );
}

export default GbvCaseDetailPage;
