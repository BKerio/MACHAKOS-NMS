import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Search as MagnifyingGlass,
  ArrowUpNarrowWide as SortAscending,
  ArrowDownWideNarrow as SortDescending,
  CircleAlert as WarningCircle,
  Download as DownloadSimple,
  Calendar as CalendarBlank,
  ArrowRight,
} from 'lucide-react';
import api from '@/api/client';
import { Incident } from '@/types/api';
import { socket } from '@/lib/socket';
import { formatDistanceToNow } from 'date-fns';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';

const statusPill: Record<string, string> = {
  SUBMITTED: 'pill-red',
  DISPATCH_HANDLING: 'pill-amber',
  DISPATCHED: 'pill-blue',
  RESOLVED: 'pill-green',
};

type RangePreset = 'today' | '7d' | '30d' | 'all' | 'custom';

const RANGE_LABELS: Record<RangePreset, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time',
  custom: 'Custom',
};

/** "Today" must mean today in Nairobi, not in the browser's timezone or UTC. */
function nairobiToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()); // en-CA gives YYYY-MM-DD
}

function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`); // midday avoids any DST/rounding edge
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function resolveRange(
  preset: RangePreset, customFrom: string, customTo: string,
): { from?: string; to?: string } {
  if (preset === 'all') return {};
  if (preset === 'custom') {
    return { from: customFrom || undefined, to: customTo || undefined };
  }
  const today = nairobiToday();
  if (preset === 'today') return { from: today, to: today };
  return { from: shiftDays(today, preset === '7d' ? -6 : -29), to: today };
}

function QueuePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [exporting, setExporting] = useState(false);
  const [rangePreset, setRangePreset] = useState<RangePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const role = useAuthStore((s) => s.user?.role);
  const canExport = role === 'DISPATCHER' || role === 'ADMIN' || role === 'SUPER_ADMIN';

  const { from, to } = useMemo(
    () => resolveRange(rangePreset, customFrom, customTo),
    [rangePreset, customFrom, customTo],
  );
  const rangeActive = !!from || !!to;

  async function exportReport() {
    setExporting(true);
    try {
      const res = await api.get('/incidents/export', {
        responseType: 'blob',
        // The export honours the same filters shown on screen.
        params: {
          ...(statusFilter === 'ALL' ? {} : { status: statusFilter }),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EOC_Incident_Report_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      addNotification({ type: 'success', title: 'Exported', message: 'Incident report downloaded.' });
    } catch {
      addNotification({ type: 'error', title: 'Export failed', message: 'Could not generate the report.' });
    } finally {
      setExporting(false);
    }
  }

  // Date filtering happens server-side - otherwise "Today" would only ever look
  // inside the most recent page of results. A wider limit is used when a range
  // is active so a full day/week of cases comes back in one go.
  const { data: incidents, isLoading } = useQuery({
    queryKey: ['incidents', from ?? '', to ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (rangeActive) params.set('limit', '500');
      const qs = params.toString();
      const res = await api.get(`/incidents${qs ? `?${qs}` : ''}`);
      return res.data.data as Incident[];
    },
  });

  // History lookup - searches ALL cases (incl. National ID / NHIF / phone) on the
  // server, not just the loaded queue. Activates once 2+ characters are typed.
  const searching = searchTerm.trim().length >= 2;
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['incidents', 'search', searchTerm.trim()],
    queryFn: async () => {
      const res = await api.get(`/incidents?limit=100&search=${encodeURIComponent(searchTerm.trim())}`);
      return res.data.data as Incident[];
    },
    enabled: searching,
  });

  useEffect(() => {
    socket.connect();
    // The feed's query key now carries the active date range, so an exact-key
    // cache write would miss. Invalidating by prefix refetches whichever range
    // is currently on screen - and correctly drops incidents outside it.
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['incidents'] });
    socket.on('incident:new', refresh);
    socket.on('incident:update', refresh);
    return () => {
      socket.off('incident:new', refresh);
      socket.off('incident:update', refresh);
    };
  }, [queryClient]);

  // When searching, use the server-side history results (full case history);
  // otherwise use the live queue. Status filter + sort are applied client-side to both.
  const source = searching ? (searchResults ?? []) : (incidents ?? []);
  const filteredIncidents = source
    .filter((inc) => statusFilter === 'ALL' || inc.status === statusFilter)
    .sort((a, b) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return sortOrder === 'desc' ? diff : -diff;
    });

  return (
    <>
      {/* Page header */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div className="section-title" style={{ fontSize: 20 }}>Incident Feed</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>Live incident management and dispatch tracking</div>
        </div>
        {canExport && (
          <button className="btn btn-ghost" onClick={exportReport} disabled={exporting}>
            <DownloadSimple size={16} /> {exporting ? 'Exporting…' : 'Export Report'}
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="searchbox" style={{ minWidth: 220, flex: 1, maxWidth: 400 }}>
            <MagnifyingGlass size={16} />
            <input
              type="text"
              placeholder="Search all cases - case no., name, National ID, NHIF or phone…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="seg">
            {['ALL', 'SUBMITTED', 'DISPATCH_HANDLING', 'DISPATCHED', 'RESOLVED'].map((s) => (
              <button
                key={s}
                className={statusFilter === s ? 'on' : ''}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'ALL' ? 'All' : s === 'DISPATCH_HANDLING' ? 'Handling' : s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ')}
              </button>
            ))}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
            title={sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
          >
            {sortOrder === 'desc' ? <SortDescending size={16} /> : <SortAscending size={16} />}
            {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
          </button>
        </div>

        {/* Date range */}
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <CalendarBlank size={16} color="var(--muted)" />
          <div className="seg">
            {(['today', '7d', '30d', 'all', 'custom'] as RangePreset[]).map((p) => (
              <button key={p} className={rangePreset === p ? 'on' : ''} onClick={() => setRangePreset(p)}>
                {RANGE_LABELS[p]}
              </button>
            ))}
          </div>
          {rangePreset === 'custom' && (
            <div className="row" style={{ gap: 8 }}>
              <input
                type="date"
                className="input"
                style={{ height: 34, width: 150, padding: '0 10px', fontSize: 13 }}
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <ArrowRight size={13} color="var(--muted)" />
              <input
                type="date"
                className="input"
                style={{ height: 34, width: 150, padding: '0 10px', fontSize: 13 }}
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          )}
          {searching && rangeActive && (
            <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
              Search covers all history - date range not applied
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Status</th>
                <th>Complaint</th>
                <th>Location</th>
                <th>Wait</th>
              </tr>
            </thead>
            <tbody>
              {(searching ? isSearching : isLoading) ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
                    {searching ? 'Searching case history…' : 'Synchronising feed…'}
                  </td>
                </tr>
              ) : filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
                    {searching ? 'No cases found for this search' : 'No incidents match the current filter'}
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((inc) => {
                  const late = Date.now() - new Date(inc.createdAt).getTime() > 600_000;
                  return (
                    <tr key={inc.id} onClick={() => navigate(`/incidents/${inc.id}`)}>
                      <td>
                        <span className="mono strong" style={{ fontSize: 13 }}>{inc.caseNumber}</span>
                        {inc.massCasualty && (
                          <span className="pill pill-red" style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px' }}>
                            <WarningCircle size={9} /> MCI
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`pill ${statusPill[inc.status] ?? 'pill-gray'}`}>
                          {inc.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{inc.chiefComplaint}</div>
                        {(inc.watcherComments || inc.preHospitalManagement) && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Notes available</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: 13.5 }}>{inc.locationName}</div>
                        {inc.subCounty && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{inc.subCounty}</div>}
                      </td>
                      <td>
                        <span className={`mono ${late ? 'live-badge' : 'muted'}`} style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {late && <span className="dot" style={{ width: 6, height: 6, background: 'var(--red)', borderRadius: 99, display: 'inline-block', marginRight: 5 }} />}
                          {formatDistanceToNow(new Date(inc.createdAt), { addSuffix: true })}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && filteredIncidents.length > 0 && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
            Showing {filteredIncidents.length} incident{filteredIncidents.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </>
  );
}

export default QueuePage;
