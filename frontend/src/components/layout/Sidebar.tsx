import { useEffect, useState } from 'react';
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
  Megaphone,
  CircleUserRound,
  CirclePlus,
  Inbox,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useActiveCalls } from '@/hooks/useActiveCalls';
import { useIncidentQueueCount } from '@/hooks/useIncidentQueueCount';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { confirmSignOut } from '@/lib/alert';
import SidebarLogo from '@/assets/logos/nccg.jpg';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Live socket link to dispatch; drives the header status and the avatar dot. */
  connected: boolean;
  /** Phones: whether the slide-in drawer is open. */
  drawerOpen: boolean;
  onCloseDrawer: () => void;
}

const MOBILE_QUERY = '(max-width: 859px)';

/** True on phone-width screens, where the sidebar is a drawer. */
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}

type NavItem = { label: string; path: string; Icon: LucideIcon; roles: string[] };
type NavSection = { title?: string; items: NavItem[] };

const ALL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'WATCHER', 'PARTNER', 'DRIVER', 'EMT', 'NURSE'];
/** Who can log a new incident (same as the /incidents/new route guard). */
const REPORTERS = ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'WATCHER'];
const COMMAND = ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'];
const ADMINS = ['SUPER_ADMIN', 'ADMIN'];
const CREW = ['DRIVER', 'EMT', 'NURSE'];

const menuSections: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', path: '/dashboard', Icon: LayoutDashboard, roles: COMMAND },
      { label: 'Report Incident', path: '/incidents/new', Icon: CirclePlus, roles: REPORTERS },
      { label: 'Incident History', path: '/incidents/history', Icon: HistoryIcon, roles: REPORTERS },
      { label: 'My Alerts', path: '/watcher', Icon: Inbox, roles: ['WATCHER'] },
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
      { label: 'Campaigns', path: '/admin/campaigns', Icon: Megaphone, roles: ADMINS },
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
      { label: 'Statistics', path: '/operator/statistics', Icon: ChartLineUp, roles: CREW },
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

function Sidebar({ collapsed: collapsedPref, onToggleCollapse, connected, drawerOpen, onCloseDrawer }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const location = useLocation();
  const navigate = useNavigate();
  const activeCalls = useActiveCalls();
  const incidentQueueCount = useIncidentQueueCount();
  // When collapsed, hovering the rail temporarily expands it as an overlay.
  const [peek, setPeek] = useState(false);
  const [query, setQuery] = useState('');
  const isMobile = useIsMobile();
  // The drawer is always the full menu; the icon rail is a desktop-only mode.
  const collapsed = collapsedPref && !isMobile;
  const drawer = isMobile && drawerOpen;

  // Close the drawer whenever the page changes (a link was tapped)...
  useEffect(() => { onCloseDrawer(); }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  // ...on Escape, and stop the page behind it from scrolling while open.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseDrawer();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [drawer, onCloseDrawer]);
  // Leaving phone width with the drawer open: just close it.
  useEffect(() => { if (!isMobile && drawerOpen) onCloseDrawer(); }, [isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleSections = menuSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => user && item.roles.includes(user.role)),
    }))
    .filter((section) => section.items.length > 0);
  const visibleItems = visibleSections.flatMap((section) => section.items);

  // Search narrows the menu to matching pages (by label or section name).
  const q = query.trim().toLowerCase();
  const shownSections = q
    ? visibleSections
        .map((section) => ({
          ...section,
          items: section.items.filter((i) => i.label.toLowerCase().includes(q) || section.title?.toLowerCase().includes(q)),
        }))
        .filter((section) => section.items.length > 0)
    : visibleSections;

  // Several nav paths share a prefix (e.g. '/fleet' and '/fleet/fuel'), so a
  // plain startsWith check would light up both at once. Only the single
  // longest matching path "wins" and is marked active.
  const activePath = visibleItems
    .map((item) => item.path)
    .filter((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0]
    // A single case (/incidents/case-021) belongs under Incident History.
    ?? (/^\/incidents\/[^/]+$/.test(location.pathname) && visibleItems.some((i) => i.path === '/incidents/history')
      ? '/incidents/history'
      : undefined);

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
    const confirmed = await confirmSignOut(user);
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
      {isMobile && (
        <div className={`sidebar-backdrop${drawer ? ' open' : ''}`} onClick={onCloseDrawer} aria-hidden="true" />
      )}
      <aside
        className={`sidebar${collapsed ? ' collapsed' : ''}${collapsed && peek ? ' peek' : ''}${drawer ? ' drawer-open' : ''}`}
        aria-hidden={isMobile && !drawer ? true : undefined}
        {...(isMobile && !drawer ? { inert: true } : {})}
        // Close as soon as a link is tapped, not when a lazy page finishes loading.
        onClickCapture={(e) => { if (drawer && (e.target as HTMLElement).closest('a')) onCloseDrawer(); }}
        onMouseEnter={() => collapsed && setPeek(true)}
        onMouseLeave={() => setPeek(false)}
      >
        <div className="sidebar-inner">
          <div className="sidebar-head">
            <button
              onClick={isMobile ? onCloseDrawer : onToggleCollapse}
              className="sidebar-collapse-btn"
              title={isMobile ? 'Close menu' : collapsed ? 'Pin sidebar open' : 'Collapse sidebar'}
              aria-label={isMobile ? 'Close menu' : collapsed ? 'Pin sidebar open' : 'Collapse sidebar'}
            >
              {isMobile ? <X size={18} /> : collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>

            <div className="brand-crest">
              <div className="brand-logo">
                <img src={SidebarLogo} draggable={false} alt="Machakos County" />
              </div>
              <span className={`brand-crest-dot${connected ? ' on' : ''}`} aria-hidden="true" />
            </div>

            <div className="brand-text">
              <b>Emergency Ops</b>
              <span className="brand-org">for Machakos County</span>
            </div>
          </div>

          <div className="sidebar-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search"
              aria-label="Search the menu"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuery('');
                if (e.key === 'Enter') {
                  const first = shownSections[0]?.items[0];
                  if (first) { navigate(first.path); setQuery(''); }
                }
              }}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={13} />
              </button>
            )}
          </div>

          <nav className="nav-scroll" aria-label="Main">
            {shownSections.length === 0 && <p className="nav-empty">No pages match “{query}”.</p>}
            {shownSections.map((section, idx) => (
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
                      onClick={() => setQuery('')}
                      className={`nav-item${isActive ? ' active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="nav-tile">
                        <item.Icon size={20} aria-hidden="true" />
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

    </>
  );
}

export default Sidebar;
