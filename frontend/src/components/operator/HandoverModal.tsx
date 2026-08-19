import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, X as XIcon, LoaderCircle } from 'lucide-react';
import { getAvailableHandoverVehicles, getErrorMessage } from '@/api/responder';
import { HANDOVER_REASON_PRESETS, buildHandoverReason } from '@/utils/closureReasons';

function formatDistance(km?: number | null) {
  if (km == null || !Number.isFinite(km)) return 'Distance unknown';
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}

interface HandoverModalProps {
  caseNumber: string;
  currentVehicleId: string;
  referenceLat?: number | null;
  referenceLng?: number | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (payload: { reason: string; autoAssign: boolean; newVehicleId?: string }) => void;
}

function HandoverModal({
  caseNumber,
  currentVehicleId,
  referenceLat,
  referenceLng,
  isSubmitting = false,
  onClose,
  onConfirm,
}: HandoverModalProps) {
  const [selected, setSelected] = useState('');
  const [extraNote, setExtraNote] = useState('');
  const [autoAssign, setAutoAssign] = useState(true);
  const [pickedVehicleId, setPickedVehicleId] = useState<string | undefined>();

  const { data: vehicles = [], isLoading, error } = useQuery({
    queryKey: ['operator', 'handover-vehicles', currentVehicleId, referenceLat, referenceLng],
    queryFn: () => getAvailableHandoverVehicles({ excludeVehicleId: currentVehicleId, lat: referenceLat, lng: referenceLng }),
  });

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const reasonText = selected ? buildHandoverReason(selected, extraNote) : '';
  const hasReceiver = autoAssign ? vehicles.length > 0 : Boolean(pickedVehicleId);
  const canSubmit = selected.length > 0 && reasonText.length >= 5 && !isSubmitting && hasReceiver;
  const nearest = vehicles[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col" style={{ background: 'var(--surface)' }}>
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ background: 'var(--nav-bg)' }}>
          <div>
            <p className="text-[11px] font-bold tracking-widest text-white/80">Transfer case</p>
            <p className="text-lg font-bold text-white mt-0.5">{caseNumber}</p>
          </div>
          <button onClick={handleClose} disabled={isSubmitting} className="p-1.5 text-white/80 hover:text-white">
            <XIcon size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <div className="flex gap-2.5 border rounded-xl p-3 mb-4" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <ArrowLeftRight size={18} style={{ color: 'var(--green)' }} className="flex-shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
              Pass this live case to a nearby free ambulance that already has a driver. The case stays open — it is
              not cancelled — and dispatch plus the receiving crew are notified for the log.
            </p>
          </div>

          <p className="label mb-2.5">Why are you transferring?</p>
          <div className="flex flex-col gap-2">
            {HANDOVER_REASON_PRESETS.map((preset) => {
              const active = selected === preset;
              return (
                <button
                  key={preset}
                  onClick={() => setSelected(preset)}
                  disabled={isSubmitting}
                  className="text-left px-3.5 py-3 rounded-xl border-2 text-sm transition-all"
                  style={
                    active
                      ? { borderColor: 'var(--green)', background: 'var(--green-light)', color: 'var(--green)', fontWeight: 700 }
                      : { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }
                  }
                >
                  {preset}
                </button>
              );
            })}
          </div>

          <p className="label mt-4 mb-2">Extra notes for dispatch</p>
          <textarea
            className="eoc-textarea"
            style={{ minHeight: 70 }}
            placeholder="Anything the next crew should know…"
            value={extraNote}
            onChange={(e) => setExtraNote(e.target.value)}
            disabled={isSubmitting}
          />

          <div className="flex items-center gap-3 pt-4 mt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex-1">
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Send to nearest free unit</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {isLoading
                  ? 'Looking for nearby ambulances…'
                  : nearest
                    ? `Suggested: ${nearest.registrationNumber} · ${formatDistance(nearest.distanceKm)}`
                    : 'No free ambulances with a driver right now'}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={autoAssign}
                disabled={isSubmitting || vehicles.length === 0}
                onChange={(e) => {
                  setAutoAssign(e.target.checked);
                  if (e.target.checked) setPickedVehicleId(undefined);
                }}
              />
              <div
                className="w-10 h-6 rounded-full transition-colors peer-disabled:opacity-50"
                style={{ background: autoAssign ? 'var(--green)' : 'var(--border-strong)' }}
              >
                <div
                  className="w-4.5 h-4.5 bg-white rounded-full shadow transition-transform mt-[3px]"
                  style={{ width: 18, height: 18, transform: autoAssign ? 'translateX(19px)' : 'translateX(3px)' }}
                />
              </div>
            </label>
          </div>

          {!autoAssign && (
            <div className="mt-3">
              <p className="label mb-2.5">Choose a nearby free ambulance</p>
              {isLoading ? (
                <LoaderCircle size={20} className="animate-spin" style={{ color: 'var(--green)' }} />
              ) : error ? (
                <p className="text-sm" style={{ color: 'var(--red)' }}>{getErrorMessage(error)}</p>
              ) : vehicles.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  No other free ambulances with a checked-in driver are nearby. Stay with the case or call dispatch.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {vehicles.map((v) => {
                    const active = pickedVehicleId === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setPickedVehicleId((prev) => (prev === v.id ? undefined : v.id))}
                        disabled={isSubmitting}
                        className="flex items-center gap-2.5 text-left px-3.5 py-3 rounded-xl border-2 transition-all"
                        style={
                          active
                            ? { borderColor: 'var(--green)', background: 'var(--green-light)' }
                            : { borderColor: 'var(--border)', background: 'var(--surface)' }
                        }
                      >
                        <div className="flex-1">
                          <p className={`text-sm ${active ? 'font-bold' : ''}`} style={{ color: 'var(--ink)' }}>
                            {v.registrationNumber}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                            {v.currentDriver?.name ?? 'Driver'}
                            {v.currentEmt ? ` · EMT ${v.currentEmt.name}` : ''}
                            {v.lastLocationName ? ` · ${v.lastLocationName}` : ''}
                          </p>
                        </div>
                        <span
                          className="text-[11px] font-bold px-2 py-1 rounded-lg flex-shrink-0"
                          style={active ? { background: 'var(--green)', color: '#fff' } : { background: 'var(--surface-3)', color: 'var(--green)' }}
                        >
                          {formatDistance(v.distanceKm)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!isLoading && vehicles.length === 0 && (
            <p className="text-sm mt-3" style={{ color: 'var(--red)' }}>
              A receiving ambulance is required so the case stays active for patients and the log.
            </p>
          )}
        </div>

        <div className="px-5 py-4 flex gap-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button onClick={handleClose} disabled={isSubmitting} className="btn btn-ghost flex-1">
            Keep case
          </button>
          <button
            onClick={() => canSubmit && onConfirm({ reason: reasonText, autoAssign, newVehicleId: !autoAssign ? pickedVehicleId : undefined })}
            disabled={!canSubmit}
            className="btn btn-primary flex-[1.4]"
          >
            <ArrowLeftRight size={16} />
            {isSubmitting ? 'Transferring…' : 'Transfer case'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default HandoverModal;
