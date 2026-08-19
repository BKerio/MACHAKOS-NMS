import { useState } from 'react';
import {
  Share2 as ShareNetwork,
  Handshake,
  CircleCheck as CheckCircle,
  TriangleAlert as Warning,
  Search as MagnifyingGlass,
  ExternalLink as ArrowSquareOut,
  MapPin,
  Users,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '@/api/client';
import { Incident } from '@/types/api';
import { useNotificationStore } from '@/stores/notificationStore';
import Map from '@/components/shared/Map';

type Urgency = 'LOW' | 'MEDIUM' | 'HIGH';

function PartnerDashboardPage() {
  const navigate = useNavigate();
  const { addNotification } = useNotificationStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [requestUrgency, setRequestUrgency] = useState<Urgency>('MEDIUM');

  const { data: incidentsData, isLoading } = useQuery({
    queryKey: ['partner', 'incidents'],
    queryFn: async () => {
      const res = await api.get('/partner/incidents?limit=20');
      return res.data.data as Incident[];
    },
  });

  const incidents = incidentsData ?? [];

  const filtered = incidents.filter(i => {
    const matchesSearch = !search ||
      i.caseNumber.toLowerCase().includes(search.toLowerCase()) ||
      i.chiefComplaint.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || i.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const urgentCount = incidents.filter(i => i.status === 'SUBMITTED').length;
  const activeCount = incidents.filter(i => i.status === 'DISPATCHED' || i.status === 'DISPATCH_HANDLING').length;
  const resolvedCount = incidents.filter(i => i.status === 'RESOLVED').length;

  const mapMarkers = incidents
    .filter(i => i.lat && i.lng && i.status !== 'RESOLVED' && i.status !== 'DRAFT')
    .map(i => ({ id: i.id, lat: i.lat!, lng: i.lng!, title: i.chiefComplaint, type: 'incident' as const }));

  const resourceRequestMutation = useMutation({
    mutationFn: () => api.post('/partner/resource-request', { message: requestMessage, urgency: requestUrgency }),
    onSuccess: () => {
      addNotification({ type: 'success', title: 'Request Sent', message: 'Resource request forwarded to central dispatch.' });
      setShowRequestModal(false);
      setRequestMessage('');
      setRequestUrgency('MEDIUM');
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Request Failed', message: err?.response?.data?.message || 'Could not send resource request.' });
    },
  });

  return (
    <div className="col" style={{ gap: 20 }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-5 rounded-xl border border-surface-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-brand-teal">Partner Overview</h2>
          <p className="text-xs text-slate-text mt-0.5">Forwarded cases and agency coordination</p>
        </div>
        <button
          onClick={() => setShowRequestModal(true)}
          className="w-full sm:w-auto bg-brand-teal text-white font-medium text-sm px-5 py-2.5 rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-all"
        >
          <Handshake size={18} />
          Request Resource
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-slate-text">Forwarded Cases</p>
            <div className="flex items-center gap-2">
              {urgentCount > 0 && <span className="bg-status-danger/10 text-status-danger text-xs font-medium px-2 py-0.5 rounded-md">{urgentCount} urgent</span>}
              <ShareNetwork size={16} className="text-brand-green" />
            </div>
          </div>
          <p className="text-3xl font-bold text-brand-teal leading-none">{incidents.length}</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-slate-text">Active Operations</p>
            <Warning size={16} className="text-status-warning" />
          </div>
          <p className="text-3xl font-bold text-brand-teal leading-none">{activeCount}</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-slate-text">Resolved</p>
            <CheckCircle size={16} className="text-brand-green" />
          </div>
          <p className="text-3xl font-bold text-brand-teal leading-none">{resolvedCount}</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8">
        {/* Cases Table */}
        <div className="flex-[2] bg-white rounded-xl border border-surface-border shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-surface-border flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
            <h3 className="font-semibold text-brand-teal">Case Feed</h3>
            <div className="flex items-center gap-2">
              <div className="relative">
                <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search cases…"
                  className="pl-8 pr-3 py-1.5 text-xs border border-surface-border rounded-lg bg-slate-50 text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal/30 w-36 sm:w-44"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-xs border border-surface-border rounded-lg px-2 py-1.5 bg-slate-50 text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal/30 cursor-pointer"
              >
                <option value="ALL">All Status</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="DISPATCH_HANDLING">Handling</option>
                <option value="DISPATCHED">Dispatched</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-surface-border">
                  <th className="px-6 py-3.5 text-xs font-medium text-slate-text">Case ID</th>
                  <th className="px-6 py-3.5 text-xs font-medium text-slate-text">Location</th>
                  <th className="px-6 py-3.5 text-xs font-medium text-slate-text">Wait</th>
                  <th className="px-6 py-3.5 text-xs font-medium text-slate-text">Status</th>
                  <th className="px-6 py-3.5 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/50">
                {isLoading ? (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-400">Loading cases...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-400">No cases match filters</td></tr>
                ) : filtered.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-brand-teal text-sm">{c.caseNumber}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{c.chiefComplaint}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-brand-teal">
                        <MapPin size={14} className="text-slate-300 flex-shrink-0" />
                        {c.locationName}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-brand-teal">
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                        c.status === 'SUBMITTED' ? 'bg-status-danger/10 text-status-danger' :
                        c.status === 'DISPATCHED' || c.status === 'DISPATCH_HANDLING' ? 'bg-status-warning/10 text-status-warning' :
                        c.status === 'RESOLVED' ? 'bg-brand-green/10 text-brand-green' :
                        'bg-slate-100 text-slate-400'
                      }`}>
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => navigate(`/partner/incidents/${c.id}`)}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand-teal transition-all border border-surface-border"
                      >
                        <ArrowSquareOut size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Case Breakdown */}
        <div className="flex-1 bg-brand-sidebar p-6 rounded-xl flex flex-col h-fit">
          <div className="flex items-center gap-2.5 mb-6">
            <Users size={18} className="text-brand-green" />
            <h4 className="font-semibold text-white">Case Breakdown</h4>
          </div>
          <div className="space-y-6">
            {[
              { label: 'Awaiting Dispatch', val: incidents.filter(i => i.status === 'SUBMITTED').length, total: incidents.length, color: 'bg-status-danger' },
              { label: 'In Progress', val: incidents.filter(i => i.status === 'DISPATCHED' || i.status === 'DISPATCH_HANDLING').length, total: incidents.length, color: 'bg-brand-green' },
              { label: 'Resolved', val: incidents.filter(i => i.status === 'RESOLVED').length, total: incidents.length, color: 'bg-status-info' },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs font-medium mb-2">
                  <span className="text-slate-400">{item.label}</span>
                  <span className="text-white">{item.val}</span>
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all duration-700`}
                    style={{ width: item.total > 0 ? `${(item.val / item.total) * 100}%` : '0%' }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-6">{incidents.length} total cases forwarded</p>
        </div>
      </div>

      {/* Map Section */}
      <div className="bg-white rounded-xl border border-surface-border shadow-sm overflow-hidden flex flex-col h-[500px]">
        <div className="px-5 py-4 border-b border-surface-border flex justify-between items-center">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-slate-text" />
            <h3 className="font-semibold text-brand-teal">Coverage Map</h3>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-brand-green font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse"></span>
            Live
          </span>
        </div>
        <div className="flex-1 relative bg-slate-200">
          <Map center={[-1.2921, 36.8219]} zoom={12} markers={mapMarkers} layerType="light" />
        </div>
      </div>

      {/* Resource Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowRequestModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-brand-sidebar px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Handshake size={18} className="text-brand-green" />
                <div>
                  <p className="text-xs text-slate-400 tracking-widest font-bold">Resource Request</p>
                  <p className="text-sm font-bold text-white">Send to Central Dispatch</p>
                </div>
              </div>
              <button
                onClick={() => setShowRequestModal(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 tracking-widest mb-2">Urgency</label>
                <div className="flex gap-2">
                  {(['LOW', 'MEDIUM', 'HIGH'] as Urgency[]).map(u => (
                    <button
                      key={u}
                      onClick={() => setRequestUrgency(u)}
                      className={`flex-1 py-2 rounded-lg text-xs font-black tracking-widest border transition-all ${
                        requestUrgency === u
                          ? u === 'HIGH' ? 'bg-status-danger text-white border-status-danger'
                            : u === 'MEDIUM' ? 'bg-status-warning text-white border-status-warning'
                            : 'bg-brand-green text-white border-brand-green'
                          : 'border-surface-border text-slate-400 hover:border-brand-teal/30'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 tracking-widest mb-2">Message</label>
                <textarea
                  value={requestMessage}
                  onChange={e => setRequestMessage(e.target.value)}
                  rows={4}
                  placeholder="Describe the resource needed and situation…"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal resize-none"
                />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3 justify-end">
              <button
                onClick={() => setShowRequestModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-500 text-sm font-bold rounded-xl hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => resourceRequestMutation.mutate()}
                disabled={requestMessage.trim().length < 5 || resourceRequestMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-brand-teal text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Handshake size={14} />
                {resourceRequestMutation.isPending ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PartnerDashboardPage;
