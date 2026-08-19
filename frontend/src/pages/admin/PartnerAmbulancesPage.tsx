import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Plus, Pencil as PencilSimple, Check, X as XIcon } from 'lucide-react';
import api from '@/api/client';
import { PartnerAmbulance } from '@/types/api';
import { useNotificationStore } from '@/stores/notificationStore';
import { useAuthStore } from '@/stores/authStore';

interface PartnerAgency { id: string; name: string }

const inputCls = 'w-full border rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-all';
const inputStyle = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' } as const;
const labelCls = 'block text-[10px] font-black tracking-widest mb-1.5';

const emptyForm = {
  agencyId: '', registrationNumber: '', vehicleType: '', contactName: '',
  contactPhone: '', baseLocation: '', capacity: '', notes: '',
};

function PartnerAmbulancesPage() {
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<PartnerAmbulance | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  // Admins manage the roster; dispatchers get a read-only view of active units.
  const canManage = role === 'SUPER_ADMIN' || role === 'ADMIN';

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['partner-ambulances', canManage ? 'admin' : 'fleet'],
    queryFn: async () =>
      (await api.get(canManage ? '/admin/partner-ambulances' : '/fleet/partner-ambulances')).data.data as PartnerAmbulance[],
  });

  const { data: agencies = [] } = useQuery({
    queryKey: ['incidents', 'partner-agencies'],
    queryFn: async () => (await api.get('/incidents/partner-agencies')).data.data as PartnerAgency[],
    staleTime: 5 * 60_000,
    enabled: canManage,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['partner-ambulances'] });

  const createMutation = useMutation({
    mutationFn: () => api.post('/admin/partner-ambulances', cleanPayload(form)),
    onSuccess: () => {
      invalidate();
      setShowModal(false);
      setForm(emptyForm);
      addNotification({ type: 'success', title: 'Added', message: 'Partner ambulance registered.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not add.' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PartnerAmbulance> }) => api.patch(`/admin/partner-ambulances/${id}`, data),
    onSuccess: () => {
      invalidate();
      setEditTarget(null);
      addNotification({ type: 'success', title: 'Updated', message: 'Partner ambulance updated.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not update.' }),
  });

  const formValid = form.registrationNumber.trim().length >= 2;

  return (
    <div className="col" style={{ gap: 24 }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 p-4 sm:p-6 lg:p-8 rounded-xl border shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-6 bg-brand-green rounded-full" />
            <p className="font-sans text-[11px] font-black tracking-[0.2em]" style={{ color: 'var(--muted)' }}>Partner Fleet</p>
          </div>
          <h2 className="font-sans text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>Partner Ambulances</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            {canManage
              ? 'Reference vehicle info for partner ambulances (no GPS trackers).'
              : 'Available ambulances with no GPS tracker - reference capacity for dispatch.'}
          </p>
        </div>
        {canManage && (
          <button onClick={() => { setForm(emptyForm); setShowModal(true); }} className="btn btn-primary flex items-center gap-3 px-6 py-3 sm:px-8 sm:py-4 text-xs">
            <Plus size={20} /> Add Ambulance
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="border-b" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                {['Registration', 'Partner', 'Type', 'Contact', 'Base', 'Capacity', 'Status', ...(canManage ? [''] : [])].map((h, hi) => (
                  <th key={h || `actions-${hi}`} className="px-5 py-4 font-sans text-[10px] font-black tracking-[0.2em]" style={{ color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={canManage ? 8 : 7} className="px-6 py-16 text-center text-sm" style={{ color: 'var(--muted)' }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Truck size={44} style={{ color: 'var(--border)' }} />
                      <p className="font-bold text-sm tracking-widest" style={{ color: 'var(--muted)' }}>No partner ambulances yet</p>
                    </div>
                  </td>
                </tr>
              ) : rows.map((r, i) => (
                <tr key={r.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <td className="px-5 py-4 font-black text-sm" style={{ color: 'var(--ink)' }}>{r.registrationNumber}</td>
                  <td className="px-5 py-4 text-sm font-semibold" style={{ color: 'var(--ink)' }}>{r.agency?.name ?? '-'}</td>
                  <td className="px-5 py-4 text-sm" style={{ color: 'var(--muted)' }}>{r.vehicleType || '-'}</td>
                  <td className="px-5 py-4 text-sm" style={{ color: 'var(--muted)' }}>
                    {r.contactName || r.contactPhone ? [r.contactName, r.contactPhone].filter(Boolean).join(' · ') : '-'}
                  </td>
                  <td className="px-5 py-4 text-sm" style={{ color: 'var(--muted)' }}>{r.baseLocation || '-'}</td>
                  <td className="px-5 py-4 text-sm" style={{ color: 'var(--muted)' }}>{r.capacity || '-'}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1.5 font-black text-[11px] tracking-widest" style={{ color: r.isActive ? 'var(--green)' : 'var(--red)' }}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.isActive ? 'var(--green)' : 'var(--red)' }} />
                      {r.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <button onClick={() => setEditTarget(r)} className="btn btn-ghost px-3 py-1.5 text-xs inline-flex items-center gap-1.5">
                        <PencilSimple size={14} /> Edit
                      </button>
                      <button
                        onClick={() => updateMutation.mutate({ id: r.id, data: { isActive: !r.isActive } })}
                        disabled={updateMutation.isPending}
                        className="btn btn-ghost px-3 py-1.5 text-xs inline-flex items-center gap-1.5 ml-1"
                        style={{ color: r.isActive ? 'var(--red)' : 'var(--green)' }}
                      >
                        {r.isActive ? <><XIcon size={14} /> Deactivate</> : <><Check size={14} /> Activate</>}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add modal */}
      {showModal && (
        <AmbulanceModal
          title="Add Partner Ambulance"
          form={form}
          setForm={setForm}
          agencies={agencies}
          onClose={() => setShowModal(false)}
          onSubmit={() => createMutation.mutate()}
          submitting={createMutation.isPending}
          valid={!!formValid}
        />
      )}

      {/* Edit modal */}
      {editTarget && (
        <EditAmbulanceModal
          target={editTarget}
          agencies={agencies}
          onClose={() => setEditTarget(null)}
          onSave={(data) => updateMutation.mutate({ id: editTarget.id, data })}
          submitting={updateMutation.isPending}
        />
      )}
    </div>
  );
}

function cleanPayload(f: typeof emptyForm) {
  return {
    agencyId: f.agencyId || undefined,
    registrationNumber: f.registrationNumber,
    vehicleType: f.vehicleType || undefined,
    contactName: f.contactName || undefined,
    contactPhone: f.contactPhone || undefined,
    baseLocation: f.baseLocation || undefined,
    capacity: f.capacity || undefined,
    notes: f.notes || undefined,
  };
}

function AmbulanceModal({ title, form, setForm, agencies, onClose, onSubmit, submitting, valid }: {
  title: string;
  form: typeof emptyForm;
  setForm: (fn: (f: typeof emptyForm) => typeof emptyForm) => void;
  agencies: PartnerAgency[];
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  valid: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" style={{ background: 'var(--surface)' }}>
        <div className="bg-brand-sidebar px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Truck size={18} className="text-brand-green" />
            <p className="text-sm font-bold text-white">{title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
            <XIcon size={16} />
          </button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
          <div className="col-span-2">
            <label className={labelCls} style={{ color: 'var(--muted)' }}>Partner Agency</label>
            <select className={inputCls + ' cursor-pointer'} style={inputStyle} value={form.agencyId} onChange={e => setForm(f => ({ ...f, agencyId: e.target.value }))}>
              <option value="">None (county / EOC-owned)</option>
              {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} style={{ color: 'var(--muted)' }}>Registration *</label>
            <input className={inputCls} style={inputStyle} placeholder="e.g. KDG 001R" value={form.registrationNumber} onChange={e => setForm(f => ({ ...f, registrationNumber: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls} style={{ color: 'var(--muted)' }}>Type</label>
            <input className={inputCls} style={inputStyle} placeholder="e.g. BLS / ALS / Fire" value={form.vehicleType} onChange={e => setForm(f => ({ ...f, vehicleType: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls} style={{ color: 'var(--muted)' }}>Contact Name</label>
            <input className={inputCls} style={inputStyle} value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls} style={{ color: 'var(--muted)' }}>Contact Phone</label>
            <input className={inputCls} style={inputStyle} placeholder="07XX XXX XXX" value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls} style={{ color: 'var(--muted)' }}>Base Location</label>
            <input className={inputCls} style={inputStyle} value={form.baseLocation} onChange={e => setForm(f => ({ ...f, baseLocation: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls} style={{ color: 'var(--muted)' }}>Capacity</label>
            <input className={inputCls} style={inputStyle} placeholder="e.g. 2 stretchers" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <label className={labelCls} style={{ color: 'var(--muted)' }}>Notes</label>
            <textarea rows={2} className={inputCls} style={inputStyle} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3 justify-end" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="btn btn-ghost px-4 py-2 text-sm">Cancel</button>
          <button onClick={onSubmit} disabled={submitting || !valid} className="btn btn-primary flex items-center gap-2 px-5 py-2 text-sm">
            <Plus size={14} /> {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditAmbulanceModal({ target, agencies, onClose, onSave, submitting }: {
  target: PartnerAmbulance;
  agencies: PartnerAgency[];
  onClose: () => void;
  onSave: (data: Partial<PartnerAmbulance>) => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState({
    agencyId: target.agencyId ?? '',
    registrationNumber: target.registrationNumber,
    vehicleType: target.vehicleType ?? '',
    contactName: target.contactName ?? '',
    contactPhone: target.contactPhone ?? '',
    baseLocation: target.baseLocation ?? '',
    capacity: target.capacity ?? '',
    notes: target.notes ?? '',
  });
  return (
    <AmbulanceModal
      title="Edit Partner Ambulance"
      form={form}
      setForm={(fn) => setForm(fn as any)}
      agencies={agencies}
      onClose={onClose}
      onSubmit={() => onSave(cleanPayload(form))}
      submitting={submitting}
      valid={form.registrationNumber.trim().length >= 2}
    />
  );
}

export default PartnerAmbulancesPage;
