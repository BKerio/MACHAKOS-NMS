import {
  Bell,
  LogOut as SignOut,
  Menu as List,
  Phone,
  Search as MagnifyingGlass,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import NotificationDrawer from '@/components/shared/NotificationDrawer';
import RoleSwitcher from '@/components/layout/RoleSwitcher';
import { useNavigate, Link } from 'react-router-dom';
import { useActiveCalls } from '@/hooks/useActiveCalls';
import { confirmDialog } from '@/lib/alert';
import ThemeMenu from '@/components/layout/ThemeMenu';

interface TopBarProps {
  onToggleSidebar: () => void;
}

function TopBar({ onToggleSidebar }: TopBarProps) {
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [show, setShow] = useState(true);
  const lastScrollY = useRef(0);

  const { notifications, addNotification } = useNotificationStore();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const unreadCount = notifications.filter((n) => !n.read).length;
  const activeCalls = useActiveCalls();
  const user = useAuthStore((s) => s.user);
  const canSeeCalls = user && ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'].includes(user.role);

  // Hide on scroll down, show on scroll up. The last position lives in a ref
  // so scrolling only re-renders when the bar actually shows or hides.
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setShow(!(currentScrollY > lastScrollY.current && currentScrollY > 60));
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

        <div className="searchbox topbar-search">
          <MagnifyingGlass size={16} />
          <input placeholder="Search incidents, units…" />
        </div>

        {/* Push everything else right */}
        <div style={{ flex: 1 }} />

        {/* Active calls indicator */}
        {canSeeCalls && activeCalls.length > 0 && (
          <Link
            to="/call-logs"
            className="status-chip topbar-calls"
            style={{ gap: 6, textDecoration: 'none', color: 'var(--blue)', background: 'var(--blue-soft)', borderColor: 'color-mix(in srgb, var(--blue) 18%, transparent)' }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '99px', background: 'var(--blue)', display: 'inline-block', animation: 'pulse-ring 2s infinite' }} />
            <Phone size={13} />
            {activeCalls.length}<span className="topbar-calls-label"> active call{activeCalls.length > 1 ? 's' : ''}</span>
          </Link>
        )}

        {/* Role switcher - Super Admin / Admin can preview any role */}
        <RoleSwitcher />

        {/* Appearance: light / dark / system + accent */}
        <ThemeMenu />

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

        {/* Sign out (phones use the one in the drawer footer) */}
        <button
          className="icon-btn topbar-signout"
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
