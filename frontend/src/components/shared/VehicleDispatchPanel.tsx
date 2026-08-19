import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Send as PaperPlaneRight,
  CircleAlert as WarningCircle,
  CircleCheck as CheckCircle,
  User,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '@/api/client';
import { Vehicle, Incident } from '@/types/api';
import { LiveVehicle, getVehicleTrackingStatus } from '@/hooks/useVehicleTracking';
import { useNotificationStore } from '@/stores/notificationStore';

// ── Haversine (km) ────────────────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function formatDist(km: number | null): string {
  if (km == null) return 'N/A';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

type ScoredIncident = Incident & { score: number; distKm: number | null };

function scoreIncidents(incidents: Incident[], vLat: number, vLng: number): ScoredIncident[] {
  return incidents
    .map((inc): ScoredIncident => {
      let score = 0;
      let distKm: number | null = null;

      if (inc.lat != null && inc.lng != null) {
        distKm = haversine(vLat, vLng, inc.lat, inc.lng);
        // Proximity: 50 pts max → 0 at 25 km+
        score += Math.max(0, 50 - distKm * 2);
      }

      // Urgency: older incident = higher score, 30 pts max at 60+ min wait
      const waitMins = (Date.now() - new Date(inc.createdAt).getTime()) / 60_000;
      score += Math.min(30, waitMins / 2);

      return { ...inc, score, distKm };
    })
    .sort((a, b) => b.score - a.score);
}

// ── Status palette matching Map.tsx ───────────────────────────────────────────
const STATUS_STYLE = {
  ready:       'bg-brand-green/20 text-brand-green',
  'no-driver': 'bg-amber-500/20 text-amber-400',
  engaged:     'bg-status-danger/20 text-status-danger',
  unavailable: 'bg-slate-500/20 text-slate-400',
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  clickedVehicle: LiveVehicle;
  onClose: () => void;
}

function VehicleDispatchPanel({ clickedVehicle, onClose }: Props) {
  const [selectedIncidentId, setSelectedIncidentId] = useState('');
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();

  const { data: vehicles = [], isLoading: loadingVehicles } = useQuery({
    queryKey: ['dispatch', 'vehicles'],
    queryFn: async () => (await api.get('/dispatch/vehicles')).data.data as Vehicle[],
  });

  const { data: incidents = [], isLoading: loadingIncidents } = useQuery({
    queryKey: ['dispatch', 'queue'],
    queryFn: async () => (await api.get('/dispatch/queue')).data.data as Incident[],
  });

  const dbVehicle = vehicles.find(v => v.id === clickedVehicle.vehicleId);
  // Badge must reflect the DB source of truth (same data the dispatch button uses),
  // not the possibly-stale live tracking map - otherwise it can wrongly read "engaged".
  const effectiveVehicle: LiveVehicle = dbVehicle
    ? {
        ...clickedVehicle,
        dbStatus: (dbVehicle.status as LiveVehicle['dbStatus']),
        isActive: dbVehicle.isActive,
        hasDriver: !!dbVehicle.currentDriver,
      }
    : clickedVehicle;
  const trackingStatus = getVehicleTrackingStatus(effectiveVehicle);
  const hasDriver = !!dbVehicle?.currentDriver;
  const isVehicleBusy = dbVehicle?.status === 'BUSY';
  const isLoading = loadingVehicles || loadingIncidents;

  const scoredIncidents = scoreIncidents(incidents, clickedVehicle.lat, clickedVehicle.lng);

  const dispatch = useMutation({
    mutationFn: () =>
      api.post('/tasks', {
        incidentId: selectedIncidentId,
        vehicleId: dbVehicle!.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      addNotification({
        type: 'success',
        title: 'Dispatched',
        message: `${clickedVehicle.registration} assigned successfully.`,
      });
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      addNotification({
        type: 'error',
        title: 'Dispatch failed',
        message: err?.response?.data?.message ?? 'Could not dispatch vehicle.',
      });
    },
  });

  const canDispatch =
    hasDriver &&
    !isVehicleBusy &&
    !!selectedIncidentId &&
    !!dbVehicle &&
    !dispatch.isPending;

  return (
    <div className="fixed right-0 top-0 h-screen w-[400px] bg-white border-l border-surface-border shadow-2xl z-[200] flex flex-col">

      {/* ── Header ── */}
      <div className="px-6 py-5 border-b border-surface-border flex items-center justify-between bg-brand-sidebar flex-shrink-0">
        <div>
          <p className="text-xs font-black tracking-widest text-slate-400 mb-1">
            Vehicle Assignment
          </p>
          <h3 className="font-bold text-white text-lg leading-none">
            {clickedVehicle.registration}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-[10px] font-black tracking-wider px-2 py-1 rounded-full ${STATUS_STYLE[trackingStatus]}`}>
              {trackingStatus}
            </span>
            {clickedVehicle.speed > 2 && (
              <span className="text-xs text-slate-400">
                {Math.round(clickedVehicle.speed)} km/h
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── Crew Section ── */}
        <div className="p-5 border-b border-surface-border">
          <p className="text-xs font-black tracking-widest text-slate-400 mb-3">
            Current Crew
          </p>

          {isLoading ? (
            <div className="h-11 rounded-lg bg-slate-100 animate-pulse" />
          ) : (
            <div className="flex flex-col gap-2">
              {[
                { role: 'Driver', person: dbVehicle?.currentDriver, required: true },
                { role: 'EMT', person: dbVehicle?.currentEmt, required: false },
                { role: 'Nurse', person: dbVehicle?.currentNurse, required: false },
              ].map(({ role, person, required }) => (
                <div
                  key={role}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${
                    person
                      ? 'bg-brand-green/5 border border-brand-green/20'
                      : required
                        ? 'bg-status-danger/5 border border-status-danger/20'
                        : 'bg-slate-50 border border-surface-border'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        person
                          ? 'bg-brand-green/20'
                          : required
                            ? 'bg-status-danger/20'
                            : 'bg-slate-200'
                      }`}
                    >
                      <User
                        size={12}
                        className={
                          person
                            ? 'text-brand-green'
                            : required
                              ? 'text-status-danger'
                              : 'text-slate-400'
                        }
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-500">{role}</span>
                  </div>
                  <span
                    className={`text-xs font-bold ${
                      person
                        ? 'text-brand-teal'
                        : required
                          ? 'text-status-danger'
                          : 'text-slate-400'
                    }`}
                  >
                    {person?.name ?? (required ? 'Not checked in' : 'Unassigned')}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {!isLoading && (isVehicleBusy || !hasDriver) && (
            <div
              className={`mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs font-medium ${
                isVehicleBusy
                  ? 'bg-blue-50 border border-blue-200 text-blue-700'
                  : 'bg-status-warning/10 border border-status-warning/30 text-status-warning'
              }`}
            >
              <WarningCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                {isVehicleBusy
                  ? 'This vehicle is currently on an active task. Cancel the current task before reassigning.'
                  : 'A driver must check in via the mobile app before this vehicle can be dispatched.'}
              </span>
            </div>
          )}
        </div>

        {/* ── Incident Selection ── */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black tracking-widest text-slate-400">
              Assign to Incident
            </p>
            <span className="text-xs text-slate-400">
              {scoredIncidents.length} open
            </span>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : scoredIncidents.length === 0 ? (
            <div className="text-center py-10 text-slate-300">
              <CheckCircle size={36} className="mx-auto mb-2" />
              <p className="text-sm font-medium">No incidents in queue</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {scoredIncidents.map((inc, i) => {
                const isSelected = selectedIncidentId === inc.id;
                const isBest = i === 0;
                const waitMins = Math.round(
                  (Date.now() - new Date(inc.createdAt).getTime()) / 60_000
                );
                return (
                  <button
                    key={inc.id}
                    onClick={() =>
                      setSelectedIncidentId(isSelected ? '' : inc.id)
                    }
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-brand-teal/5 border-brand-teal ring-1 ring-brand-teal'
                        : 'bg-slate-50 border-surface-border hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-brand-teal flex-shrink-0">
                          {inc.caseNumber}
                        </span>
                        {isBest && (
                          <span className="text-[9px] font-black tracking-wider bg-brand-green text-white px-1.5 py-0.5 rounded-full flex-shrink-0">
                            Best match
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-slate-500 flex-shrink-0">
                        {formatDist(inc.distKm)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium line-clamp-1">
                      {inc.chiefComplaint}
                    </p>
                    <div className="flex items-center mt-1.5">
                      <span className="text-[10px] text-slate-400 flex-1 truncate">
                        {inc.locationName}
                      </span>
                      <span
                        className={`text-[10px] font-bold ml-3 flex-shrink-0 ${
                          waitMins > 10 ? 'text-status-danger' : 'text-slate-400'
                        }`}
                      >
                        {waitMins < 60
                          ? `${waitMins}m wait`
                          : formatDistanceToNow(new Date(inc.createdAt), { addSuffix: false }) + ' wait'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer / Dispatch Button ── */}
      <div className="p-5 border-t border-surface-border bg-slate-50 flex-shrink-0">
        {!canDispatch && selectedIncidentId && !dispatch.isPending && (
          <p className="text-xs text-center text-status-warning font-medium mb-3">
            {!hasDriver
              ? 'Driver must check in via mobile before dispatching'
              : 'Vehicle is currently on an active task'}
          </p>
        )}
        <button
          onClick={() => dispatch.mutate()}
          disabled={!canDispatch}
          className="w-full bg-brand-green text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          <PaperPlaneRight size={18} />
          {dispatch.isPending ? 'Dispatching…' : 'Dispatch Vehicle'}
        </button>
      </div>
    </div>
  );
}

export default VehicleDispatchPanel;
