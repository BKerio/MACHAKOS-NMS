import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, TriangleAlert, ClipboardList } from 'lucide-react';
import { getMyCheckIn } from '@/api/responder';
import { getVehicleChecklist, submitChecklistItem } from '@/api/checklist';
import { useNotificationStore } from '@/stores/notificationStore';
import type { VehicleChecklistItem } from '@/types/api';

function categoryLabel(value: string) {
  return value
    .split('_')
    .map((w) => (w ? w[0] + w.slice(1).toLowerCase() : w))
    .join(' ');
}

function ChecklistRow({
  item,
  onConfirm,
  busy,
}: {
  item: VehicleChecklistItem;
  onConfirm: (status: 'OK' | 'ISSUE', note?: string) => void;
  busy: boolean;
}) {
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState(item.note ?? '');

  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{item.name}</p>
          {item.status && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              {item.status === 'OK' ? 'Confirmed' : 'Issue flagged'}
              {item.checkedByName ? ` · ${item.checkedByName}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm('OK')}
            className="btn btn-sm flex items-center gap-1.5"
            style={
              item.status === 'OK'
                ? { background: 'var(--green)', color: '#fff' }
                : { background: 'var(--surface-2)', color: 'var(--ink-2)', border: '1px solid var(--border)' }
            }
          >
            <CheckCircle2 size={14} /> OK
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setNoting((v) => !v)}
            className="btn btn-sm flex items-center gap-1.5"
            style={
              item.status === 'ISSUE'
                ? { background: 'var(--red)', color: '#fff' }
                : { background: 'var(--surface-2)', color: 'var(--ink-2)', border: '1px solid var(--border)' }
            }
          >
            <TriangleAlert size={14} /> Issue
          </button>
        </div>
      </div>
      {noting && (
        <div className="flex gap-2 mt-3">
          <input
            className="input flex-1"
            placeholder="What's wrong? (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onConfirm('ISSUE', note.trim() || undefined);
              setNoting(false);
            }}
            className="btn btn-sm"
            style={{ background: 'var(--red)', color: '#fff' }}
          >
            Flag
          </button>
        </div>
      )}
    </div>
  );
}

function ChecklistPage() {
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const { data: myVehicle } = useQuery({ queryKey: ['operator', 'my-checkin'], queryFn: getMyCheckIn });

  const { data: checklist, isLoading } = useQuery({
    queryKey: ['operator', 'checklist', myVehicle?.id],
    queryFn: () => getVehicleChecklist(myVehicle!.id),
    enabled: !!myVehicle,
  });

  const submitMutation = useMutation({
    mutationFn: (payload: { itemId: string; status: 'OK' | 'ISSUE'; note?: string }) =>
      submitChecklistItem(myVehicle!.id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['operator', 'checklist', myVehicle?.id] }),
    onError: (err: any) =>
      addNotification({ type: 'error', title: 'Could not save', message: err?.response?.data?.message || 'Try again.' }),
  });

  if (!myVehicle) {
    return (
      <div className="col" style={{ gap: 20 }}>
        <div>
          <p className="eyebrow">Field Operations</p>
          <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Vehicle Checklist</h2>
        </div>
        <div className="card card-pad text-center" style={{ padding: 48 }}>
          <ClipboardList size={48} style={{ color: 'var(--muted-2)' }} className="mx-auto mb-4" />
          <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Not checked in</p>
          <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
            Check in to a vehicle on the Crew tab to confirm its equipment checklist.
          </p>
        </div>
      </div>
    );
  }

  const vehicleItems = (checklist?.items ?? []).filter((i) => i.itemType === 'VEHICLE');
  const medicalItems = (checklist?.items ?? []).filter((i) => i.itemType === 'MEDICAL');
  const medicalByCategory = medicalItems.reduce<Record<string, VehicleChecklistItem[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  const summary = checklist?.summary;

  return (
    <div className="col" style={{ gap: 20 }}>
      <div>
        <p className="eyebrow">Field Operations</p>
        <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Vehicle Checklist</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Confirm {myVehicle.registrationNumber}'s equipment is present before dispatch can assign it a case.
        </p>
      </div>

      {summary && (
        <div className="card card-pad flex items-center gap-3">
          {summary.complete ? (
            <CheckCircle2 size={22} style={{ color: 'var(--green)' }} />
          ) : (
            <TriangleAlert size={22} style={{ color: 'var(--amber)' }} />
          )}
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
              {summary.confirmed}/{summary.totalRequired} confirmed
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              {summary.complete ? 'Ready for dispatch' : 'Dispatch is blocked until every item is confirmed'}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="skel" style={{ height: 200 }} />
      ) : (
        <>
          {vehicleItems.length > 0 && (
            <div className="col" style={{ gap: 10 }}>
              <p className="label">Vehicle</p>
              {vehicleItems.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  busy={submitMutation.isPending}
                  onConfirm={(status, note) => submitMutation.mutate({ itemId: item.id, status, note })}
                />
              ))}
            </div>
          )}

          {Object.entries(medicalByCategory).map(([category, items]) => (
            <div key={category} className="col" style={{ gap: 10 }}>
              <p className="label">{categoryLabel(category)}</p>
              {items.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  busy={submitMutation.isPending}
                  onConfirm={(status, note) => submitMutation.mutate({ itemId: item.id, status, note })}
                />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default ChecklistPage;
