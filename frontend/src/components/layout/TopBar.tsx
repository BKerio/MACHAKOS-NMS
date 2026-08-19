import {
  Bell,
  LogOut as SignOut,
  Menu as List,
  Phone,
  Sun,
  Moon,
  Search as MagnifyingGlass,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import NotificationDrawer from '@/components/shared/NotificationDrawer';
import RoleSwitcher from '@/components/layout/RoleSwitcher';
import { useNavigate, Link } from 'react-router-dom';
import { useActiveCalls } from '@/hooks/useActiveCalls';
import { confirmDialog } from '@/lib/alert';

interface TopBarProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onToggleSidebar: () => void;
}

function TopBar({ theme, onThemeToggle, onToggleSidebar }: TopBarProps) {
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [show, setShow] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  const { notifications, addNotification } = useNotificationStore();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const unreadCount = notifications.filter((n) => !n.read).length;
  const activeCalls = useActiveCalls();
  const user = useAuthStore((s) => s.user);
  const canSeeCalls = user && ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'].includes(user.role);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setShow(!(currentScrollY > lastScrollY && currentScrollY > 60));
      setLastScrollY(currentScrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const requestSignOut = async () => {
    const confirmed = await confirmDialog({
      title: 'Sign Out',
      text: "Are you sure you want to sign out? You'll need to log in again to access the dashboard.",
      confirmLabel: 'Sign Out',
      danger: true,
    });
    if (confirmed) {
      addNotification({
        type: 'info',
        title: 'Signed Out',
        message: 'You have been securely logged out.',
      });
      logout();
      navigate('/login');
    }
  };

  return (
    <>
      <header
        className="topbar"
        style={{ transform: show ? 'none' : 'translateY(-100%)', transition: 'transform .3s' }}
      >
        {/* Left: hamburger (sidebar toggle) + search */}
        <button
          onClick={onToggleSidebar}
          className="icon-btn"
          style={{ border: 0, background: 'transparent' }}
          title="Toggle sidebar"
        >
          <List size={20} />
        </button>

        <div className="searchbox" style={{ display: 'flex' }}>
          <MagnifyingGlass size={16} />
          <input placeholder="Search incidents, units…" />
        </div>

        {/* Push everything else right */}
        <div style={{ flex: 1 }} />

        {/* Active calls indicator */}
        {canSeeCalls && activeCalls.length > 0 && (
          <Link
            to="/call-logs"
            className="status-chip"
            style={{ gap: 6, textDecoration: 'none', color: 'var(--blue)', background: 'var(--blue-soft)', borderColor: 'color-mix(in srgb, var(--blue) 18%, transparent)' }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '99px', background: 'var(--blue)', display: 'inline-block', animation: 'pulse-ring 2s infinite' }} />
            <Phone size={13} />
            {activeCalls.length} active call{activeCalls.length > 1 ? 's' : ''}
          </Link>
        )}

        {/* Role switcher - Super Admin / Admin can preview any role */}
        <RoleSwitcher />

        {/* Theme toggle */}
        <button className="icon-btn" onClick={onThemeToggle} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Notifications */}
        <button
          className="icon-btn"
          style={{ position: 'relative' }}
          onClick={() => setIsNotificationOpen(true)}
          title="Notifications"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute', top: 6, right: 6,
                width: 8, height: 8, borderRadius: '99px',
                background: 'var(--red)', border: '1.5px solid var(--surface)',
              }}
            />
          )}
        </button>

        {/* Sign out */}
        <button
          className="icon-btn"
          onClick={requestSignOut}
          title="Sign Out"
          style={{ borderColor: 'transparent' }}
        >
          <SignOut size={18} />
        </button>
      </header>

      <NotificationDrawer isOpen={isNotificationOpen} onClose={() => setIsNotificationOpen(false)} />
    </>
  );
}

export default TopBar;
