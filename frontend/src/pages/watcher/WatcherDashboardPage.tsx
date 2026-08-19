import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  CirclePlus as PlusCircle,
  ClipboardList as ClipboardText,
  CircleCheck as CheckCircle,
  TriangleAlert as Warning,
  Clock,
  Ambulance,
  CircleX as XCircle,
} from 'lucide-react';
import EndCaseModal from '@/components/shared/EndCaseModal';
import { formatDistanceToNow } from 'date-fns';
import api from '@/api/client';
import { Incident, IncidentStatus } from '@/types/api';
import { useAuthStore } from '@/stores/authStore';
import { socket } from '@/lib/socket';

// Same status → pill-color convention used on the dispatcher queue, so a case
// reads the same way regardless of which role's screen you're looking at.
const STATUS_PILL: Record<IncidentStatus, string> = {
  DRAFT:             'pill-gray',
  SUBMITTED:         'pill-red',
  DISPATCH_HANDLING: 'pill-amber',
  DISPATCH_ON_HOLD:  'pill-gray',
  DISPATCHED:        'pill-blue',
  RESOLVED:          'pill-green',
};

const STATUS_LABEL: Record<IncidentStatus, string> = {
  DRAFT:             'Draft',
  SUBMITTED:         'Submitted',
  DISPATCH_HANDLING: 'Handling',
  DISPATCH_ON_HOLD:  'On Hold',
  DISPATCHED:        'Dispatched',
  RESOLVED:          'Resolved',
};

const FILTERS: (IncidentStatus | 'ALL')[] = ['ALL', 'DRAFT', 'SUBMITTED', 'DISPATCH_HANDLING', 'DISPATCHED', 'RESOLVED'];

function WatcherDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore(s => s.user);
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | 'ALL'>('ALL');
  const [endCaseTarget, setEndCaseTarget] = useState<Incident | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['watcher', 'incidents', user?.id],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (user?.id) params.set('watcherId', user.id);
      const res = await api.get(`/incidents?${params}`);
      return (res.data.data ?? []) as Incident[];
    },
    enabled: !!user?.id,
  });

  const incidents = data ?? [];

  useEffect(() => {
    function onIncidentUpdate(updated: Incident) {
      queryClient.setQueryData(
        ['watcher', 'incidents', user?.id],
        (old: Incident[] | undefined) =>
          old?.map(i => (i.id === updated.id ? { ...i, ...updated } : i)) ?? old
      );
    }
    function onIncidentNew(inc: Incident) {
      if ((inc as any).watcherId === user?.id) {
        queryClient.invalidateQueries({ queryKey: ['watcher', 'incidents', user?.id] });
      }
    }
    socket.on('incident:update', onIncidentUpdate);
    socket.on('incident:new', onIncidentNew);
    return () => {
      socket.off('incident:update', onIncidentUpdate);
      socket.off('incident:new', onIncidentNew);
    };
  }, [queryClient, user?.id]);

  const filtered = statusFilter === 'ALL'
    ? incidents
    : incidents.filter(i => i.status === statusFilter);

  const submittedCount  = incidents.filter(i => i.status === 'SUBMITTED').length;
  const dispatchedCount = incidents.filter(i => i.status === 'DISPATCHED' || i.status === 'DISPATCH_HANDLING').length;
  const resolvedCount   = incidents.filter(i => i.status === 'RESOLVED').length;

  return (
    <>
      {/* Page header */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div className="eyebrow">Watcher Portal</div>
          <div className="section-title" style={{ fontSize: 20, marginTop: 2 }}>My Alerts</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>Track incidents you've reported and their dispatch status</div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/watcher/new-incident')}>
          <PlusCircle size={16} /> New Incident
        </button>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat" onClick={() => setStatusFilter('ALL')}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="stat-ico" style={{ background: 'var(--blue-soft)' }}><ClipboardText size={18} color="var(--blue)" /></div>
          </div>
          <div className="stat-label">Total reported</div>
          <div className="stat-val">{incidents.length}</div>
          <div className="stat-foot"><ClipboardText size={12} /> All time submissions</div>
        </div>

        <div className="stat" onClick={() => setStatusFilter('SUBMITTED')}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="stat-ico" style={{ background: 'var(--red-soft)' }}><Clock size={18} color="var(--red)" /></div>
          </div>
          <div className="stat-label">Awaiting dispatch</div>
          <div className="stat-val">{submittedCount}</div>
          <div className="stat-foot" style={{ color: submittedCount > 0 ? 'var(--red)' : 'var(--muted)' }}>
            <Warning size={12} /> {submittedCount > 0 ? 'Needs attention' : 'Queue clear'}
          </div>
        </div>

        <div className="stat" onClick={() => setStatusFilter('DISPATCH_HANDLING')}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="stat-ico" style={{ background: 'var(--green-light)' }}><Ambulance size={18} color="var(--green)" /></div>
          </div>
          <div className="stat-label">In progress</div>
          <div className="stat-val">{dispatchedCount}</div>
          <div className="stat-foot"><Ambulance size={12} /> Units responding</div>
        </div>

        <div className="stat dark-stat" onClick={() => setStatusFilter('RESOLVED')}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="stat-ico" style={{ background: 'rgba(95,215,154,.15)' }}><CheckCircle size={18} color="#5FD79A" /></div>
          </div>
          <div className="stat-label">Resolved</div>
          <div className="stat-val">{resolvedCount}</div>
          <div className="stat-foot"><CheckCircle size={12} /> Cases closed</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            <Warning size={16} color="var(--muted)" />
            <span className="card-title" style={{ fontSize: 13.5 }}>Incident History</span>
          </div>
          <div className="seg" style={{ overflowX: 'auto', maxWidth: '100%' }}>
            {FILTERS.map(f => (
              <button
                key={f}
                className={statusFilter === f ? 'on' : ''}
                onClick={() => setStatusFilter(f)}
              >
                {f === 'ALL' ? 'All' : STATUS_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Complaint</th>
                <th>Location</th>
                <th>Reported</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
                    Loading incidents…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '56px 0' }}>
                    <ClipboardText size={36} color="var(--muted-2)" style={{ margin: '0 auto 12px' }} />
                    <div style={{ fontWeight: 600, color: 'var(--muted)', fontSize: 13.5 }}>No incidents yet</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Submitted alerts will appear here</div>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ margin: '16px auto 0' }}
                      onClick={() => navigate('/watcher/new-incident')}
                    >
                      <PlusCircle size={14} /> Submit your first alert
                    </button>
                  </td>
                </tr>
              ) : filtered.map(inc => (
                <tr key={inc.id} style={{ cursor: 'default' }}>
                  <td>
                    <span className="mono strong" style={{ fontSize: 13 }}>{inc.caseNumber}</span>
                    {inc.massCasualty && (
                      <span className="pill pill-red" style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px' }}>
                        <Warning size={9} /> MCI
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{inc.chiefComplaint}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13.5 }}>{inc.locationName}</div>
                    {inc.subCounty && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{inc.subCounty}</div>}
                  </td>
                  <td>
                    <span className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {formatDistanceToNow(new Date(inc.createdAt), { addSuffix: true })}
                    </span>
                  </td>
                  <td>
                    <span className={`pill ${STATUS_PILL[inc.status]}`}>{STATUS_LABEL[inc.status]}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {inc.status !== 'RESOLVED' && (
                      <button
                        onClick={() => setEndCaseTarget(inc)}
                        className="btn btn-sm"
                        style={{ background: 'var(--red-soft)', color: 'var(--red)', border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)' }}
                      >
                        <XCircle size={13} /> End Case
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isLoading && filtered.length > 0 && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
            Showing {filtered.length} of {incidents.length} incident{incidents.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {endCaseTarget && (
        <EndCaseModal
          incidentId={endCaseTarget.id}
          caseNumber={endCaseTarget.caseNumber}
          isOpen={!!endCaseTarget}
          onClose={() => setEndCaseTarget(null)}
          invalidateKeys={[['watcher', 'incidents', user?.id]]}
        />
      )}
    </>
  );
}

export default WatcherDashboardPage;
