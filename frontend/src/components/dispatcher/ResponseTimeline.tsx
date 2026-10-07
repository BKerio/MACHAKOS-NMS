import { useEffect, useState } from 'react';
import { BadgeCheck, Clock, Timer, TriangleAlert, Zap } from 'lucide-react';

/*
 * Response timeline (TAT) for one case.
 *
 * Each step is a node: a filled "verified" badge when it happened, a pulsing
 * outline for the step the case is waiting on (with a live timer), a muted
 * "Skipped" for steps passed over, and a plain outline for what's still ahead.
 * A bar under the title shows where the time went, leg by leg.
 */

export interface TatStep {
  key: string;
  label: string;
  timestamp: string | null;
  durationFromPreviousMs: number | null;
}

type Speed = 'fast' | 'slow' | 'delayed';

// Thresholds for a single leg of the response.
const SLOW_MS = 5 * 60_000;
const DELAYED_MS = 10 * 60_000;
// Past this, a case is no longer "live" - e.g. a run finished but never formally closed.
const STALE_MS = 12 * 3600_000;

const speedOf = (ms: number): Speed => (ms > DELAYED_MS ? 'delayed' : ms > SLOW_MS ? 'slow' : 'fast');

const SPEED: Record<Speed, { color: string; label: string; Icon: typeof Zap }> = {
  fast: { color: 'var(--color-status-success)', label: 'Fast', Icon: Zap },
  slow: { color: 'var(--amber)', label: 'Slow (5-10 min)', Icon: Clock },
  delayed: { color: 'var(--red)', label: 'Delayed (10+ min)', Icon: TriangleAlert },
};

const NBO = 'Africa/Nairobi';

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone: NBO, hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: NBO, day: '2-digit', month: 'short', year: 'numeric' });

/** Ticks once a second while something is waiting, so the live timer moves. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

type NodeState = 'done' | 'current' | 'skipped' | 'pending';

function StepBadge({ state }: { state: NodeState }) {
  if (state === 'done') {
    // Filled scalloped badge with a white tick - the "verified" mark.
    return <BadgeCheck size={22} fill="var(--blue)" color="#fff" strokeWidth={2} className="shrink-0" aria-label="Done" />;
  }
  if (state === 'current') {
    return (
      <span className="relative grid place-items-center w-[22px] h-[22px] shrink-0" aria-label="In progress">
        <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'color-mix(in srgb, var(--blue) 25%, transparent)' }} />
        <BadgeCheck size={22} color="var(--blue)" strokeWidth={1.8} className="relative" />
      </span>
    );
  }
  return (
    <BadgeCheck
      size={22}
      color={state === 'skipped' ? 'var(--muted-2)' : 'var(--border-strong)'}
      strokeWidth={1.6}
      className="shrink-0"
      aria-label={state === 'skipped' ? 'Skipped' : 'Not reached yet'}
      style={state === 'skipped' ? { opacity: 0.7 } : undefined}
    />
  );
}

export default function ResponseTimeline({ steps, totalMs }: { steps: TatStep[] | null; totalMs: number | null }) {
  const lastDoneIdx = steps ? steps.map((s) => !!s.timestamp).lastIndexOf(true) : -1;
  // The case waits on the first step after the last one that happened - unless it's all done.
  const currentIdx = steps && lastDoneIdx < steps.length - 1 ? lastDoneIdx + 1 : -1;
  const now = useNow(currentIdx >= 0 && lastDoneIdx >= 0);
  const waitingMs = currentIdx >= 0 && lastDoneIdx >= 0 ? now - new Date(steps![lastDoneIdx].timestamp!).getTime() : null;
  const stale = waitingMs != null && waitingMs > STALE_MS;

  const states: NodeState[] = (steps ?? []).map((s, i) =>
    s.timestamp ? 'done' : i < lastDoneIdx ? 'skipped' : i === currentIdx && !stale ? 'current' : 'pending',
  );

  // Legs for the "where the time went" bar: every step that has a duration.
  const legs = (steps ?? [])
    .filter((s) => s.timestamp && s.durationFromPreviousMs && s.durationFromPreviousMs > 0)
    .map((s) => ({ key: s.key, label: s.label, ms: s.durationFromPreviousMs!, speed: speedOf(s.durationFromPreviousMs!) }));
  const legTotal = legs.reduce((a, l) => a + l.ms, 0);
  const slowest = legs.reduce<(typeof legs)[number] | null>((m, l) => (!m || l.ms > m.ms ? l : m), null);
  // Fast legs too thin to see on their own merge into one segment at the bar's end.
  const barLegs: { key: string; title: string; ms: number; speed: Speed }[] = [];
  for (const l of legs) {
    const tiny = legTotal > 0 && l.ms / legTotal < 0.03 && l.speed === 'fast';
    const prev = barLegs[barLegs.length - 1];
    if (tiny && prev?.key.startsWith('tiny')) {
      prev.ms += l.ms;
      prev.title += `, ${l.label} +${fmtDuration(l.ms)}`;
    } else {
      barLegs.push({ key: tiny ? `tiny-${l.key}` : l.key, title: `${l.label}: +${fmtDuration(l.ms)}`, ms: l.ms, speed: l.speed });
    }
  }

  return (
    <section
      className="rounded-xl border overflow-hidden"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <header className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: 'color-mix(in srgb, var(--blue) 12%, var(--surface))' }}>
            <Timer size={16} color="var(--blue)" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold leading-tight" style={{ color: 'var(--ink)' }}>Response timeline</h3>
            <p className="text-[11.5px]" style={{ color: 'var(--muted)' }}>Turnaround time, alert to case closed</p>
          </div>
          {totalMs != null && (
            <div className="ml-auto text-right">
              <div className="text-[18px] font-bold leading-none tabular-nums" style={{ color: 'var(--ink)' }}>{fmtDuration(totalMs)}</div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wider mt-1" style={{ color: 'var(--muted)' }}>Total</div>
            </div>
          )}
        </div>

        {legs.length > 1 && (
          <div className="mt-3.5">
            <div className="flex h-2 rounded-full overflow-hidden gap-[2px]" style={{ background: 'var(--surface-3)' }}>
              {barLegs.map((l) => (
                <span
                  key={l.key}
                  title={l.title}
                  style={{ width: `${Math.max(2, (l.ms / legTotal) * 100)}%`, background: SPEED[l.speed].color }}
                />
              ))}
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px]" style={{ color: 'var(--muted)' }}>
              {(['fast', 'slow', 'delayed'] as Speed[]).map((sp) => (
                <span key={sp} className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm" style={{ background: SPEED[sp].color }} /> {SPEED[sp].label}
                </span>
              ))}
              {slowest && slowest.speed !== 'fast' && (
                <span className="ml-auto font-semibold" style={{ color: SPEED[slowest.speed].color }}>
                  Longest wait: {slowest.label.toLowerCase()} (+{fmtDuration(slowest.ms)})
                </span>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="px-5 py-4">
        {!steps ? (
          <p className="text-sm py-4" style={{ color: 'var(--muted)' }}>Loading timeline…</p>
        ) : (
          <ol className="flex flex-col">
            {steps.map((s, i) => {
              const state = states[i];
              const isLast = i === steps.length - 1;
              const next = steps[i + 1];
              // Connector below this node takes the speed of the leg that ends at the next step.
              const nextMs = next?.timestamp && next.durationFromPreviousMs ? next.durationFromPreviousMs : null;
              const lineColor = nextMs != null ? SPEED[speedOf(nextMs)].color : 'var(--border)';
              const lineDashed = !next?.timestamp;
              const ms = s.timestamp && s.durationFromPreviousMs && s.durationFromPreviousMs > 0 ? s.durationFromPreviousMs : null;
              const speed = ms != null ? speedOf(ms) : null;
              // Date only on the first timed step and whenever the day changes.
              const prevTs = steps.slice(0, i).reverse().find((p) => p.timestamp)?.timestamp;
              const showDay = !!s.timestamp && (!prevTs || dayOf(prevTs) !== dayOf(s.timestamp));

              return (
                <li key={s.key} className="flex gap-3.5">
                  <div className="flex flex-col items-center pt-0.5">
                    <StepBadge state={state} />
                    {!isLast && (
                      <span
                        className="flex-1 my-1 min-h-[22px]"
                        style={lineDashed
                          ? { width: 0, borderLeft: '2px dashed var(--border)' }
                          : { width: 2, borderRadius: 2, background: `color-mix(in srgb, ${lineColor} 55%, transparent)` }}
                      />
                    )}
                  </div>

                  <div className={`flex-1 min-w-0 ${isLast ? '' : 'pb-4'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className="text-[13.5px] font-semibold leading-tight"
                          style={{ color: state === 'done' || state === 'current' ? 'var(--ink)' : 'var(--muted-2)' }}
                        >
                          {s.label}
                          {state === 'skipped' && (
                            <span className="ml-2 text-[10.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}>
                              Skipped
                            </span>
                          )}
                        </p>
                        {s.timestamp ? (
                          <p className="text-[12px] mt-0.5 tabular-nums" style={{ color: 'var(--muted)' }}>
                            <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>{timeOf(s.timestamp)}</span>
                            {showDay && <span> · {dayOf(s.timestamp)}</span>}
                          </p>
                        ) : state === 'current' && waitingMs != null ? (
                          <p className="text-[12px] mt-0.5 font-medium tabular-nums" style={{ color: 'var(--blue)' }}>
                            Waiting {fmtDuration(waitingMs)}…
                          </p>
                        ) : i === currentIdx && stale && waitingMs != null ? (
                          <p className="text-[12px] mt-0.5 tabular-nums" style={{ color: 'var(--muted)' }}>
                            Not done yet · {fmtDuration(waitingMs)} since the last step
                          </p>
                        ) : null}
                      </div>

                      {ms != null && speed && (
                        <span
                          className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-md shrink-0 tabular-nums"
                          style={{ color: SPEED[speed].color, background: `color-mix(in srgb, ${SPEED[speed].color} 12%, var(--surface))` }}
                          title={SPEED[speed].label}
                        >
                          {(() => { const I = SPEED[speed].Icon; return <I size={12} color={SPEED[speed].color} />; })()}
                          +{fmtDuration(ms)}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
