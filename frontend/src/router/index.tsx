import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import RoleGuard from '@/components/shared/RoleGuard';
import AppShell from '@/components/layout/AppShell';
import LoginPage from '@/pages/auth/LoginPage';

// Heavy authenticated pages are code-split so they load on demand (keeps the
// initial bundle small). The Suspense boundary lives in AppShell.
const DashboardPage = lazy(() => import('@/pages/dispatcher/DashboardPage'));
const WallboardPage = lazy(() => import('@/pages/dispatcher/WallboardPage'));
const QueuePage = lazy(() => import('@/pages/dispatcher/QueuePage'));
const IncidentDetailPage = lazy(() => import('@/pages/dispatcher/IncidentDetailPage'));
const FleetPage = lazy(() => import('@/pages/dispatcher/FleetPage'));
const FuelPage = lazy(() => import('@/pages/dispatcher/FuelPage'));
const CallLogPage = lazy(() => import('@/pages/dispatcher/CallLogPage'));
const NewIncidentWizard = lazy(() => import('@/pages/watcher/NewIncidentWizard'));
const WatcherDashboardPage = lazy(() => import('@/pages/watcher/WatcherDashboardPage'));
const UserManagementPage = lazy(() => import('@/pages/admin/UserManagementPage'));
const SystemSettingsPage = lazy(() => import('@/pages/admin/SystemSettingsPage'));
const AnalyticsPage = lazy(() => import('@/pages/admin/AnalyticsPage'));
const SystemReportPage = lazy(() => import('@/pages/admin/SystemReportPage'));
const PartnerDashboardPage = lazy(() => import('@/pages/partner/PartnerDashboardPage'));
const PartnerCaseDetailPage = lazy(() => import('@/pages/partner/PartnerCaseDetailPage'));
const FacilitiesPage = lazy(() => import('@/pages/admin/FacilitiesPage'));
const PartnersPage = lazy(() => import('@/pages/admin/PartnersPage'));
const BulkSmsPage = lazy(() => import('@/pages/admin/BulkSmsPage'));
const NatureOptionsPage = lazy(() => import('@/pages/admin/NatureOptionsPage'));
const InventoryPage = lazy(() => import('@/pages/admin/InventoryPage'));
const StandbyPage = lazy(() => import('@/pages/dispatcher/StandbyPage'));
const PartnerAmbulancesPage = lazy(() => import('@/pages/admin/PartnerAmbulancesPage'));
const GbvDashboardPage = lazy(() => import('@/pages/gbv/GbvDashboardPage'));
const GbvCaseDetailPage = lazy(() => import('@/pages/gbv/GbvCaseDetailPage'));
const DriverDashboardPage = lazy(() => import('@/pages/driver/DriverDashboardPage'));
const OperatorNavigatePage = lazy(() => import('@/pages/operator/NavigatePage'));
const OperatorAssignmentPage = lazy(() => import('@/pages/operator/AssignmentPage'));
const OperatorCrewPage = lazy(() => import('@/pages/operator/CrewPage'));
const OperatorActivityPage = lazy(() => import('@/pages/operator/ActivityPage'));
const OperatorHistoryPage = lazy(() => import('@/pages/operator/HistoryPage'));
const OperatorPatientDataPage = lazy(() => import('@/pages/operator/PatientDataPage'));
const OperatorPatientCareReportPage = lazy(() => import('@/pages/operator/PatientCareReportPage'));
const OperatorInventoryPage = lazy(() => import('@/pages/operator/InventoryPage'));
const ProfilePage = lazy(() => import('@/pages/shared/ProfilePage'));
// Unauthenticated read-only display for the call-centre TV (token-gated).
const WallboardDisplayPage = lazy(() => import('@/pages/public/WallboardDisplayPage'));

// Placeholder components for unimplemented pages
const Unauthorized = () => <div className="p-10 font-sans font-bold text-status-danger text-center">Unauthorized Access</div>;

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    // Public, read-only wallboard for an unattended screen in the ops room.
    // Sits OUTSIDE AppShell and any RoleGuard on purpose - no login, no chrome.
    // Access is gated by ?token= matching the backend's WALLBOARD_TOKEN.
    path: '/display',
    element: (
      <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0E1A14' }} />}>
        <WallboardDisplayPage />
      </Suspense>
    ),
  },
  {
    path: '/unauthorized',
    element: <Unauthorized />,
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <Navigate to="/login" replace />,
      },
      {
        path: 'admin/users',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN']}>
            <UserManagementPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/facilities',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN']}>
            <FacilitiesPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/partners',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN']}>
            <PartnersPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/sms',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN']}>
            <BulkSmsPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/nature-options',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN']}>
            <NatureOptionsPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/inventory',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN']}>
            <InventoryPage />
          </RoleGuard>
        ),
      },
      
      {
        path: 'admin/settings',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN']}>
            <SystemSettingsPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/analytics',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'WATCHER', 'PARTNER']}>
            <AnalyticsPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/system-report',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN']}>
            <SystemReportPage />
          </RoleGuard>
        ),
      },
      {
        path: 'dashboard',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER']}>
            <DashboardPage />
          </RoleGuard>
        ),
      },
      {
        path: 'wallboard',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'WATCHER']}>
            <WallboardPage />
          </RoleGuard>
        ),
      },
      {
        path: 'fleet/fuel',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER']}>
            <FuelPage />
          </RoleGuard>
        ),
      },
      {
        path: 'queue',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER']}>
            <QueuePage />
          </RoleGuard>
        ),
      },
      {
        path: 'incidents/:id',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'PARTNER']}>
            <IncidentDetailPage />
          </RoleGuard>
        ),
      },
      {
        path: 'fleet',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER']}>
            <FleetPage />
          </RoleGuard>
        ),
      },
      {
        path: 'fleet/standby',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER']}>
            <StandbyPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/partner-ambulances',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER']}>
            <PartnerAmbulancesPage />
          </RoleGuard>
        ),
      },
      {
        path: 'call-logs',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER']}>
            <CallLogPage />
          </RoleGuard>
        ),
      },
      {
        path: 'watcher',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'WATCHER', 'DISPATCHER']}>
            <WatcherDashboardPage />
          </RoleGuard>
        ),
      },
      {
        path: 'watcher/new-incident',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'WATCHER', 'DISPATCHER']}>
            <NewIncidentWizard />
          </RoleGuard>
        ),
      },
      {
        path: 'partner/dashboard',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'PARTNER']}>
            <PartnerDashboardPage />
          </RoleGuard>
        ),
      },
      {
        path: 'partner/incidents/:id',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'PARTNER']}>
            <PartnerCaseDetailPage />
          </RoleGuard>
        ),
      },
      {
        path: 'gbv/dashboard',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'PARTNER']}>
            <GbvDashboardPage />
          </RoleGuard>
        ),
      },
      {
        path: 'gbv/cases/:id',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER']}>
            <GbvCaseDetailPage />
          </RoleGuard>
        ),
      },
      {
        path: 'driver/dashboard',
        element: (
          <RoleGuard allowed={['DRIVER']}>
            <DriverDashboardPage />
          </RoleGuard>
        ),
      },
      {
        path: 'operator',
        element: <Navigate to="/operator/assignment" replace />,
      },
      {
        path: 'operator/navigate',
        element: (
          <RoleGuard allowed={['DRIVER']}>
            <OperatorNavigatePage />
          </RoleGuard>
        ),
      },
      {
        path: 'operator/assignment',
        element: (
          <RoleGuard allowed={['DRIVER', 'EMT', 'NURSE']}>
            <OperatorAssignmentPage />
          </RoleGuard>
        ),
      },
      {
        path: 'operator/crew',
        element: (
          <RoleGuard allowed={['DRIVER', 'EMT', 'NURSE']}>
            <OperatorCrewPage />
          </RoleGuard>
        ),
      },
      {
        path: 'operator/activity',
        element: (
          <RoleGuard allowed={['DRIVER', 'EMT', 'NURSE']}>
            <OperatorActivityPage />
          </RoleGuard>
        ),
      },
      {
        path: 'operator/history',
        element: (
          <RoleGuard allowed={['DRIVER', 'EMT', 'NURSE']}>
            <OperatorHistoryPage />
          </RoleGuard>
        ),
      },
      {
        path: 'operator/inventory',
        element: (
          <RoleGuard allowed={['DRIVER', 'EMT', 'NURSE']}>
            <OperatorInventoryPage />
          </RoleGuard>
        ),
      },
      {
        path: 'operator/tasks/:taskId/patient-data',
        element: (
          <RoleGuard allowed={['DRIVER', 'EMT', 'NURSE']}>
            <OperatorPatientDataPage />
          </RoleGuard>
        ),
      },
      {
        path: 'operator/tasks/:taskId/patient-care-report',
        element: (
          <RoleGuard allowed={['DRIVER', 'EMT', 'NURSE']}>
            <OperatorPatientCareReportPage />
          </RoleGuard>
        ),
      },
      {
        // Self-service account page - available to every signed-in role (AppShell
        // already requires a token), not gated by RoleGuard like the role-scoped pages above.
        path: 'profile',
        element: <ProfilePage />,
      },
      {
        path: '*',
        element: <div className="p-10 font-sans font-bold text-slate-text text-center">Page Not Found</div>,
      },
    ],
  },
]);

export default router;
