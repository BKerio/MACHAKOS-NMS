import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight, X as XIcon, CarFront, UserX, Moon, TrendingUp, ShieldAlert, MoreHorizontal, Check, type LucideIcon,
} from 'lucide-react';
import AppLoader from '@/components/shared/AppLoader';
import { getTransferCandidates, getErrorMessage } from '@/api/responder';

/** Same reasons as the crew app's Transfer screen. A breakdown takes this
 *  ambulance out of service with its crew still checked in. */
const REASONS: { label: string; Icon: LucideIcon; breakdown?: boolean }[] = [
  { label: 'Mechanical breakdown', Icon: CarFront, breakdown: true },
  { label: 'Driver unable to continue', Icon: UserX },
  { label: 'Crew fatigue or end of shift', Icon: Moon },
  { label: 'Higher-capability unit needed', Icon: TrendingUp },
  { label: 'Safety concern', Icon: ShieldAlert },
  { label: 'Other', Icon: MoreHorizontal },
];

function formatDistance(km: number | null) {
  if (km == null || !Number.isFinite(km)) return 'No GPS';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

interface HandoverModalProps {
  taskId: string;
  caseNumber: string;
  registrationNumber?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (payload: { reason: string; autoAssign: boolean; newVehicleId?: string; breakdown?: boolean }) => void;
}

function HandoverModal({ taskId, caseNumber, registrationNumber, isSubmitting = false, onClose, onConfirm }: HandoverModalProps) {
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [note, setNote] = useState('');
  const [pickedId, setPickedId] = useState<string | undefined>();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['operator', 'transfer-candidates', taskId],
    queryFn: () => getTransferCandidates(taskId),
    staleTime: 0,
  });
  const vehicles = data?.vehicles ?? [];

  // Closest ready unit preselected, still easy to change.
  useEffect(() => {
    if (pickedId === undefined && vehicles.length > 0) setPickedId(vehicles[0].id);
  }, [vehicles, pickedId]);

  const picked = vehicles.find((v) => v.id === pickedId);
  const reasonText = reason ? (note.trim() ? `${reason.label} - ${note.trim()}` : reason.label) : '';
  const noteOk = reason?.label !== 'Other' || note.trim().length >= 5;
  const canSubmit = !!reason && noteOk && !isLoading && !isSubmitting;

  const handleClose = () => { if (!isSubmitting) onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col" style={{ background: 'var(--surface)' }}>
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ background: 'var(--nav-bg)' }}>
          <div>
            <p className="text-[11px] font-bold tracking-widest text-white/80">TRANSFER CASE</p>
            <p className="text-lg font-bold text-white mt-0.5">{caseNumber}</p>
          </div>
          <button onClick={handleClose} disabled={isSubmitting} className="p-1.5 text-white/80 hover:text-white" aria-label="Close">
            <XIcon size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <p className="label mb-2.5">Why are you transferring?</p>
          <div className="grid grid-cols-2 gap-2">
            {REASONS.map((r) => {
              const active = reason?.label === r.label;
              return (
                <button
                  key={r.label}
                  onClick={() => setReason(r)}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 text-left px-3 py-2.5 rounded-xl border-2 text-sm transition-all"
                  style={
                    active
                      ? { borderColor: 'var(--green)', background: 'var(--green-light)', color: 'var(--green)', fontWeight: 700 }
                      : { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }
                  }
                >
                  <r.Icon size={16} className="flex-shrink-0" />
                  {r.label}
                </button>
              );
            })}
          </div>

          <p className="label mt-4 mb-2">{reason?.label === 'Other' ? 'What happened? (required)' : 'Note for dispatch (optional)'}</p>
          <textarea
            className="eoc-textarea"
            style={{ minHeight: 64 }}
            placeholder="Anything the next crew should know"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isSubmitting}
          />
          {reason?.breakdown && (
            <p className="text-xs mt-2" style={{ color: 'var(--amber)' }}>
              {registrationNumber ?? 'This ambulance'} will be marked unavailable; you and your crew stay checked in with it.
            </p>
          )}

          <p className="label mt-5 mb-1">Ready ambulances</p>
          <p className="text-xs mb-2.5" style={{ color: 'var(--muted)' }}>
            Full crew, checklist done, not on a case. Closest to {data?.target.label ?? 'the scene'} first.
          </p>
          {isLoading ? (
            <div className="py-6 flex justify-center"><AppLoader size={24} style={{ color: 'var(--green)' }} /></div>
          ) : error ? (
            <div className="flex items-center gap-2">
              <p className="text-sm" style={{ color: 'var(--red)' }}>{getErrorMessage(error)}</p>
              <button onClick={() => refetch()} className="text-sm font-bold" style={{ color: 'var(--green)' }}>Retry</button>
            </div>
          ) : vehicles.length === 0 ? (
            <div className="rounded-xl border p-4 text-sm" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              <p className="font-bold" style={{ color: 'var(--ink)' }}>No ambulance is ready</p>
              <p className="mt-1" style={{ color: 'var(--muted)' }}>
                Every other unit is on a case, under maintenance or short of crew. Hand the case back and dispatch will find one.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {vehicles.map((v, i) => {
                const active = pickedId === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setPickedId(v.id)}
                    disabled={isSubmitting}
                    className="flex items-center gap-3 text-left px-3.5 py-3 rounded-xl border-2 transition-all"
                    style={active ? { borderColor: 'var(--green)', background: 'var(--green-light)' } : { borderColor: 'var(--border)', background: 'var(--surface)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                        {v.registrationNumber}
                        {i === 0 && v.distanceKm != null && (
                          <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-3)', color: 'var(--green)' }}>Nearest</span>
                        )}
                      </p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
                        {[v.currentDriver ? `Driver ${v.currentDriver.name.split(' ')[0]}` : null, `${v.medicCount}/2 medics`, v.locationName]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--muted)' }}>{formatDistance(v.distanceKm)}</span>
                    {active && <Check size={18} style={{ color: 'var(--green)' }} className="flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-4 flex gap-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button onClick={handleClose} disabled={isSubmitting} className="btn btn-ghost flex-1">Keep case</button>
          <button
            onClick={() =>
              canSubmit &&
              onConfirm({ reason: reasonText, autoAssign: false, newVehicleId: picked?.id, breakdown: !!reason?.breakdown })
            }
            disabled={!canSubmit}
            className="btn btn-primary flex-[1.4]"
          >
            {isSubmitting ? <AppLoader size={20} /> : <ArrowLeftRight size={16} />}
            {isSubmitting ? 'Transferring…' : picked ? `Transfer to ${picked.registrationNumber}` : 'Hand back to dispatch'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default HandoverModal;
