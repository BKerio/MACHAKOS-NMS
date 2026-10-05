import { useMemo, useState, type ReactNode } from 'react';
import {
  FileBarChart2 as FileBarChart,
  FileSpreadsheet,
  FileText,
  Users,
  Ambulance,
  Hospital,
  Package,
  CircleAlert as Warning,
  Building2 as Buildings,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '@/api/client';
import { useNotificationStore } from '@/stores/notificationStore';
import { caseSlices, fmtMinutes, ownershipSlices, pct, type Slice, type SystemReport } from './systemReport/types';
import { renderPie } from './systemReport/pieImage';
import { exportSystemReportExcel } from './systemReport/exportExcel';

const CHART_COLORS = [
  '#15211B',
  '#005A32',
  '#2563EB',
  '#B7791F',
  '#7C3AED',
  '#0F766E',
  '#BE123C',
  '#475569',
  '#0891B2',
  '#CA8A04',
];

const TOOLTIP_STYLE = {
  borderRadius: '8px',
  border: '1px solid var(--border)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  background: 'var(--surface)',
  color: 'var(--ink)',
};

function labelize(value: string) {
  return value.replace(/_/g, ' ');
}

/** Labelled donut for part-to-whole at a glance; the legend beside it carries every value. */
function DonutWithLegend({ slices, caption }: { slices: Slice[]; caption: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <EmptyChart />;
  return (
    <div className="h-full flex items-center gap-4">
      <div className="relative h-full flex-1 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices.filter((s) => s.value > 0)}
              dataKey="value"
              nameKey="label"
              innerRadius="58%"
              outerRadius="88%"
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.filter((s) => s.value > 0).map((s) => (
                <Cell key={s.label} fill={s.color} />
              ))}
            </Pie>
            <RechartsTooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: any, name: any) => [`${v} (${pct(Number(v), total)})`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-black leading-none" style={{ color: 'var(--ink)' }}>{total}</span>
          <span className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>{caption}</span>
        </div>
      </div>
      <ul className="flex flex-col gap-2 text-sm min-w-[170px]">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-[3px] flex-shrink-0" style={{ background: s.color }} />
            <span className="flex-1" style={{ color: 'var(--ink)' }}>{s.label}</span>
            <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{s.value}</span>
            <span className="w-12 text-right text-xs tabular-nums" style={{ color: 'var(--muted)' }}>{pct(s.value, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function shortNature(value: string) {
  const cut = value.split('(')[0].trim();
  return cut.length > 22 ? `${cut.slice(0, 20)}...` : cut;
}

function SystemReportPage() {
  const { addNotification } = useNotificationStore();

  const { data, isLoading } = useQuery<SystemReport>({
    queryKey: ['admin', 'system-report'],
    queryFn: async () => {
      const res = await api.get('/admin/system-report');
      return res.data.data as SystemReport;
    },
  });

  const usersByRoleChart = useMemo(
    () =>
      (data?.usersByRole ?? []).map((r) => ({
        name: labelize(r.role),
        count: r.count,
      })),
    [data]
  );

  const incidentsByStatusChart = useMemo(
    () =>
      (data?.incidentsByStatus ?? []).map((r) => ({
        name: labelize(r.status),
        count: r.count,
      })),
    [data]
  );

  const incidentsByNatureChart = useMemo(
    () =>
      (data?.incidentsByNature ?? []).map((r) => ({
        name: shortNature(r.nature),
        full: r.nature,
        count: r.count,
      })),
    [data]
  );

  const inventoryStockChart = useMemo(
    () =>
      (data?.inventoryByCategory ?? []).map((r) => ({
        name: labelize(r.category),
        stock: r.stock,
        items: r.items,
      })),
    [data]
  );

  const tasksByStatusChart = useMemo(
    () =>
      (data?.tasksByStatus ?? []).map((r) => ({
        name: labelize(r.status),
        count: r.count,
      })),
    [data]
  );

  const [exporting, setExporting] = useState(false);

  async function exportExcel() {
    if (!data) {
      addNotification({ type: 'info', title: 'No Data', message: 'Report is still loading.' });
      return;
    }
    setExporting(true);
    try {
      await exportSystemReportExcel(data);
      addNotification({ type: 'success', title: 'Excel Exported', message: 'System report downloaded as Excel.' });
    } catch (err) {
      console.error(err);
      addNotification({ type: 'error', title: 'Export Failed', message: 'Could not build the Excel report.' });
    } finally {
      setExporting(false);
    }
  }

  function exportPdf() {
    if (!data) {
      addNotification({ type: 'info', title: 'No Data', message: 'Report is still loading.' });
      return;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 16;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('EOC System Report', 14, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(
      `Generated ${new Date(data.generatedAt).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' })} (Africa/Nairobi)`,
      14,
      y
    );
    doc.setTextColor(0);
    y += 8;

    const c = data.caseSummary;
    const rt = data.responseTimes;
    autoTable(doc, {
      startY: y,
      head: [['Cases', 'Value']],
      body: [
        ['Total cases', String(c.total)],
        ['Solved (resolved)', String(c.resolved)],
        ['Pending (awaiting dispatch)', String(c.pending)],
        ['In progress (crew dispatched)', String(c.inProgress)],
        ['Drafts (not submitted)', String(c.drafts)],
        ['Resolution rate (of submitted)', `${c.resolutionRate}%`],
        ['Today / last 7 days / last 30 days', `${c.today} / ${c.last7Days} / ${c.last30Days}`],
        ['Mass casualty incidents', String(c.massCasualty)],
        ['GBV-flagged cases', String(c.gbvFlagged)],
        ['Avg time to reach scene', fmtMinutes(rt.avgResponseMinutes)],
        ['Avg case duration', fmtMinutes(rt.avgCaseMinutes)],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [27, 95, 172] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // Two pies side by side: case outcomes and facility ownership.
    const pieW = (pageWidth - 28 - 6) / 2;
    const pies = [
      renderPie('Case outcomes', caseSlices(data), 'cases'),
      renderPie('Facilities - Public vs Private', ownershipSlices(data), 'facilities'),
    ];
    pies.forEach((p, i) => {
      doc.addImage(p.dataUrl, 'PNG', 14 + i * (pieW + 6), y, pieW, (pieW * p.height) / p.width);
    });
    y += (pieW * pies[0].height) / pies[0].width + 8;

    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value']],
      body: [
        ['Users', String(data.summary.users)],
        ['Active Users', String(data.summary.activeUsers)],
        ['Incidents', String(data.summary.incidents)],
        ['Tasks', String(data.summary.tasks)],
        ['Vehicles', String(data.summary.vehicles)],
        ['Agencies', String(data.summary.agencies)],
        ['Facilities (public / private)', `${data.summary.facilities} (${data.summary.publicFacilities} / ${data.summary.privateFacilities})`],
        ['Inventory Items', String(data.summary.inventoryItems)],
        ['Low Stock Items', String(data.summary.lowStockItems)],
        ['Partner Ambulances', String(data.summary.partnerAmbulances)],
        ['GBV Reports', String(data.summary.gbvReports)],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [21, 33, 27] },
      margin: { left: 14, right: 14 },
    });

    const afterSummary = (doc as any).lastAutoTable.finalY + 10;

    const sections: { title: string; head: string[]; body: (string | number)[][] }[] = [
      {
        title: 'Users by Role',
        head: ['Role', 'Count'],
        body: data.usersByRole.map((r) => [labelize(r.role), r.count]),
      },
      {
        title: 'Incidents by Status',
        head: ['Status', 'Count'],
        body: data.incidentsByStatus.map((r) => [labelize(r.status), r.count]),
      },
      {
        title: 'Incidents by Nature',
        head: ['Nature', 'Count'],
        body: data.incidentsByNature.map((r) => [r.nature, r.count]),
      },
      {
        title: 'Incidents by Sub-County',
        head: ['Sub-County', 'Count'],
        body: data.incidentsBySubCounty.map((r) => [r.subCounty, r.count]),
      },
      {
        title: 'Facilities by Ownership',
        head: ['Ownership', 'Count', 'Share'],
        body: ownershipSlices(data).map((s) => [s.label, s.value, pct(s.value, data.summary.facilities)]),
      },
      {
        title: 'Facilities by Type',
        head: ['Type', 'Count'],
        body: data.facilitiesByType.map((r) => [r.type, r.count]),
      },
      {
        title: 'Vehicles by Status',
        head: ['Status', 'Count'],
        body: data.vehiclesByStatus.map((r) => [labelize(r.status), r.count]),
      },
      {
        title: 'Inventory by Category',
        head: ['Category', 'Items', 'Stock'],
        body: data.inventoryByCategory.map((r) => [labelize(r.category), r.items, r.stock]),
      },
      {
        title: 'Low Stock Items',
        head: ['Name', 'Category', 'Stock', 'Reorder'],
        body: data.inventoryLowStock.map((r) => [r.name, r.category, r.quantityStock, r.reorderLevel]),
      },
      {
        title: 'Tasks by Status',
        head: ['Status', 'Count'],
        body: data.tasksByStatus.map((r) => [labelize(r.status), r.count]),
      },
    ];

    let cursor = afterSummary;
    for (const section of sections) {
      if (section.body.length === 0) continue;
      if (cursor > 250) {
        doc.addPage();
        cursor = 16;
      }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(section.title, 14, cursor);
      autoTable(doc, {
        startY: cursor + 3,
        head: [section.head],
        body: section.body,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [0, 90, 50] },
        margin: { left: 14, right: 14 },
      });
      cursor = (doc as any).lastAutoTable.finalY + 10;
    }

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 8, {
        align: 'right',
      });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    doc.save(`EOC_System_Report_${stamp}.pdf`);
    addNotification({ type: 'success', title: 'PDF Exported', message: 'System report downloaded as PDF.' });
  }

  const summary = data?.summary;

  return (
    <div className="col" style={{ gap: 24 }}>
      {/* Header */}
      <div
        className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 p-4 sm:p-6 lg:p-8 rounded-xl border shadow-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div>
          <p className="font-sans text-[11px] font-black tracking-[0.2em] mb-1" style={{ color: 'var(--muted)' }}>
            Insights
          </p>
          <h2 className="font-sans text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>
            System Report
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Cross-system snapshot of users, incidents, fleet, facilities, and inventory
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportExcel}
            disabled={!data || exporting}
            className="flex items-center gap-2 px-4 py-3 text-xs font-black tracking-widest rounded-xl border transition-colors disabled:opacity-40"
            style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface-2)' }}
          >
            <FileSpreadsheet size={16} />
            {exporting ? 'Building…' : 'Export Excel'}
          </button>
          <button
            type="button"
            onClick={exportPdf}
            disabled={!data}
            className="btn btn-primary flex items-center gap-2 px-5 py-3 text-xs disabled:opacity-40"
          >
            <FileText size={16} />
            Export PDF
          </button>
        </div>
      </div>

      {isLoading || !summary ? (
        <div
          className="rounded-xl border p-16 text-center shadow-sm"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <FileBarChart size={36} className="mx-auto mb-3" style={{ color: 'var(--muted-2)' }} />
          <p className="font-bold" style={{ color: 'var(--muted)' }}>
            Building system report...
          </p>
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              { label: 'Users', value: summary.users, Icon: Users },
              { label: 'Incidents', value: summary.incidents, Icon: Warning },
              { label: 'Vehicles', value: summary.vehicles, Icon: Ambulance },
              { label: 'Facilities', value: summary.facilities, Icon: Hospital },
              { label: 'Agencies', value: summary.agencies, Icon: Buildings },
              { label: 'Inventory', value: summary.inventoryItems, Icon: Package },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl border p-4 shadow-sm"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <kpi.Icon size={14} style={{ color: 'var(--muted)' }} />
                  <span className="text-[10px] font-black tracking-widest" style={{ color: 'var(--muted)' }}>
                    {kpi.label}
                  </span>
                </div>
                <p className="text-3xl font-black leading-none" style={{ color: 'var(--ink)' }}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          {summary.lowStockItems > 0 && (
            <div
              className="rounded-xl border px-4 py-3 flex items-center gap-3 text-sm font-semibold"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--red)' }}
            >
              <Warning size={18} color="var(--red)" />
              {summary.lowStockItems} inventory item{summary.lowStockItems === 1 ? '' : 's'} at or below reorder level
            </div>
          )}

          {/* Case summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              { label: 'Total cases', value: data.caseSummary.total },
              { label: 'Solved', value: data.caseSummary.resolved, color: '#0a7d0a' },
              { label: 'Pending', value: data.caseSummary.pending, color: '#a86b00' },
              { label: 'In progress', value: data.caseSummary.inProgress, color: '#1c5cab' },
              { label: 'Resolution rate', value: `${data.caseSummary.resolutionRate}%` },
              { label: 'Avg to scene', value: fmtMinutes(data.responseTimes.avgResponseMinutes) },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl border p-4 shadow-sm"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <span className="text-[10px] font-black tracking-widest" style={{ color: kpi.color ?? 'var(--muted)' }}>
                  {kpi.label}
                </span>
                <p className="text-2xl font-black leading-none mt-2" style={{ color: 'var(--ink)' }}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title="Case Outcomes"
              subtitle={`${data.caseSummary.today} today · ${data.caseSummary.last7Days} in 7 days · ${data.caseSummary.last30Days} in 30 days · ${data.caseSummary.massCasualty} mass casualty`}
              height={300}
            >
              <DonutWithLegend slices={caseSlices(data)} caption="cases" />
            </ChartCard>
            <ChartCard
              title="Facilities - Public vs Private"
              subtitle={`${data.summary.activeFacilities} of ${data.summary.facilities} facilities active`}
              height={300}
            >
              <DonutWithLegend slices={ownershipSlices(data)} caption="facilities" />
            </ChartCard>
          </div>

          {/* Charts row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Users by Role" subtitle="Personnel distribution across roles">
              {usersByRoleChart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usersByRoleChart} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--muted)', fontSize: 10 }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} allowDecimals={false} />
                    <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" name="Users" fill="#15211B" radius={[4, 4, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>

            <ChartCard title="User Status" subtitle="Active vs inactive accounts">
              {(data.usersByStatus?.some((s) => s.count > 0)) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.usersByStatus}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="45%"
                      innerRadius="42%"
                      outerRadius="68%"
                      paddingAngle={3}
                    >
                      {data.usersByStatus.map((entry) => (
                        <Cell key={entry.status} fill={entry.status === 'Active' ? '#005A32' : '#94A099'} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>
          </div>

          {/* Charts row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Incidents by Status" subtitle="Case pipeline across the system">
              {incidentsByStatusChart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={incidentsByStatusChart}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      innerRadius="40%"
                      outerRadius="68%"
                      paddingAngle={2}
                    >
                      {incidentsByStatusChart.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>

            <ChartCard title="Incidents by Sub-County" subtitle="Top locations by case volume">
              {(data.incidentsBySubCounty?.length ?? 0) > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.incidentsBySubCounty}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="subCounty"
                      width={100}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--ink)', fontSize: 11 }}
                    />
                    <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" name="Incidents" fill="#005A32" radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>
          </div>

          {/* Charts row 3 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Incidents by Nature" subtitle="Clinical / alert categories">
              {incidentsByNatureChart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={incidentsByNatureChart} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--ink)', fontSize: 10 }}
                    />
                    <RechartsTooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: any, _name: any, props: any) => [value, props?.payload?.full ?? 'Nature']}
                    />
                    <Bar dataKey="count" name="Incidents" fill="#B7791F" radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>

            <ChartCard title="Fleet Status" subtitle="Ambulance readiness">
              {(data.vehiclesByStatus?.length ?? 0) > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.vehiclesByStatus.map((v) => ({ name: labelize(v.status), count: v.count }))}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      innerRadius="42%"
                      outerRadius="68%"
                      paddingAngle={3}
                    >
                      {(data.vehiclesByStatus ?? []).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>
          </div>

          {/* Charts row 4 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Inventory Stock by Category" subtitle="Units currently on hand">
              {inventoryStockChart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inventoryStockChart} margin={{ top: 8, right: 12, left: 0, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} allowDecimals={false} />
                    <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="stock" name="Units" fill="#0F766E" radius={[4, 4, 0, 0]} barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>

            <ChartCard title="Tasks by Status" subtitle="Crew task pipeline">
              {tasksByStatusChart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tasksByStatusChart} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--muted)', fontSize: 9 }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} allowDecimals={false} />
                    <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" name="Tasks" fill="#2563EB" radius={[4, 4, 0, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>
          </div>

          {/* Extra pies */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChartCard title="Agencies" subtitle="Internal vs partner" height={280}>
              {(data.agenciesByType?.length ?? 0) > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.agenciesByType.map((a) => ({ name: labelize(a.type), count: a.count }))}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      outerRadius="70%"
                      paddingAngle={2}
                    >
                      {(data.agenciesByType ?? []).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>

            <ChartCard title="Facilities by Type" subtitle="Referral network mix" height={280}>
              {(data.facilitiesByType?.length ?? 0) > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.facilitiesByType}
                      dataKey="count"
                      nameKey="type"
                      cx="50%"
                      cy="45%"
                      outerRadius="70%"
                      paddingAngle={2}
                    >
                      {(data.facilitiesByType ?? []).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>

            <ChartCard title="Extra Counts" subtitle="Supporting registers" height={280}>
              <div className="h-full flex flex-col justify-center gap-3 px-2">
                {[
                  { label: 'GBV Reports', value: summary.gbvReports },
                  { label: 'Nature Options', value: summary.natureOptions },
                  { label: 'Partner Ambulances', value: summary.partnerAmbulances },
                  { label: 'Active Partner Units', value: summary.activePartnerAmbulances },
                  { label: 'Low Stock Alerts', value: summary.lowStockItems },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between rounded-lg border px-3 py-2"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span className="text-xs font-bold" style={{ color: 'var(--muted)' }}>
                      {row.label}
                    </span>
                    <span className="text-lg font-black" style={{ color: 'var(--ink)' }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          {data.generatedAt && (
            <p className="text-[11px] font-medium text-center" style={{ color: 'var(--muted)' }}>
              Snapshot generated {new Date(data.generatedAt).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  height = 340,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  height?: number;
}) {
  return (
    <div
      className="rounded-xl border shadow-sm flex flex-col overflow-hidden"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', height }}
    >
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>
          {title}
        </p>
        {subtitle && (
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex-1 px-3 py-3 min-h-0">{children}</div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-full flex items-center justify-center text-sm font-semibold" style={{ color: 'var(--muted)' }}>
      No data
    </div>
  );
}

export default SystemReportPage;
