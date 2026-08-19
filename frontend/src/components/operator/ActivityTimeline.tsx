import { Check } from 'lucide-react';
import { formatActivityTimeFull, type TaskActivity } from '@/utils/taskActivities';

function ActivityTimeline({
  activities,
  emptyMessage = 'No stage activity recorded yet.',
}: {
  activities: TaskActivity[];
  emptyMessage?: string;
}) {
  if (activities.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--muted)' }}>{emptyMessage}</p>;
  }

  return (
    <div>
      {activities.map((item, index) => {
        const isLast = index === activities.length - 1;
        const done = item.state === 'done';
        const active = item.state === 'active';
        const upcoming = item.state === 'upcoming';
        const skipped = item.state === 'skipped';

        const dotStyle = active
          ? { background: 'var(--green)' }
          : done
            ? { background: 'var(--green)' }
            : { background: 'var(--border)' };
        const lineStyle = done || active ? { background: 'var(--green)' } : { background: 'var(--border)' };

        const labelColor =
          item.status === 'CANCELLED' ? 'var(--red)' : item.status === 'HANDED_OVER' ? 'var(--gold)' : undefined;

        return (
          <div key={item.key} className="flex items-start" style={{ minHeight: 52 }}>
            <div className="flex flex-col items-center flex-shrink-0" style={{ width: 24, marginRight: 12 }}>
              <div
                className="flex items-center justify-center rounded-full"
                style={{ width: 22, height: 22, ...dotStyle }}
              >
                {done ? (
                  <Check size={12} color="#fff" />
                ) : active ? (
                  <span className="rounded-full live-dot" style={{ width: 8, height: 8, background: '#fff' }} />
                ) : null}
              </div>
              {!isLast && <div style={{ width: 2, flex: 1, minHeight: 24, marginTop: 2, ...lineStyle }} />}
            </div>
            <div className="flex-1" style={{ paddingBottom: 14, paddingTop: 1 }}>
              <p
                className={`text-sm ${active || done ? 'font-bold' : 'font-medium'}`}
                style={{ color: labelColor ?? (upcoming || skipped ? 'var(--muted)' : 'var(--ink)') }}
              >
                {item.label}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {item.timestamp
                  ? formatActivityTimeFull(item.timestamp)
                  : active
                    ? 'In progress'
                    : upcoming
                      ? 'Upcoming'
                      : skipped
                        ? '—'
                        : 'Pending'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ActivityTimeline;
