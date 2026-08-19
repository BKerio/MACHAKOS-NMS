import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCog, ChevronDown } from 'lucide-react';
import api from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { Role } from '@/types/api';
import { ROLE_ROUTES } from '@/components/dev/DevRoleSwitcher';

const ALL_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'WATCHER', 'PARTNER', 'DRIVER', 'EMT', 'NURSE'];

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  DISPATCHER: 'Dispatcher',
  WATCHER: 'Watcher',
  PARTNER: 'Partner',
  DRIVER: 'Driver',
  EMT: 'EMT',
  NURSE: 'Nurse',
};

/**
 * Lets Super Admin / Admin accounts preview the console as any role, from the
 * topbar, without needing that role among their actual assigned roles. There
 * is no backend-issued token for the preview (see /auth/switch-role fallback
 * below) - RoleGuard trusts the real JWT role first, so this can never grant
 * an unprivileged account access it doesn't actually have.
 */
function RoleSwitcher() {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { token, user, setAuth, setRole } = useAuthStore();
  const { addNotification } = useNotificationStore();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!user) return null;

  // Roles captured at login and never mutated by a preview switch, so this
  // stays the account's true identity even while previewing another role.
  const baseRoles: Role[] = user.roles?.length ? user.roles : [user.role];
  const isAdmin = baseRoles.includes('SUPER_ADMIN') || baseRoles.includes('ADMIN');
  if (!isAdmin) return null;

  const activeRole: Role = user.activeRole || user.role;

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
        if (data?.token && data?.user) setAuth(data.token, data.user);
        else setRole(role);
      } else {
        setRole(role);
      }
    } catch {
      // No backend route yet - fall back to a client-only preview.
      setRole(role);
    } finally {
      setSwitching(false);
      setOpen(false);
      addNotification({ type: 'info', title: 'Role Switched', message: `Now previewing as ${ROLE_LABEL[role]}.` });
      navigate(ROLE_ROUTES[role] || '/dashboard');
    }
  };

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="icon-btn"
        style={{ width: 'auto', padding: '0 12px', gap: 7 }}
        title="Preview console as a different role"
      >
        <UserCog size={16} />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{ROLE_LABEL[activeRole]}</span>
        <ChevronDown size={14} style={{ opacity: .6, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
      </button>

      {open && (
        <div className="card role-switch-menu">
          <div style={{ padding: '6px 10px 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', color: 'var(--muted)' }}>
            PREVIEW AS
          </div>
          {ALL_ROLES.map((role) => (
            <button
              key={role}
              onClick={() => switchTo(role)}
              disabled={switching}
              className={`role-switch-item${activeRole === role ? ' active' : ''}`}
            >
              {activeRole === role && <span style={{ width: 6, height: 6, borderRadius: 99, background: 'currentColor', flexShrink: 0 }} />}
              {ROLE_LABEL[role]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default RoleSwitcher;
