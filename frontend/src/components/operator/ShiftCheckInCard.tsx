import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck, MapPin, Camera, X as XIcon, LoaderCircle, Check, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { confirmDialog } from '@/lib/alert';
import {
  getAgencyVehicles, getMyCheckIn, checkInToVehicle, checkOutFromVehicle, getCurrentPosition, getErrorMessage,
} from '@/api/responder';
import type { Role, Vehicle } from '@/types/api';

const ROLE_SLOT: Record<'DRIVER' | 'EMT' | 'NURSE', keyof Vehicle> = {
  DRIVER: 'currentDriver',
  EMT: 'currentEmt',
  NURSE: 'currentNurse',
};

function slotLabel(role: Role) {
  if (role === 'DRIVER') return 'Driver';
  if (role === 'EMT') return 'EMT';
  return 'Nurse';
}

function formatCheckInTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Inline check-in panel: capture GPS + a selfie, then submit. */
function CheckInPanel({
  vehicle,
  onCancel,
  onSubmit,
  isSubmitting,
}: {
  vehicle: Vehicle;
  onCancel: () => void;
  onSubmit: (data: { lat: number; lng: number; file: File }) => void;
  isSubmitting: boolean;
}) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const captureLocation = async () => {
    setIsLocating(true);
    setLocError(null);
    try {
      const pos = await getCurrentPosition();
      setCoords(pos);
    } catch (err) {
      setLocError(getErrorMessage(err));
    } finally {
      setIsLocating(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const canSubmit = !!coords && !!file && !isSubmitting;

  return (
    <div className="rounded-xl border p-4 mt-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Check in to {vehicle.registrationNumber}</p>
        <button onClick={onCancel} disabled={isSubmitting} className="icon-btn"><XIcon size={16} /></button>
      </div>

      <div className="flex flex-col gap-3">
        {/* Location */}
        <div className="flex items-center gap-3">
          <button
            onClick={captureLocation}
            disabled={isLocating || isSubmitting}
            className={`btn btn-sm ${coords ? 'btn-soft' : 'btn-primary'}`}
          >
            {isLocating ? <LoaderCircle size={14} className="animate-spin" /> : coords ? <Check size={14} /> : <MapPin size={14} />}
            {isLocating ? 'Locating…' : coords ? 'Location captured' : 'Capture location'}
          </button>
          {locError && <span className="text-xs" style={{ color: 'var(--red)' }}>{locError}</span>}
        </div>

        {/* Selfie */}
        <div className="flex items-center gap-3">
          <input ref={inputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFileChange} />
          <button onClick={() => inputRef.current?.click()} disabled={isSubmitting} className={`btn btn-sm ${file ? 'btn-soft' : 'btn-primary'}`}>
            <Camera size={14} />
            {file ? 'Retake selfie' : 'Take accountability selfie'}
          </button>
          {previewUrl && <img src={previewUrl} alt="Selfie preview" className="w-10 h-10 rounded-lg object-cover border" style={{ borderColor: 'var(--border)' }} />}
        </div>

        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Location and a selfie are required before dispatch can assign cases to you.
        </p>

        <div className="flex gap-2 mt-1">
          <button onClick={onCancel} disabled={isSubmitting} className="btn btn-ghost btn-sm flex-1">Cancel</button>
          <button
            onClick={() => canSubmit && onSubmit({ lat: coords!.lat, lng: coords!.lng, file: file! })}
            disabled={!canSubmit}
            className="btn btn-primary btn-sm flex-1"
          >
            {isSubmitting ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
            {isSubmitting ? 'Checking in…' : 'Complete check-in'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShiftCheckInCard() {
  const user = useAuthStore((s) => s.user);
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);
  const [checkInTarget, setCheckInTarget] = useState<Vehicle | null>(null);
  const roleLabel = useMemo(() => (user ? slotLabel(user.role) : ''), [user]);

  const { data: myVehicle, isLoading: myLoading } = useQuery({
    queryKey: ['operator', 'my-checkin'],
    queryFn: getMyCheckIn,
  });

  const { data: vehicles = [], isLoading: vehiclesLoading, isRefetching, error, refetch } = useQuery({
    queryKey: ['operator', 'agency-vehicles'],
    queryFn: getAgencyVehicles,
    enabled: showPicker,
  });

  const checkInMutation = useMutation({
    mutationFn: (data: { lat: number; lng: number; file: File }) => checkInToVehicle(checkInTarget!.id, data),
    onSuccess: () => {
      setCheckInTarget(null);
      setShowPicker(false);
      queryClient.invalidateQueries({ queryKey: ['operator', 'my-checkin'] });
      queryClient.invalidateQueries({ queryKey: ['operator', 'agency-vehicles'] });
      addNotification({ type: 'success', title: 'Checked in', message: 'Location and time captured. You are on shift.' });
    },
    onError: (err) => addNotification({ type: 'error', title: 'Check-in paused', message: getErrorMessage(err) }),
  });

  const checkOutMutation = useMutation({
    mutationFn: () => checkOutFromVehicle(myVehicle!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operator', 'my-checkin'] });
      queryClient.invalidateQueries({ queryKey: ['operator', 'agency-vehicles'] });
      addNotification({ type: 'success', title: 'Checked out', message: 'Your shift on this vehicle has ended.' });
    },
    onError: (err) => addNotification({ type: 'error', title: 'Check-out failed', message: getErrorMessage(err) }),
  });

  const handleEndShift = async () => {
    const confirmed = await confirmDialog({
      title: 'End shift?',
      text: 'This will check you out of the vehicle so dispatch will stop assigning cases to this crew slot.',
      confirmLabel: 'End shift',
      cancelLabel: 'Keep shift',
      danger: true,
    });
    if (confirmed) checkOutMutation.mutate();
  };

  if (!user) return null;

  return (
    <div className="card card-pad">
      <div className="flex gap-3.5 mb-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--green)' }}>
          <ClipboardCheck size={22} color="#fff" />
        </div>
        <div className="flex-1">
          <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Shift check-in</p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            Check in with a selfie and your location before dispatch can assign cases. Browser location access is
            required.
          </p>
        </div>
      </div>

      {myLoading ? (
        <div className="skel" style={{ height: 72 }} />
      ) : myVehicle ? (
        <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="eyebrow">On shift</p>
              <p className="text-xl font-bold mt-1" style={{ color: 'var(--ink)' }}>{myVehicle.registrationNumber}</p>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{roleLabel} · IMEI {myVehicle.imei}</p>
            </div>
            <button onClick={handleEndShift} disabled={checkOutMutation.isPending} className="btn btn-sm" style={{ border: '1.5px solid var(--red)', color: 'var(--red)', background: 'transparent' }}>
              {checkOutMutation.isPending ? <LoaderCircle size={14} className="animate-spin" /> : 'End shift'}
            </button>
          </div>
          <div className="flex items-center gap-2 pt-3 mt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <MapPin size={16} style={{ color: 'var(--green)' }} />
            <div>
              <p className="text-sm" style={{ color: 'var(--ink)' }}>
                {(() => {
                  const name = myVehicle.checkInLocationName || myVehicle.lastLocationName;
                  if (name && !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(name.trim())) return `Logged in at ${name}`;
                  return 'Logged in — resolving place name…';
                })()}
              </p>
              {myVehicle.checkedInAt && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Since {formatCheckInTime(myVehicle.checkedInAt)}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <button onClick={() => setShowPicker((v) => !v)} className="btn btn-primary btn-block">
            {showPicker ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showPicker ? 'Hide vehicles' : 'Select vehicle to check in'}
          </button>

          {showPicker && (
            <div className="mt-3 max-h-80 overflow-y-auto scroll-thin">
              <p className="label mb-2">With tracker — check-in</p>
              {vehiclesLoading ? (
                <div className="skel" style={{ height: 56 }} />
              ) : error ? (
                <div className="flex items-center gap-2">
                  <p className="text-sm" style={{ color: 'var(--red)' }}>{getErrorMessage(error)}</p>
                  <button onClick={() => refetch()} className="text-sm font-bold" style={{ color: 'var(--green)' }}>Retry</button>
                </div>
              ) : vehicles.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>No active GPS vehicles found for your agency.</p>
              ) : (
                vehicles.map((vehicle) => {
                  const slot = ROLE_SLOT[user.role as keyof typeof ROLE_SLOT];
                  const occupant = slot ? (vehicle[slot] as { id: string; name: string } | null | undefined) : null;
                  const isMine = occupant?.id === user.id;
                  const isTaken = !!occupant && !isMine;

                  return (
                    <div key={vehicle.id}>
                      <div className="flex items-center gap-3 rounded-xl border p-3 mb-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{vehicle.registrationNumber}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                            {isMine ? `You are checked in as ${roleLabel}` : isTaken ? `${roleLabel}: ${occupant!.name}` : `${roleLabel} slot open`}
                          </p>
                        </div>
                        {isTaken ? (
                          <span className="text-xs font-bold px-3 py-2 rounded-lg" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}>Taken</span>
                        ) : isMine ? (
                          <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--green)' }}>
                            <Check size={16} color="#fff" />
                          </span>
                        ) : (
                          <button onClick={() => setCheckInTarget(vehicle)} disabled={checkInMutation.isPending} className="btn btn-sm btn-primary">
                            Check in
                          </button>
                        )}
                      </div>
                      {checkInTarget?.id === vehicle.id && (
                        <CheckInPanel
                          vehicle={vehicle}
                          isSubmitting={checkInMutation.isPending}
                          onCancel={() => setCheckInTarget(null)}
                          onSubmit={(data) => checkInMutation.mutate(data)}
                        />
                      )}
                    </div>
                  );
                })
              )}
              {isRefetching && <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Refreshing…</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ShiftCheckInCard;
