import { useState, useEffect } from 'react';
import { socket } from '@/lib/socket';
import { ActiveCall } from '@/types/api';

export function useActiveCalls() {
  const [activeCalls, setActiveCalls] = useState<Map<string, ActiveCall>>(new Map());

  useEffect(() => {
    function onNew(call: ActiveCall) {
      setActiveCalls(prev => new Map(prev).set(call.callId, call));
    }

    function onAnswered(call: ActiveCall) {
      setActiveCalls(prev => {
        const next = new Map(prev);
        const existing = next.get(call.callId);
        if (existing) next.set(call.callId, { ...existing, status: 'ANSWERED' });
        return next;
      });
    }

    function onEnded(payload: { callId?: string }) {
      if (!payload.callId) return;
      setActiveCalls(prev => {
        const next = new Map(prev);
        next.delete(payload.callId!);
        return next;
      });
    }

    socket.on('pbx:call:new', onNew);
    socket.on('pbx:call:answered', onAnswered);
    socket.on('pbx:call:ended', onEnded);

    return () => {
      socket.off('pbx:call:new', onNew);
      socket.off('pbx:call:answered', onAnswered);
      socket.off('pbx:call:ended', onEnded);
    };
  }, []);

  return Array.from(activeCalls.values());
}
