import { useState } from 'react';
import api from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { Role } from '@/types/api';

export const ROLE_ROUTES: Record<Role, string> = {
  SUPER_ADMIN: '/admin/users',
  ADMIN: '/admin/users',
  DISPATCHER: '/dashboard',
  WATCHER: '/watcher/new-incident',
  PARTNER: '/partner/dashboard',
  DRIVER: '/driver/dashboard',
  EMT: '/emt/dashboard',
  NURSE: '/nurse/dashboard',
};

const ROLE_COLORS: Record<Role, string> = {
  SUPER_ADMIN: 'bg-purple-600',
  ADMIN: 'bg-brand-teal',
  DISPATCHER: 'bg-status-info',
  WATCHER: 'bg-status-warning',
  PARTNER: 'bg-brand-green',
  DRIVER: 'bg-orange-600',
  EMT: 'bg-red-600',
  NURSE: 'bg-pink-600',
};

function DevRoleSwitcher() {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const { token, user, setAuth, setRole } = useAuthStore();

  if (!user) return null;

  const userRoles: Role[] = user.roles && user.roles.length > 0 ? user.roles : [user.role];
  const activeRole: Role = user.activeRole || user.role || userRoles[0];

  if (userRoles.length <= 1) return null;

  const switchTo = async (role: Role) => {
    if (role === activeRole || switching) {
      setOpen(false);
      return;
    }

    setSwitching(true);

    try {
      if (token) {
        const response = await api.post('/auth/switch-role', { role });
        const data = response.data.data;

        if (data?.token && data?.user) {
          setAuth(data.token, data.user);
        } else {
          setRole(role);
        }
      } else {
        setRole(role);
      }
    } catch {
      // If the backend route is not deployed yet, keep frontend role switching working.
      setRole(role);
    } finally {
      setOpen(false);
      setSwitching(false);
      window.location.href = ROLE_ROUTES[role] || '/dashboard';
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-2">
      {open && (
        <div className="bg-[#1a2327] border border-brand-teal/30 rounded-2xl shadow-2xl p-4 flex flex-col gap-2 min-w-[220px]">
          <p className="text-[9px] font-black text-slate-400 tracking-[0.2em] mb-1">
            Switch Role Center
          </p>

          {userRoles.map((role) => (
            <button
              key={role}
              onClick={() => switchTo(role)}
              disabled={switching}
              className={`w-full text-left px-4 py-2.5 rounded-xl text-[11px] font-black tracking-widest transition-all flex items-center gap-3 disabled:opacity-60 ${
                activeRole === role
                  ? `${ROLE_COLORS[role]} text-white shadow-md`
                  : 'text-slate-400 hover:bg-white/5'
              }`}
              type="button"
            >
              {activeRole === role && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              )}
              {role.replace('_', ' ')}
            </button>
          ))}

          <div className="border-t border-white/10 mt-1 pt-2">
            <p className="text-[9px] text-slate-600 tracking-widest text-center">
              Multi-role access enabled
            </p>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="bg-[#1a2327] border border-brand-teal/40 text-brand-green font-black text-[10px] tracking-widest px-4 py-3 rounded-2xl shadow-2xl hover:border-brand-green transition-all flex items-center gap-2"
        type="button"
      >
        <span className={`w-2 h-2 rounded-full ${ROLE_COLORS[activeRole]} animate-pulse`} />
        {activeRole.replace('_', ' ')}
        <span className="text-slate-500">{open ? '▲' : '▼'}</span>
      </button>
    </div>
  );
}

export default DevRoleSwitcher;
