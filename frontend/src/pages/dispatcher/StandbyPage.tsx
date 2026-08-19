import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Timer, Plus, CircleStop as StopCircle, X as XIcon } from 'lucide-react';
import api from '@/api/client';
import { Vehicle } from '@/types/api';
import { useNotificationStore } from '@/stores/notificationStore';
import { fmtDateTime, toNairobiInput, nairobiInputToISO } from '@/lib/datetime';

interface StandbyRow {
  id: string;
  vehicleId: string;
  vehicle?: { id: string; registrationNumber: string };
  title: string;
  location?: string | null;
  notes?: string | null;
  startedAt: string;
  endedAt?: string | null;
}

const inputCls = 'w-full border rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-all';
const inputStyle = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' } as const;
const labelCls = 'block text-[10px] font-black tracking-widest mb-1.5';

function StandbyPage() {
  const [showModal, setShowModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'ENDED'>('ALL');
  const [form, setForm] = useState({ vehicleId: '', title: '', location: '', notes: '', startedAt: toNairobiInput() });
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const { data: vehicles = [] } = useQuery({
    queryKey: ['dispatch', 'vehicles'],
    queryFn: async () => (await api.get('/dispatch/vehicles')).data.data as Vehicle[],
    staleTime: 60_000,
  });

  const { data: standbys = [], isLoading } = useQuery({
    queryKey: ['fleet', 'standby', activeFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (activeFilter === 'ACTIVE') params.active = 'true';
      if (activeFilter === 'ENDED') params.active = 'false';
      return (await api.get('/fleet/standby', { params })).data.data as StandbyRow[];
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/fleet/standby', {
        vehicleId: form.vehicleId,
        title: form.title,
        location: form.location || undefined,
        notes: form.notes || undefined,
        startedAt: nairobiInputToISO(form.startedAt),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleet', 'standby'] });
      setShowModal(false);
      setForm({ vehicleId: '', title: '', location: '', notes: '', startedAt: toNairobiInput() });
      addNotification({ type: 'success', title: 'Standby logged', message: 'Vehicle placed on standby.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not log standby.' });
    },
  });

  const endMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/fleet/standby/${id}/end`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleet', 'standby'] });
      addNotification({ type: 'success', title: 'Standby ended', message: 'Standby period closed.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not end standby.' });
    },
  });

  const activeCount = standbys.filter(s => !s.endedAt).length;
  const formValid = form.vehicleId && form.title.trim().length >= 2;

  return (
    <div className="col" style={{ gap: 24 }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 p-4 sm:p-6 lg:p-8 rounded-xl border shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-6 bg-brand-green rounded-full" />
            <p className="font-sans text-[11px] font-black tracking-[0.2em]" style={{ color: 'var(--muted)' }}>Fleet Standby</p>
          </div>
          <h2 className="font-sans text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>Standby</h2>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary flex items-center gap-3 px-6 py-3 sm:px-8 sm:py-4 text-xs">
          <Plus size={20} /> Place on Standby
        </button>
      </div>

      {/* Stats + filter */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Total', value: standbys.length },
          { label: 'On Standby Now', value: activeCount },
          { label: 'Ended', value: standbys.length - activeCount },
        ].map(stat => (
          <div key={stat.label} className="p-6 rounded-xl border shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="font-sans text-[10px] font-black tracking-[0.2em] mb-2" style={{ color: 'var(--muted)' }}>{stat.label}</div>
            <div className="font-sans text-4xl font-black leading-none" style={{ color: 'var(--ink)' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {(['ALL', 'ACTIVE', 'ENDED'] as const).map(f => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className="px-4 py-2 rounded-lg text-xs font-black tracking-widest border transition-colors"
            style={{
              background: activeFilter === f ? 'var(--green)' : 'var(--surface)',
              color: activeFilter === f ? '#fff' : 'var(--muted)',
              borderColor: 'var(--border)',
            }}
          >
            {f === 'ALL' ? 'All' : f === 'ACTIVE' ? 'On Standby' : 'Ended'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="border-b" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                {['Vehicle', 'Event / Reason', 'Location', 'Started', 'Ended', 'Status', ''].map(h => (
                  <th key={h} className="px-6 py-4 font-sans text-[10px] font-black tracking-[0.2em]" style={{ color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-6 py-16 text-center text-sm" style={{ color: 'var(--muted)' }}>Loading…</td></tr>
              ) : standbys.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Timer size={44} style={{ color: 'var(--border)' }} />
                      <p className="font-bold text-sm tracking-widest" style={{ color: 'var(--muted)' }}>No standby records</p>
                    </div>
                  </td>
                </tr>
              ) : standbys.map((s, i) => (
                <tr key={s.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <td className="px-6 py-4 font-black text-sm" style={{ color: 'var(--ink)' }}>{s.vehicle?.registrationNumber ?? '-'}</td>
                  <td className="px-6 py-4 text-sm font-semibold" style={{ color: 'var(--ink)' }}>{s.title}</td>
                  <td className="px-6 py-4 text-sm" style={{ color: 'var(--muted)' }}>{s.location || '-'}</td>
                  <td className="px-6 py-4 text-xs" style={{ color: 'var(--muted)' }}>{fmtDateTime(s.startedAt)}</td>
                  <td className="px-6 py-4 text-xs" style={{ color: 'var(--muted)' }}>{s.endedAt ? fmtDateTime(s.endedAt) : '-'}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 font-black text-[11px] tracking-widest" style={{ color: s.endedAt ? 'var(--muted)' : 'var(--green)' }}>
                      <span className={`w-2.5 h-2.5 rounded-full ${s.endedAt ? '' : 'animate-pulse'}`} style={{ background: s.endedAt ? 'var(--muted-2)' : 'var(--green)' }} />
                      {s.endedAt ? 'Ended' : 'On Standby'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {!s.endedAt && (
                      <button
                        onClick={() => endMutation.mutate(s.id)}
                        disabled={endMutation.isPending}
                        className="btn btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs ml-auto"
                      >
                        <StopCircle size={15} /> End
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" style={{ background: 'var(--surface)' }}>
            <div className="bg-brand-sidebar px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Timer size={18} className="text-brand-green" />
                <p className="text-sm font-bold text-white">Place Vehicle on Standby</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                <XIcon size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Vehicle *</label>
                <select className={inputCls + ' cursor-pointer'} style={inputStyle} value={form.vehicleId} onChange={e => setForm(f => ({ ...f, vehicleId: e.target.value }))}>
                  <option value="">Select vehicle…</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.registrationNumber}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Event / Reason *</label>
                <input className={inputCls} style={inputStyle} placeholder="e.g. Derby match standby" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Location</label>
                <input className={inputCls} style={inputStyle} placeholder="e.g. Kasarani Stadium" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Start Time</label>
                <input type="datetime-local" className={inputCls} style={inputStyle} value={form.startedAt} onChange={e => setForm(f => ({ ...f, startedAt: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Notes</label>
                <textarea rows={3} className={inputCls} style={inputStyle} placeholder="Optional notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3 justify-end" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost px-4 py-2 text-sm">Cancel</button>
              <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !formValid} className="btn btn-primary flex items-center gap-2 px-5 py-2 text-sm">
                <Plus size={14} /> {createMutation.isPending ? 'Saving…' : 'Log Standby'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StandbyPage;
