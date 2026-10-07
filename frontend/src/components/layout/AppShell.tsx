import { Outlet, Navigate, useLocation } from 'react-router-dom';
import AppLoader from '@/components/shared/AppLoader';
import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import { socket } from '@/lib/socket';
import { useNotificationStore } from '@/stores/notificationStore';
import { useAuthStore } from '@/stores/authStore';

const FIELD_CREW_ROLES = ['DRIVER', 'EMT', 'NURSE'];

function AppShell() {
  const { addNotification } = useNotificationStore();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');
  // Phones: the sidebar is a slide-in drawer instead of a fixed column.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [reconnectedFlash, setReconnectedFlash] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (!token || !user) return;

    socket.connect();

    socket.on('connect', () => {
      socket.emit('join:room', { userId: user.id, roles: [user.role] });
      setIsConnected(true);
      setReconnectedFlash(true);
    });

    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', () => setIsConnected(false));

    if (socket.connected) {
      socket.emit('join:room', { userId: user.id, roles: [user.role] });
    }

    socket.on('incident:new', (data) => {
      addNotification({
        type: 'warning',
        title: 'New Incident Submitted',
        message: `Incident #${data.id.substring(0, 4)} reported at ${data.locationName}.`,
      });
    });

    socket.on('fleet:offline', (data) => {
      addNotification({
        type: 'error',
        title: 'Vehicle Offline',
        message: `Unit ${data.id.substring(0, 4)} has gone offline unexpectedly.`,
      });
    });

    socket.on('task:assigned', (task: { id: string; vehicleId: string; incidentId: string }) => {
      addNotification({
        type: 'success',
        title: 'Crew Dispatched',
        message: `Task ${task.id.substring(0, 6)} - crew assigned and en route.`,
      });
    });

    socket.on('incident:escalated', (data: { caseNumber: string; locationName: string; massCasualtyCount: number }) => {
      addNotification({
        type: 'error',
        title: `MCI DECLARED - ${data.caseNumber}`,
        message: `${data.massCasualtyCount} casualties at ${data.locationName}. Immediate response required.`,
      });
    });

    // Crew checked in away from the ambulance's GPS tracker (or with a fake
    // GPS app). Informational - the vehicle can still be assigned.
    socket.on('fleet:checkin-alert', (data: { message: string; userName: string | null; role: string; locationName: string | null }) => {
      const who = [data.userName, data.role?.toLowerCase()].filter(Boolean).join(', ');
      addNotification({
        type: 'warning',
        title: 'Check-in away from ambulance',
        message: `${data.message}${who ? ` (${who})` : ''}${data.locationName ? ` - phone was at ${data.locationName}` : ''}.`,
      });
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('incident:new');
      socket.off('fleet:offline');
      socket.off('task:assigned');
      socket.off('incident:escalated');
      socket.off('fleet:checkin-alert');
    };
  }, [addNotification, token, user]);

  useEffect(() => {
    if (!reconnectedFlash) return;
    const t = setTimeout(() => setReconnectedFlash(false), 3000);
    return () => clearTimeout(t);
  }, [reconnectedFlash]);

  // Field crew get the same new-case push alerts on the web dashboard as on
  // the mobile app - dispatchers/admins already see everything live via the
  // socket handlers above, so it's scoped to the roles push actually targets.
  // Lazy-imported so the Firebase SDK isn't in every role's bundle.
  //
  // Keyed on the user's id and role, not the user object: a profile refresh
  // replaces the object, and re-running this would needlessly unregister and
  // re-register the browser.
  const userId = user?.id;
  const userRole = user?.role;
  useEffect(() => {
    if (!token || !userId || !userRole || !FIELD_CREW_ROLES.includes(userRole)) return;
    let cancelled = false;
    let stopListening: (() => void) | null = null;
    const session = token; // still valid in the cleanup below, unlike the store's

    import('@/lib/firebasePush').then(async ({ registerWebPush, onForegroundMessage }) => {
      if (cancelled) return;
      registerWebPush();
      const stop = await onForegroundMessage(({ title, body }) => {
        addNotification({
          type: 'info',
          title: title || 'New notification',
          message: body || '',
        });
      });
      if (cancelled) stop();
      else stopListening = stop;
    });

    return () => {
      cancelled = true;
      stopListening?.();
      import('@/lib/firebasePush').then(({ unregisterWebPush }) => unregisterWebPush(session));
    };
  }, [addNotification, token, userId, userRole]);

  const location = useLocation();
  // Every page opens at the top. Keyed on the path only, so changing a filter
  // or search (?query) on the same page doesn't jump the user back up.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className="app">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        connected={isConnected}
        drawerOpen={drawerOpen}
        onCloseDrawer={() => setDrawerOpen(false)}
      />
      <div className="main">
        <TopBar
          onToggleSidebar={() =>
            window.matchMedia('(max-width: 859px)').matches ? setDrawerOpen((o) => !o) : setCollapsed((c) => !c)
          }
        />
        {!isConnected && (
          <div className="banner-warn">
            <span style={{ width: 8, height: 8, borderRadius: '99px', background: 'var(--amber)', flexShrink: 0, display: 'inline-block', animation: 'pulse 2s infinite' }} />
            Live connection lost - retrying…
          </div>
        )}
        {isConnected && reconnectedFlash && (
          <div className="banner-ok">
            <span style={{ width: 8, height: 8, borderRadius: '99px', background: 'var(--green)', flexShrink: 0, display: 'inline-block' }} />
            Reconnected
          </div>
        )}
        <main className="content">
          <Suspense fallback={<div className="p-10 flex justify-center"><AppLoader size={34} color="var(--green)" label="Loading" /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default AppShell;
