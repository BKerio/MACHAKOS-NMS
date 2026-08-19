import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  MapPin,
  User,
  Phone,
  CircleCheck as CheckCircle,
  Ambulance,
  PencilLine as NotePencil,
  Link as LinkIcon,
  ClipboardList as ClipboardText,
  CircleX as XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '@/api/client';
import { Incident, IncidentStatus } from '@/types/api';
import { useNotificationStore } from '@/stores/notificationStore';
import EndCaseModal from '@/components/shared/EndCaseModal';

const STATUS_BADGE: Record<IncidentStatus, { label: string; cls: string }> = {
  DRAFT:             { label: 'Draft',      cls: 'bg-slate-100 text-slate-500' },
  SUBMITTED:         { label: 'Submitted',  cls: 'bg-status-warning/10 text-status-warning' },
  DISPATCH_HANDLING: { label: 'Handling',   cls: 'bg-status-info/10 text-status-info' },
  DISPATCH_ON_HOLD:  { label: 'On Hold',    cls: 'bg-slate-100 text-slate-500' },
  DISPATCHED:        { label: 'Dispatched', cls: 'bg-brand-green/10 text-brand-green' },
  RESOLVED:          { label: 'Resolved',   cls: 'bg-brand-teal/10 text-brand-teal' },
};

function PartnerCaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();

  const [notes, setNotes] = useState('');
  const [pcrUrl, setPcrUrl] = useState('');
  const [showEndCase, setShowEndCase] = useState(false);

  const { data: incident, isLoading } = useQuery({
    queryKey: ['partner', 'incident', id],
    queryFn: async () => {
      const res = await api.get(`/partner/incidents/${id}`);
      const data = res.data.data as Incident;
      setNotes(data.partnerNotes ?? '');
      setPcrUrl(data.pcrUrl ?? '');
      return data;
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { notes?: string; pcrUrl?: string; status?: IncidentStatus }) =>
      api.patch(`/partner/incidents/${id}/update`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner', 'incident', id] });
      queryClient.invalidateQueries({ queryKey: ['partner', 'incidents'] });
      addNotification({ type: 'success', title: 'Saved', message: 'Case updated successfully.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not save update.' });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: () => api.post(`/partner/incidents/${id}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner', 'incident', id] });
      addNotification({ type: 'success', title: 'Accepted', message: 'Case accepted and marked as handling.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not accept case.' });
    },
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-brand-teal/20 border-t-brand-teal rounded-full animate-spin" />
    </div>
  );

  if (!incident) return (
    <div className="p-10 text-center text-status-danger font-bold">Case not found.</div>
  );

  const badge = STATUS_BADGE[incident.status];
  const isResolved = incident.status === 'RESOLVED';
  const canAccept = incident.status === 'SUBMITTED' || incident.status === 'DRAFT';

  return (
    <div className="col" style={{ gap: 20 }}>

      {/* Header */}
      <div className="flex items-center gap-3 bg-white p-5 rounded-xl border border-surface-border shadow-sm">
        <button
          onClick={() => navigate('/partner/dashboard')}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-brand-teal transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <p className="text-xs text-slate-400">Partner Portal / Case Detail</p>
          <h2 className="text-xl font-bold text-brand-teal mt-0.5">{incident.caseNumber}</h2>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
        {canAccept && (
          <button
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending}
            className="px-4 py-2 bg-brand-teal text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <CheckCircle size={16} />
            {acceptMutation.isPending ? 'Accepting...' : 'Accept Case'}
          </button>
        )}
        {!isResolved && (
          <button
            onClick={() => setShowEndCase(true)}
            className="px-4 py-2 bg-status-danger text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-all flex items-center gap-2"
          >
            <XCircle size={16} />
            End Case
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Incident Overview */}
        <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border bg-slate-50">
            <h3 className="font-semibold text-brand-teal flex items-center gap-2">
              <ClipboardText size={16} /> Incident Overview
            </h3>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Chief Complaint</p>
              <p className="text-sm font-semibold text-brand-teal">{incident.chiefComplaint}</p>
            </div>
            <div className="flex items-start gap-2">
              <MapPin size={15} className="text-brand-green mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-brand-teal">{incident.locationName}</p>
                <p className="text-xs text-slate-400">{incident.subCounty}</p>
              </div>
            </div>
            {incident.alertNature && (
              <div>
                <p className="text-xs font-medium text-slate-400 mb-1">Alert Nature</p>
                <p className="text-sm text-brand-teal">{incident.alertNature}{incident.alertNatureDetail ? ` - ${incident.alertNatureDetail}` : ''}</p>
              </div>
            )}
            {incident.placeOfReferral && (
              <div>
                <p className="text-xs font-medium text-slate-400 mb-1">Referral Facility</p>
                <p className="text-sm text-brand-teal">{incident.placeOfReferral}</p>
              </div>
            )}
            <div className="text-xs text-slate-400">
              Reported {formatDistanceToNow(new Date(incident.createdAt), { addSuffix: true })}
            </div>
          </div>
        </div>

        {/* Patient Information */}
        <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border bg-slate-50">
            <h3 className="font-semibold text-brand-teal flex items-center gap-2">
              <User size={16} /> Patient
            </h3>
          </div>
          <div className="p-5 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Name</p>
              <p className="text-sm font-semibold text-brand-teal">{incident.patientName || '-'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">Age / Gender</p>
              <p className="text-sm text-brand-teal">{incident.patientAge ? `${incident.patientAge} yrs` : '-'} · {incident.patientGender || '-'}</p>
            </div>
            {incident.patientContact && (
              <div className="col-span-2">
                <p className="text-xs font-medium text-slate-400 mb-1">Contact</p>
                <div className="flex items-center gap-2">
                  <Phone size={13} className="text-brand-green" />
                  <p className="text-sm text-brand-teal font-semibold">{incident.patientContact}</p>
                </div>
              </div>
            )}
            {incident.nextOfKin && (
              <div className="col-span-2">
                <p className="text-xs font-medium text-slate-400 mb-1">Next of Kin</p>
                <p className="text-sm text-brand-teal">{incident.nextOfKin} {incident.nextOfKinPhone ? `· ${incident.nextOfKinPhone}` : ''}</p>
              </div>
            )}
            {incident.watcherComments && (
              <div className="col-span-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="text-xs font-medium text-slate-400 mb-1">Caller Notes</p>
                <p className="text-sm italic text-slate-500">"{incident.watcherComments}"</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Partner Update Form */}
      <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border bg-slate-50">
          <h3 className="font-semibold text-brand-teal flex items-center gap-2">
            <NotePencil size={16} /> Partner Update
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Add notes, upload PCR, or close the case from your end.</p>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-slate-text block mb-1.5">Case Notes</label>
            <textarea
              className="w-full border border-surface-border rounded-lg px-4 py-3 text-sm h-28 resize-none outline-none focus:ring-2 focus:ring-brand-teal transition-all"
              placeholder="Enter observations, interventions, patient condition on arrival..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={isResolved}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-text block mb-1.5 flex items-center gap-1.5">
              <LinkIcon size={13} /> PCR Document URL
            </label>
            <input
              type="url"
              className="w-full border border-surface-border rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-teal transition-all"
              placeholder="https://drive.google.com/... or any shareable link"
              value={pcrUrl}
              onChange={e => setPcrUrl(e.target.value)}
              disabled={isResolved}
            />
            {incident.pcrUrl && (
              <a
                href={incident.pcrUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-teal underline mt-1 inline-block hover:opacity-75"
              >
                View existing PCR →
              </a>
            )}
          </div>

          {/* Status Actions */}
          {!isResolved && (
            <div className="border-t border-surface-border pt-4">
              <p className="text-xs font-medium text-slate-text mb-3">Update Case Status</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => updateMutation.mutate({ notes, pcrUrl: pcrUrl || undefined, status: 'DISPATCHED' })}
                  disabled={updateMutation.isPending || incident.status === 'DISPATCHED'}
                  className="flex items-center gap-1.5 px-4 py-2 bg-brand-green/10 text-brand-green text-sm font-semibold rounded-lg hover:bg-brand-green hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Ambulance size={15} /> Mark Dispatched
                </button>
                <button
                  onClick={() => updateMutation.mutate({ notes, pcrUrl: pcrUrl || undefined, status: 'RESOLVED' })}
                  disabled={updateMutation.isPending || notes.trim().length < 5}
                  className="flex items-center gap-1.5 px-4 py-2 bg-brand-teal/10 text-brand-teal text-sm font-semibold rounded-lg hover:bg-brand-teal hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  title={notes.trim().length < 5 ? 'Add case notes before resolving' : ''}
                >
                  <CheckCircle size={15} /> Resolve Case
                </button>
                <button
                  onClick={() => updateMutation.mutate({ notes, pcrUrl: pcrUrl || undefined })}
                  disabled={updateMutation.isPending}
                  className="ml-auto flex items-center gap-1.5 px-4 py-2 border border-surface-border text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-all disabled:opacity-40"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
              {notes.trim().length < 5 && notes.length > 0 && (
                <p className="text-xs text-status-warning mt-2">Notes must be at least 5 characters to resolve.</p>
              )}
            </div>
          )}

          {isResolved && incident.partnerNotes && (
            <div className="bg-brand-teal/5 border border-brand-teal/20 rounded-lg p-4">
              <p className="text-xs font-semibold text-brand-teal mb-1">Saved Partner Notes</p>
              <p className="text-sm text-slate-600">{incident.partnerNotes}</p>
            </div>
          )}
        </div>
      </div>

      <EndCaseModal
        incidentId={incident.id}
        caseNumber={incident.caseNumber}
        isOpen={showEndCase}
        onClose={() => setShowEndCase(false)}
        onSuccess={() => navigate(-1)}
        invalidateKeys={[['partner', 'incidents'], ['partner', 'incident', id]]}
      />
    </div>
  );
}

export default PartnerCaseDetailPage;
