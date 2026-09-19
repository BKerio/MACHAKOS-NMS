import { useState } from 'react';
import {
  Plus,
  Search as MagnifyingGlass,
  MapPin,
  Trash2,
  X as XIcon,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotificationStore } from '@/stores/notificationStore';
import api from '@/api/client';

interface SubCounty {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

const inputCls = 'w-full border rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-all';
const inputStyle = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' };

function SubCountiesPage() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SubCounty | null>(null);
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const { data: subCounties = [], isLoading } = useQuery<SubCounty[]>({
    queryKey: ['admin', 'sub-counties'],
    queryFn: async () => {
      const res = await api.get('/admin/sub-counties');
      return res.data.data as SubCounty[];
    },
  });

  const addMutation = useMutation({
    mutationFn: (name: string) => api.post('/admin/sub-counties', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sub-counties'] });
      setShowModal(false);
      setNewName('');
      addNotification({ type: 'success', title: 'Sub-County Added', message: 'The new sub-county is now available across the app.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not add sub-county.' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/sub-counties/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sub-counties'] });
      setDeleteTarget(null);
      addNotification({ type: 'success', title: 'Sub-County Removed', message: 'It will no longer appear in dropdowns.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not remove sub-county.' });
    },
  });

  const filtered = subCounties.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  function submit() {
    const name = newName.trim();
    if (name.length < 2) return;
    addMutation.mutate(name);
  }

  return (
    <div className="col" style={{ gap: 24 }}>

      {/* Header */}
      <div
        className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 p-4 sm:p-6 lg:p-8 rounded-xl border shadow-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div>
          <p className="font-sans text-[11px] font-black tracking-[0.2em] mb-1" style={{ color: 'var(--muted)' }}>
            Administrative Regions
          </p>
          <h2 className="font-sans text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>
            Sub-Counties
          </h2>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn btn-primary flex items-center gap-3 px-6 py-3 sm:px-8 sm:py-4 text-xs"
        >
          <Plus size={20} />
          Add Sub-County
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-6 rounded-xl border shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="font-sans text-[10px] font-black tracking-[0.2em] mb-2" style={{ color: 'var(--muted)' }}>Total Sub-Counties</div>
          <div className="font-sans text-4xl font-black leading-none" style={{ color: 'var(--ink)' }}>{subCounties.length}</div>
        </div>
        <div className="p-6 rounded-xl border shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            This list feeds the Sub-County choices on the Facilities registry and the New Incident form.
            Removing one only hides it from future selections; existing records that already reference it are unaffected.
          </p>
        </div>
      </div>

      {/* Search */}
      <div
        className="rounded-xl border p-4 flex items-center gap-4 shadow-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="relative flex-1">
          <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-2)' }} />
          <input
            className={inputCls + ' pl-11'}
            style={inputStyle}
            placeholder="Search sub-counties…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-t-brand-green rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--green)' }} />
            <p className="font-black text-xs tracking-widest animate-pulse" style={{ color: 'var(--muted)' }}>Loading sub-counties…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
            <MapPin size={48} style={{ color: 'var(--border)' }} />
            <p className="font-bold text-sm tracking-widest" style={{ color: 'var(--muted)' }}>
              {search ? 'No matches found' : 'No sub-counties yet'}
            </p>
          </div>
        ) : (
          <div>
            {filtered.map((s, i) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-6 py-4 transition-colors"
                style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--green-light)' }}>
                    <MapPin size={16} style={{ color: 'var(--green)' }} />
                  </div>
                  <span className="font-bold text-sm tracking-tight" style={{ color: 'var(--ink)' }}>{s.name}</span>
                </div>
                <button
                  onClick={() => setDeleteTarget(s)}
                  title="Remove Sub-County"
                  className="p-2 rounded-lg border transition-colors hover:opacity-70"
                  style={{ borderColor: 'var(--border)', color: 'var(--red)', background: 'var(--surface)' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Sub-County Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" style={{ background: 'var(--surface)' }}>
            <div className="bg-brand-sidebar px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MapPin size={18} className="text-brand-green" />
                <div>
                  <p className="text-xs text-slate-400 tracking-widest font-bold">Administrative Regions</p>
                  <p className="text-sm font-bold text-white">Add New Sub-County</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                <XIcon size={16} />
              </button>
            </div>
            <div className="p-5">
              <label className="block text-[10px] font-black tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>Name *</label>
              <input
                className={inputCls}
                style={inputStyle}
                placeholder="e.g. Kathiani"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                autoFocus
              />
            </div>
            <div className="px-5 pb-5 flex gap-3 justify-end" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost px-4 py-2 text-sm">Cancel</button>
              <button
                onClick={submit}
                disabled={addMutation.isPending || newName.trim().length < 2}
                className="btn btn-primary flex items-center gap-2 px-5 py-2 text-sm"
              >
                <Plus size={14} />
                {addMutation.isPending ? 'Adding…' : 'Add Sub-County'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !deleteMutation.isPending && setDeleteTarget(null)}
          />
          <div
            className="relative rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div
              className="px-5 py-4 flex items-center gap-3"
              style={{ borderBottom: '1px solid var(--border)', background: 'var(--red)', color: '#fff' }}
            >
              <Trash2 size={18} />
              <div>
                <p className="text-xs tracking-widest font-bold opacity-80">Remove Sub-County</p>
                <p className="text-sm font-bold">{deleteTarget.name}</p>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
                This removes it from future Sub-County dropdowns on Facilities and New Incident forms.
                Existing facilities or incidents already tagged with it keep that value untouched.
              </p>
            </div>
            <div className="px-5 pb-5 flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 border text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 text-white text-sm font-bold rounded-xl transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--red)' }}
              >
                <Trash2 size={14} />
                {deleteMutation.isPending ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SubCountiesPage;
