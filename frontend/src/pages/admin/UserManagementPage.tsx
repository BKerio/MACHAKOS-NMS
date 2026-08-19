import { useState, type CSSProperties } from 'react';
import {
  UserPlus,
  Search as MagnifyingGlass,
  Power,
  Download,
  RotateCcw as ClockCounterClockwise,
  ChevronLeft as CaretLeft,
  ChevronRight as CaretRight,
  ShieldCheck,
  Check,
  X as XIcon,
  Pencil as PencilSimple,
  Building2 as Buildings,
  Trash2,
  TriangleAlert as AlertTriangle,
  Users,
} from 'lucide-react';
import { useNotificationStore } from '@/stores/notificationStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/api/client';
import { User, Agency, PaginatedResponse, Role } from '@/types/api';
import AddPersonnelModal from '@/components/shared/AddPersonnelModal';
import PartnerOnboardingModal from '@/components/shared/PartnerOnboardingModal';

const inputCls =
  'w-full border rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-all';
const inputStyle = {
  background: 'var(--surface)',
  borderColor: 'var(--border)',
  color: 'var(--ink)',
};

const EDIT_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'WATCHER', 'PARTNER', 'DRIVER', 'EMT', 'NURSE'];
const MAX_EDIT_ROLES = 2;

function sameRoles(a: Role[], b: Role[]) {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort();
  return [...a].sort().every((r, i) => r === sortedB[i]);
}

function UserManagementPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [editRoleTarget, setEditRoleTarget] = useState<{ id: string; name: string; email: string; roles: Role[]; agencyId: string | null } | null>(null);
  const [editRolesValue, setEditRolesValue] = useState<Role[]>(['WATCHER']);
  const [editAgencyValue, setEditAgencyValue] = useState('');
  const [editNameValue, setEditNameValue] = useState('');
  const [editEmailValue, setEditEmailValue] = useState('');
  const [editPasswordValue, setEditPasswordValue] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<Role | 'ALL'>('ALL');
  const [agencyFilter, setAgencyFilter] = useState('ALL');
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string; email: string; action: 'deactivate' | 'reactivate' | 'delete' } | null>(null);
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      return api.patch(`/admin/users/${userId}`, { isActive });
    },
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setConfirmTarget(null);
      addNotification({
        type: 'success',
        title: isActive ? 'User Activated' : 'User Deactivated',
        message: isActive ? 'Account has been reactivated.' : 'Account has been deactivated.',
      });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Action Failed', message: err?.response?.data?.message || 'Could not update user status.' });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => api.delete(`/admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setConfirmTarget(null);
      addNotification({ type: 'success', title: 'User Deleted', message: 'The account has been permanently removed.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Deletion Failed', message: err?.response?.data?.message || 'Could not delete user.' });
    },
  });

  const editRoleMutation = useMutation({
    mutationFn: ({ userId, ...data }: { userId: string; name?: string; email?: string; password?: string; roles?: Role[]; agencyId?: string }) =>
      api.patch(`/admin/users/${userId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setEditRoleTarget(null);
      addNotification({ type: 'success', title: 'User Updated', message: 'Changes have been saved.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Update Failed', message: err?.response?.data?.message || 'Could not update user.' });
    },
  });

  const { data: usersResponse, isLoading } = useQuery({
    queryKey: ['admin', 'users', currentPage, roleFilter, agencyFilter],
    queryFn: async () => {
      const params: any = { page: currentPage, limit: 10 };
      if (roleFilter !== 'ALL') params.role = roleFilter;
      if (agencyFilter !== 'ALL') params.agencyId = agencyFilter;
      const res = await api.get<PaginatedResponse<User>>('/admin/users', { params });
      return res.data;
    },
  });

  const { data: agencies = [] } = useQuery({
    queryKey: ['admin', 'agencies'],
    queryFn: async () => {
      const res = await api.get('/admin/agencies');
      return res.data.data as Agency[];
    },
  });

  const { data: auditLogsResponse, isLoading: auditLoading } = useQuery({
    queryKey: ['admin', 'audit-logs'],
    queryFn: async () => {
      const res = await api.get('/admin/audit-logs?limit=50');
      return res.data.data as { id: string; createdAt: string; action: string; subjectId?: string; user?: { name: string; email: string } }[];
    },
    enabled: showAuditModal,
  });

  const auditLogs = auditLogsResponse ?? [];

  function downloadAuditCSV() {
    const headers = ['Time', 'User', 'Email', 'Action', 'Subject'];
    const rows = auditLogs.map(l => [
      new Date(l.createdAt).toISOString(),
      l.user?.name ?? '',
      l.user?.email ?? '',
      l.action,
      l.subjectId ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Audit_Log_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  const users = usersResponse?.data || [];
  const meta = usersResponse?.meta || { total: 0, page: 1, limit: 10, totalPages: 0 };
  const activeOnPage = users.filter(u => u.isActive).length;
  const inactiveOnPage = users.filter(u => !u.isActive).length;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  function exportRosterCSV() {
    const headers = ['Name', 'Email', 'Role', 'Agency', 'Status', 'Phone'];
    const rows = users.map(u => [
      u.name,
      u.email,
      u.role,
      (u as any).agency?.name ?? '',
      u.isActive ? 'Active' : 'Inactive',
      u.phone ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Personnel_Roster_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    addNotification({ type: 'success', title: 'Exported', message: 'Personnel roster downloaded.' });
  }

  const avatarTone = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN': return 'bg-brand-teal text-white';
      case 'ADMIN': return 'bg-brand-green text-white';
      case 'DISPATCHER': return 'bg-[#006973] text-white';
      case 'WATCHER': return 'bg-status-info text-white';
      default: return 'text-brand-teal';
    }
  };

  const avatarStyle = (role: string): CSSProperties | undefined => {
    if (['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'WATCHER'].includes(role)) return undefined;
    return { background: 'var(--surface-2)', color: 'var(--ink)' };
  };

  const filteredUsers = users.filter(
    u =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleEditRole = (role: Role) => {
    setEditRolesValue(prev => {
      const selected = prev.includes(role);
      if (!selected && prev.length >= MAX_EDIT_ROLES) {
        addNotification({
          type: 'error',
          title: 'Role Limit Reached',
          message: `A user can hold at most ${MAX_EDIT_ROLES} roles. Remove one before adding another.`,
        });
        return prev;
      }
      const next = selected ? prev.filter(r => r !== role) : [...prev, role];
      return next.length ? next : prev;
    });
  };

  return (
    <div className="col" style={{ gap: 24 }}>

      {/* Header */}
      <div
        className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 p-4 sm:p-6 lg:p-8 rounded-xl border shadow-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-6 bg-brand-green rounded-full" />
            <p className="font-sans text-[11px] font-black tracking-[0.2em]" style={{ color: 'var(--muted)' }}>
              Access Control
            </p>
          </div>
          <h2 className="font-sans text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>
            User Management
          </h2>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <button
            onClick={() => setIsPartnerModalOpen(true)}
            className="flex-1 sm:flex-none font-black text-xs tracking-widest px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-all border"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }}
          >
            <Users size={18} />
            Onboard Partner
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn btn-primary flex-1 sm:flex-none flex items-center justify-center gap-3 px-6 py-3 sm:px-8 sm:py-4 text-xs"
          >
            <UserPlus size={20} />
            Add User
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: meta.total },
          { label: 'Active (page)', value: activeOnPage },
          { label: 'Inactive (page)', value: inactiveOnPage },
          { label: 'Agencies', value: agencies?.length ?? 0 },
        ].map(stat => (
          <div
            key={stat.label}
            className="p-6 rounded-xl border shadow-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="font-sans text-[10px] font-black tracking-[0.2em] mb-2" style={{ color: 'var(--muted)' }}>
              {stat.label}
            </div>
            <div className="font-sans text-4xl font-black leading-none" style={{ color: 'var(--ink)' }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        className="rounded-xl border p-4 flex flex-col lg:flex-row items-stretch lg:items-center gap-4 lg:gap-6 shadow-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="relative flex-1">
          <MagnifyingGlass
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--muted-2)' }}
          />
          <input
            className={inputCls + ' pl-11'}
            style={inputStyle}
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-3 flex-1">
            <span className="font-sans text-[10px] font-black tracking-[0.2em]" style={{ color: 'var(--muted)' }}>
              Role
            </span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className={inputCls + ' cursor-pointer'}
              style={inputStyle}
            >
              <option value="ALL">All Roles</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ADMIN">Admin</option>
              <option value="DISPATCHER">Dispatcher</option>
              <option value="WATCHER">Watcher</option>
              <option value="PARTNER">Partner</option>
              <option value="DRIVER">Driver</option>
              <option value="EMT">EMT</option>
              <option value="NURSE">Nurse</option>
            </select>
          </div>
          <div className="flex items-center gap-3 flex-1">
            <span className="font-sans text-[10px] font-black tracking-[0.2em]" style={{ color: 'var(--muted)' }}>
              Agency
            </span>
            <select
              value={agencyFilter}
              onChange={e => { setAgencyFilter(e.target.value); setCurrentPage(1); }}
              className={inputCls + ' cursor-pointer'}
              style={inputStyle}
            >
              <option value="ALL">All Agencies</option>
              {agencies?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
        {/* Table */}
        <div
          className="flex-[3] rounded-xl shadow-sm border overflow-hidden flex flex-col min-h-[500px]"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="overflow-x-auto flex-1 hide-scrollbar">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
                <div className="w-10 h-10 border-2 border-brand-teal/20 border-t-brand-teal rounded-full animate-spin" />
                <p className="font-bold text-xs tracking-widest" style={{ color: 'var(--muted)' }}>
                  Loading users...
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    {['Personnel', 'Role', 'Agency', 'Status', ''].map((h, i) => (
                      <th
                        key={h || `actions-${i}`}
                        className={`px-6 py-4 font-sans text-[10px] font-black tracking-[0.2em] ${h === '' ? 'text-right' : ''}`}
                        style={{ color: 'var(--muted)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <ShieldCheck size={40} style={{ color: 'var(--muted-2)' }} />
                          <p className="font-bold text-sm" style={{ color: 'var(--muted)' }}>
                            No users found
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map(u => (
                      <tr
                        key={u.id}
                        className="transition-colors"
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${avatarTone(u.role)}`}
                              style={avatarStyle(u.role)}
                            >
                              {getInitials(u.name)}
                            </div>
                            <div>
                              <div className="font-bold text-sm tracking-tight" style={{ color: 'var(--ink)' }}>
                                {u.name}
                              </div>
                              <div className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
                                {u.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {(u.roles?.length ? u.roles : [u.role]).map((r) => (
                              <span
                                key={r}
                                className="inline-flex px-2.5 py-1 rounded-md text-[10px] font-black tracking-widest"
                                style={{ background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                              >
                                {r.replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                            {(u as any).agency?.name || 'Unassigned'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ background: u.isActive ? 'var(--green)' : 'var(--red)' }}
                            />
                            <span
                              className="font-black text-[11px] tracking-widest"
                              style={{ color: u.isActive ? 'var(--ink)' : 'var(--red)' }}
                            >
                              {u.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                const roles = u.roles?.length ? u.roles : [u.role];
                                setEditRoleTarget({ id: u.id, name: u.name, email: u.email, roles, agencyId: u.agencyId });
                                setEditRolesValue(roles);
                                setEditAgencyValue(u.agencyId ?? '');
                                setEditNameValue(u.name);
                                setEditEmailValue(u.email);
                                setEditPasswordValue('');
                              }}
                              title="Edit User"
                              className="p-2 rounded-lg border transition-colors hover:opacity-70"
                              style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface)' }}
                            >
                              <PencilSimple size={16} />
                            </button>
                            <button
                              onClick={() => setConfirmTarget({ id: u.id, name: u.name, email: u.email, action: u.isActive ? 'deactivate' : 'reactivate' })}
                              title={u.isActive ? 'Deactivate Account' : 'Reactivate Account'}
                              className="p-2 rounded-lg border transition-colors hover:opacity-70"
                              style={{ borderColor: 'var(--border)', color: u.isActive ? 'var(--green)' : 'var(--muted-2)', background: 'var(--surface)' }}
                            >
                              <Power size={16} />
                            </button>
                            <button
                              onClick={() => setConfirmTarget({ id: u.id, name: u.name, email: u.email, action: 'delete' })}
                              title="Delete User"
                              className="p-2 rounded-lg border transition-colors hover:opacity-70"
                              style={{ borderColor: 'var(--border)', color: 'var(--red)', background: 'var(--surface)' }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          <div
            className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row gap-4 justify-between items-center"
            style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}
          >
            <div className="text-[11px] font-bold tracking-widest text-center sm:text-left" style={{ color: 'var(--muted)' }}>
              Showing {users.length} of {meta.total} users
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border disabled:opacity-30 transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}
              >
                <CaretLeft size={18} />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className="w-9 h-9 rounded-lg font-black text-xs transition-colors border"
                    style={
                      currentPage === p
                        ? { background: 'var(--ink)', color: 'var(--surface)', borderColor: 'var(--ink)' }
                        : { background: 'var(--surface)', color: 'var(--muted)', borderColor: 'var(--border)' }
                    }
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(meta.totalPages, p + 1))}
                disabled={currentPage === meta.totalPages || meta.totalPages === 0}
                className="p-2 rounded-lg border disabled:opacity-30 transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}
              >
                <CaretRight size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="flex-1 flex flex-col gap-4">
          <div
            className="rounded-xl p-6 border shadow-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <h4 className="font-sans text-lg font-black tracking-tight mb-5" style={{ color: 'var(--ink)' }}>
              Actions
            </h4>
            <div className="flex flex-col gap-3">
              <button
                onClick={exportRosterCSV}
                className="flex items-center justify-between p-4 rounded-xl transition-colors border"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }}
              >
                <span className="font-black text-[11px] tracking-widest">Export Roster</span>
                <Download size={18} style={{ color: 'var(--muted)' }} />
              </button>
              <button
                onClick={() => setShowAuditModal(true)}
                className="flex items-center justify-between p-4 rounded-xl transition-colors border"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }}
              >
                <span className="font-black text-[11px] tracking-widest">Audit Log</span>
                <ClockCounterClockwise size={18} style={{ color: 'var(--muted)' }} />
              </button>
            </div>
          </div>

          <div
            className="rounded-xl border shadow-sm flex-1 min-h-[200px] p-6 flex flex-col justify-between"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div>
              <p className="font-sans text-[10px] font-black tracking-[0.2em] mb-2" style={{ color: 'var(--muted)' }}>
                Overview
              </p>
              <p className="font-sans text-xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>
                Personnel Summary
              </p>
              <p className="text-xs font-medium mt-3 leading-relaxed" style={{ color: 'var(--muted)' }}>
                {meta.total} registered users across {agencies?.length ?? 0}{' '}
                {agencies?.length === 1 ? 'agency' : 'agencies'}.
              </p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <p className="text-[9px] font-black tracking-widest mb-1" style={{ color: 'var(--muted)' }}>
                  Active
                </p>
                <p className="text-2xl font-black" style={{ color: 'var(--green)' }}>
                  {activeOnPage}
                </p>
              </div>
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <p className="text-[9px] font-black tracking-widest mb-1" style={{ color: 'var(--muted)' }}>
                  Inactive
                </p>
                <p className="text-2xl font-black" style={{ color: 'var(--red)' }}>
                  {inactiveOnPage}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit User Modal */}
      {editRoleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditRoleTarget(null)} />
          <div
            className="relative rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div
              className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-3">
                <PencilSimple size={18} className="text-brand-teal" />
                <div>
                  <p className="text-xs tracking-widest font-bold" style={{ color: 'var(--muted)' }}>
                    Edit User
                  </p>
                  <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                    {editRoleTarget.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditRoleTarget(null)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--muted)' }}
              >
                <XIcon size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-black tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                  Name
                </label>
                <input
                  type="text"
                  className={inputCls}
                  style={inputStyle}
                  value={editNameValue}
                  onChange={e => setEditNameValue(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                  Email
                </label>
                <input
                  type="email"
                  className={inputCls}
                  style={inputStyle}
                  value={editEmailValue}
                  onChange={e => setEditEmailValue(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                  Reset Password
                </label>
                <input
                  type="password"
                  placeholder="Leave blank to keep current password"
                  autoComplete="new-password"
                  className={inputCls}
                  style={inputStyle}
                  value={editPasswordValue}
                  onChange={e => setEditPasswordValue(e.target.value)}
                />
                {editPasswordValue.length > 0 && editPasswordValue.length < 8 && (
                  <p className="text-xs font-medium mt-1.5" style={{ color: 'var(--amber, #B45309)' }}>
                    Password must be at least 8 characters.
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[10px] font-black tracking-widest" style={{ color: 'var(--muted)' }}>
                    Roles
                  </label>
                  <span className="text-[10px] font-bold" style={{ color: 'var(--muted)' }}>
                    {editRolesValue.length}/{MAX_EDIT_ROLES} selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {EDIT_ROLES.map(r => {
                    const selected = editRolesValue.includes(r);
                    const disabled = !selected && editRolesValue.length >= MAX_EDIT_ROLES;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleEditRole(r)}
                        disabled={disabled}
                        className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[10px] font-black tracking-wide transition-colors disabled:cursor-not-allowed"
                        style={
                          selected
                            ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: 'var(--surface)' }
                            : { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--muted)', opacity: disabled ? 0.4 : 1 }
                        }
                      >
                        {selected && <Check size={11} strokeWidth={3} />}
                        {r.replace('_', ' ')}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
                  Users can hold up to {MAX_EDIT_ROLES} roles. If more than one is assigned, they'll choose which to sign in as at login.
                </p>
              </div>

              {editRolesValue.includes('PARTNER') && (
                <div>
                  <label className="block text-[10px] font-black tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                    <Buildings size={10} className="inline mr-1" />
                    Assign to Partner Agency
                  </label>
                  <select
                    className={inputCls + ' cursor-pointer'}
                    style={inputStyle}
                    value={editAgencyValue}
                    onChange={e => setEditAgencyValue(e.target.value)}
                  >
                    <option value={editRoleTarget.agencyId ?? ''}>Keep current agency</option>
                    {agencies.filter(a => a.type === 'PARTNER').map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  {agencies.filter(a => a.type === 'PARTNER').length === 0 && (
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                      No partner agencies yet. Use &quot;Onboard Partner&quot; to create one first.
                    </p>
                  )}
                </div>
              )}

              {!sameRoles(editRolesValue, editRoleTarget.roles) && (
                <div
                  className="rounded-xl px-4 py-2.5 text-xs font-medium border"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                >
                  Roles will change from{' '}
                  <span className="font-bold">{editRoleTarget.roles.map(r => r.replace('_', ' ')).join(', ')}</span>
                  {' to '}
                  <span className="font-bold">{editRolesValue.map(r => r.replace('_', ' ')).join(', ')}</span>
                  . User gets new permissions on next login.
                </div>
              )}
            </div>
            <div className="px-5 pb-5 flex gap-3 justify-end">
              <button
                onClick={() => setEditRoleTarget(null)}
                className="px-4 py-2 border text-sm font-bold rounded-xl transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => editRoleMutation.mutate({
                  userId: editRoleTarget.id,
                  name: editNameValue.trim() !== editRoleTarget.name ? editNameValue.trim() : undefined,
                  email: editEmailValue.trim() !== editRoleTarget.email ? editEmailValue.trim() : undefined,
                  password: editPasswordValue.length >= 8 ? editPasswordValue : undefined,
                  roles: !sameRoles(editRolesValue, editRoleTarget.roles) ? editRolesValue : undefined,
                  agencyId: editRolesValue.includes('PARTNER') && editAgencyValue && editAgencyValue !== (editRoleTarget.agencyId ?? '') ? editAgencyValue : undefined,
                })}
                disabled={
                  editRoleMutation.isPending ||
                  (editPasswordValue.length > 0 && editPasswordValue.length < 8) ||
                  (
                    sameRoles(editRolesValue, editRoleTarget.roles) &&
                    editNameValue.trim() === editRoleTarget.name &&
                    editEmailValue.trim() === editRoleTarget.email &&
                    editPasswordValue.length === 0
                  )
                }
                className="btn btn-primary flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check size={14} />
                {editRoleMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Action Dialog */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !toggleActiveMutation.isPending && !deleteUserMutation.isPending && setConfirmTarget(null)}
          />
          <div
            className="relative rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div
              className="px-5 py-4 flex items-center gap-3"
              style={{
                borderBottom: '1px solid var(--border)',
                background:
                  confirmTarget.action === 'delete'
                    ? 'var(--red)'
                    : confirmTarget.action === 'deactivate'
                      ? '#B45309'
                      : 'var(--surface-2)',
                color: confirmTarget.action === 'reactivate' ? 'var(--ink)' : '#fff',
              }}
            >
              {confirmTarget.action === 'delete'
                ? <Trash2 size={18} />
                : <AlertTriangle size={18} />}
              <div>
                <p className="text-xs tracking-widest font-bold opacity-80">
                  {confirmTarget.action === 'delete' ? 'Irreversible Action' : 'Confirm Action'}
                </p>
                <p className="text-sm font-bold">
                  {confirmTarget.action === 'delete'
                    ? 'Delete User'
                    : confirmTarget.action === 'deactivate'
                      ? 'Deactivate Account'
                      : 'Reactivate Account'}
                </p>
              </div>
            </div>
            <div className="p-5 space-y-1">
              <p className="text-sm font-black tracking-tight" style={{ color: 'var(--ink)' }}>
                {confirmTarget.name}
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {confirmTarget.email}
              </p>
              <p className="text-sm leading-relaxed pt-3" style={{ color: 'var(--muted)' }}>
                {confirmTarget.action === 'delete' &&
                  'This permanently removes the account and cannot be undone. If this user has associated incidents, tasks, or vehicle assignments, deletion will be blocked. Deactivate the account instead.'}
                {confirmTarget.action === 'deactivate' &&
                  'The user will immediately lose access to the system. You can reactivate the account at any time.'}
                {confirmTarget.action === 'reactivate' &&
                  'The user will regain access to the system with their existing role and permissions.'}
              </p>
            </div>
            <div className="px-5 pb-5 flex gap-3 justify-end">
              <button
                onClick={() => setConfirmTarget(null)}
                disabled={toggleActiveMutation.isPending || deleteUserMutation.isPending}
                className="px-4 py-2 border text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmTarget.action === 'delete') deleteUserMutation.mutate(confirmTarget.id);
                  else toggleActiveMutation.mutate({ userId: confirmTarget.id, isActive: confirmTarget.action === 'reactivate' });
                }}
                disabled={toggleActiveMutation.isPending || deleteUserMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 text-white text-sm font-bold rounded-xl transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: confirmTarget.action === 'delete' ? 'var(--red)' : 'var(--ink)',
                }}
              >
                {confirmTarget.action === 'delete' ? <Trash2 size={14} /> : <Check size={14} />}
                {toggleActiveMutation.isPending || deleteUserMutation.isPending
                  ? 'Processing...'
                  : confirmTarget.action === 'delete'
                    ? 'Delete Permanently'
                    : confirmTarget.action === 'deactivate'
                      ? 'Deactivate'
                      : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAuditModal(false)} />
          <div
            className="relative rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden border"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div
              className="px-5 py-4 flex items-center justify-between flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-3">
                <ClockCounterClockwise size={18} className="text-brand-teal" />
                <div>
                  <p className="text-xs tracking-widest font-bold" style={{ color: 'var(--muted)' }}>
                    System Records
                  </p>
                  <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                    Audit Log
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadAuditCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface-2)' }}
                >
                  <Download size={13} /> Export CSV
                </button>
                <button
                  onClick={() => setShowAuditModal(false)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--muted)' }}
                >
                  <XIcon size={16} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {auditLoading ? (
                <div className="flex items-center justify-center py-16 gap-3">
                  <div className="w-8 h-8 border-2 border-brand-teal/20 border-t-brand-teal rounded-full animate-spin" />
                  <p className="text-xs font-bold tracking-widest" style={{ color: 'var(--muted)' }}>
                    Loading audit records...
                  </p>
                </div>
              ) : auditLogs.length === 0 ? (
                <p className="text-center text-sm py-16" style={{ color: 'var(--muted)' }}>
                  No audit records found.
                </p>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }} className="sticky top-0">
                      {['Time', 'User', 'Action', 'Subject'].map(h => (
                        <th
                          key={h}
                          className="px-5 py-3 text-xs font-black tracking-widest"
                          style={{ color: 'var(--muted)' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map(log => (
                      <tr
                        key={log.id}
                        className="transition-colors"
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        <td className="px-5 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                          {new Date(log.createdAt).toLocaleString('en-GB', {
                            timeZone: 'Africa/Nairobi',
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-5 py-3">
                          <div className="text-xs font-bold" style={{ color: 'var(--ink)' }}>
                            {log.user?.name ?? '-'}
                          </div>
                          <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                            {log.user?.email ?? ''}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                          {log.action}
                        </td>
                        <td className="px-5 py-3 text-xs font-mono" style={{ color: 'var(--muted)' }}>
                          {log.subjectId ?? '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <AddPersonnelModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
      <PartnerOnboardingModal
        isOpen={isPartnerModalOpen}
        onClose={() => setIsPartnerModalOpen(false)}
      />
    </div>
  );
}

export default UserManagementPage;
