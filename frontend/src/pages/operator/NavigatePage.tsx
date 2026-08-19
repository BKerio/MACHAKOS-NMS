import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import { getActiveTask, updateTaskStatus, getErrorMessage } from '@/api/responder';
import { useNotificationStore } from '@/stores/notificationStore';
import Map from '@/components/shared/Map';
import type { LiveVehicle } from '@/hooks/useVehicleTracking';
import { fetchDrivingRoute, type DrivingRoute } from '@/lib/directions';
import { ACTION_LABELS, getNextStatus } from '@/utils/taskStatus';
import type { TaskStatus } from '@/types/api';

/** Straight-line distance (km) - shown while a real route is still loading, or
 * as a fallback when no Google Maps key is configured and routing is unavailable. */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * (Math.PI / 180);
  const dLng = (b.lng - a.lng) * (Math.PI / 180);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * In-app map/navigation screen - the web equivalent of the mobile app's
 * navigate.tsx. Replaces "open in Google Maps" links for drivers so the
 * scene, live position and route stay inside the console instead of handing
 * the driver off to an external tab.
 */
function NavigatePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();

  const { data: task } = useQuery({ queryKey: ['operator', 'active-task'], queryFn: getActiveTask });

  const destination = useMemo(() => {
    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, label: params.get('label') || 'Incident scene' };
    }
    if (task?.incident.lat != null && task?.incident.lng != null) {
      return { lat: task.incident.lat, lng: task.incident.lng, label: task.incident.locationName || 'Incident scene' };
    }
    return null;
  }, [params, task]);

  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [route, setRoute] = useState<DrivingRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(true);
  const watchIdRef = useRef<number | null>(null);

  // Live position, same as the "capture location" flow used for shift check-in.
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocError('Location is not available in this browser.');
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLocError(null);
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => setLocError(err.message || 'Could not get your location.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  useEffect(() => {
    if (!origin || !destination) return;
    let cancelled = false;
    setRouteLoading(true);
    fetchDrivingRoute(origin, destination)
      .then((r) => { if (!cancelled) setRoute(r); })
      .catch(() => { if (!cancelled) setRoute(null); })
      .finally(() => { if (!cancelled) setRouteLoading(false); });
    return () => { cancelled = true; };
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng]);

  const statusMutation = useMutation({
    mutationFn: (status: TaskStatus) => updateTaskStatus(task!.id, status),
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ['operator', 'active-task'] });
      addNotification({ type: 'success', title: 'Status updated', message: ACTION_LABELS[task!.status] ?? '' });
      if (status === 'COMPLETED') {
        navigate(`/operator/tasks/${task!.id}/patient-care-report?caseNumber=${encodeURIComponent(task!.incident.caseNumber)}`);
      } else if (status === 'AT_HOSPITAL') {
        navigate('/operator/activity');
      }
    },
    onError: (err) => addNotification({ type: 'error', title: 'Update failed', message: getErrorMessage(err) }),
  });

  const nextStatus = task ? getNextStatus(task.status) : null;
  const actionLabel = task ? ACTION_LABELS[task.status] : null;

  const you: LiveVehicle[] = origin
    ? [{
      vehicleId: 'you', imei: '', registration: 'You', lat: origin.lat, lng: origin.lng,
      speed: 0, heading: 0, ignition: true, timestamp: new Date().toISOString(),
      dbStatus: 'READY', isActive: true, hasDriver: true,
    }]
    : [];

  const center: [number, number] = origin
    ? [origin.lat, origin.lng]
    : destination
      ? [destination.lat, destination.lng]
      : [-1.2921, 36.8219];

  const straightLineKm = origin && destination ? haversineKm(origin, destination) : null;

  const statusLine = route
    ? `${route.durationText} · ${route.distanceText}`
    : routeLoading && origin
      ? 'Calculating route…'
      : straightLineKm != null
        ? `${straightLineKm < 1 ? `${Math.round(straightLineKm * 1000)} m` : `${straightLineKm.toFixed(1)} km`} away · straight line`
        : locError || 'Locating you…';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--nav-bg)', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
        <button
          className="icon-btn"
          style={{ borderColor: 'rgba(255,255,255,.15)', background: 'transparent', color: 'rgba(255,255,255,.8)', flexShrink: 0 }}
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {task?.incident.caseNumber || destination?.label || 'Navigation'}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>{statusLine}</div>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        {destination ? (
          <Map
            center={center}
            zoom={14}
            markers={[{ id: 'dest', lat: destination.lat, lng: destination.lng, title: destination.label, type: 'incident' }]}
            vehicleMarkers={you}
            routePath={route?.path}
            focusPosition={origin ? [origin.lat, origin.lng] : undefined}
          />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.6)' }}>
            No destination provided
          </div>
        )}
      </div>

      {task && nextStatus && actionLabel && (
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
          <button
            onClick={() => statusMutation.mutate(nextStatus)}
            disabled={statusMutation.isPending}
            className="btn btn-primary btn-lg btn-block"
          >
            {statusMutation.isPending ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export default NavigatePage;
