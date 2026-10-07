import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck, MapPin, Camera, X as XIcon, Check, ChevronDown, ChevronUp, Lock, Phone,
} from 'lucide-react';
import AppLoader from '@/components/shared/AppLoader';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { confirmDialog } from '@/lib/alert';
import {
  getAgencyVehicles, getMyCheckIn, checkInToVehicle, checkOutFromVehicle, getCurrentPosition, getErrorMessage,
} from '@/api/responder';
import type { Role, Vehicle } from '@/types/api';
import LoadingState from '@/components/shared/LoadingState';
import { MIN_MEDICS, medicCountLabel } from '@/utils/crew';

// Medics have two slots each (a crew can be two EMTs or two nurses).
const ROLE_SLOTS: Record<'DRIVER' | 'EMT' | 'NURSE', (keyof Vehicle)[]> = {
  DRIVER: ['currentDriver'],
  EMT: ['currentEmt', 'currentEmt2'],
  NURSE: ['currentNurse', 'currentNurse2'],
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

/**
 * An ambulance another driver is already checked in to - the web twin of the
 * crew app's locked card: plate and state, who's on it (with a call link),
 * medic cover, and a footer saying why it can't be picked. No button.
 */
function CrewedVehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const driver = vehicle.currentDriver!;
  const medics = [vehicle.currentEmt, vehicle.currentEmt2, vehicle.currentNurse, vehicle.currentNurse2].filter(Boolean).length;
  const complete = medics >= MIN_MEDICS;
  const [state, tone] =
    vehicle.status === 'BUSY' ? ['On a case', 'blue']
      : vehicle.status === 'MAINTENANCE' ? ['Maintenance', 'muted']
        : complete ? ['Ready', 'status-success'] : ['Crewing up', 'amber'];
  const toneColor = tone === 'muted' ? 'var(--muted)' : tone === 'status-success' ? 'var(--color-status-success)' : `var(--${tone})`;
  const initials = driver.name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const phone = (driver as { phone?: string | null }).phone;

  return (
    <div
      className="rounded-xl border mb-2 overflow-hidden"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      aria-label={`${vehicle.registrationNumber}, ${state}, driver ${driver.name}. Already crewed, not available.`}
    >
      <div className="px-3.5 pt-3 pb-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className="text-sm font-black tracking-wider px-2.5 py-0.5 rounded-md"
            style={{ background: '#F7D23E', color: '#111', border: '2px solid #111' }}
          >
            {vehicle.registrationNumber.toUpperCase()}
          </span>
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ color: toneColor, background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            {state}
          </span>
        </div>
        {vehicle.lastLocationName && (
          <p className="text-xs mt-1.5 flex items-center gap-1 truncate" style={{ color: 'var(--muted)' }}>
            <MapPin size={12} className="flex-shrink-0" /> {vehicle.lastLocationName}
          </p>
        )}
      </div>
      <div className="px-3.5 py-2.5 border-t flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
        <span className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}>
          {initials}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{driver.name}</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Driver on shift</p>
        </div>
        <span className="text-xs font-bold flex-shrink-0" style={{ color: complete ? 'var(--color-status-success)' : 'var(--amber)' }}>
          {medicCountLabel(medics)}
        </span>
        {phone && (
          <a href={`tel:${phone}`} className="icon-btn flex-shrink-0" title={`Call ${driver.name.split(' ')[0]}`} aria-label={`Call ${driver.name}`}>
            <Phone size={16} style={{ color: 'var(--green)' }} />
          </a>
        )}
      </div>
      <div className="px-3.5 py-1.5 flex items-center gap-1.5 text-xs" style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>
        <Lock size={12} /> Crewed · not available to check in
      </div>
    </div>
  );
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
            {isLocating ? <AppLoader size={18} /> : coords ? <Check size={14} /> : <MapPin size={14} />}
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
          A selfie and your location are required. Your location is only compared with the ambulance's tracker to
          confirm you're with it.
        </p>

        <div className="flex gap-2 mt-1">
          <button onClick={onCancel} disabled={isSubmitting} className="btn btn-ghost btn-sm flex-1">Cancel</button>
          <button
            onClick={() => canSubmit && onSubmit({ lat: coords!.lat, lng: coords!.lng, file: file! })}
            disabled={!canSubmit}
            className="btn btn-primary btn-sm flex-1"
          >
            {isSubmitting ? <AppLoader size={18} /> : <Check size={14} />}
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

  // Another driver holds this ambulance: never offered as a choice.
  const isCrewedByOther = (v: Vehicle) => !!v.currentDriver && v.currentDriver.id !== user.id;

  return (
    <div className="card card-pad">
      <div className="flex gap-3.5 mb-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--green)' }}>
          <ClipboardCheck size={22} color="#fff" />
        </div>
        <div className="flex-1">
          <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Shift check-in</p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            {user.role === 'DRIVER'
              ? "Drivers check in with a selfie at the ambulance. The check-in is recorded at the ambulance's GPS position; your browser location only confirms you're with it."
              : 'EMTs and nurses are added to an ambulance by its driver.'}
          </p>
        </div>
      </div>

      {myLoading ? (
        <LoadingState minHeight={72} />
      ) : myVehicle ? (
        <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="eyebrow">On shift</p>
              <p className="text-xl font-bold mt-1" style={{ color: 'var(--ink)' }}>{myVehicle.registrationNumber}</p>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{roleLabel} · IMEI {myVehicle.imei}</p>
            </div>
            <button onClick={handleEndShift} disabled={checkOutMutation.isPending} className="btn btn-sm" style={{ border: '1.5px solid var(--red)', color: 'var(--red)', background: 'transparent' }}>
              {checkOutMutation.isPending ? <AppLoader size={18} /> : 'End shift'}
            </button>
          </div>
          <div className="flex items-center gap-2 pt-3 mt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <MapPin size={16} style={{ color: 'var(--green)' }} />
            <div>
              <p className="text-sm" style={{ color: 'var(--ink)' }}>
                {(() => {
                  const name = myVehicle.checkInLocationName || myVehicle.lastLocationName;
                  if (name && !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(name.trim())) return `Ambulance at ${name} at check-in`;
                  return 'Checked in - ambulance position not yet known';
                })()}
              </p>
              {myVehicle.checkedInAt && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Since {formatCheckInTime(myVehicle.checkedInAt)}</p>
              )}
            </div>
          </div>
        </div>
      ) : user.role !== 'DRIVER' ? (
        <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)' }}>
          <p className="eyebrow">Off shift</p>
          <p className="text-base font-bold mt-1" style={{ color: 'var(--ink)' }}>Waiting for your driver</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {slotLabel(user.role)}s don't check in. Ask the driver of your ambulance to add you to the crew - you'll be
            on shift as soon as they do.
          </p>
        </div>
      ) : (
        <>
          <button onClick={() => setShowPicker((v) => !v)} className="btn btn-primary btn-block">
            {showPicker ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showPicker ? 'Hide vehicles' : 'Select vehicle to check in'}
          </button>

          {showPicker && (
            <div className="mt-3 max-h-80 overflow-y-auto scroll-thin">
              <p className="label mb-2">With tracker - check-in</p>
              {vehiclesLoading ? (
                <LoadingState minHeight={56} />
              ) : error ? (
                <div className="flex items-center gap-2">
                  <p className="text-sm" style={{ color: 'var(--red)' }}>{getErrorMessage(error)}</p>
                  <button onClick={() => refetch()} className="text-sm font-bold" style={{ color: 'var(--green)' }}>Retry</button>
                </div>
              ) : vehicles.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>No active GPS vehicles found for your agency.</p>
              ) : (
                <>
                {vehicles.filter((v) => !isCrewedByOther(v)).map((vehicle) => {
                  const slots = ROLE_SLOTS[user.role as keyof typeof ROLE_SLOTS] ?? [];
                  const occupants = slots
                    .map((s) => vehicle[s] as { id: string; name: string } | null | undefined)
                    .filter((o): o is { id: string; name: string } => !!o);
                  const isMine = occupants.some((o) => o.id === user.id);
                  // The driver seat is single; medics are only turned away once both of their slots are taken.
                  const isTaken = !isMine && occupants.length === slots.length && slots.length > 0;
                  const occupant = occupants[0];

                  return (
                    <div key={vehicle.id}>
                      <div className="flex items-center gap-3 rounded-xl border p-3 mb-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{vehicle.registrationNumber}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                            {isMine
                              ? `You are checked in as ${roleLabel}`
                              : isTaken
                                ? `${roleLabel}: ${occupants.map((o) => o.name).join(', ')}`
                                : occupant && slots.length > 1
                                  ? `${roleLabel}: ${occupant.name} · 1 slot open`
                                  : `${roleLabel} slot open`}
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
                })}
                {vehicles.some(isCrewedByOther) && (
                  <>
                    <p className="label mt-4 mb-1">Already crewed</p>
                    <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
                      {vehicles.filter(isCrewedByOther).length} with a driver on shift · not available
                    </p>
                    {vehicles.filter(isCrewedByOther).map((v) => <CrewedVehicleCard key={v.id} vehicle={v} />)}
                  </>
                )}
                </>
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
