import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import {
  LayoutGrid as SquaresFour,
  CircleAlert as WarningCircle,
  Map as MapTrifold,
  List as ListBullets,
  Users,
  Settings as Gear,
  ChartLine as ChartLineUp,
  Phone,
  ClipboardList as ClipboardText,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Hospital,
  Tag,
  ShieldAlert as ShieldWarning,
  Handshake,
  MessageSquareText as ChatText,
  Timer,
  Truck,
  RadioTower as Broadcast,
  Fuel as GasPump,
  Ambulance,
  UserCheck,
  Activity,
  History as HistoryIcon,
  Package,
  FileBarChart2 as FileBarChart,
} from 'lucide-react';
import { useActiveCalls } from '@/hooks/useActiveCalls';
import { useIncidentQueueCount } from '@/hooks/useIncidentQueueCount';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { confirmDialog } from '@/lib/alert';
import SidebarLogo from '@/assets/logos/nccg.jpg';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

type NavItem = { label: string; path: string; Icon: any; roles: string[] };

const ALL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'WATCHER', 'DISPATCHER', 'PARTNER', 'DRIVER', 'EMT', 'NURSE'];

const menuSections: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: 'Dashboard', path: '/dashboard', Icon: SquaresFour, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'] },
      { label: 'Wallboard', path: '/wallboard', Icon: Broadcast, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'WATCHER'] },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Incident Feed', path: '/queue', Icon: ListBullets, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'] },
      { label: 'Fleet Management', path: '/fleet', Icon: MapTrifold, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'] },
      { label: 'Fuel Monitoring', path: '/fleet/fuel', Icon: GasPump, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'] },
      { label: 'Standby', path: '/fleet/standby', Icon: Timer, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'] },
      { label: 'Call Logs', path: '/call-logs', Icon: Phone, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'] },
      { label: 'GBV Register', path: '/gbv/dashboard', Icon: ShieldWarning, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'PARTNER'] },
    ],
  },
  {
    title: 'Management',
    items: [
      { label: 'Personnel', path: '/admin/users', Icon: Users, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { label: 'Partners', path: '/admin/partners', Icon: Handshake, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { label: 'Partner Ambulances', path: '/admin/partner-ambulances', Icon: Truck, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'] },
      { label: 'Facilities', path: '/admin/facilities', Icon: Hospital, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { label: 'Nature Options', path: '/admin/nature-options', Icon: Tag, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { label: 'Inventory', path: '/admin/inventory', Icon: Package, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { label: 'Bulk SMS', path: '/admin/sms', Icon: ChatText, roles: ['SUPER_ADMIN', 'ADMIN'] },
    ],
  },
  {
    title: 'Insights',
    items: [
      { label: 'Analytics', path: '/admin/analytics', Icon: ChartLineUp, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'WATCHER', 'PARTNER'] },
      { label: 'System Report', path: '/admin/system-report', Icon: FileBarChart, roles: ['SUPER_ADMIN', 'ADMIN'] },
      { label: 'System Settings', path: '/admin/settings', Icon: Gear, roles: ['SUPER_ADMIN', 'ADMIN'] },
    ],
  },
  {
    title: 'Watcher',
    items: [
      { label: 'My Alerts', path: '/watcher', Icon: ClipboardText, roles: ['WATCHER'] },
      { label: 'New Incident', path: '/watcher/new-incident', Icon: WarningCircle, roles: ['WATCHER'] },
    ],
  },
  {
    title: 'Partner',
    items: [
      { label: 'Partner Dashboard', path: '/partner/dashboard', Icon: SquaresFour, roles: ['PARTNER'] },
    ],
  },
  {
    title: 'Field Operations',
    items: [
      { label: 'Dashboard', path: '/driver/dashboard', Icon: SquaresFour, roles: ['DRIVER'] },
      { label: 'Assignment', path: '/operator/assignment', Icon: Ambulance, roles: ['DRIVER', 'EMT', 'NURSE'] },
      { label: 'Crew', path: '/operator/crew', Icon: UserCheck, roles: ['DRIVER', 'EMT', 'NURSE'] },
      { label: 'Activity', path: '/operator/activity', Icon: Activity, roles: ['DRIVER', 'EMT', 'NURSE'] },
      { label: 'History', path: '/operator/history', Icon: HistoryIcon, roles: ['DRIVER', 'EMT', 'NURSE'] },
      { label: 'Inventory', path: '/operator/inventory', Icon: Package, roles: ['DRIVER', 'EMT', 'NURSE'] },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'My Profile', path: '/profile', Icon: Users, roles: ALL_ROLES },
    ],
  },
];

function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
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

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.role?.charAt(0) ?? 'U';

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
        {/* Brand header */}
        <div className="sidebar-head">
          <button
            onClick={onToggleCollapse}
            className="sidebar-collapse-btn"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <div className="brand-logo">
            <img src={SidebarLogo} draggable={false} alt="Machakos County" />
          </div>
          <div className="brand-text">
            <b>Emergency Operations</b>
            <span className="brand-org">Machakos County</span>
            <span className="brand-tag">Command Centre</span>
          </div>
        </div>

        {/* Nav scroll */}
        <nav className="nav-scroll">
          {visibleSections.map((section, idx) => (
            <div className="nav-group" key={section.title ?? `section-${idx}`}>
              {section.title && <div className="nav-group-label">{section.title}</div>}
              {section.items.map((item) => {
                const isActive = item.path === activePath;
                const hasCallBadge = item.path === '/call-logs' && activeCalls.length > 0;
                const isIncidentFeed = item.path === '/queue';
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`nav-item${isActive ? ' active' : ''}`}
                  >
                    <item.Icon size={20} />
                    <span className="nav-label">{item.label}</span>
                    {hasCallBadge && (
                      <span className="nav-badge">{activeCalls.length}</span>
                    )}
                    {isIncidentFeed && (
                      <span
                        className="nav-badge"
                        style={{ background: incidentQueueCount > 0 ? 'var(--red)' : 'var(--green)' }}
                        title={incidentQueueCount > 0 ? `${incidentQueueCount} incident${incidentQueueCount === 1 ? '' : 's'} submitted` : 'No incidents waiting'}
                      >
                        {incidentQueueCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="sidebar-foot">
          <div className="sidebar-user">
            <div className="av av-sm" style={{ background: 'var(--green)' }}>{initials}</div>
            <div className="sidebar-user-meta">
              <b>{user?.name ?? 'Operator'}</b>
              <span>{user?.role?.replace('_', ' ')}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="sidebar-logout-btn"
            title="Sign Out"
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
       </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="bottomnav">
        {visibleItems.slice(0, 5).map((item) => {
          const isActive = item.path === activePath;
          const hasCallBadge = item.path === '/call-logs' && activeCalls.length > 0;
          const isIncidentFeed = item.path === '/queue';
          return (
            <Link key={item.path} to={item.path} className={`bn-item${isActive ? ' on' : ''}`}>
              {hasCallBadge && <span className="bn-badge" />}
              {isIncidentFeed && (
                <span className="bn-badge" style={{ background: incidentQueueCount > 0 ? 'var(--red)' : 'var(--green)' }} />
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
