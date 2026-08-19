import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/api/client';
import { socket } from '@/lib/socket';
import { Vehicle } from '@/types/api';

export interface LiveVehicle {
  vehicleId: string;
  imei: string;
  registration: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  ignition: boolean;
  timestamp: string;
  dbStatus: 'READY' | 'BUSY' | 'MAINTENANCE';
  isActive: boolean;
  hasDriver: boolean; // true when a driver is checked-in (from DB)
}

export type VehicleTrackingStatus = 'ready' | 'no-driver' | 'engaged' | 'unavailable';

export function getVehicleTrackingStatus(v: LiveVehicle): VehicleTrackingStatus {
  if (!v.isActive || v.dbStatus === 'MAINTENANCE') return 'unavailable';
  if (v.dbStatus === 'BUSY') return 'engaged';
  if (v.hasDriver) return 'ready';
  return 'no-driver';
}

export function useVehicleTracking() {
  const queryClient = useQueryClient();
  const [livePositions, setLivePositions] = useState<Map<string, LiveVehicle>>(new Map());
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const { data: vehicles } = useQuery({
    queryKey: ['admin', 'vehicles', 'tracking'],
    queryFn: async () => {
      const res = await api.get('/dispatch/vehicles');
      return (res.data.data ?? res.data) as Vehicle[];
    },
    staleTime: 30_000,
    // Fallback: re-fetch DB positions every 35s in case the socket is down.
    // The socket is the primary path; this keeps the map alive on reconnect.
    refetchInterval: 35_000,
  });

  // Sync from DB - runs on mount and every 35s (fallback when socket is down).
  // Socket updates take priority: we only overwrite a position if the DB timestamp
  // is newer than what we already have.
  useEffect(() => {
    if (!vehicles) return;
    setLivePositions(prev => {
      const next = new Map(prev);
      for (const v of vehicles) {
        const existing = next.get(v.id);
        const hasCoords = v.lastLat != null && v.lastLng != null;
        // Can't place a brand-new marker without coordinates, but we can still
        // keep the operational status of an already-tracked vehicle in sync.
        if (!existing && !hasCoords) continue;

        const dbTs = new Date(v.lastLocationAt ?? 0).getTime();
        const existingTs = existing ? new Date(existing.timestamp).getTime() : 0;
        // Operational status is the DB's source of truth - driver check-ins and
        // BUSY/READY transitions are NOT reliably pushed via the GPS socket, so
        // ALWAYS sync them from the DB (never gate them on the GPS timestamp).
        const hasDriver = !!v.currentDriver;
        const dbStatus = (v.status as LiveVehicle['dbStatus']) ?? existing?.dbStatus ?? 'READY';

        if (!existing) {
          next.set(v.id, {
            vehicleId: v.id,
            imei: v.imei,
            registration: v.registrationNumber,
            lat: v.lastLat as number,
            lng: v.lastLng as number,
            speed: 0,
            heading: 0,
            ignition: false,
            timestamp: v.lastLocationAt ?? new Date().toISOString(),
            dbStatus,
            isActive: v.isActive,
            hasDriver,
          });
        } else {
          // Keep the fresher socket GPS position, but always refresh status.
          const positionIsNewer = hasCoords && dbTs > existingTs;
          next.set(v.id, {
            ...existing,
            ...(positionIsNewer
              ? { lat: v.lastLat as number, lng: v.lastLng as number, timestamp: v.lastLocationAt ?? existing.timestamp }
              : {}),
            dbStatus,
            isActive: v.isActive,
            hasDriver,
          });
        }
      }
      return next;
    });
    if (vehicles.some(v => v.lastLat)) {
      setLastUpdatedAt(prev => prev ?? new Date());
    }
  }, [vehicles]);

  // Real-time updates pushed from backend every 30s via Uffizio poll
  useEffect(() => {
    function onFleetPos(updates: LiveVehicle[]) {
      setLivePositions(prev => {
        const next = new Map(prev);
        for (const u of updates) {
          const existing = next.get(u.vehicleId);
          next.set(u.vehicleId, {
            vehicleId: u.vehicleId,
            imei: u.imei ?? existing?.imei ?? '',
            registration: u.registration ?? existing?.registration ?? '',
            lat: u.lat,
            lng: u.lng,
            speed: u.speed ?? 0,
            heading: u.heading ?? 0,
            ignition: u.ignition ?? false,
            timestamp: u.timestamp ?? new Date().toISOString(),
            dbStatus: u.dbStatus ?? existing?.dbStatus ?? 'READY',
            isActive: u.isActive ?? existing?.isActive ?? true,
            hasDriver: u.hasDriver ?? existing?.hasDriver ?? false,
          });
        }
        return next;
      });
      setLastUpdatedAt(new Date());
    }

    // Immediate vehicle status update when a task is dispatched or completed -
    // don't wait for the next 60s Uffizio poll to reflect BUSY/READY.
    function onTaskAssigned(task: { vehicleId: string }) {
      setLivePositions(prev => {
        const next = new Map(prev);
        for (const [key, v] of next) {
          if (v.vehicleId === task.vehicleId) {
            next.set(key, { ...v, dbStatus: 'BUSY' });
          }
        }
        return next;
      });
    }

    function onTaskUpdated(task: { vehicleId: string; status: string }) {
      if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
        setLivePositions(prev => {
          const next = new Map(prev);
          for (const [key, v] of next) {
            if (v.vehicleId === task.vehicleId) {
              next.set(key, { ...v, dbStatus: 'READY' });
            }
          }
          return next;
        });
      }
    }

    function onVehicleCrew(payload: {
      id?: string;
      vehicleId?: string;
      currentDriverId?: string | null;
      currentDriver?: { id: string } | null;
    }) {
      const vehicleId = payload.id ?? payload.vehicleId;
      if (!vehicleId) return;
      const hasDriver = !!(payload.currentDriver ?? payload.currentDriverId);
      setLivePositions(prev => {
        const next = new Map(prev);
        for (const [key, v] of next) {
          if (v.vehicleId === vehicleId) {
            next.set(key, { ...v, hasDriver });
          }
        }
        return next;
      });
      // Refresh DB crew (EMT/nurse names) on Fleet + Dispatch panels
      queryClient.invalidateQueries({ queryKey: ['admin', 'vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch', 'vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles', 'nearest'] });
    }

    socket.on('fleet:pos', onFleetPos);
    socket.on('task:assigned', onTaskAssigned);
    socket.on('task:updated', onTaskUpdated);
    socket.on('vehicle:crew', onVehicleCrew);
    return () => {
      socket.off('fleet:pos', onFleetPos);
      socket.off('task:assigned', onTaskAssigned);
      socket.off('task:updated', onTaskUpdated);
      socket.off('vehicle:crew', onVehicleCrew);
    };
  }, [queryClient]);

  return {
    vehicles: Array.from(livePositions.values()),
    lastUpdatedAt,
  };
}
