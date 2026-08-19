import { useState, useRef } from 'react';
import {
  Plus,
  Search as MagnifyingGlass,
  EllipsisVertical as DotsThreeVertical,
  Hospital,
  Pencil as PencilSimple,
  Check,
  X as XIcon,
  MapPin,
  Map as MapTrifold,
  LoaderCircle as Spinner,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotificationStore } from '@/stores/notificationStore';
import api from '@/api/client';
import { Facility } from '@/types/api';
import Map from '@/components/shared/Map';

const FACILITY_TYPES = ['Hospital', 'Health Centre', 'Clinic', 'Dispensary', 'Nursing Home', 'Maternity'];
const KEPH_LEVELS = [1, 2, 3, 4, 5, 6];
const NAIROBI_SUB_COUNTIES = [
  'Dagoretti North', 'Dagoretti South', 'Embakasi Central', 'Embakasi East',
  'Embakasi North', 'Embakasi South', 'Embakasi West', 'Kamukunji', 'Kasarani',
  "Kibra", "Lang'ata", 'Makadara', 'Mathare', 'Roysambu', 'Ruaraka', 'Starehe', 'Westlands',
];

// Nairobi centre
const NAIROBI: [number, number] = [-1.2864, 36.8172];

const kephBadge: Record<number, { bg: string; color: string }> = {
  1: { bg: 'var(--surface-2)', color: 'var(--muted)' },
  2: { bg: '#EFF6FF', color: '#1D4ED8' },
  3: { bg: '#FFFBEB', color: '#B45309' },
  4: { bg: '#FFF7ED', color: '#C2410C' },
  5: { bg: '#FEF2F2', color: '#B91C1C' },
  6: { bg: '#F5F3FF', color: '#7C3AED' },
};

const emptyForm = { name: '', type: 'Hospital', kephLevel: 3, subCounty: '' };

// ── input style helper (dark-mode safe) ──────────────────────────────────────
const inputCls =
  'w-full border rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-all';
const inputStyle = {
  background: 'var(--surface)',
  borderColor: 'var(--border)',
  color: 'var(--ink)',
};

function FacilitiesPage() {
  const [search, setSearch] = useState('');
  const [subCountyFilter, setSubCountyFilter] = useState('ALL');
  const [kephFilter, setKephFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Facility | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [locationQuery, setLocationQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const { data: facilities = [], isLoading } = useQuery({
    queryKey: ['admin', 'facilities', subCountyFilter, kephFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (subCountyFilter !== 'ALL') params.subCounty = subCountyFilter;
      if (kephFilter !== 'ALL') params.kephLevel = kephFilter;
      const res = await api.get('/admin/facilities', { params });
      return res.data.data as Facility[];
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/facilities', {
        name: form.name,
        type: form.type,
        kephLevel: Number(form.kephLevel),
        subCounty: form.subCounty,
        lat: pin!.lat,
        lng: pin!.lng,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'facilities'] });
      setShowModal(false);
      setForm(emptyForm);
      setPin(null);
      addNotification({ type: 'success', title: 'Facility Added', message: 'New facility registered.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not add facility.' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Facility> }) =>
      api.patch(`/admin/facilities/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'facilities'] });
      setEditTarget(null);
      setActionId(null);
      addNotification({ type: 'success', title: 'Updated', message: 'Facility updated.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not update facility.' });
    },
  });

  const filtered = facilities.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.subCounty.toLowerCase().includes(search.toLowerCase())
  );

  function handleLocationSearch(q: string) {
    setLocationQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 3) { setSuggestions([]); return; }
    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ', Nairobi, Kenya')}&limit=5&addressdetails=1`
        );
        const data = await res.json();
        setSuggestions(data ?? []);
        setShowSuggestions(true);
      } catch {} finally { setIsSearching(false); }
    }, 400);
  }

  function detectSubCounty(address: Record<string, string>): string {
    const candidates = [
      address.city_district, address.suburb, address.county,
      address.state_district, address.municipality,
    ].filter(Boolean).map(s => s.toLowerCase());
    for (const sub of NAIROBI_SUB_COUNTIES) {
      const subLower = sub.toLowerCase();
      if (candidates.some(c => c.includes(subLower) || subLower.includes(c))) return sub;
    }
    return '';
  }

  function selectSuggestion(s: any) {
    setPin({ lat: parseFloat(s.lat), lng: parseFloat(s.lon) });
    setLocationQuery(s.display_name.split(',').slice(0, 2).join(',').trim());
    const detected = detectSubCounty(s.address ?? {});
    if (detected) setForm(f => ({ ...f, subCounty: detected }));
    setSuggestions([]);
    setShowSuggestions(false);
  }

  async function handleMapClick(lat: number, lng: number) {
    setPin({ lat, lng });
    setIsReverseGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
      );
      const data = await res.json();
      if (data?.display_name) {
        setLocationQuery(data.display_name.split(',').slice(0, 2).join(',').trim());
        const detected = detectSubCounty(data.address ?? {});
        if (detected) setForm(f => ({ ...f, subCounty: detected }));
      }
    } catch {} finally { setIsReverseGeocoding(false); }
  }

  function openAdd() {
    setForm(emptyForm);
    setPin(null);
    setLocationQuery('');
    setSuggestions([]);
    setShowModal(true);
  }

  const formValid =
    form.name.trim().length >= 2 &&
    form.subCounty.trim().length >= 2 &&
    pin !== null;

  return (
    <div className="col" style={{ gap: 24 }}>

      {/* Header */}
      <div
        className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 p-4 sm:p-6 lg:p-8 rounded-xl border shadow-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-6 bg-brand-green rounded-full" />
            <p className="font-sans text-[11px] font-black tracking-[0.2em]" style={{ color: 'var(--muted)' }}>
              Medical Facilities Registry
            </p>
          </div>
          <h2 className="font-sans text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>
            Facilities
          </h2>
        </div>
        <button
          onClick={openAdd}
          className="btn btn-primary flex items-center gap-3 px-6 py-3 sm:px-8 sm:py-4 text-xs"
        >
          <Plus size={20} />
          Add Facility
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: facilities.length },
          { label: 'Active', value: facilities.filter(f => f.isActive).length },
          { label: 'Hospitals', value: facilities.filter(f => f.type === 'Hospital').length },
          { label: 'Sub-Counties', value: new Set(facilities.map(f => f.subCounty)).size },
        ].map(stat => (
          <div
            key={stat.label}
            className="p-6 rounded-xl border shadow-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="font-sans text-[10px] font-black tracking-[0.2em] mb-2" style={{ color: 'var(--muted)' }}>
              {stat.label}
            </div>
            <div className="font-sans text-4xl font-black leading-none" style={{ color: 'var(--ink)' }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        className="rounded-xl border p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 shadow-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="relative flex-1">
          <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-2)' }} />
          <input
            className={inputCls + ' pl-11'}
            style={inputStyle}
            placeholder="Search by name or sub-county…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          value={subCountyFilter}
          onChange={e => setSubCountyFilter(e.target.value)}
          className={inputCls + ' cursor-pointer'}
          style={{ ...inputStyle, width: 'auto' }}
        >
          <option value="ALL">All Sub-Counties</option>
          {NAIROBI_SUB_COUNTIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={kephFilter}
          onChange={e => setKephFilter(e.target.value)}
          className={inputCls + ' cursor-pointer'}
          style={{ ...inputStyle, width: 'auto' }}
        >
          <option value="ALL">All KEPH Levels</option>
          {KEPH_LEVELS.map(l => <option key={l} value={l}>Level {l}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-t-brand-green rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--green)' }} />
              <p className="font-black text-xs tracking-widest animate-pulse" style={{ color: 'var(--muted)' }}>Loading facilities…</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                  {['Facility', 'Type', 'KEPH Level', 'Sub-County', 'Coordinates', 'Status', ''].map(h => (
                    <th key={h} className="px-6 py-4 font-sans text-[10px] font-black tracking-[0.2em]" style={{ color: 'var(--muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <Hospital size={48} style={{ color: 'var(--border)' }} />
                        <p className="font-bold text-sm tracking-widest" style={{ color: 'var(--muted)' }}>No facilities found</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map((f, i) => (
                  <tr
                    key={f.id}
                    className="transition-colors"
                    style={{ borderTop: i > 0 ? `1px solid var(--border)` : undefined }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--green-light)' }}>
                          <Hospital size={18} style={{ color: 'var(--green)' }} />
                        </div>
                        <span className="font-black text-sm tracking-tight" style={{ color: 'var(--ink)' }}>{f.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{f.type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest"
                        style={{ background: kephBadge[f.kephLevel]?.bg ?? 'var(--surface-2)', color: kephBadge[f.kephLevel]?.color ?? 'var(--muted)' }}
                      >
                        Level {f.kephLevel}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                        <MapPin size={13} style={{ color: 'var(--muted-2)' }} />
                        {f.subCounty}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs" style={{ color: 'var(--muted-2)' }}>
                      {f.lat.toFixed(4)}, {f.lng.toFixed(4)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${f.isActive ? 'animate-pulse' : ''}`} style={{ background: f.isActive ? 'var(--green)' : 'var(--red)' }} />
                        <span className="font-black text-[11px] tracking-widest" style={{ color: f.isActive ? 'var(--ink)' : 'var(--red)' }}>
                          {f.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right relative">
                      <button
                        onClick={() => setActionId(actionId === f.id ? null : f.id)}
                        className="p-2.5 rounded-xl transition-all border border-transparent"
                        style={{ color: 'var(--muted-2)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--ink)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--muted-2)'; }}
                      >
                        <DotsThreeVertical size={22} />
                      </button>
                      {actionId === f.id && (
                        <div
                          className="absolute right-6 top-12 z-20 rounded-xl shadow-xl py-1 min-w-[170px] text-left border"
                          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                        >
                          <button
                            onClick={() => { setEditTarget(f); setActionId(null); }}
                            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold transition-colors"
                            style={{ color: 'var(--ink)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <PencilSimple size={15} /> Edit
                          </button>
                          <div className="my-0.5" style={{ borderTop: '1px solid var(--border)' }} />
                          <button
                            onClick={() => updateMutation.mutate({ id: f.id, data: { isActive: !f.isActive } })}
                            disabled={updateMutation.isPending}
                            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50"
                            style={{ color: f.isActive ? 'var(--red)' : 'var(--green)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            {f.isActive
                              ? <><XIcon size={15} /> Deactivate</>
                              : <><Check size={15} /> Activate</>}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Facility Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden" style={{ background: 'var(--surface)' }}>
            {/* Modal header */}
            <div className="bg-brand-sidebar px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Hospital size={18} className="text-brand-green" />
                <div>
                  <p className="text-xs text-slate-400 tracking-widest font-bold">Registry</p>
                  <p className="text-sm font-bold text-white">Add New Facility</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                <XIcon size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Fields row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] font-black tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>Facility Name *</label>
                  <input
                    className={inputCls}
                    style={inputStyle}
                    placeholder="e.g. Kenyatta National Hospital"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>Type *</label>
                  <select
                    className={inputCls + ' cursor-pointer'}
                    style={inputStyle}
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  >
                    {FACILITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>KEPH Level *</label>
                  <select
                    className={inputCls + ' cursor-pointer'}
                    style={inputStyle}
                    value={form.kephLevel}
                    onChange={e => setForm(f => ({ ...f, kephLevel: Number(e.target.value) }))}
                  >
                    {KEPH_LEVELS.map(l => <option key={l} value={l}>Level {l}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-black tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>Sub-County *</label>
                  <select
                    className={inputCls + ' cursor-pointer'}
                    style={inputStyle}
                    value={form.subCounty}
                    onChange={e => setForm(f => ({ ...f, subCounty: e.target.value }))}
                  >
                    <option value="">Select sub-county…</option>
                    {NAIROBI_SUB_COUNTIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Map picker */}
              <div>
                <label className="flex items-center gap-2 text-[10px] font-black tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                  <MapTrifold size={13} />
                  Location *
                </label>

                {/* Search box */}
                <div className="relative mb-2">
                  <div className="flex items-center border rounded-xl px-3 h-11 gap-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    {isSearching || isReverseGeocoding
                      ? <Spinner size={15} className="animate-spin flex-shrink-0" style={{ color: 'var(--muted-2)' }} />
                      : <MagnifyingGlass size={15} className="flex-shrink-0" style={{ color: 'var(--muted-2)' }} />}
                    <input
                      className="flex-1 text-sm font-medium bg-transparent outline-none"
                      style={{ color: 'var(--ink)' }}
                      placeholder="Search place or address…"
                      value={locationQuery}
                      onChange={e => handleLocationSearch(e.target.value)}
                      onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    />
                    {locationQuery && (
                      <button type="button" onClick={() => { setLocationQuery(''); setSuggestions([]); }} style={{ color: 'var(--muted-2)' }}>
                        <XIcon size={13} />
                      </button>
                    )}
                  </div>
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl shadow-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={() => selectSuggestion(s)}
                          className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                          style={{ color: 'var(--ink)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span className="font-semibold">{s.display_name.split(',').slice(0, 2).join(',')}</span>
                          <span className="text-xs ml-1" style={{ color: 'var(--muted-2)' }}>{s.display_name.split(',').slice(2, 4).join(',')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Map */}
                <div className="rounded-xl overflow-hidden border" style={{ height: 240, borderColor: 'var(--border)' }}>
                  <Map
                    center={pin ? [pin.lat, pin.lng] : NAIROBI}
                    zoom={pin ? 15 : 13}
                    markers={pin ? [{ id: 'pin', lat: pin.lat, lng: pin.lng, title: form.name || 'Facility', type: 'facility' }] : []}
                    onLocationSelect={handleMapClick}
                    layerType="light"
                    className="h-full w-full"
                  />
                </div>
                {pin ? (
                  <p className="mt-1.5 text-xs font-mono font-semibold" style={{ color: 'var(--muted)' }}>
                    {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs" style={{ color: 'var(--muted-2)' }}>
                    Search above or click the map to pin the location
                  </p>
                )}
              </div>
            </div>

            <div className="px-5 pb-5 flex gap-3 justify-end" style={{ borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => setShowModal(false)}
                className="btn btn-ghost px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !formValid}
                className="btn btn-primary flex items-center gap-2 px-5 py-2 text-sm"
              >
                <Plus size={14} />
                {createMutation.isPending ? 'Adding…' : 'Add Facility'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Facility Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditTarget(null)} />
          <div className="relative rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" style={{ background: 'var(--surface)' }}>
            <div className="bg-brand-sidebar px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PencilSimple size={18} className="text-brand-green" />
                <div>
                  <p className="text-xs text-slate-400 tracking-widest font-bold">Edit Facility</p>
                  <p className="text-sm font-bold text-white truncate max-w-[220px]">{editTarget.name}</p>
                </div>
              </div>
              <button onClick={() => setEditTarget(null)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                <XIcon size={16} />
              </button>
            </div>
            <EditFacilityForm
              facility={editTarget}
              onSave={data => updateMutation.mutate({ id: editTarget.id, data })}
              onCancel={() => setEditTarget(null)}
              isPending={updateMutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EditFacilityForm({ facility, onSave, onCancel, isPending }: {
  facility: Facility;
  onSave: (data: Partial<Facility>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(facility.name);
  const [type, setType] = useState(facility.type);
  const [kephLevel, setKephLevel] = useState(facility.kephLevel);

  const inputStyle = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' };

  return (
    <>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-[10px] font-black tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>Name</label>
          <input
            className="w-full border rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-all"
            style={inputStyle}
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] font-black tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>Type</label>
          <select className="w-full border rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-all cursor-pointer" style={inputStyle} value={type} onChange={e => setType(e.target.value)}>
            {FACILITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>KEPH Level</label>
          <select className="w-full border rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-all cursor-pointer" style={inputStyle} value={kephLevel} onChange={e => setKephLevel(Number(e.target.value))}>
            {KEPH_LEVELS.map(l => <option key={l} value={l}>Level {l}</option>)}
          </select>
        </div>
      </div>
      <div className="px-5 pb-5 flex gap-3 justify-end" style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={onCancel} className="btn btn-ghost px-4 py-2 text-sm">Cancel</button>
        <button
          onClick={() => onSave({ name, type, kephLevel })}
          disabled={isPending || name.trim().length < 2}
          className="btn btn-primary flex items-center gap-2 px-5 py-2 text-sm"
        >
          <Check size={14} />
          {isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </>
  );
}

export default FacilitiesPage;
