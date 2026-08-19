import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search as MagnifyingGlass,
  Handshake,
  Mail as EnvelopeSimple,
  Phone,
  MapPin,
  Users,
  Pencil as PencilSimple,
  X as XIcon,
  CircleCheck as CheckCircle,
  Building2 as Buildings,
} from 'lucide-react';
import api from '@/api/client';
import { Agency, User } from '@/types/api';
import { useNotificationStore } from '@/stores/notificationStore';
import PartnerOnboardingModal from '@/components/shared/PartnerOnboardingModal';

const inputCls = 'w-full border rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-all';
const inputStyle = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' };
const labelCls = 'block text-[10px] font-black tracking-widest mb-2';

// Partner specialties - a case flagged with one of these auto-SMSes matching partners.
const NICHE_OPTIONS = ['GBV', 'MCI'];

// Read contact fields out of the agency's contactInfo JSON blob
function contactOf(agency: Agency): { email: string; phone: string; niches: string[] } {
  const info = (agency.contactInfo ?? {}) as Record<string, unknown>;
  return {
    email: typeof info.email === 'string' ? info.email : '',
    phone: typeof info.phone === 'string' ? info.phone : '',
    niches: Array.isArray(info.niches) ? (info.niches as unknown[]).map(String) : [],
  };
}

function PartnersPage() {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const [search, setSearch] = useState('');
  const [showOnboard, setShowOnboard] = useState(false);
  const [editTarget, setEditTarget] = useState<Agency | null>(null);
  const [editForm, setEditForm] = useState({ email: '', phone: '', niches: [] as string[] });

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ['admin', 'agencies', 'PARTNER'],
    queryFn: async () => {
      const res = await api.get('/admin/agencies');
      return (res.data.data as Agency[]).filter(a => a.type === 'PARTNER');
    },
  });

  const { data: partnerUsers = [] } = useQuery({
    queryKey: ['admin', 'users', 'PARTNER'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=PARTNER&limit=200');
      return res.data.data as User[];
    },
  });

  const usersByAgency = (agencyId: string) => partnerUsers.filter(u => u.agencyId === agencyId);

  const updateContactMutation = useMutation({
    mutationFn: ({ id, existing }: { id: string; existing: Record<string, unknown> }) =>
      api.patch(`/admin/agencies/${id}`, {
        contactInfo: { ...existing, email: editForm.email, phone: editForm.phone, niches: editForm.niches },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'agencies'] });
      setEditTarget(null);
      addNotification({ type: 'success', title: 'Contact Updated', message: 'Partner contact details saved.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not update contact.' });
    },
  });

  function openEdit(agency: Agency) {
    const c = contactOf(agency);
    setEditForm({ email: c.email, phone: c.phone, niches: c.niches });
    setEditTarget(agency);
  }

  const toggleNiche = (n: string) =>
    setEditForm(f => ({ ...f, niches: f.niches.includes(n) ? f.niches.filter(x => x !== n) : [...f.niches, n] }));

  const filtered = partners.filter(p => {
    const c = contactOf(p);
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q);
  });

  const contactable = partners.filter(p => { const c = contactOf(p); return c.email && c.phone; }).length;

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
              Partner Organizations
            </p>
          </div>
          <h2 className="font-sans text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>
            Partners
          </h2>
        </div>
        <button
          onClick={() => setShowOnboard(true)}
          className="btn btn-primary flex items-center gap-3 px-6 py-3 sm:px-8 sm:py-4 text-xs"
        >
          <Plus size={20} />
          Add Partner
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Partners', value: partners.length },
          { label: 'Active', value: partners.filter(p => p.isActive).length },
          { label: 'Partner Users', value: partnerUsers.length },
          { label: 'With Full Contact', value: contactable },
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

      {/* Search */}
      <div
        className="rounded-xl border p-4 shadow-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-2)' }} />
          <input
            className={inputCls + ' pl-11'}
            style={inputStyle}
            placeholder="Search by name, email or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-center py-10 font-bold" style={{ color: 'var(--muted)' }}>Loading partners…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border p-10 text-center shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <Handshake size={40} className="mx-auto mb-3" style={{ color: 'var(--muted-2)' }} />
          <p className="font-bold" style={{ color: 'var(--ink)' }}>No partners yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Click “Add Partner” to onboard your first partner organization.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(partner => {
            const c = contactOf(partner);
            const users = usersByAgency(partner.id);
            return (
              <div
                key={partner.id}
                className="rounded-xl border shadow-sm p-5"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl flex-shrink-0" style={{ background: 'var(--surface-2)' }}>
                      <Buildings size={20} className="text-brand-teal" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold truncate" style={{ color: 'var(--ink)' }}>{partner.name}</p>
                      {partner.location && (
                        <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--muted)' }}>
                          <MapPin size={12} />{partner.location}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className="text-[10px] font-black tracking-wide px-2 py-1 rounded-full flex-shrink-0"
                    style={partner.isActive
                      ? { background: '#ECFDF5', color: '#047857' }
                      : { background: 'var(--surface-2)', color: 'var(--muted)' }}
                  >
                    {partner.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Contact */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[9px] font-black tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Contact Email</p>
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="text-sm font-semibold text-brand-teal flex items-center gap-1.5 truncate hover:underline">
                        <EnvelopeSimple size={14} />{c.email}
                      </a>
                    ) : (
                      <p className="text-sm font-semibold text-amber-500 flex items-center gap-1.5"><EnvelopeSimple size={14} />Missing</p>
                    )}
                  </div>
                  <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[9px] font-black tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Contact Phone</p>
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className="text-sm font-semibold text-brand-teal flex items-center gap-1.5 truncate hover:underline">
                        <Phone size={14} />{c.phone}
                      </a>
                    ) : (
                      <p className="text-sm font-semibold text-amber-500 flex items-center gap-1.5"><Phone size={14} />Missing</p>
                    )}
                  </div>
                </div>

                {/* Users */}
                <div className="mt-4">
                  <p className="text-[9px] font-black tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                    <Users size={12} />Partner Users · {users.length}
                  </p>
                  {users.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--muted-2)' }}>No user accounts linked yet.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {users.map(u => (
                        <div key={u.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold truncate" style={{ color: 'var(--ink)' }}>{u.name}</span>
                          <span className="truncate" style={{ color: 'var(--muted)' }}>{u.phone || u.email}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Niches - a case with a matching flag auto-SMSes this partner */}
                <div className="mt-4">
                  <p className="text-[9px] font-black tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                    Auto-notify Niches
                  </p>
                  {c.niches.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--muted-2)' }}>None - won't be auto-notified.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {c.niches.map(n => (
                        <span key={n} className="text-[10px] font-black tracking-wide px-2 py-1 rounded-full" style={{ background: '#EEF2FF', color: '#4338CA' }}>
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t flex justify-end" style={{ borderColor: 'var(--border)' }}>
                  <button
                    onClick={() => openEdit(partner)}
                    className="flex items-center gap-1.5 text-xs font-bold text-brand-teal hover:opacity-70 transition-opacity"
                  >
                    <PencilSimple size={14} />Edit contact &amp; niches
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Onboard modal (create partner agency + user) */}
      <PartnerOnboardingModal isOpen={showOnboard} onClose={() => setShowOnboard(false)} />

      {/* Edit contact modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditTarget(null)} />
          <div className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--surface)' }}>
            <div className="bg-brand-sidebar px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Handshake size={18} className="text-brand-green" />
                <h3 className="text-white font-bold text-sm">Edit Partner Contact</h3>
              </div>
              <button onClick={() => setEditTarget(null)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                <XIcon size={18} />
              </button>
            </div>
            <form
              onSubmit={e => { e.preventDefault(); updateContactMutation.mutate({ id: editTarget.id, existing: (editTarget.contactInfo ?? {}) as Record<string, unknown> }); }}
              className="p-5 space-y-4"
            >
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{editTarget.name}</p>
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}><EnvelopeSimple size={12} className="inline mr-1" />Contact Email *</label>
                <input required type="email" className={inputCls} style={inputStyle} placeholder="ops@partneragency.org" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}><Phone size={12} className="inline mr-1" />Contact Phone *</label>
                <input required type="tel" className={inputCls} style={inputStyle} placeholder="+254712345678" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>Auto-notify Niches</label>
                <div className="flex flex-wrap gap-2">
                  {NICHE_OPTIONS.map(n => {
                    const on = editForm.niches.includes(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => toggleNiche(n)}
                        className="px-3 py-2 rounded-lg border text-xs font-bold transition-all"
                        style={on
                          ? { background: '#4338CA', color: '#fff', borderColor: 'transparent' }
                          : { background: 'var(--surface-2)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                      >
                        {on ? '✓ ' : ''}{n}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--muted)' }}>
                  When a case is flagged with a selected niche, this partner is texted automatically.
                </p>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setEditTarget(null)} className="px-4 py-2.5 text-sm font-bold rounded-xl" style={{ color: 'var(--muted)' }}>Cancel</button>
                <button
                  type="submit"
                  disabled={!editForm.email.trim() || !editForm.phone.trim() || updateContactMutation.isPending}
                  className="flex items-center gap-2 px-6 py-2.5 bg-brand-teal text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-40"
                >
                  <CheckCircle size={16} />
                  {updateContactMutation.isPending ? 'Saving…' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PartnersPage;
