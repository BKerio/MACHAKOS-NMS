import { useState, useMemo } from 'react';
import {
  Clock,
  Ambulance,
  Download,
  MapPinned as MapPinLine,
  TriangleAlert as Warning,
  Calendar as CalendarBlank,
  Timer,
  ArrowRight,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useNotificationStore } from '@/stores/notificationStore';
import { useQuery } from '@tanstack/react-query';
import api from '@/api/client';

interface AnalyticsData {
  total: number;
  byGender: { gender: string; count: number }[];
  bySubCounty: { subCounty: string; count: number }[];
  byNature: { nature: string; count: number }[];
  byReferral: { facility: string; count: number }[];
  byStatus: { status: string; count: number }[];
  tat: {
    avgDispatchMinutes: number | null;
    avgSceneMinutes: number | null;
    avgHospitalMinutes: number | null;
  };
  trend: { date: string; count: number }[];
  ambulanceUtilization: { ambulance: string; cases: number }[];
}

type Preset = 'today' | '7d' | '30d' | '90d' | 'custom';

const GENDER_COLORS: Record<string, string> = {
  Male: '#15211B',
  Female: '#005A32',
  Unknown: '#6B7670',
};

const STATUS_COLORS: Record<string, string> = {
  RESOLVED: '#005A32',
  DISPATCHED: '#15211B',
  DISPATCH_HANDLING: '#2563EB',
  SUBMITTED: '#B7791F',
  DRAFT: '#6B7670',
  DISPATCH_ON_HOLD: '#94A099',
};

/** Today's date in Nairobi (en-CA formats as YYYY-MM-DD). */
function nairobiToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function getDateRange(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  if (preset === 'today') {
    const t = nairobiToday();
    return { from: t, to: t };
  }
  const now = new Date();
  if (preset === '7d') {
    return {
      from: new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0],
      to: now.toISOString().split('T')[0],
    };
  }
  if (preset === '30d') {
    return {
      from: new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0],
      to: now.toISOString().split('T')[0],
    };
  }
  if (preset === '90d') {
    return {
      from: new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0],
      to: now.toISOString().split('T')[0],
    };
  }
  return { from: customFrom, to: customTo };
}

const TOOLTIP_STYLE = {
  borderRadius: '8px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  background: '#fff',
  color: '#000',
};

function AnalyticsPage() {
  const { addNotification } = useNotificationStore();
  const [preset, setPreset] = useState<Preset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { from, to } = useMemo(
    () => getDateRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['analytics', from, to],
    queryFn: async () => {
      const res = await api.get(`/analytics?from=${from}&to=${to}`);
      return res.data.data as AnalyticsData;
    },
    enabled: !!from && !!to,
  });

  function exportReport() {
    if (!data || data.total === 0) {
      addNotification({ type: 'info', title: 'No Data', message: 'No data to export for this period.' });
      return;
    }
    const rows = [
      ['Metric', 'Value'],
      ['Total Incidents', data.total],
      ['Avg Dispatch Time (min)', data.tat.avgDispatchMinutes ?? '-'],
      ['Avg Scene Arrival (min)', data.tat.avgSceneMinutes ?? '-'],
      ['Avg Hospital Arrival (min)', data.tat.avgHospitalMinutes ?? '-'],
      [],
      ['Sub-County', 'Incidents'],
      ...data.bySubCounty.map(r => [r.subCounty, r.count]),
      [],
      ['Nature of Alert', 'Incidents'],
      ...data.byNature.map(r => [r.nature, r.count]),
      [],
      ['Gender', 'Count'],
      ...data.byGender.map(r => [r.gender, r.count]),
      [],
      ['Status', 'Count'],
      ...data.byStatus.map(r => [r.status, r.count]),
      [],
      ['Ambulance', 'Cases'],
      ...data.ambulanceUtilization.map(r => [r.ambulance, r.cases]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `EOC_Analytics_${from}_to_${to}.csv`;
    a.click();
    addNotification({ type: 'success', title: 'Exported', message: 'Analytics report downloaded.' });
  }

  const resolvedCount = data?.byStatus.find(s => s.status === 'RESOLVED')?.count ?? 0;
  const submittedCount = data?.byStatus.find(s => s.status === 'SUBMITTED')?.count ?? 0;
  const hotZone = data?.bySubCounty[0]?.subCounty ?? '-';

  return (
    <div className="col" style={{ gap: 20 }}>

      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="section-title" style={{ fontSize: 20 }}>Analytics Dashboard</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>Operational performance and incident data</div>
        </div>
        <button className="btn btn-ghost" onClick={exportReport}>
          <Download size={16} /> Export Report
        </button>
      </div>

      {/* Date Range Picker */}
      <div className="card card-pad">
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <CalendarBlank size={16} color="var(--muted)" />
          <div className="seg">
            {(['today', '7d', '30d', '90d'] as Preset[]).map((p) => (
              <button key={p} className={preset === p ? 'on' : ''} onClick={() => setPreset(p)}>
                {p === 'today' ? 'Today' : p === '7d' ? 'Last 7 days' : p === '30d' ? 'Last 30 days' : 'Last 90 days'}
              </button>
            ))}
            <button className={preset === 'custom' ? 'on' : ''} onClick={() => setPreset('custom')}>Custom</button>
          </div>
          {preset === 'custom' && (
            <div className="row" style={{ gap: 8 }}>
              <input type="date" className="input" style={{ height: 34, width: 150, padding: '0 10px', fontSize: 13 }} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <ArrowRight size={13} color="var(--muted)" />
              <input type="date" className="input" style={{ height: 34, width: 150, padding: '0 10px', fontSize: 13 }} value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          )}
          {isLoading && <div className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>Loading…</div>}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-ico" style={{ background: 'var(--green-light)' }}><Clock size={18} color="var(--green)" /></div>
          <div className="stat-label">Total Incidents</div>
          <div className="stat-val">{data?.total ?? '-'}</div>
          <div className="stat-foot"><Clock size={12} /> {resolvedCount} resolved</div>
        </div>
        <div className="stat">
          <div className="stat-ico" style={{ background: 'var(--red-soft)' }}><Warning size={18} color="var(--red)" /></div>
          <div className="stat-label">Awaiting Dispatch</div>
          <div className="stat-val">{submittedCount}</div>
          <div className="stat-foot" style={{ color: submittedCount > 0 ? 'var(--red)' : undefined }}>{submittedCount > 0 ? 'Needs attention' : 'Queue clear'}</div>
        </div>
        <div className="stat">
          <div className="stat-ico" style={{ background: 'var(--blue-soft)' }}><Timer size={18} color="var(--blue)" /></div>
          <div className="stat-label">Avg Dispatch TAT</div>
          <div className="stat-val">{data?.tat.avgDispatchMinutes != null ? `${data.tat.avgDispatchMinutes}m` : '-'}</div>
          <div className="stat-foot"><Timer size={12} /> from received to accepted</div>
        </div>
        <div className="stat dark-stat">
          <div className="stat-ico" style={{ background: 'rgba(95,215,154,.15)' }}><MapPinLine size={18} color="#5FD79A" /></div>
          <div className="stat-label">Incident Hotzone</div>
          <div className="stat-val" style={{ fontSize: 22, letterSpacing: '-.02em' }}>{hotZone}</div>
          <div className="stat-foot"><MapPinLine size={12} /> {data?.bySubCounty[0]?.count ?? 0} cases logged</div>
        </div>
      </div>

      {/* TAT Breakdown */}
      <div className="card">
        <div className="card-head">
          <span className="card-title"><Timer size={14} style={{ display: 'inline', marginRight: 6 }} />Turnaround Time Breakdown</span>
        </div>
        <div className="card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {[
            { label: 'Dispatch → Accepted', value: data?.tat.avgDispatchMinutes, desc: 'Time until crew accepts task', color: 'var(--green)' },
            { label: 'Accepted → Scene Arrival', value: data?.tat.avgSceneMinutes, desc: 'Travel time to incident scene', color: 'var(--blue)' },
            { label: 'Scene → Hospital', value: data?.tat.avgHospitalMinutes, desc: 'Patient transport time', color: 'var(--amber)' },
          ].map((item) => (
            <div key={item.label} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 16, border: '1px solid var(--border)' }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{item.label}</div>
              <div className="mono" style={{ fontSize: 36, fontWeight: 700, color: item.color, letterSpacing: '-.03em', lineHeight: 1 }}>
                {item.value != null ? item.value : '-'}
                {item.value != null && <span style={{ fontSize: 18, marginLeft: 4 }}>min</span>}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts Grid - Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Incident Trend */}
        <div className="card" style={{ height: 360, display: 'flex', flexDirection: 'column' }}>
          <div className="card-head">
            <div>
              <div className="card-title">Incident Trend</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Daily cases in selected period</div>
            </div>
          </div>
          <div style={{ flex: 1, padding: '16px 20px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.trend ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#005A32" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#005A32" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} dx={-10} allowDecimals={false} />
                <RechartsTooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="#005A32" strokeWidth={2.5} fill="url(#trendGrad)" name="Incidents" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sub-County Breakdown */}
        <div className="card" style={{ height: 360, display: 'flex', flexDirection: 'column' }}>
          <div className="card-head">
            <div>
              <div className="card-title">Incidents by Sub-County</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Top areas by case volume</div>
            </div>
          </div>
          <div style={{ flex: 1, padding: '16px 20px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.bySubCounty ?? []} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="var(--border)" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="subCounty" axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-2)', fontSize: 11 }} width={100} />
                <RechartsTooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" name="Cases" fill="#005A32" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Grid - Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>

        {/* Gender Distribution */}
        <div className="card" style={{ height: 320, display: 'flex', flexDirection: 'column' }}>
          <div className="card-head">
            <div className="card-title">Gender Distribution</div>
          </div>
          <div style={{ flex: 1, padding: '8px 20px' }}>
            {(data?.byGender.length ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data?.byGender} dataKey="count" nameKey="gender" cx="50%" cy="45%" innerRadius="45%" outerRadius="70%" paddingAngle={3}>
                    {data?.byGender.map((entry) => <Cell key={entry.gender} fill={GENDER_COLORS[entry.gender] ?? '#6B7670'} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ fontSize: 12 }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="muted" style={{ textAlign: 'center', paddingTop: 60, fontSize: 13 }}>No data</div>
            )}
          </div>
        </div>

        {/* Case Outcomes */}
        <div className="card" style={{ height: 320, display: 'flex', flexDirection: 'column' }}>
          <div className="card-head">
            <div className="card-title">Case Outcomes</div>
          </div>
          <div style={{ flex: 1, padding: '8px 20px' }}>
            {(data?.byStatus.length ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data?.byStatus} dataKey="count" nameKey="status" cx="50%" cy="45%" innerRadius="45%" outerRadius="70%" paddingAngle={3}>
                    {data?.byStatus.map((entry) => <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#6B7670'} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ fontSize: 12 }} formatter={(value, name) => [value, String(name).replace(/_/g, ' ')]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} formatter={(value) => String(value).replace(/_/g, ' ')} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="muted" style={{ textAlign: 'center', paddingTop: 60, fontSize: 13 }}>No data</div>
            )}
          </div>
        </div>

        {/* Ambulance Utilization */}
        <div className="card" style={{ height: 320, display: 'flex', flexDirection: 'column' }}>
          <div className="card-head">
            <div>
              <div className="card-title">Ambulance Utilization</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Cases attended per vehicle</div>
            </div>
          </div>
          <div style={{ flex: 1, padding: '16px 20px' }}>
            {(data?.ambulanceUtilization.length ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.ambulanceUtilization ?? []} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="ambulance" axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-2)', fontSize: 11 }} width={90} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ fontSize: 12 }} />
                  <Bar dataKey="cases" name="Cases" fill="#2563EB" radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="muted" style={{ textAlign: 'center', paddingTop: 60, fontSize: 13 }}>No data</div>
            )}
          </div>
        </div>
      </div>

      {/* Nature of Alert Breakdown */}
      <div className="card" style={{ height: 340, display: 'flex', flexDirection: 'column' }}>
        <div className="card-head">
          <div>
            <div className="card-title">Cases by Nature of Alert</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Incident volume by clinical category</div>
          </div>
        </div>
        <div style={{ flex: 1, padding: '16px 20px' }}>
          {(data?.byNature.length ?? 0) > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.byNature ?? []} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="var(--border)" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="nature" axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-2)', fontSize: 11 }} width={110} />
                <RechartsTooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" name="Cases" fill="#B7791F" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="muted" style={{ textAlign: 'center', paddingTop: 60, fontSize: 13 }}>No data</div>
          )}
        </div>
      </div>

      {/* Hospital Referrals */}
      {(data?.byReferral.length ?? 0) > 0 && (
        <div className="card" style={{ height: 320, display: 'flex', flexDirection: 'column' }}>
          <div className="card-head">
            <div className="card-title"><Ambulance size={14} style={{ display: 'inline', marginRight: 6 }} />Hospital Referrals</div>
          </div>
          <div style={{ flex: 1, padding: '16px 20px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.byReferral ?? []} margin={{ top: 0, right: 20, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="facility" axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-2)', fontSize: 10 }} angle={-25} textAnchor="end" interval={0} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} dx={-10} allowDecimals={false} />
                <RechartsTooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" name="Referrals" fill="#005A32" radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
export default AnalyticsPage;
