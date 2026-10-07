import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, CircleCheck, CircleX, MoreHorizontal } from 'lucide-react';
import AppLoader from '@/components/shared/AppLoader';
import type { IncidentStatus } from '@/types/api';

/*
 * Incident detail header: who the case is (number, live status, flags) and a
 * command bar. The two decisive actions - Resolve and End Case - never move;
 * secondary actions sit inline when there's room and fold into "More" when
 * there isn't, so no label ever wraps onto three lines.
 */

type Tone = 'neutral' | 'danger';

export interface HeaderAction {
  key: string;
  label: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
  onClick?: () => void;
  /** Navigates instead of acting (e.g. View GBV report). */
  to?: string;
  tone?: Tone;
  disabled?: boolean;
  busy?: boolean;
}

export interface HeaderBadge {
  key: string;
  label: string;
  tone: 'red' | 'blue' | 'amber' | 'purple';
  pulse?: boolean;
}

const STATUS: Record<IncidentStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'var(--muted)' },
  SUBMITTED: { label: 'Waiting for dispatch', color: 'var(--amber)' },
  DISPATCH_HANDLING: { label: 'Being handled', color: 'var(--blue)' },
  DISPATCH_ON_HOLD: { label: 'On hold', color: 'var(--amber)' },
  DISPATCHED: { label: 'Crew dispatched', color: 'var(--blue)' },
  RESOLVED: { label: 'Resolved', color: 'var(--color-status-success)' },
};

const BADGE: Record<HeaderBadge['tone'], { fg: string; bg: string }> = {
  red: { fg: 'var(--red)', bg: 'var(--red-soft)' },
  blue: { fg: 'var(--blue)', bg: 'var(--blue-soft)' },
  amber: { fg: 'var(--amber)', bg: 'var(--amber-soft)' },
  purple: { fg: '#7e22ce', bg: 'color-mix(in srgb, #7e22ce 12%, var(--surface))' },
};

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h} h ${mins % 60} min ago` : `${Math.floor(h / 24)} d ago`;
}

const btnBase =
  'inline-flex items-center justify-center gap-2 h-10 px-3.5 rounded-lg text-[13px] font-semibold whitespace-nowrap ' +
  'border transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

function toneStyle(tone: Tone = 'neutral') {
  return tone === 'danger'
    ? { borderColor: 'color-mix(in srgb, var(--red) 35%, transparent)', color: 'var(--red)', background: 'var(--surface)' }
    : { borderColor: 'var(--border-strong)', color: 'var(--ink-2)', background: 'var(--surface)' };
}

function ActionButton({ a }: { a: HeaderAction }) {
  const body = (
    <>
      {a.busy ? <AppLoader size={16} /> : <a.Icon size={16} />}
      {a.label}
    </>
  );
  return a.to ? (
    <Link to={a.to} className={`${btnBase} hover:brightness-95`} style={toneStyle(a.tone)}>{body}</Link>
  ) : (
    <button type="button" onClick={a.onClick} disabled={a.disabled} className={`${btnBase} hover:brightness-95`} style={toneStyle(a.tone)}>
      {body}
    </button>
  );
}

/** "More" dropdown holding the secondary actions on narrower screens. */
function MoreMenu({ actions }: { actions: HeaderAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={btnBase}
        style={toneStyle()}
      >
        <MoreHorizontal size={16} />
        More
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-40 min-w-[220px] rounded-xl border py-1.5"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
        >
          {actions.map((a) => {
            const color = a.tone === 'danger' ? 'var(--red)' : 'var(--ink)';
            const cls = 'w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13.5px] font-medium text-left transition-colors hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed';
            const inner = (
              <>
                {a.busy ? <AppLoader size={16} /> : <a.Icon size={16} />}
                {a.label}
              </>
            );
            return a.to ? (
              <Link key={a.key} role="menuitem" to={a.to} className={cls} style={{ color }} onClick={() => setOpen(false)}>{inner}</Link>
            ) : (
              <button
                key={a.key}
                role="menuitem"
                type="button"
                disabled={a.disabled}
                className={cls}
                style={{ color }}
                onClick={() => { setOpen(false); a.onClick?.(); }}
              >
                {inner}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CaseHeader({
  caseNumber, status, createdAt, badges, secondary, resolved, onResolve, onEndCase,
}: {
  caseNumber: string;
  status: IncidentStatus;
  createdAt: string;
  badges: HeaderBadge[];
  secondary: HeaderAction[];
  resolved: boolean;
  onResolve: () => void;
  onEndCase: () => void;
}) {
  const st = STATUS[status] ?? { label: status, color: 'var(--muted)' };

  return (
    <header
      className="case-header rounded-xl border p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center gap-4"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}
    >
      {/* Identity */}
      <div className="min-w-0 flex-1">
        <nav className="flex items-center gap-1 text-[12px]" style={{ color: 'var(--muted)' }} aria-label="Breadcrumb">
          <Link to="/queue" className="hover:underline">Incidents</Link>
          <ChevronRight size={12} />
          <span>Case detail</span>
        </nav>
        <div className="flex items-center gap-3 flex-wrap mt-1">
          <h2 className="text-[22px] font-bold tracking-tight leading-tight" style={{ color: 'var(--ink)' }}>{caseNumber}</h2>
          <span
            className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[12px] font-semibold"
            style={{ color: st.color, background: `color-mix(in srgb, ${st.color} 12%, var(--surface))` }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />
            {st.label}
          </span>
          <span className="text-[12px]" style={{ color: 'var(--muted)' }}>
            Logged {new Date(createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })} · {ago(createdAt)}
          </span>
        </div>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {badges.map((b) => (
              <span
                key={b.key}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold max-w-full"
                style={{ color: BADGE[b.tone].fg, background: BADGE[b.tone].bg }}
              >
                {b.pulse && <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: BADGE[b.tone].fg }} />}
                <span className="truncate">{b.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Command bar */}
      <div className="flex items-center gap-2 flex-wrap xl:flex-nowrap xl:justify-end">
        <div className="hidden 2xl:flex items-center gap-2">
          {secondary.map((a) => <ActionButton key={a.key} a={a} />)}
        </div>
        <div className="2xl:hidden">
          <MoreMenu actions={secondary} />
        </div>
        <span className="hidden sm:block w-px h-7 mx-1" style={{ background: 'var(--border)' }} />
        <button
          type="button"
          onClick={onResolve}
          disabled={resolved}
          className={btnBase}
          style={resolved
            ? { borderColor: 'var(--color-status-success)', color: 'var(--color-status-success)', background: 'color-mix(in srgb, var(--color-status-success) 10%, var(--surface))' }
            : { borderColor: 'color-mix(in srgb, var(--color-status-success) 45%, transparent)', color: 'var(--color-status-success)', background: 'var(--surface)' }}
        >
          <CircleCheck size={16} />
          {resolved ? 'Resolved' : 'Resolve'}
        </button>
        <button
          type="button"
          onClick={onEndCase}
          disabled={resolved}
          className={`${btnBase} border-transparent text-white hover:brightness-110`}
          style={{ background: 'var(--red)' }}
        >
          <CircleX size={16} />
          End case
        </button>
      </div>
    </header>
  );
}
