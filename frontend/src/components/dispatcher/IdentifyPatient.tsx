import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, UserSearch, UserX, X as XIcon } from 'lucide-react';
import api from '@/api/client';
import AppLoader from '@/components/shared/AppLoader';
import { useNotificationStore } from '@/stores/notificationStore';
import { unknownLabel } from '@/lib/incidentPath';
import type { Incident } from '@/types/api';

/*
 * For a patient logged as "Unknown N": a banner with an Identify button, and
 * the form that fills in who they are once family / ID / police confirm it.
 * After identification the case keeps its "Unknown N" label as a trail.
 */

const field = 'input w-full';

export default function IdentifyPatient({ incident }: { incident: Incident }) {
  const [open, setOpen] = useState(false);
  const label = unknownLabel(incident);

  if (!incident.patientUnknown) {
    if (!label || !incident.identifiedAt) return null;
    return (
      <div className="mx-6 mt-5 rounded-lg px-4 py-2.5 flex items-center gap-2 text-[13px]"
        style={{ background: 'color-mix(in srgb, var(--color-status-success) 10%, var(--surface))', color: 'var(--ink-2)' }}>
        <BadgeCheck size={16} color="var(--color-status-success)" />
        <span>
          <b style={{ color: 'var(--ink)' }}>Identified</b> on{' '}
          {new Date(incident.identifiedAt).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {' '}· logged as <b style={{ color: 'var(--ink)' }}>{label}</b>
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="mx-6 mt-5 rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
        style={{ borderColor: 'color-mix(in srgb, var(--amber) 40%, transparent)', background: 'var(--amber-soft)' }}>
        <span className="w-10 h-10 rounded-lg grid place-items-center shrink-0" style={{ background: 'var(--amber)', color: '#fff' }}>
          <UserX size={18} color="#fff" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold" style={{ color: 'var(--ink)' }}>
            {label ?? 'Unknown person'} <span className="font-medium" style={{ color: 'var(--amber)' }}>· not identified yet</span>
          </p>
          <p className="text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
            When family, ID or police confirm who this is, record it here. The case keeps "{label ?? 'Unknown'}" as a reference.
          </p>
        </div>
        <button type="button" className="btn btn-primary whitespace-nowrap" onClick={() => setOpen(true)}>
          <UserSearch size={16} /> Identify patient
        </button>
      </div>
      {open && <IdentifyModal incident={incident} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

function IdentifyModal({ incident, label, onClose }: { incident: Incident; label: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const [f, setF] = useState({
    patientName: '',
    patientAge: incident.patientAge ?? '',
    patientGender: incident.patientGender ?? '',
    patientNationalId: '',
    patientContact: '',
    nextOfKin: incident.nextOfKin ?? '',
    nextOfKinPhone: incident.nextOfKinPhone ?? '',
    note: '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const phoneOnly = (k: 'patientContact' | 'nextOfKinPhone') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value.replace(/[^0-9+\-\s]/g, '') }));

  const mutation = useMutation({
    mutationFn: () => api.patch(`/incidents/${incident.id}/identify`, f),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', incident.id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      addNotification({ type: 'success', title: 'Patient identified', message: `${label ?? 'Patient'} is now ${f.patientName.trim()}.` });
      onClose();
    },
    onError: (err: any) =>
      addNotification({ type: 'error', title: 'Could not save', message: err?.response?.data?.message || 'Try again.' }),
  });

  const nameOk = f.patientName.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="identify-title">
      <div className="absolute inset-0 bg-black/50" onClick={() => !mutation.isPending && onClose()} />
      <div className="relative w-full max-w-lg rounded-2xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="px-5 py-4 flex items-center gap-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <UserSearch size={18} color="var(--blue)" />
          <div className="flex-1">
            <p id="identify-title" className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>Identify {label ?? 'patient'}</p>
            <p className="text-[12px]" style={{ color: 'var(--muted)' }}>{incident.caseNumber} · fill in what's been confirmed</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} disabled={mutation.isPending} className="p-1.5 rounded-lg" style={{ color: 'var(--muted)' }}>
            <XIcon size={16} />
          </button>
        </div>

        <form
          className="p-5 grid grid-cols-2 gap-3.5 max-h-[70vh] overflow-y-auto"
          onSubmit={(e) => { e.preventDefault(); if (nameOk) mutation.mutate(); }}
        >
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-[12px] font-semibold" style={{ color: 'var(--ink-2)' }}>Full name <span style={{ color: 'var(--red)' }}>*</span></span>
            <input className={field} autoFocus value={f.patientName} onChange={set('patientName')} placeholder="As on their ID, if available" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold" style={{ color: 'var(--ink-2)' }}>Age</span>
            <input className={field} inputMode="numeric" value={f.patientAge} onChange={set('patientAge')} placeholder="e.g. 34" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold" style={{ color: 'var(--ink-2)' }}>Sex</span>
            <select className="eoc-select" value={f.patientGender} onChange={set('patientGender')}>
              <option value="">Not recorded</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold" style={{ color: 'var(--ink-2)' }}>National ID</span>
            <input className={field} inputMode="numeric" value={f.patientNationalId} onChange={set('patientNationalId')} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold" style={{ color: 'var(--ink-2)' }}>Patient phone</span>
            <input className={field} inputMode="tel" value={f.patientContact} onChange={phoneOnly('patientContact')} placeholder="0712345678" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold" style={{ color: 'var(--ink-2)' }}>Next of kin</span>
            <input className={field} value={f.nextOfKin} onChange={set('nextOfKin')} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold" style={{ color: 'var(--ink-2)' }}>Next of kin phone</span>
            <input className={field} inputMode="tel" value={f.nextOfKinPhone} onChange={phoneOnly('nextOfKinPhone')} placeholder="0712345678" />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-[12px] font-semibold" style={{ color: 'var(--ink-2)' }}>How were they identified?</span>
            <textarea className="eoc-textarea" style={{ minHeight: 70 }} value={f.note} onChange={set('note')} placeholder="e.g. Sister came to Machakos Level 5 with his ID" />
            <span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>Saved to the case audit log.</span>
          </label>

          <div className="col-span-2 flex gap-2.5 justify-end pt-1">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!nameOk || mutation.isPending}>
              {mutation.isPending ? <AppLoader size={18} /> : <BadgeCheck size={16} />}
              {mutation.isPending ? 'Saving…' : 'Save identity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
