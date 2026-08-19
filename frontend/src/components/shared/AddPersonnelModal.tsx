import { useState } from 'react';
import {
  X,
  UserPlus,
  Mail as Envelope,
  Lock,
  Phone,
  Building2 as Buildings,
  Check,
} from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import api from '@/api/client';
import { useNotificationStore } from '@/stores/notificationStore';
import { Agency, Role } from '@/types/api';

const MAX_ROLES = 2;

interface AddPersonnelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLES: Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'WATCHER',
  'DISPATCHER',
  'PARTNER',
  'DRIVER',
  'EMT',
  'NURSE',
];

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  WATCHER: 'Watcher',
  DISPATCHER: 'Dispatcher',
  PARTNER: 'Partner',
  DRIVER: 'Driver',
  EMT: 'EMT',
  NURSE: 'Nurse',
};

const DEFAULT_ROLE: Role = 'WATCHER';

const fieldCls =
  'w-full border rounded-lg px-3 py-2.5 text-sm font-semibold outline-none transition-colors';
const fieldStyle = {
  background: 'var(--surface)',
  borderColor: 'var(--border)',
  color: 'var(--ink)',
};
const labelCls = 'block text-[10px] font-black tracking-widest mb-1.5';

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function AddPersonnelModal({ isOpen, onClose }: AddPersonnelModalProps) {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    passwordRaw: '',
    phone: '',
    role: DEFAULT_ROLE,
    roles: [DEFAULT_ROLE] as Role[],
    agencyId: '',
  });

  const { data: agencies = [] } = useQuery({
    queryKey: ['admin', 'agencies'],
    queryFn: async () => {
      const res = await api.get('/admin/agencies');
      return res.data.data as Agency[];
    },
    enabled: isOpen,
  });

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      passwordRaw: '',
      phone: '',
      role: DEFAULT_ROLE,
      roles: [DEFAULT_ROLE],
      agencyId: '',
    });
  };

  const toggleRole = (role: Role) => {
    setFormData((prev) => {
      const selected = prev.roles.includes(role);
      if (!selected && prev.roles.length >= MAX_ROLES) {
        addNotification({
          type: 'error',
          title: 'Role Limit Reached',
          message: `A user can hold at most ${MAX_ROLES} roles. Remove one before adding another.`,
        });
        return prev;
      }

      const nextRoles = selected
        ? prev.roles.filter((item) => item !== role)
        : [...prev.roles, role];

      const safeRoles = nextRoles.length ? nextRoles : [DEFAULT_ROLE];

      return {
        ...prev,
        roles: safeRoles,
        role: safeRoles[0],
      };
    });
  };

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return api.post('/admin/users', {
        ...data,
        role: data.roles[0],
        roles: data.roles,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      addNotification({
        type: 'success',
        title: 'User Created',
        message: `${formData.name} has been added.`,
      });
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        title: 'Could Not Create User',
        message:
          error.response?.data?.message ||
          'Failed to create user. Please check the details and try again.',
      });
    },
  });

  if (!isOpen) return null;

  const selectedAgency = agencies.find((a) => a.id === formData.agencyId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div
        className="relative w-full max-w-md rounded-2xl shadow-xl overflow-hidden border flex flex-col max-h-[90vh]"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {/* Accent strip */}
        <div className="h-1 w-full bg-brand-green flex-shrink-0" />

        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs flex-shrink-0"
              style={{
                background: formData.name.trim() ? 'var(--ink)' : 'var(--surface-2)',
                color: formData.name.trim() ? 'var(--surface)' : 'var(--muted)',
              }}
            >
              {formData.name.trim() ? initialsOf(formData.name) : <UserPlus size={18} />}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base leading-tight truncate" style={{ color: 'var(--ink)' }}>
                {formData.name.trim() || 'New User'}
              </h3>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
                {formData.roles.map((r) => ROLE_LABELS[r]).join(', ')}
                {selectedAgency ? ` · ${selectedAgency.name}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-2 rounded-lg transition-colors flex-shrink-0"
            style={{ color: 'var(--muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        <form
          className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();

            if (!formData.agencyId) {
              addNotification({
                type: 'error',
                title: 'Agency Required',
                message: 'Please select an agency.',
              });
              return;
            }

            if (!formData.roles.length) {
              addNotification({
                type: 'error',
                title: 'Role Required',
                message: 'Please assign at least one role.',
              });
              return;
            }

            mutation.mutate(formData);
          }}
        >
          {/* Identity */}
          <section className="space-y-3">
            <p className="text-[10px] font-black tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
              Identity
            </p>

            <div>
              <label className={labelCls} style={{ color: 'var(--muted)' }}>
                Full Name
              </label>
              <input
                required
                type="text"
                placeholder="Jane Wanjiku"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                className={fieldCls}
                style={fieldStyle}
              />
            </div>

            <div>
              <label className={labelCls} style={{ color: 'var(--muted)' }}>
                <Envelope size={11} className="inline mr-1 -mt-0.5" />
                Email
              </label>
              <input
                required
                type="email"
                placeholder="j.wanjiku@agency.go.ke"
                value={formData.email}
                onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                className={fieldCls}
                style={fieldStyle}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>
                  <Lock size={11} className="inline mr-1 -mt-0.5" />
                  Password
                </label>
                <input
                  required
                  type="password"
                  placeholder="Min. 8 chars"
                  minLength={8}
                  value={formData.passwordRaw}
                  onChange={(event) =>
                    setFormData({ ...formData, passwordRaw: event.target.value })
                  }
                  className={fieldCls}
                  style={fieldStyle}
                />
              </div>
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>
                  <Phone size={11} className="inline mr-1 -mt-0.5" />
                  Phone
                </label>
                <input
                  type="tel"
                  placeholder="+254..."
                  value={formData.phone}
                  onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                  className={fieldCls}
                  style={fieldStyle}
                />
              </div>
            </div>
          </section>

          {/* Access */}
          <section className="space-y-3">
            <p className="text-[10px] font-black tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
              Access
            </p>

            <div>
              <label className={labelCls} style={{ color: 'var(--muted)' }}>
                <Buildings size={11} className="inline mr-1 -mt-0.5" />
                Agency
              </label>
              <select
                required
                className={fieldCls + ' cursor-pointer'}
                style={fieldStyle}
                value={formData.agencyId}
                onChange={(event) =>
                  setFormData({ ...formData, agencyId: event.target.value })
                }
              >
                <option value="">Select agency...</option>
                {agencies.map((agency) => (
                  <option key={agency.id} value={agency.id}>
                    {agency.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-black tracking-widest" style={{ color: 'var(--muted)' }}>
                  Roles
                </label>
                <span className="text-[10px] font-bold" style={{ color: 'var(--muted)' }}>
                  {formData.roles.length}/{MAX_ROLES} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ROLES.map((role) => {
                  const selected = formData.roles.includes(role);
                  const disabled = !selected && formData.roles.length >= MAX_ROLES;
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      disabled={disabled}
                      className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[10px] font-black tracking-wide transition-colors disabled:cursor-not-allowed"
                      style={
                        selected
                          ? {
                              background: 'var(--ink)',
                              borderColor: 'var(--ink)',
                              color: 'var(--surface)',
                            }
                          : {
                              background: 'var(--surface)',
                              borderColor: 'var(--border)',
                              color: 'var(--muted)',
                              opacity: disabled ? 0.4 : 1,
                            }
                      }
                    >
                      {selected && <Check size={11} strokeWidth={3} />}
                      {ROLE_LABELS[role]}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
                Users can hold up to {MAX_ROLES} roles. If more than one is assigned, they'll choose which to sign in as at login.
              </p>
            </div>
          </section>

          {/* Footer */}
          <div
            className="flex items-center gap-2 pt-3 mt-auto flex-shrink-0"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn btn-primary flex-[1.4] flex items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50"
            >
              {mutation.isPending ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  Create User
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddPersonnelModal;
