import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import {
  LayoutDashboard,
  MonitorPlay,
  Siren,
  Map as MapTrifold,
  Users,
  Settings as Gear,
  ChartLine as ChartLineUp,
  Phone,
  ClipboardList as ClipboardText,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Hospital,
  Tag,
  MapPin,
  ShieldAlert as ShieldWarning,
  Handshake,
  MessageSquareText as ChatText,
  Timer,
  Truck,
  Fuel as GasPump,
  Ambulance,
  UserCheck,
  Activity,
  History as HistoryIcon,
  Package,
  FileBarChart2 as FileBarChart,
  Bell,
  CircleUserRound,
  type LucideIcon,
} from 'lucide-react';
import { useActiveCalls } from '@/hooks/useActiveCalls';
import { useIncidentQueueCount } from '@/hooks/useIncidentQueueCount';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { confirmDialog } from '@/lib/alert';
import SidebarLogo from '@/assets/logos/nccg.jpg';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Live socket link to dispatch; drives the header status and the avatar dot. */
  connected: boolean;
}

type NavItem = { label: string; path: string; Icon: LucideIcon; roles: string[] };
type NavSection = { title?: string; items: NavItem[] };

const ALL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'PARTNER', 'DRIVER', 'EMT', 'NURSE'];
const COMMAND = ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'];
const ADMINS = ['SUPER_ADMIN', 'ADMIN'];
const CREW = ['DRIVER', 'EMT', 'NURSE'];

const menuSections: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', path: '/dashboard', Icon: LayoutDashboard, roles: COMMAND },
      { label: 'Wallboard', path: '/wallboard', Icon: MonitorPlay, roles: COMMAND },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Incident Feed', path: '/queue', Icon: Siren, roles: COMMAND },
      { label: 'Fleet Management', path: '/fleet', Icon: MapTrifold, roles: COMMAND },
      { label: 'Vehicle Checklists', path: '/fleet/checklists', Icon: ClipboardText, roles: COMMAND },
      { label: 'Fuel Monitoring', path: '/fleet/fuel', Icon: GasPump, roles: COMMAND },
      { label: 'Standby', path: '/fleet/standby', Icon: Timer, roles: COMMAND },
      { label: 'Call Logs', path: '/call-logs', Icon: Phone, roles: COMMAND },
      { label: 'GBV Register', path: '/gbv/dashboard', Icon: ShieldWarning, roles: [...COMMAND, 'PARTNER'] },
    ],
  },
  {
    title: 'Management',
    items: [
      { label: 'Personnel', path: '/admin/users', Icon: Users, roles: ADMINS },
      { label: 'Partners', path: '/admin/partners', Icon: Handshake, roles: ADMINS },
      { label: 'Partner Ambulances', path: '/admin/partner-ambulances', Icon: Truck, roles: COMMAND },
      { label: 'Facilities', path: '/admin/facilities', Icon: Hospital, roles: ADMINS },
      { label: 'Nature Options', path: '/admin/nature-options', Icon: Tag, roles: ADMINS },
      { label: 'Sub-Counties', path: '/admin/sub-counties', Icon: MapPin, roles: ADMINS },
      { label: 'Inventory', path: '/admin/inventory', Icon: Package, roles: ADMINS },
      { label: 'Bulk SMS', path: '/admin/sms', Icon: ChatText, roles: ADMINS },
      { label: 'Notifications', path: '/admin/notifications', Icon: Bell, roles: ADMINS },
    ],
  },
  {
    title: 'Insights',
    items: [
      { label: 'Analytics', path: '/admin/analytics', Icon: ChartLineUp, roles: [...COMMAND, 'PARTNER'] },
      { label: 'System Report', path: '/admin/system-report', Icon: FileBarChart, roles: ADMINS },
      { label: 'System Settings', path: '/admin/settings', Icon: Gear, roles: ADMINS },
    ],
  },
  {
    title: 'Partner',
    items: [
      { label: 'Partner Dashboard', path: '/partner/dashboard', Icon: LayoutDashboard, roles: ['PARTNER'] },
    ],
  },
  {
    title: 'Field Operations',
    items: [
      { label: 'Dashboard', path: '/driver/dashboard', Icon: LayoutDashboard, roles: ['DRIVER'] },
      { label: 'Assignment', path: '/operator/assignment', Icon: Ambulance, roles: CREW },
      { label: 'Crew', path: '/operator/crew', Icon: UserCheck, roles: CREW },
      { label: 'Activity', path: '/operator/activity', Icon: Activity, roles: CREW },
      { label: 'History', path: '/operator/history', Icon: HistoryIcon, roles: CREW },
      { label: 'Inventory', path: '/operator/inventory', Icon: Package, roles: CREW },
      { label: 'Vehicle Checklist', path: '/operator/checklist', Icon: ClipboardText, roles: CREW },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'My Profile', path: '/profile', Icon: CircleUserRound, roles: ALL_ROLES },
    ],
  },
];

type Badge = { count: number; hot: boolean; title: string };

function Sidebar({ collapsed, onToggleCollapse, connected }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const location = useLocation();
  const navigate = useNavigate();
  const activeCalls = useActiveCalls();
  const incidentQueueCount = useIncidentQueueCount();
  // When collapsed, hovering the rail temporarily expands it as an overlay.
  const [peek, setPeek] = useState(false);

  const visibleSections = menuSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => user && item.roles.includes(user.role)),
    }))
    .filter((section) => section.items.length > 0);
  const visibleItems = visibleSections.flatMap((section) => section.items);

  // Several nav paths share a prefix (e.g. '/fleet' and '/fleet/fuel'), so a
  // plain startsWith check would light up both at once. Only the single
  // longest matching path "wins" and is marked active.
  const activePath = visibleItems
    .map((item) => item.path)
    .filter((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];

  const badgeFor = (path: string): Badge | null => {
    if (path === '/queue') {
      return {
        count: incidentQueueCount,
        hot: incidentQueueCount > 0,
        title: incidentQueueCount > 0
          ? `${incidentQueueCount} incident${incidentQueueCount === 1 ? '' : 's'} submitted`
          : 'No incidents waiting',
      };
    }
    if (path === '/call-logs' && activeCalls.length > 0) {
      return { count: activeCalls.length, hot: true, title: `${activeCalls.length} active call${activeCalls.length === 1 ? '' : 's'}` };
    }
    return null;
  };

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.role?.charAt(0) ?? 'U';
  const roleLabel = user?.role?.replace(/_/g, ' ').toLowerCase();

  const handleLogout = async () => {
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
      <aside
        className={`sidebar${collapsed ? ' collapsed' : ''}${collapsed && peek ? ' peek' : ''}`}
        onMouseEnter={() => collapsed && setPeek(true)}
        onMouseLeave={() => setPeek(false)}
      >
        <div className="sidebar-inner">
          <div className="sidebar-head">
            <button
              onClick={onToggleCollapse}
              className="sidebar-collapse-btn"
              title={collapsed ? 'Pin sidebar open' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Pin sidebar open' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>

            <div className="brand-crest">
              <div className="brand-logo">
                <img src={SidebarLogo} draggable={false} alt="Machakos County" />
              </div>
              <span className={`brand-crest-dot${connected ? ' on' : ''}`} aria-hidden="true" />
            </div>

            <div className="brand-text">
              <b>Emergency Operations</b>
              <span className="brand-org">Machakos County</span>
            </div>
          </div>

          <nav className="nav-scroll" aria-label="Main">
            {visibleSections.map((section, idx) => (
              <div className="nav-group" key={section.title ?? `section-${idx}`}>
                {section.title && (
                  <div className="nav-group-label">
                    <span className="nav-group-dot" aria-hidden="true" />
                    <span className="nav-group-text">{section.title}</span>
                  </div>
                )}
                {section.items.map((item) => {
                  const isActive = item.path === activePath;
                  const badge = badgeFor(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`nav-item${isActive ? ' active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="nav-tile">
                        <item.Icon size={24} aria-hidden="true" />
                      </span>
                      <span className="nav-label">{item.label}</span>
                      {badge && (
                        <span className={`nav-badge${badge.hot ? ' hot' : ''}`} title={badge.title}>
                          {badge.count}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="sidebar-foot">
            <Link to="/profile" className="sidebar-user" title="My profile">
              <span className="sidebar-av">
                {initials}
                <span className={`sidebar-av-dot${connected ? ' on' : ''}`} aria-hidden="true" />
              </span>
              <span className="sidebar-user-meta">
                <b>{user?.name ?? 'Operator'}</b>
                <span className="sidebar-role">{roleLabel}</span>
              </span>
            </Link>
            <button onClick={handleLogout} className="sidebar-logout-btn" title="Sign out" aria-label="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="bottomnav" aria-label="Main">
        {visibleItems.slice(0, 5).map((item) => {
          const isActive = item.path === activePath;
          const badge = badgeFor(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`bn-item${isActive ? ' on' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {badge && (
                <span className="bn-badge" style={{ background: badge.hot ? 'var(--red)' : 'var(--green)' }} />
              )}
              <item.Icon size={22} />
              <span>{item.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export default Sidebar;
