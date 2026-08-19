import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/api/client';
import { socket } from '@/lib/socket';
import { Role } from '@/types/api';

export interface PresenceUser {
  userId: string;
  name: string;
  role: Role;
  agencyId: string | null;
  agencyName: string | null;
  /** ISO timestamp - when this user's session started (shown as "on duty since"). */
  connectedAt: string;
  sockets: number;
}

/**
 * Live "who is online right now" feed for the call-centre wallboard.
 * Backed by GET /presence/online (initial load + 30s fallback poll) and the
 * `presence:update` socket event (instant push on every connect/disconnect).
 */
export function usePresence() {
  const [live, setLive] = useState<PresenceUser[] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['presence', 'online'],
    queryFn: async () => {
      const res = await api.get('/presence/online');
      return res.data.data as PresenceUser[];
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    socket.connect();
    const onUpdate = (snapshot: PresenceUser[]) => setLive(snapshot);
    socket.on('presence:update', onUpdate);
    return () => { socket.off('presence:update', onUpdate); };
  }, []);

  const all = live ?? data ?? [];

  return {
    all,
    isLoading: isLoading && !live,
    byRole: (role: Role) => all.filter((u) => u.role === role),
  };
}
