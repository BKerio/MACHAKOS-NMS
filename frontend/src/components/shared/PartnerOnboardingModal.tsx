import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Handshake,
  Building2 as Buildings,
  UserPlus,
  Mail as EnvelopeSimple,
  Lock,
  Phone,
  MapPin,
  ArrowRight,
  ArrowLeft,
  Check,
  UserCog as UserGear,
} from 'lucide-react';
import api from '@/api/client';
import { useNotificationStore } from '@/stores/notificationStore';
import { Agency, User } from '@/types/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'create' | 'assign';

const fieldCls =
  'w-full border rounded-lg px-3 py-2.5 text-sm font-semibold outline-none transition-colors';
const fieldStyle = {
  background: 'var(--surface)',
  borderColor: 'var(--border)',
  color: 'var(--ink)',
};
const labelCls = 'block text-[10px] font-black tracking-widest mb-1.5';

function PartnerOnboardingModal({ isOpen, onClose }: Props) {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const [tab, setTab] = useState<Tab>('create');

  const [step, setStep] = useState<1 | 2>(1);
  const [createdAgencyId, setCreatedAgencyId] = useState('');
  const [agencyForm, setAgencyForm] = useState({
    name: '',
    location: '',
    contactEmail: '',
    contactPhone: '',
    niches: [] as string[],
  });
  const [userForm, setUserForm] = useState({ name: '', email: '', passwordRaw: '', phone: '' });

  const [assignUserId, setAssignUserId] = useState('');
  const [assignAgencyId, setAssignAgencyId] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const { data: partnerAgencies = [] } = useQuery({
    queryKey: ['admin', 'agencies', 'PARTNER'],
    queryFn: async () => {
      const res = await api.get('/admin/agencies');
      return (res.data.data as Agency[]).filter(a => a.type === 'PARTNER');
    },
    enabled: isOpen,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['admin', 'users', 'all-for-assign'],
    queryFn: async () => {
      const res = await api.get('/admin/users?limit=200');
      return res.data.data as User[];
    },
    enabled: isOpen && tab === 'assign',
  });

  const filteredUsers = allUsers.filter(u =>
    u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const createAgencyMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/agencies', {
        name: agencyForm.name,
        type: 'PARTNER',
        location: agencyForm.location || undefined,
        contactInfo: {
          email: agencyForm.contactEmail,
          phone: agencyForm.contactPhone,
          niches: agencyForm.niches,
        },
      }),
    onSuccess: (res) => {
      const agency = res.data.data as Agency;
      setCreatedAgencyId(agency.id);
      queryClient.invalidateQueries({ queryKey: ['admin', 'agencies'] });
      setStep(2);
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Agency Creation Failed',
        message: err?.response?.data?.message || 'Could not create partner agency.',
      });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/users', {
        name: userForm.name,
        email: userForm.email,
        passwordRaw: userForm.passwordRaw,
        phone: userForm.phone || undefined,
        role: 'PARTNER',
        agencyId: createdAgencyId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      addNotification({
        type: 'success',
        title: 'Partner Onboarded',
        message: `${userForm.name} has been set up as a partner user.`,
      });
      handleClose();
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'User Creation Failed',
        message: err?.response?.data?.message || 'Could not create partner user.',
      });
    },
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      api.patch(`/admin/users/${assignUserId}`, {
        role: 'PARTNER',
        agencyId: assignAgencyId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      addNotification({
        type: 'success',
        title: 'Partner Assigned',
        message: 'User has been reassigned as a partner.',
      });
      handleClose();
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Assignment Failed',
        message: err?.response?.data?.message || 'Could not assign partner role.',
      });
    },
  });

  function handleClose() {
    setTab('create');
    setStep(1);
    setCreatedAgencyId('');
    setAgencyForm({ name: '', location: '', contactEmail: '', contactPhone: '', niches: [] });
    setUserForm({ name: '', email: '', passwordRaw: '', phone: '' });
    setAssignUserId('');
    setAssignAgencyId('');
    setUserSearch('');
    onClose();
  }

  if (!isOpen) return null;

  const headerTitle =
    tab === 'assign'
      ? 'Assign Partner'
      : step === 1
        ? agencyForm.name.trim() || 'New Partner'
        : userForm.name.trim() || agencyForm.name.trim() || 'Partner User';

  const headerSub =
    tab === 'assign'
      ? 'Link an existing user to a partner agency'
      : step === 1
        ? 'Step 1 of 2 · Agency details'
        : 'Step 2 of 2 · User account';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div
        className="relative w-full max-w-md rounded-2xl shadow-xl overflow-hidden border flex flex-col max-h-[90vh]"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="h-1 w-full bg-brand-green flex-shrink-0" />

        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}
            >
              {tab === 'assign' ? <UserGear size={18} /> : step === 2 ? <UserPlus size={18} /> : <Handshake size={18} />}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-base leading-tight truncate" style={{ color: 'var(--ink)' }}>
                {headerTitle}
              </h2>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
                {headerSub}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            type="button"
            className="p-2 rounded-lg transition-colors flex-shrink-0"
            style={{ color: 'var(--muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode switch */}
        <div className="px-5 pt-3 flex-shrink-0">
          <div
            className="grid grid-cols-2 gap-1 p-1 rounded-xl"
            style={{ background: 'var(--surface-2)' }}
          >
            {([
              ['create', 'Create', UserPlus],
              ['assign', 'Assign', UserGear],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-black tracking-wide transition-colors"
                style={
                  tab === id
                    ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                    : { color: 'var(--muted)' }
                }
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Create tab */}
        {tab === 'create' && (
          <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">
            {/* Compact step rail */}
            <div className="flex items-center gap-2">
              {[
                { n: 1, label: 'Agency' },
                { n: 2, label: 'User' },
              ].map((s, i) => {
                const done = step > s.n;
                const active = step === s.n;
                return (
                  <div key={s.n} className="flex items-center gap-2 flex-1 min-w-0">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0"
                      style={
                        done || active
                          ? { background: 'var(--ink)', color: 'var(--surface)' }
                          : { background: 'var(--surface-2)', color: 'var(--muted)' }
                      }
                    >
                      {done ? <Check size={12} strokeWidth={3} /> : s.n}
                    </div>
                    <span
                      className="text-[11px] font-bold truncate"
                      style={{ color: active || done ? 'var(--ink)' : 'var(--muted)' }}
                    >
                      {s.label}
                    </span>
                    {i === 0 && (
                      <div
                        className="flex-1 h-px mx-1"
                        style={{ background: done ? 'var(--ink)' : 'var(--border)' }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {step === 1 && (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  createAgencyMutation.mutate();
                }}
                className="flex flex-col gap-3 flex-1"
              >
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    <Buildings size={11} className="inline mr-1 -mt-0.5" />
                    Agency Name *
                  </label>
                  <input
                    required
                    className={fieldCls}
                    style={fieldStyle}
                    placeholder="St. John Ambulance Kenya"
                    value={agencyForm.name}
                    onChange={e => setAgencyForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>

                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    <MapPin size={11} className="inline mr-1 -mt-0.5" />
                    Location
                  </label>
                  <input
                    className={fieldCls}
                    style={fieldStyle}
                    placeholder="Upper Hill, Nairobi"
                    value={agencyForm.location}
                    onChange={e => setAgencyForm(f => ({ ...f, location: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls} style={{ color: 'var(--muted)' }}>
                      <EnvelopeSimple size={11} className="inline mr-1 -mt-0.5" />
                      Email *
                    </label>
                    <input
                      required
                      type="email"
                      className={fieldCls}
                      style={fieldStyle}
                      placeholder="ops@partner.org"
                      value={agencyForm.contactEmail}
                      onChange={e => setAgencyForm(f => ({ ...f, contactEmail: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelCls} style={{ color: 'var(--muted)' }}>
                      <Phone size={11} className="inline mr-1 -mt-0.5" />
                      Phone *
                    </label>
                    <input
                      required
                      type="tel"
                      className={fieldCls}
                      style={fieldStyle}
                      placeholder="+254..."
                      value={agencyForm.contactPhone}
                      onChange={e => setAgencyForm(f => ({ ...f, contactPhone: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    Auto-notify niches
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {['GBV', 'MCI'].map(n => {
                      const on = agencyForm.niches.includes(n);
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() =>
                            setAgencyForm(f => ({
                              ...f,
                              niches: on ? f.niches.filter(x => x !== n) : [...f.niches, n],
                            }))
                          }
                          className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[10px] font-black tracking-wide transition-colors"
                          style={
                            on
                              ? {
                                  background: 'var(--ink)',
                                  borderColor: 'var(--ink)',
                                  color: 'var(--surface)',
                                }
                              : {
                                  background: 'var(--surface)',
                                  borderColor: 'var(--border)',
                                  color: 'var(--muted)',
                                }
                          }
                        >
                          {on && <Check size={11} strokeWidth={3} />}
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: 'var(--muted)' }}>
                    Selected niches trigger an automatic SMS to this partner.
                  </p>
                </div>

                <div
                  className="flex items-center gap-2 pt-3 mt-auto"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl border transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      !agencyForm.name.trim() ||
                      !agencyForm.contactEmail.trim() ||
                      !agencyForm.contactPhone.trim() ||
                      createAgencyMutation.isPending
                    }
                    className="btn btn-primary flex-[1.4] flex items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:opacity-40"
                  >
                    {createAgencyMutation.isPending ? (
                      'Creating...'
                    ) : (
                      <>
                        Continue
                        <ArrowRight size={15} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {step === 2 && (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  createUserMutation.mutate();
                }}
                className="flex flex-col gap-3 flex-1"
              >
                <div
                  className="rounded-xl px-3 py-2.5 text-[11px] font-semibold flex items-start gap-2 border"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                >
                  <Check size={14} className="text-brand-green mt-0.5 flex-shrink-0" />
                  <span>
                    <span className="font-black">{agencyForm.name}</span> is ready. Add the login account next.
                  </span>
                </div>

                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    Full Name *
                  </label>
                  <input
                    required
                    className={fieldCls}
                    style={fieldStyle}
                    placeholder="Jane Mwangi"
                    value={userForm.name}
                    onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>

                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    <EnvelopeSimple size={11} className="inline mr-1 -mt-0.5" />
                    Email *
                  </label>
                  <input
                    required
                    type="email"
                    className={fieldCls}
                    style={fieldStyle}
                    placeholder="jane@partner.org"
                    value={userForm.email}
                    onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls} style={{ color: 'var(--muted)' }}>
                      <Lock size={11} className="inline mr-1 -mt-0.5" />
                      Password *
                    </label>
                    <input
                      required
                      type="password"
                      minLength={8}
                      className={fieldCls}
                      style={fieldStyle}
                      placeholder="Min. 8 chars"
                      value={userForm.passwordRaw}
                      onChange={e => setUserForm(f => ({ ...f, passwordRaw: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelCls} style={{ color: 'var(--muted)' }}>
                      <Phone size={11} className="inline mr-1 -mt-0.5" />
                      Phone
                    </label>
                    <input
                      type="tel"
                      className={fieldCls}
                      style={fieldStyle}
                      placeholder="+254..."
                      value={userForm.phone}
                      onChange={e => setUserForm(f => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                </div>

                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                  Role is set to Partner automatically.
                </p>

                <div
                  className="flex items-center gap-2 pt-3 mt-auto"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex items-center justify-center gap-1.5 flex-1 px-4 py-2.5 text-sm font-bold rounded-xl border transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}
                  >
                    <ArrowLeft size={14} />
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={
                      !userForm.name ||
                      !userForm.email ||
                      !userForm.passwordRaw ||
                      !createdAgencyId ||
                      createUserMutation.isPending
                    }
                    className="btn btn-primary flex-[1.4] flex items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:opacity-40"
                  >
                    {createUserMutation.isPending ? (
                      'Saving...'
                    ) : (
                      <>
                        <Handshake size={15} />
                        Finish
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Assign tab */}
        {tab === 'assign' && (
          <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-3">
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
              Pick an existing user and move them to the partner role.
            </p>

            <div>
              <label className={labelCls} style={{ color: 'var(--muted)' }}>
                Search user *
              </label>
              <input
                className={fieldCls}
                style={fieldStyle}
                placeholder="Name or email..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
              />
              {userSearch.length > 0 && filteredUsers.length > 0 && (
                <div
                  className="mt-1.5 rounded-xl overflow-hidden max-h-40 overflow-y-auto border"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {filteredUsers.slice(0, 8).map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setAssignUserId(u.id);
                        setUserSearch(`${u.name} (${u.email})`);
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm flex items-center justify-between transition-colors"
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: assignUserId === u.id ? 'var(--surface-2)' : 'var(--surface)',
                      }}
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate" style={{ color: 'var(--ink)' }}>
                          {u.name}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>
                          {u.email}
                        </p>
                      </div>
                      <span
                        className="text-[9px] font-black tracking-wide px-2 py-0.5 rounded-md flex-shrink-0 ml-2"
                        style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
                      >
                        {u.role.replace('_', ' ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className={labelCls} style={{ color: 'var(--muted)' }}>
                <Buildings size={11} className="inline mr-1 -mt-0.5" />
                Partner agency
              </label>
              <select
                className={fieldCls + ' cursor-pointer'}
                style={fieldStyle}
                value={assignAgencyId}
                onChange={e => setAssignAgencyId(e.target.value)}
              >
                <option value="">Keep current agency</option>
                {partnerAgencies.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {partnerAgencies.length === 0 && (
                <p className="text-[10px] mt-1.5" style={{ color: 'var(--muted)' }}>
                  No partner agencies yet. Use Create to add one first.
                </p>
              )}
            </div>

            <div
              className="rounded-xl px-3 py-2.5 text-[11px] font-medium border"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--muted)' }}
            >
              Role becomes <span className="font-black" style={{ color: 'var(--ink)' }}>Partner</span>. They will see the partner dashboard on next login.
            </div>

            <div
              className="flex items-center gap-2 pt-3 mt-auto"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => assignMutation.mutate()}
                disabled={!assignUserId || assignMutation.isPending}
                className="btn btn-primary flex-[1.4] flex items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:opacity-40"
              >
                {assignMutation.isPending ? (
                  'Assigning...'
                ) : (
                  <>
                    <UserGear size={15} />
                    Assign
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PartnerOnboardingModal;
