import { useState } from 'react';
import {
  Plus,
  Search as MagnifyingGlass,
  EllipsisVertical as DotsThreeVertical,
  Tag,
  Trash2 as Trash,
  X as XIcon,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotificationStore } from '@/stores/notificationStore';
import api from '@/api/client';

interface NatureOption {
  id: string;
  nature: string;
  detail: string | null;
  createdAt: string;
}

const inputCls = 'w-full border rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-all';
const inputStyle = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' };

function NatureOptionsPage() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'nature' | 'detail'>('nature');
  const [newNature, setNewNature] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [selectedNatureForDetail, setSelectedNatureForDetail] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [expandedNatures, setExpandedNatures] = useState<Set<string>>(new Set());

  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const { data: options = [], isLoading } = useQuery<NatureOption[]>({
    queryKey: ['nature-options'],
    queryFn: async () => {
      const res = await api.get('/admin/nature-options');
      return res.data.data as NatureOption[];
    },
  });

  const addMutation = useMutation({
    mutationFn: (body: { nature: string; detail?: string }) =>
      api.post('/admin/nature-options', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nature-options'] });
      setShowModal(false);
      setNewNature(''); setNewDetail(''); setSelectedNatureForDetail('');
      addNotification({ type: 'success', title: 'Added', message: 'Nature option saved.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not add option.' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/nature-options/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nature-options'] });
      setActionId(null);
      addNotification({ type: 'success', title: 'Deleted', message: 'Option removed.' });
    },
  });

  // Group options by nature
  const grouped = options.reduce<Record<string, { topLevel: NatureOption | null; details: NatureOption[] }>>((acc, opt) => {
    if (!acc[opt.nature]) acc[opt.nature] = { topLevel: null, details: [] };
    if (!opt.detail) acc[opt.nature].topLevel = opt;
    else acc[opt.nature].details.push(opt);
    return acc;
  }, {});

  const uniqueNatures = Object.keys(grouped).sort();
  const filteredNatures = uniqueNatures.filter(n =>
    n.toLowerCase().includes(search.toLowerCase()) ||
    grouped[n].details.some(d => d.detail?.toLowerCase().includes(search.toLowerCase()))
  );

  const totalNatures = uniqueNatures.length;
  const totalDetails = options.filter(o => o.detail).length;

  function toggleExpand(nature: string) {
    setExpandedNatures(prev => {
      const next = new Set(prev);
      next.has(nature) ? next.delete(nature) : next.add(nature);
      return next;
    });
  }

  function openAddNature() {
    setModalMode('nature');
    setNewNature(''); setNewDetail(''); setSelectedNatureForDetail('');
    setShowModal(true);
  }

  function openAddDetail(nature?: string) {
    setModalMode('detail');
    setNewNature(''); setNewDetail('');
    setSelectedNatureForDetail(nature || '');
    setShowModal(true);
  }

  function handleSubmit() {
    if (modalMode === 'nature') {
      if (!newNature.trim()) return;
      addMutation.mutate({ nature: newNature.trim() });
    } else {
      if (!selectedNatureForDetail || !newDetail.trim()) return;
      addMutation.mutate({ nature: selectedNatureForDetail, detail: newDetail.trim() });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Page header */}
      <div style={{ borderLeft: '4px solid var(--green)', paddingLeft: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 4 }}>
            Incident Classification
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            Nature Options
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => openAddDetail()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            <Plus size={15} /> Add Specific Nature
          </button>
          <button
            onClick={openAddNature}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--green)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            <Plus size={15} /> Add Category
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { label: 'Total Categories', value: totalNatures },
          { label: 'Total Specific Natures', value: totalDetails },
          { label: 'Total Options', value: options.length },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 8 }}>{s.label}</p>
            <p style={{ fontSize: 36, fontWeight: 900, color: 'var(--ink)', lineHeight: 1 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search + table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        {/* Search bar */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <MagnifyingGlass size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              style={{ width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, background: 'var(--surface-2)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
              placeholder="Search categories or specific natures…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 120px 80px', gap: 0, padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          {['Category', 'Specific Natures', 'Created', ''].map(h => (
            <span key={h} style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--muted)' }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        {isLoading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Loading…</div>
        ) : filteredNatures.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            {search ? 'No results found.' : 'No nature options yet. Add a category above.'}
          </div>
        ) : (
          filteredNatures.map(nature => {
            const group = grouped[nature];
            const isExpanded = expandedNatures.has(nature);
            const detailCount = group.details.length;
            const topCreated = group.topLevel
              ? new Date(group.topLevel.createdAt).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' })
              : '-';

            return (
              <div key={nature} style={{ borderBottom: '1px solid var(--border)' }}>
                {/* Nature row */}
                <div
                  style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 120px 80px', gap: 0, padding: '14px 24px', alignItems: 'center', cursor: detailCount > 0 ? 'pointer' : 'default' }}
                  onClick={() => detailCount > 0 && toggleExpand(nature)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Tag size={16} color="var(--green)" />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--ink)' }}>{nature}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {detailCount > 0 ? (
                      <>
                        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                          {detailCount} specific {detailCount === 1 ? 'nature' : 'natures'}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                      </>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); openAddDetail(nature); }}
                        style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, background: 'none', border: '1px dashed var(--green)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
                      >
                        + Add specific
                      </button>
                    )}
                  </div>

                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{topCreated}</span>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', position: 'relative' }}>
                    <button
                      onClick={e => { e.stopPropagation(); setActionId(actionId === nature ? null : nature); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, borderRadius: 6 }}
                    >
                      <DotsThreeVertical size={18} />
                    </button>
                    {actionId === nature && (
                      <div style={{ position: 'absolute', right: 0, top: 28, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 160, overflow: 'hidden' }}>
                        <button
                          onClick={e => { e.stopPropagation(); openAddDetail(nature); setActionId(null); }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', fontSize: 13, color: 'var(--ink)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <Plus size={14} /> Add specific nature
                        </button>
                        {group.topLevel && (
                          <button
                            onClick={e => { e.stopPropagation(); deleteMutation.mutate(group.topLevel!.id); }}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', fontSize: 13, color: '#ef4444', background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}
                          >
                            <Trash size={14} color="#ef4444" /> Delete category
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded detail rows */}
                {isExpanded && group.details.map(detail => (
                  <div
                    key={detail.id}
                    style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 120px 80px', gap: 0, padding: '10px 24px 10px 64px', alignItems: 'center', background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>↳</span>
                    <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{detail.detail}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(detail.createdAt).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi' })}</span>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => deleteMutation.mutate(detail.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, borderRadius: 6 }}
                      >
                        <Trash size={15} color="#ef4444" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowModal(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 32, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--ink)' }}>
                {modalMode === 'nature' ? 'Add Nature Category' : 'Add Specific Nature'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <XIcon size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {modalMode === 'detail' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                    Category <span style={{ color: 'red' }}>*</span>
                  </label>
                  <select
                    className={inputCls}
                    style={inputStyle}
                    value={selectedNatureForDetail}
                    onChange={e => setSelectedNatureForDetail(e.target.value)}
                  >
                    <option value="">Select a category…</option>
                    {uniqueNatures.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                  {modalMode === 'nature' ? 'Category Name' : 'Specific Nature'} <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  className={inputCls}
                  style={inputStyle}
                  placeholder={modalMode === 'nature' ? 'e.g. Trauma' : 'e.g. Road Traffic Accident'}
                  value={modalMode === 'nature' ? newNature : newDetail}
                  onChange={e => modalMode === 'nature' ? setNewNature(e.target.value) : setNewDetail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  autoFocus
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={addMutation.isPending}
                style={{ flex: 2, padding: '12px 0', borderRadius: 12, border: 'none', background: 'var(--green)', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: addMutation.isPending ? 0.7 : 1 }}
              >
                {addMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click-away for action menus */}
      {actionId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setActionId(null)} />
      )}
    </div>
  );
}
export default NatureOptionsPage;
