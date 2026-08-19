import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleAlert as WarningCircle,
  RadioTower as Broadcast,
  Truck,
  Timer,
  Layers as Stack,
  Maximize as CornersOut,
  X,
  ListChecks,
} from 'lucide-react';
import api from '@/api/client';
import { Incident } from '@/types/api';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { socket } from '@/lib/socket';
import Map from '@/components/shared/Map';
import { useVehicleTracking, LiveVehicle } from '@/hooks/useVehicleTracking';
import VehicleDispatchPanel from '@/components/shared/VehicleDispatchPanel';

function DashboardPage() {
  const navigate = useNavigate();
  const [mapLayer, setMapLayer] = useState<'light' | 'dark' | 'street'>('light');
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [clickedVehicle, setClickedVehicle] = useState<LiveVehicle | null>(null);

  const { data: analyticsData } = useQuery({
    queryKey: ['analytics'],
    queryFn: async () => {
      const res = await api.get('/analytics');
      return res.data.data as { tat: { avgDispatchMinutes: number | null; avgSceneMinutes: number | null } };
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: incidentsData } = useQuery({
    queryKey: ['incidents', 'recent'],
    queryFn: async () => {
      const res = await api.get('/incidents?limit=10');
      return res.data.data as Incident[];
    },
  });

  const { data: queueData } = useQuery({
    queryKey: ['dispatch', 'queue'],
    queryFn: async () => {
      const res = await api.get('/dispatch/queue');
      return res.data.data as Incident[];
    },
  });

  const { data: fleetStatus } = useQuery({
    queryKey: ['dispatch', 'fleet-status'],
    queryFn: async () => {
      const res = await api.get('/dispatch/fleet-status');
      return res.data.data as {
        READY: number; DISPATCHED: number; ON_SCENE: number; RETURNING: number;
        OFFLINE: number; MAINTENANCE: number; total: number;
      };
    },
    refetchInterval: 20_000,
  });

  const queryClient = useQueryClient();
  const { vehicles: liveVehicles, lastUpdatedAt } = useVehicleTracking();

  useEffect(() => {
    socket.connect();
    socket.on('incident:new', () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['incidents', 'recent'] });
    });
    return () => { socket.off('incident:new'); };
  }, []);

  const avgResponseDisplay = (() => {
    const d = analyticsData?.tat.avgDispatchMinutes;
    const s = analyticsData?.tat.avgSceneMinutes;
    if (d == null && s == null) return '-';
    const total = (d ?? 0) + (s ?? 0);
    const mins = Math.floor(total);
    const secs = Math.round((total - mins) * 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  })();

  const queueCount = queueData?.length ?? 0;
  const recentIncidents = incidentsData ?? [];
  const availableVehicles = liveVehicles.filter((v) => v.dbStatus === 'READY').length;
  const activeOps = recentIncidents.filter(
    (i) => i.status === 'DISPATCH_HANDLING' || i.status === 'DISPATCHED'
  ).length;

  // Only live cases belong on the ops map - resolved/draft pins are clutter
  const incidentMarkers = recentIncidents
    .filter((i) => i.lat && i.lng && i.status !== 'RESOLVED' && i.status !== 'DRAFT')
    .map((inc) => ({
      id: inc.id,
      lat: inc.lat!,
      lng: inc.lng!,
      title: `${inc.caseNumber} - ${inc.chiefComplaint}`,
      type: 'incident' as const,
    }));

  const layers: ('light' | 'dark' | 'street')[] = ['light', 'dark', 'street'];

  return (
    <>
      {/* Page header */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div className="section-title" style={{ fontSize: 20 }}>Command Dashboard</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>Live operational picture · Nairobi City County</div>
        </div>
        <div className="wrap-gap">
          <button className="btn btn-ghost" onClick={() => navigate('/queue')}>
            <ListChecks size={16} /> Full queue
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/watcher/new-incident')}>
            <WarningCircle size={16} /> New incident
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat" onClick={() => navigate('/queue')}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="stat-ico" style={{ background: 'var(--red-soft)' }}><WarningCircle size={18} color="var(--red)" /></div>
          </div>
          <div className="stat-label">Queue - awaiting dispatch</div>
          <div className="stat-val">{queueCount}</div>
          <div className="stat-foot"><WarningCircle size={12} /> {queueCount > 0 ? 'Needs immediate attention' : 'Queue clear'}</div>
        </div>

        <div className="stat" onClick={() => navigate('/queue')}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="stat-ico" style={{ background: 'var(--green-light)' }}><Broadcast size={18} color="var(--green)" /></div>
          </div>
          <div className="stat-label">Active operations</div>
          <div className="stat-val">{activeOps}</div>
          <div className="stat-foot"><Broadcast size={12} /> Units currently deployed</div>
        </div>

        <div className="stat" onClick={() => navigate('/fleet')}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="stat-ico" style={{ background: 'var(--blue-soft)' }}><Truck size={18} color="var(--blue)" /></div>
          </div>
          <div className="stat-label">Available units</div>
          <div className="stat-val">{availableVehicles}</div>
          <div className="stat-foot"><Truck size={12} /> Ready for dispatch</div>
        </div>

        <div className="stat dark-stat">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="stat-ico" style={{ background: 'rgba(95,215,154,.15)' }}><Timer size={18} color="#5FD79A" /></div>
          </div>
          <div className="stat-label">Avg response (30d)</div>
          <div className="stat-val">{avgResponseDisplay}</div>
          <div className="stat-foot"><Timer size={12} /> Target 8:00</div>
        </div>
      </div>

      {/* Main: Map + Queue */}
      <div className="dash-main">
        {/* Map card */}
        <div
          className="card"
          style={isMapExpanded ? { position: 'fixed', inset: 16, zIndex: 100, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' } : {}}
        >
          <div className="card-head">
            <div className="row" style={{ gap: 10 }}>
              <span className="card-title">Live Operations Map</span>
              <span className="live-badge"><span className="dot live-dot" /> Live</span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setMapLayer(layers[(layers.indexOf(mapLayer) + 1) % layers.length])}
              >
                <Stack size={14} /> {mapLayer}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => setIsMapExpanded(!isMapExpanded)}>
                {isMapExpanded ? <><X size={14} /> Close</> : <><CornersOut size={14} /> Expand</>}
              </button>
            </div>
          </div>
          <div style={{ position: 'relative', height: isMapExpanded ? '100%' : 'clamp(300px, 48vh, 520px)', flex: isMapExpanded ? 1 : undefined }}>
            <Map
              center={[-1.2921, 36.8219]}
              zoom={isMapExpanded ? 14 : 12}
              markers={incidentMarkers}
              vehicleMarkers={liveVehicles}
              layerType={mapLayer}
              showLiveBadge
              showLegend
              showVehicleList
              lastUpdatedAt={lastUpdatedAt}
              onVehicleClick={(v) => setClickedVehicle(v)}
            />
          </div>
        </div>

        {/* Queue preview card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-head">
            <span className="card-title">Dispatch Queue</span>
            {queueCount > 0 && <span className="pill pill-red">{queueCount} pending</span>}
          </div>
          <div className="hide-scroll" style={{ flex: 1, overflowY: 'auto', maxHeight: 'clamp(300px, 48vh, 520px)' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Description</th>
                  <th>Wait</th>
                </tr>
              </thead>
              <tbody>
                {queueData && queueData.length > 0 ? queueData.slice(0, 8).map((incident) => {
                  const late = Date.now() - new Date(incident.createdAt).getTime() > 600_000;
                  return (
                    <tr key={incident.id} onClick={() => navigate(`/incidents/${incident.id}`)}>
                      <td>
                        <span className="mono strong" style={{ fontSize: 13 }}>{incident.caseNumber}</span>
                        <div className={`pill pill-${incident.status === 'SUBMITTED' ? 'red' : incident.status === 'DISPATCH_HANDLING' ? 'amber' : 'blue'}`} style={{ marginTop: 4, fontSize: 10, padding: '2px 7px' }}>
                          {incident.status.replace(/_/g, ' ')}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{incident.chiefComplaint}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{incident.locationName}</div>
                      </td>
                      <td>
                        <span className={`mono ${late ? 'live-badge' : 'muted'}`} style={{ fontSize: 12, fontWeight: 600 }}>
                          {late && <span className="dot" style={{ background: 'var(--red)', width: 6, height: 6, borderRadius: 99, display: 'inline-block', marginRight: 4 }} />}
                          {formatDistanceToNow(new Date(incident.createdAt))}
                        </span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>Queue is clear</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-soft btn-block" onClick={() => navigate('/queue')}>
              <ListChecks size={16} /> Open full queue
            </button>
          </div>
        </div>
      </div>

      {/* Lower: Recent activity + fleet */}
      <div className="dash-lower">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Recent Incidents</span>
            <span className="tag-soft">Last 10</span>
          </div>
          <div className="card-pad">
            {recentIncidents.length === 0 ? (
              <div className="muted" style={{ textAlign: 'center', padding: '20px 0', fontSize: 13.5 }}>No recent incidents</div>
            ) : (
              <div className="tl">
                {recentIncidents.slice(0, 6).map((inc) => (
                  <div
                    className="tl-item"
                    key={inc.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/incidents/${inc.id}`)}
                  >
                    <div className={`tl-dot ${inc.status === 'RESOLVED' ? 'done' : inc.status === 'SUBMITTED' ? 'active' : ''}`}>
                      <WarningCircle size={10} />
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>
                        <b className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{inc.caseNumber}</b>
                        <span className="muted"> · </span>
                        {inc.chiefComplaint}
                      </div>
                      <span className="muted mono" style={{ fontSize: 11.5, flexShrink: 0 }}>
                        {formatDistanceToNow(new Date(inc.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title">Fleet Snapshot</span>
            <button className="btn btn-sm btn-ghost" onClick={() => navigate('/fleet')}>View all</button>
          </div>
          <div className="card-pad col" style={{ gap: 14 }}>
            {(['READY', 'DISPATCHED', 'ON_SCENE', 'RETURNING', 'OFFLINE'] as const).map((status) => {
              // Real counts from /dispatch/fleet-status; OFFLINE folds in maintenance.
              const count = status === 'OFFLINE'
                ? (fleetStatus?.OFFLINE ?? 0) + (fleetStatus?.MAINTENANCE ?? 0)
                : (fleetStatus?.[status] ?? 0);
              const total = fleetStatus?.total || 1;
              const pillCls = status === 'READY' ? 'pill-green' : status === 'OFFLINE' ? 'pill-red' : status === 'DISPATCHED' ? 'pill-blue' : 'pill-amber';
              return (
                <div key={status} className="row" style={{ gap: 12 }}>
                  <span className={`pill ${pillCls}`} style={{ minWidth: 100, justifyContent: 'center' }}>{status.replace('_', ' ')}</span>
                  <div className="grow">
                    <div className="meter"><span style={{ width: `${(count / total) * 100}%` }} /></div>
                  </div>
                  <span className="mono strong" style={{ fontSize: 13, color: 'var(--ink)', width: 20, textAlign: 'right' }}>{count}</span>
                </div>
              );
            })}
            <div className="divider" style={{ margin: '4px 0' }} />
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 13 }}>Total fleet</span>
              <span className="mono strong" style={{ fontSize: 14, color: 'var(--ink)' }}>{fleetStatus?.total ?? 0} units</span>
            </div>
            {lastUpdatedAt && (
              <div className="muted" style={{ fontSize: 12 }}>
                GPS updated {formatDistanceToNow(lastUpdatedAt, { addSuffix: true })}
              </div>
            )}
          </div>
        </div>
      </div>

      {clickedVehicle && (
        <VehicleDispatchPanel
          clickedVehicle={clickedVehicle}
          onClose={() => setClickedVehicle(null)}
        />
      )}
    </>
  );
}

export default DashboardPage;
