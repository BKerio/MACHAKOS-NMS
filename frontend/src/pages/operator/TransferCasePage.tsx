import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowLeftRight, CarFront, UserX, Moon, TrendingUp, ShieldAlert, MoreHorizontal,
  BedDouble, Siren, Truck, Check, Circle, type LucideIcon,
} from 'lucide-react';
import AppLoader from '@/components/shared/AppLoader';
import StatusBadge from '@/components/operator/StatusBadge';
import { confirmDialog } from '@/lib/alert';
import { useNotificationStore } from '@/stores/notificationStore';
import { getActiveTask, getTransferCandidates, handoverTask, getErrorMessage, type TransferCandidate } from '@/api/responder';

/**
 * Transfer a live case to another ambulance - the web twin of the crew app's
 * Transfer case screen (app/lib/features/tasks/transfer_case_screen.dart):
 * same reasons, same ready-only list (closest to where the replacement must go
 * first), same action-bar labels, same confirmation, same outcome.
 */

interface Reason { label: string; Icon: LucideIcon; breakdown?: boolean }

const REASONS: Reason[] = [
  { label: 'Mechanical breakdown', Icon: CarFront, breakdown: true },
  { label: 'Driver unable to continue', Icon: UserX },
  { label: 'Crew fatigue or end of shift', Icon: Moon },
  { label: 'Higher-capability unit needed', Icon: TrendingUp },
  { label: 'Safety concern', Icon: ShieldAlert },
  { label: 'Other', Icon: MoreHorizontal },
];

function formatDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

function gpsAgo(iso?: string | null): string | null {
  if (!iso) return null;
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(m)) return null;
  return m < 1 ? 'GPS just now' : m < 60 ? `GPS ${m} min ago` : `GPS ${Math.floor(m / 60)} h ago`;
}

/** Yellow Kenyan plate - fixed colours on purpose, same as the app. */
function NumberPlate({ reg }: { reg: string }) {
  return (
    <span className="text-sm font-black tracking-wider px-2.5 py-0.5 rounded-md" style={{ background: '#F7D23E', color: '#111', border: '2px solid #111' }}>
      {reg.toUpperCase()}
    </span>
  );
}

/** Radio-style choice card - the app's SelectCard. */
function SelectCard({
  Icon, title, tag, subtitle, selected, onClick, warn,
}: { Icon: LucideIcon; title: string; tag?: string; subtitle?: string; selected: boolean; onClick: () => void; warn?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="radio"
      aria-checked={selected}
      className="w-full flex items-center gap-3 text-left p-3 rounded-xl border transition-all"
      style={{
        background: selected ? 'var(--green-light)' : 'var(--surface)',
        borderColor: selected ? 'var(--green)' : 'var(--border)',
        borderWidth: selected ? 1.5 : 1,
      }}
    >
      <span
        className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: warn ? 'var(--amber-soft)' : 'var(--green-light)' }}
      >
        <Icon size={22} style={{ color: warn ? 'var(--amber)' : 'var(--green)' }} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-bold truncate" style={{ color: 'var(--ink)' }}>{title}</span>
        {tag && (
          <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}>
            {tag}
          </span>
        )}
        {subtitle && <span className="block text-xs mt-1 truncate" style={{ color: 'var(--muted)' }}>{subtitle}</span>}
      </span>
      {selected
        ? <Check size={22} className="flex-shrink-0 rounded-full p-0.5 text-white" style={{ background: 'var(--green)' }} />
        : <Circle size={22} className="flex-shrink-0" style={{ color: 'var(--border-strong)' }} />}
    </button>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <span className="w-1 h-4 rounded-full" style={{ background: 'var(--green)' }} />
        <p className="text-sm font-extrabold tracking-wide" style={{ color: 'var(--ink)' }}>{title.toUpperCase()}</p>
      </div>
      {subtitle && <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
    </div>
  );
}

function TransferCasePage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();

  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState('');
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);

  const { data: task, isLoading: taskLoading } = useQuery({ queryKey: ['operator', 'active-task'], queryFn: getActiveTask });
  const { data: options, error, isFetching, refetch } = useQuery({
    queryKey: ['operator', 'transfer-candidates', taskId],
    queryFn: () => getTransferCandidates(taskId),
    staleTime: 0,
    enabled: !!taskId,
  });

  // Nearest first: preselect it, still easy to change.
  useEffect(() => {
    if (selectedId === undefined && options) setSelectedId(options.vehicles[0]?.id ?? null);
  }, [options, selectedId]);

  const selected: TransferCandidate | undefined = options?.vehicles.find((v) => v.id === selectedId);
  const reg = task?.vehicle?.registrationNumber ?? 'This ambulance';
  const caseNumber = task?.incident?.caseNumber ?? '';
  const onBoard = options?.target.patientOnBoard ?? false;
  const reasonText = reason ? (note.trim() ? `${reason.label} - ${note.trim()}` : reason.label) : '';
  const ready = !!reason && !!options && (reason.label !== 'Other' || note.trim().length >= 5);

  const transfer = useMutation({
    mutationFn: () => handoverTask(taskId, { reason: reasonText, autoAssign: false, newVehicleId: selected?.id, breakdown: !!reason?.breakdown }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operator'] });
      addNotification({ type: 'success', title: 'Case transferred', message: 'The record is in your History.' });
      navigate('/operator/assignment', { replace: true });
    },
    onError: (err) => addNotification({ type: 'error', title: 'Couldn’t transfer the case', message: getErrorMessage(err) }),
  });

  const confirm = async () => {
    const ok = await confirmDialog({
      title: selected ? `Transfer to ${selected.registrationNumber}?` : 'Hand this case back to dispatch?',
      text: [
        selected
          ? `${selected.registrationNumber}'s crew takes over ${caseNumber} straight away.`
          : 'No ambulance is ready right now, so dispatch will find one.',
        reason?.breakdown ? `${reg} will be marked Unavailable; you and your crew stay checked in with it.` : '',
      ].filter(Boolean).join(' '),
      confirmLabel: selected ? 'Transfer' : 'Hand back',
    });
    if (ok) transfer.mutate();
  };

  const actionLabel = useMemo(() => {
    if (!ready) return !reason ? 'Choose a reason' : !options ? 'Finding ambulances…' : 'Add a note';
    return selected ? `Transfer to ${selected.registrationNumber}` : 'Hand back to dispatch';
  }, [ready, reason, options, selected]);

  if (!taskLoading && (!task || task.id !== taskId)) {
    return (
      <div className="card card-pad text-center" style={{ padding: 40 }}>
        <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>This case is no longer active</p>
        <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>It may already have been transferred or closed.</p>
        <button onClick={() => navigate('/operator/assignment')} className="btn btn-primary btn-sm mt-4">Back to current case</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="icon-btn" aria-label="Back"><ArrowLeft size={18} /></button>
        <h2 className="text-xl font-extrabold tracking-wide" style={{ color: 'var(--ink)' }}>TRANSFER CASE</h2>
      </div>

      {/* What's being transferred, and where the replacement will head. */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: 'var(--nav-bg)' }}>
        <div className="flex items-center">
          <p className="text-[11px] font-extrabold tracking-widest flex-1" style={{ color: 'rgba(255,255,255,0.6)' }}>TRANSFERRING</p>
          {task && <StatusBadge status={task.status} />}
        </div>
        <div className="flex items-center gap-3 mt-2">
          <p className="text-xl font-extrabold text-white flex-1">{caseNumber || '…'}</p>
          {task?.vehicle?.registrationNumber && <NumberPlate reg={task.vehicle.registrationNumber} />}
        </div>
        <div className="flex gap-2 mt-3 text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
          {onBoard ? <BedDouble size={18} className="flex-shrink-0 opacity-70" /> : <Siren size={18} className="flex-shrink-0 opacity-70" />}
          <p>
            {!options
              ? 'Working out where the replacement goes…'
              : onBoard
                ? 'The patient is on board. The replacement comes to this ambulance to collect them, then goes on to the hospital.'
                : 'The replacement goes to the scene and carries on from there.'}
          </p>
        </div>
      </div>

      <SectionHeader title="Why are you transferring?" />
      <div className="flex flex-col gap-2" role="radiogroup">
        {REASONS.map((r) => (
          <SelectCard
            key={r.label}
            Icon={r.Icon}
            title={r.label}
            warn={r.breakdown}
            subtitle={r.breakdown ? `${reg} goes out of service; your crew stays with it` : undefined}
            selected={reason?.label === r.label}
            onClick={() => setReason(r)}
          />
        ))}
      </div>

      <p className="label mt-5 mb-2">{reason?.label === 'Other' ? 'WHAT HAPPENED? (REQUIRED)' : 'NOTE FOR DISPATCH (OPTIONAL)'}</p>
      <textarea
        className="eoc-textarea"
        rows={2}
        maxLength={300}
        placeholder="e.g. Engine failed on Mombasa Rd near the flyover"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <p className="text-xs text-right mt-1" style={{ color: 'var(--muted)' }}>{note.length}/300</p>

      <div className="mt-4">
        <SectionHeader
          title="Ready ambulances"
          subtitle={options ? `Full crew, checklist done, not on a case. Closest to ${options.target.label} first.` : undefined}
        />
        {error && (
          <div className="flex items-center gap-3 rounded-xl p-3 mb-3" style={{ background: 'var(--red-soft)' }}>
            <p className="text-sm flex-1" style={{ color: 'var(--red)' }}>{getErrorMessage(error)}</p>
            <button onClick={() => refetch()} className="btn btn-sm btn-ghost">{isFetching ? <AppLoader size={16} /> : 'Retry'}</button>
          </div>
        )}
        {!options && !error ? (
          <div className="py-8 flex justify-center"><AppLoader size={28} style={{ color: 'var(--green)' }} /></div>
        ) : options && options.vehicles.length === 0 ? (
          <div className="card card-pad text-center">
            <Truck size={32} className="mx-auto" style={{ color: 'var(--muted)' }} />
            <p className="text-base font-bold mt-2" style={{ color: 'var(--ink)' }}>No ambulance is ready</p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              Every other unit is on a case, under maintenance or short of crew. Hand the case back and dispatch will find one.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2" role="radiogroup">
            {options?.vehicles.map((v, i) => (
              <SelectCard
                key={v.id}
                Icon={Truck}
                title={v.registrationNumber}
                tag={[i === 0 && v.distanceKm != null ? 'Nearest' : null, v.distanceKm == null ? 'No GPS' : formatDistance(v.distanceKm)]
                  .filter(Boolean)
                  .join(' · ')}
                subtitle={[
                  v.currentDriver ? `Driver ${v.currentDriver.name.split(' ')[0]}` : null,
                  `${v.medicCount} medics`,
                  v.locationName || null,
                  gpsAgo(v.positionAt),
                ].filter(Boolean).join(' · ')}
                selected={selectedId === v.id}
                onClick={() => setSelectedId(v.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pinned primary action - the app's PrimaryActionBar. */}
      <div className="sticky bottom-0 z-20 -mx-1 mt-6 rounded-t-2xl border-t" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 -6px 16px rgba(16,33,26,0.06)' }}>
        <div className="px-4 py-3">
          <button onClick={confirm} disabled={!ready || transfer.isPending} className="btn btn-primary btn-lg btn-block">
            {transfer.isPending ? <AppLoader size={20} /> : <ArrowLeftRight size={18} />}
            {transfer.isPending ? 'Transferring…' : actionLabel}
          </button>
          {selected && (
            <p className="text-xs text-center mt-2" style={{ color: 'var(--muted)' }}>
              {selected.registrationNumber}'s crew gets the case and a call alert straight away.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default TransferCasePage;
