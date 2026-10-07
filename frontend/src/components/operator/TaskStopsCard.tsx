import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CirclePlus, MapPinned, Route, X as XIcon } from 'lucide-react';
import AppLoader from '@/components/shared/AppLoader';
import { addTaskStop, getErrorMessage, getTaskStops, markTaskStopArrived } from '@/api/responder';
import { useNotificationStore } from '@/stores/notificationStore';
import { socket } from '@/lib/socket';
import type { TaskStop } from '@/types/api';

/**
 * Stops & re-routes on the live case, as in the crew app (task_stops_widget):
 * extra destinations added mid-case (e.g. a re-route to another facility),
 * each marked "arrived" when reached. Live via task:stop-added / -updated.
 */
function TaskStopsCard({ taskId, isActive }: { taskId: string; isActive: boolean }) {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const [adding, setAdding] = useState(false);
  const key = ['operator', 'task-stops', taskId];

  const { data: stops = [], isLoading } = useQuery({ queryKey: key, queryFn: () => getTaskStops(taskId) });

  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: key });
    socket.on('task:stop-added', refresh);
    socket.on('task:stop-updated', refresh);
    socket.on('task:updated', refresh);
    return () => {
      socket.off('task:stop-added', refresh);
      socket.off('task:stop-updated', refresh);
      socket.off('task:updated', refresh);
    };
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const arrive = useMutation({
    mutationFn: (stop: TaskStop) => markTaskStopArrived(taskId, stop.id),
    onSuccess: (_d, stop) => {
      queryClient.invalidateQueries({ queryKey: key });
      addNotification({ type: 'success', title: 'Stop reached', message: `Arrived at ${stop.name}` });
    },
    onError: (err) => addNotification({ type: 'error', title: 'Could not update stop', message: getErrorMessage(err) }),
  });

  return (
    <div className="card card-pad">
      <div className="flex items-center gap-2 mb-3">
        <Route size={17} style={{ color: 'var(--green)' }} />
        <p className="label flex-1" style={{ margin: 0 }}>Stops &amp; re-routes</p>
        {isActive && (
          <button onClick={() => setAdding(true)} className="btn btn-soft btn-sm">
            <CirclePlus size={15} /> Add stop
          </button>
        )}
      </div>

      {isLoading ? (
        <AppLoader size={22} color="var(--green)" />
      ) : stops.length === 0 ? (
        <p className="text-sm italic" style={{ color: 'var(--muted)' }}>No extra stops recorded for this case.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {stops.map((stop) => {
            const arrived = !!stop.arrivedAt;
            return (
              <div
                key={stop.id}
                className="flex items-center gap-3 rounded-xl border p-3"
                style={{
                  background: arrived ? 'color-mix(in srgb, var(--green) 6%, transparent)' : 'var(--surface-2)',
                  borderColor: arrived ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'var(--border)',
                }}
              >
                <span
                  className="grid place-items-center rounded-full flex-shrink-0"
                  style={{ width: 30, height: 30, background: arrived ? 'var(--green-light)' : 'var(--surface)' }}
                >
                  {arrived ? <Check size={15} style={{ color: 'var(--green)' }} /> : <MapPinned size={15} style={{ color: 'var(--green)' }} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-semibold"
                    style={{ color: arrived ? 'var(--muted)' : 'var(--ink)', textDecoration: arrived ? 'line-through' : undefined }}
                  >
                    {stop.name}
                  </p>
                  {stop.note && <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{stop.note}</p>}
                </div>
                {arrived ? (
                  <span className="pill pill-green" style={{ fontSize: 10.5 }}>Arrived</span>
                ) : isActive && (
                  <button
                    onClick={() => arrive.mutate(stop)}
                    disabled={arrive.isPending}
                    className="btn btn-sm"
                    style={{ border: '1.5px solid var(--green)', color: 'var(--green)', background: 'transparent' }}
                  >
                    {arrive.isPending && arrive.variables?.id === stop.id ? <AppLoader size={14} /> : 'Mark arrived'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <AddStopDialog
          taskId={taskId}
          onClose={() => setAdding(false)}
          onAdded={(name) => {
            setAdding(false);
            queryClient.invalidateQueries({ queryKey: key });
            addNotification({ type: 'success', title: 'Stop added', message: `Added stop: ${name}` });
          }}
        />
      )}
    </div>
  );
}

function AddStopDialog({ taskId, onClose, onAdded }: { taskId: string; onClose: () => void; onAdded: (name: string) => void }) {
  const { addNotification } = useNotificationStore();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const add = useMutation({
    mutationFn: () => addTaskStop(taskId, { name, note }),
    onSuccess: () => onAdded(name.trim()),
    onError: (err) => addNotification({ type: 'error', title: 'Could not add stop', message: getErrorMessage(err) }),
  });
  const close = () => { if (!add.isPending) onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
      <form
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}
        className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5"
        style={{ background: 'var(--surface)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Add intermediate stop</p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              A re-route facility or extra destination during transit.
            </p>
          </div>
          <button type="button" onClick={close} className="icon-btn" style={{ border: 0 }} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>

        <label className="field mt-4">
          <span className="label">Destination / stop name *</span>
          <input
            autoFocus
            className="input"
            placeholder="e.g. Machakos Level 5 Hospital"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={add.isPending}
          />
        </label>
        <label className="field mt-3">
          <span className="label">Reason / note (optional)</span>
          <textarea
            className="eoc-textarea"
            style={{ minHeight: 70 }}
            placeholder="e.g. Patient needs a CT scan not available at the first facility"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={add.isPending}
          />
        </label>

        <button type="submit" disabled={!name.trim() || add.isPending} className="btn btn-primary btn-block mt-5" style={{ height: 46 }}>
          {add.isPending ? <AppLoader size={18} /> : 'Add stop'}
        </button>
      </form>
    </div>
  );
}

export default TaskStopsCard;
