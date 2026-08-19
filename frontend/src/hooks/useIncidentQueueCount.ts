import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/api/client';
import { socket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';

// Matches who can see /dispatch/queue on the backend (dispatch.routes.ts) and
// the "Incident Feed" sidebar link - other roles never hit this endpoint.
const QUEUE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'];

/**
 * Live count of SUBMITTED incidents waiting to be claimed - drives the
 * red/green "Incident Feed" sidebar badge. Polls lightly and refreshes
 * instantly on the incident:new / incident:update socket events.
 */
export function useIncidentQueueCount(): number {
  const role = useAuthStore((s) => s.user?.role);
  const enabled = !!role && QUEUE_ROLES.includes(role);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['dispatch', 'queue-count'],
    queryFn: async () => {
      const res = await api.get('/dispatch/queue');
      return (res.data.data as unknown[]).length;
    },
    enabled,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!enabled) return;
    socket.connect();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['dispatch', 'queue-count'] });
    socket.on('incident:new', refresh);
    socket.on('incident:update', refresh);
    return () => {
      socket.off('incident:new', refresh);
      socket.off('incident:update', refresh);
    };
  }, [enabled, queryClient]);

  return enabled ? (data ?? 0) : 0;
}
