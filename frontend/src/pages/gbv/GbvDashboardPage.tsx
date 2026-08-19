import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ShieldAlert as ShieldWarning,
  User,
  Clock,
  CircleCheck as CheckCircle,
  Circle,
} from 'lucide-react';
import api from '@/api/client';
import { Incident } from '@/types/api';
import { formatDistanceToNow } from 'date-fns';
import { useAuthStore } from '@/stores/authStore';

const statusLabel: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  DISPATCH_HANDLING: 'Handling',
  DISPATCH_ON_HOLD: 'On Hold',
  DISPATCHED: 'Dispatched',
  RESOLVED: 'Resolved',
};

const statusColor: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SUBMITTED: 'bg-blue-50 text-blue-700',
  DISPATCH_HANDLING: 'bg-amber-50 text-amber-700',
  DISPATCH_ON_HOLD: 'bg-orange-50 text-orange-700',
  DISPATCHED: 'bg-brand-green/10 text-brand-green',
  RESOLVED: 'bg-slate-100 text-slate-500',
};

function GbvDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isPartner = user?.role === 'PARTNER';
  // Partners see the same view but scoped to GBV cases assigned to their agency.
  const { data: cases = [], isLoading } = useQuery<Incident[]>({
    queryKey: ['gbv', 'cases', isPartner ? 'partner' : 'eoc'],
    queryFn: async () => {
      const res = await api.get(isPartner ? '/partner/gbv-cases' : '/gbv/cases');
      return res.data.data;
    },
    refetchInterval: 30_000,
  });
  const detailPath = (caseId: string) => (isPartner ? `/partner/incidents/${caseId}` : `/gbv/cases/${caseId}`);

  const open = cases.filter(c => c.status !== 'RESOLVED');
  const resolved = cases.filter(c => c.status === 'RESOLVED');

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-sans text-[32px] font-bold text-brand-teal">GBV Case Register</h2>
          <p className="font-sans text-base text-slate-text mt-1">
            Gender-Based Violence cases referred for specialised handling.
          </p>
        </div>
        <div className="flex gap-4">
          <div className="bg-white border border-surface-border rounded-xl px-5 py-3 text-center">
            <p className="text-2xl font-bold text-brand-teal">{open.length}</p>
            <p className="text-xs text-slate-text mt-0.5">Open</p>
          </div>
          <div className="bg-white border border-surface-border rounded-xl px-5 py-3 text-center">
            <p className="text-2xl font-bold text-slate-500">{resolved.length}</p>
            <p className="text-xs text-slate-text mt-0.5">Resolved</p>
          </div>
        </div>
      </div>

      {/* Cases table */}
      <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-surface-border bg-slate-50 flex items-center gap-3">
          <ShieldWarning size={20} className="text-status-danger" />
          <h3 className="font-semibold text-brand-teal">All GBV Cases</h3>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-slate-text">Loading…</div>
        ) : cases.length === 0 ? (
          <div className="p-10 text-center text-slate-text">No GBV cases have been flagged yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-slate-50">
                <th className="text-left px-5 py-3 font-semibold text-slate-600">Case #</th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600">Survivor</th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600">Nature</th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600">GBV Form</th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600">Flagged</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {cases.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-mono font-bold text-brand-teal">{c.caseNumber}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <User size={14} className="text-slate-text" />
                      <span>{c.patientName || <span className="text-slate-400 italic">Unknown</span>}</span>
                    </div>
                    {c.patientAge && (
                      <span className="text-xs text-slate-400">{c.patientAge} · {c.patientGender ?? '-'}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-700">{c.alertNature || '-'}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[c.status] ?? 'bg-slate-100 text-slate-500'}`}>
                      {statusLabel[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {c.gbvReport ? (
                      <span className="flex items-center gap-1 text-brand-green text-xs font-medium">
                        <CheckCircle size={14} /> Filled
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-400 text-xs">
                        <Circle size={14} /> Pending
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-400 text-xs">
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      to={detailPath(c.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-brand-teal border border-brand-teal/30 rounded-lg hover:bg-brand-teal hover:text-white transition-all"
                    >
                      Open Case
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default GbvDashboardPage;
