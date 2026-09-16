import {
  Shield as ShieldStar,
  Database,
  Plug as PlugsConnected,
  Download,
  ToggleLeft,
  ToggleRight,
  CircleCheck as CheckCircle,
  CircleX as XCircle,
  RefreshCw as ArrowsClockwise,
  Plus,
  Trash2 as Trash,
  Tag,
} from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/api/client';
import { useNotificationStore } from '@/stores/notificationStore';

interface SystemHealth {
  db: 'online' | 'offline';
  redis: 'online' | 'offline';
  gpsConfigured: boolean;
  pbxConfigured: boolean;
  maintenanceMode: boolean;
  checkedAt: string;
}

function StatusBadge({ online, label }: { online: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1 font-medium text-sm ${online ? 'text-brand-green' : 'text-status-danger'}`}>
      {online ? <CheckCircle /> : <XCircle />}
      {label}
    </span>
  );
}

function NatureOptionsManager() {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const [newNature, setNewNature] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [selectedNature, setSelectedNature] = useState('');

  const { data: options = [] } = useQuery<{ id: string; nature: string; detail: string | null }[]>({
    queryKey: ['nature-options'],
    queryFn: async () => {
      const res = await api.get('/admin/nature-options');
      return res.data.data;
    },
  });

  const uniqueNatures = [...new Set(options.map(o => o.nature))];

  const addMutation = useMutation({
    mutationFn: (body: { nature: string; detail?: string }) => api.post('/admin/nature-options', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nature-options'] });
      setNewNature(''); setNewDetail('');
      addNotification({ type: 'success', title: 'Added', message: 'Nature option saved.' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/nature-options/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nature-options'] }),
  });

  return (
    <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 border-b border-surface-border bg-slate-50 flex items-center gap-3">
        <Tag size={20} className="text-slate-text" />
        <h3 className="font-semibold text-brand-teal">Incident Nature Options</h3>
      </div>
      <div className="p-6 flex flex-col gap-6">

        {/* Add new nature */}
        <div>
          <h4 className="text-sm font-bold text-slate-800 mb-2">Add Nature Category</h4>
          <div className="flex gap-2">
            <input
              className="flex-1 border border-surface-border rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. Trauma"
              value={newNature}
              onChange={e => setNewNature(e.target.value)}
            />
            <button
              onClick={() => newNature.trim() && addMutation.mutate({ nature: newNature.trim() })}
              className="bg-brand-teal text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1 hover:opacity-90"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        </div>

        {/* Add specific detail under a nature */}
        <div>
          <h4 className="text-sm font-bold text-slate-800 mb-2">Add Specific Nature (under a category)</h4>
          <div className="flex gap-2">
            <select
              className="border border-surface-border rounded-lg px-3 py-2 text-sm w-40"
              value={selectedNature}
              onChange={e => setSelectedNature(e.target.value)}
            >
              <option value="">Category…</option>
              {uniqueNatures.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <input
              className="flex-1 border border-surface-border rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. Road Traffic Accident"
              value={newDetail}
              onChange={e => setNewDetail(e.target.value)}
            />
            <button
              onClick={() => selectedNature && newDetail.trim() && addMutation.mutate({ nature: selectedNature, detail: newDetail.trim() })}
              className="bg-brand-teal text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1 hover:opacity-90"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        </div>

        {/* List all natures with their details */}
        <div className="flex flex-col gap-4">
          {uniqueNatures.map(nature => {
            const topLevel = options.find(o => o.nature === nature && !o.detail);
            const details = options.filter(o => o.nature === nature && o.detail);
            return (
              <div key={nature} className="border border-surface-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-slate-800">{nature}</span>
                  {topLevel && (
                    <button onClick={() => deleteMutation.mutate(topLevel.id)} className="text-red-400 hover:text-red-600">
                      <Trash size={14} />
                    </button>
                  )}
                </div>
                {details.map(d => (
                  <div key={d.id} className="flex items-center justify-between pl-4 py-0.5">
                    <span className="text-xs text-slate-500">→ {d.detail}</span>
                    <button onClick={() => deleteMutation.mutate(d.id)} className="text-red-300 hover:text-red-500">
                      <Trash size={12} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
          {uniqueNatures.length === 0 && (
            <p className="text-sm text-slate-400 italic">No nature options yet. Add some above.</p>
          )}
        </div>
      </div>
    </div>
  );
}



function SystemSettingsPage() {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();

  const { data: health, isLoading, refetch } = useQuery<SystemHealth>({
    queryKey: ['admin', 'system-health'],
    queryFn: async () => {
      const res = await api.get('/admin/system-health');
      return res.data.data as SystemHealth;
    },
    refetchInterval: 30_000,
  });

  const maintenanceMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await api.post('/admin/system-health/maintenance', { enabled });
      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'system-health'] });
      addNotification({
        type: enabled ? 'warning' : 'success',
        title: 'System State Changed',
        message: enabled
          ? 'Maintenance mode engaged. New connections suspended.'
          : 'Maintenance mode disabled. System operating normally.',
      });
    },
    onError: () => {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to toggle maintenance mode.' });
    },
  });

  const handleExportAuditLogs = async () => {
    try {
      const res = await api.get('/admin/audit-logs?limit=200');
      const rows = res.data.data as any[];
      const csv = [
        ['Time', 'User', 'Action', 'Subject Type', 'Subject ID'].join(','),
        ...rows.map(r =>
          [
            new Date(r.createdAt).toISOString(),
            `"${r.user?.name ?? r.userId}"`,
            r.action,
            r.subjectType,
            r.subjectId,
          ].join(',')
        ),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      addNotification({ type: 'success', title: 'Export Complete', message: 'Audit logs exported to CSV.' });
    } catch {
      addNotification({ type: 'error', title: 'Export Failed', message: 'Could not fetch audit logs.' });
    }
  };

  const maintenanceMode = health?.maintenanceMode ?? false;

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="mb-4">
        <h2 className="font-sans text-[32px] font-bold text-brand-teal">System Configuration</h2>
        <p className="font-sans text-base text-slate-text mt-1">Manage global platform behaviors and integration hooks.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 flex flex-col gap-6">

          {/* Security & Access */}
          <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-surface-border bg-slate-50 flex items-center gap-3">
              <ShieldStar size={20} className="text-slate-text" />
              <h3 className="font-semibold text-brand-teal">Security & Access</h3>
            </div>
            <div className="p-6 flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-sans text-sm font-bold text-slate-800">Two-Factor Authentication (2FA)</h4>
                  <p className="font-sans text-sm text-slate-500 mt-1">Require 2FA for all Super Admin and Admin roles.</p>
                </div>
                <span className="text-xs text-slate-400 italic">Coming soon</span>
              </div>
              <div className="flex justify-between items-center border-t border-surface-border pt-6">
                <div>
                  <h4 className="font-sans text-sm font-bold text-slate-800">Session Timeout</h4>
                  <p className="font-sans text-sm text-slate-500 mt-1">Automatically log out inactive dispatchers.</p>
                </div>
                <select className="bg-slate-50 border border-surface-border rounded-lg px-4 py-2 text-sm outline-none">
                  <option>15 Minutes</option>
                  <option>30 Minutes</option>
                  <option>1 Hour</option>
                  <option>Never</option>
                </select>
              </div>
            </div>
          </div>
          <NatureOptionsManager />

          {/* External Integrations */}
          
          <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-surface-border bg-slate-50 flex items-center gap-3">
              <PlugsConnected size={20} className="text-slate-text" />
              <h3 className="font-semibold text-brand-teal">External Integrations</h3>
            </div>
            <div className="p-6 flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-sans text-sm font-bold text-slate-800">Kimiitrack GPS Sync</h4>
                  <p className="font-sans text-sm text-slate-500 mt-1">Live telemetry from ambulance units via Uffizio API.</p>
                </div>
                {isLoading ? (
                  <span className="text-sm text-slate-400">Checking…</span>
                ) : (
                  <StatusBadge online={health?.gpsConfigured ?? false} label={health?.gpsConfigured ? 'Configured' : 'Not Configured'} />
                )}
              </div>
              <div className="flex justify-between items-center border-t border-surface-border pt-6">
                <div>
                  <h4 className="font-sans text-sm font-bold text-slate-800">Yeastar PBX</h4>
                  <p className="font-sans text-sm text-slate-500 mt-1">Click-to-call and CDR logging via Yeastar P-Series.</p>
                </div>
                {isLoading ? (
                  <span className="text-sm text-slate-400">Checking…</span>
                ) : (
                  <StatusBadge online={health?.pbxConfigured ?? false} label={health?.pbxConfigured ? 'Configured' : 'Not Configured'} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* System Health Widget */}
        <div className="md:col-span-1 flex flex-col gap-6">
          <div className="bg-brand-sidebar p-6 rounded-xl flex flex-col gap-4 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Database size={20} className="text-brand-green" />
                <h3 className="font-sans text-lg font-bold">System Health</h3>
              </div>
              <button
                onClick={() => refetch()}
                className="text-white/50 hover:text-white transition-colors"
                title="Refresh"
              >
                <ArrowsClockwise size={16} />
              </button>
            </div>

            <div className="bg-black/20 p-4 rounded-lg flex items-center justify-between">
              <span className="font-sans text-sm text-slate-300">API Gateway</span>
              <StatusBadge online label="Online" />
            </div>

            <div className="bg-black/20 p-4 rounded-lg flex items-center justify-between">
              <span className="font-sans text-sm text-slate-300">Database</span>
              {isLoading ? (
                <span className="text-sm text-slate-400">-</span>
              ) : (
                <StatusBadge online={health?.db === 'online'} label={health?.db === 'online' ? 'Online' : 'Offline'} />
              )}
            </div>

            <div className="bg-black/20 p-4 rounded-lg flex items-center justify-between">
              <span className="font-sans text-sm text-slate-300">Redis Cache</span>
              {isLoading ? (
                <span className="text-sm text-slate-400">-</span>
              ) : (
                <StatusBadge online={health?.redis === 'online'} label={health?.redis === 'online' ? 'Online' : 'Offline'} />
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="flex justify-between items-center">
                <span className={`font-sans text-sm font-bold ${maintenanceMode ? 'text-status-warning' : 'text-slate-300'}`}>
                  Maintenance Mode
                </span>
                <button
                  onClick={() => maintenanceMutation.mutate(!maintenanceMode)}
                  disabled={maintenanceMutation.isPending}
                  className={`transition-colors ${maintenanceMode ? 'text-status-warning' : 'text-slate-500'}`}
                >
                  {maintenanceMode ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
                </button>
              </div>
              {health?.checkedAt && (
                <p className="text-[10px] text-white/30 mt-3">
                  Last checked {new Date(health.checkedAt).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-surface-border">
            <h4 className="font-semibold text-brand-teal mb-4">Data Management</h4>
            <button
              onClick={handleExportAuditLogs}
              className="w-full flex items-center justify-between p-3.5 bg-slate-50 rounded-lg hover:bg-slate-100 transition-all text-brand-teal border border-surface-border"
            >
              <span className="text-sm font-medium">Export Audit Logs</span>
              <Download size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SystemSettingsPage;
