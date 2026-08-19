import type { CrewTask, TaskHistoryItem, TaskStatus } from '@/types/api';
import { STATUS_LABELS, STATUS_ORDER } from '@/utils/taskStatus';

export type ActivityState = 'done' | 'active' | 'upcoming' | 'skipped';

export interface TaskActivity {
  key: string;
  status: TaskStatus;
  label: string;
  timestamp: string | null;
  state: ActivityState;
}

type TimestampSource = {
  status: TaskStatus;
  receivedAt: string;
  acceptedAt?: string | null;
  sceneArrivalAt?: string | null;
  patientPickAt?: string | null;
  facilityArrivalAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  handedOverAt?: string | null;
};

const STAGE_DEFS: Array<{
  status: TaskStatus;
  label: string;
  getTime: (t: TimestampSource) => string | null | undefined;
}> = [
  { status: 'PENDING', label: 'Case assigned', getTime: (t) => t.receivedAt },
  { status: 'ACCEPTED', label: STATUS_LABELS.ACCEPTED, getTime: (t) => t.acceptedAt },
  { status: 'EN_ROUTE', label: STATUS_LABELS.EN_ROUTE, getTime: (t) => t.acceptedAt },
  { status: 'AT_SCENE', label: 'Arrived at scene', getTime: (t) => t.sceneArrivalAt },
  { status: 'PATIENT_PICKED', label: STATUS_LABELS.PATIENT_PICKED, getTime: (t) => t.patientPickAt },
  { status: 'AT_HOSPITAL', label: 'Arrived at the hospital', getTime: (t) => t.facilityArrivalAt },
  { status: 'COMPLETED', label: STATUS_LABELS.COMPLETED, getTime: (t) => t.completedAt },
];

export function formatActivityTime(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

export function formatActivityTimeFull(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return null;
  }
}

function currentIndex(status: TaskStatus): number {
  if (status === 'CANCELLED' || status === 'HANDED_OVER') return -1;
  return STATUS_ORDER.indexOf(status);
}

/**
 * Builds staged activities for an active or historical task.
 * EN_ROUTE reuses acceptedAt (no dedicated en-route column).
 */
export function buildTaskActivities(source: CrewTask | TaskHistoryItem, opts?: { live?: boolean }): TaskActivity[] {
  const live = opts?.live ?? false;
  const curIdx = currentIndex(source.status);
  const cancelled = source.status === 'CANCELLED';
  const handedOver = source.status === 'HANDED_OVER';

  const stages: TaskActivity[] = STAGE_DEFS.map((def) => {
    const idx = STATUS_ORDER.indexOf(def.status);
    const raw = def.getTime(source) ?? null;
    // Avoid double-counting acceptedAt for both ACCEPTED and EN_ROUTE when not yet en route
    const timestamp = def.status === 'EN_ROUTE' && curIdx < STATUS_ORDER.indexOf('EN_ROUTE') ? null : raw;

    let state: ActivityState;
    if (cancelled || handedOver) {
      state = timestamp ? 'done' : 'skipped';
    } else if (curIdx > idx || (curIdx === idx && def.status !== 'PENDING' && timestamp)) {
      state = curIdx === idx ? 'active' : 'done';
    } else if (curIdx === idx) {
      state = 'active';
    } else if (live) {
      state = 'upcoming';
    } else {
      state = timestamp ? 'done' : 'skipped';
    }

    // History: only keep reached stages (with time) plus cancelled marker handled below
    if (!live && !timestamp && def.status !== 'PENDING') {
      state = 'skipped';
    }

    return {
      key: def.status,
      status: def.status,
      label: def.label,
      timestamp,
      state,
    };
  });

  if (cancelled) {
    stages.push({
      key: 'CANCELLED',
      status: 'CANCELLED',
      label: STATUS_LABELS.CANCELLED,
      timestamp: source.cancelledAt ?? null,
      state: 'done',
    });
  }

  if (handedOver) {
    stages.push({
      key: 'HANDED_OVER',
      status: 'HANDED_OVER',
      label: STATUS_LABELS.HANDED_OVER,
      timestamp: source.handedOverAt ?? null,
      state: 'done',
    });
  }

  if (live) {
    return stages.filter((s) => (s.status !== 'CANCELLED' && s.status !== 'HANDED_OVER') || cancelled || handedOver);
  }

  // History: show assigned + any timed stages (+ cancel / transfer)
  return stages.filter(
    (s) =>
      s.status === 'PENDING' ||
      s.status === 'CANCELLED' ||
      s.status === 'HANDED_OVER' ||
      Boolean(s.timestamp) ||
      s.state === 'done' ||
      s.state === 'active'
  );
}
