import { useEffect, useMemo, useState } from 'react';
import {
  Ambulance,
  HeartPulse,
  Stethoscope,
  ChevronDown,
  CircleCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { usePresence } from '@/hooks/usePresence';
import { summarizeCrew, onlineFor, initialsOf, type CrewRole } from '@/lib/crewPresence';

/** Colour per crew role - blue / green / gold, never red (red means trouble). */
const ROLE_META: Record<CrewRole, { label: string; plural: string; color: string; Icon: LucideIcon }> = {
  DRIVER: { label: 'Driver', plural: 'Drivers', color: 'var(--green-bright)', Icon: Ambulance },
  EMT: { label: 'EMT', plural: 'EMTs', color: 'var(--color-status-success)', Icon: HeartPulse },
  NURSE: { label: 'Nurse', plural: 'Nurses', color: 'var(--gold)', Icon: Stethoscope },
};

const AVATAR_LIMIT = 6;

/**
 * "Field crew on the air": drivers, EMTs and nurses with a live connection to
 * the platform right now (mobile app or web), how many complete ambulance
 * crews that makes, and who they are. Live via the `presence:update` socket
 * push, with the presence query's poll as a fallback.
 */
export default function CrewOnAir() {
  const { all, isLoading } = usePresence();
  const crew = useMemo(() => summarizeCrew(all), [all]);
  const [showRoster, setShowRoster] = useState(false);

  // Keeps "online 2h 10m" current without waiting for a presence change.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const roles: { role: CrewRole; count: number }[] = [
    { role: 'DRIVER', count: crew.drivers },
    { role: 'EMT', count: crew.emts },
    { role: 'NURSE', count: crew.nurses },
  ];

  return (
    <section className="crew-air" aria-labelledby="crew-air-title">
      {/* ── Live total ───────────────────────────────────────── */}
      <div className="crew-air-total">
        <div className="crew-air-eyebrow">
          <span className="crew-air-live" aria-hidden /> <span id="crew-air-title">Field crew on the air</span>
        </div>
        <div className="crew-air-radar">
          <span className="crew-air-ring" aria-hidden />
          <span className="crew-air-ring crew-air-ring--late" aria-hidden />
          <span className="crew-air-count" aria-live="polite">
            {isLoading ? '–' : crew.total}
          </span>
        </div>
        <div className="crew-air-caption">{crew.total === 1 ? 'crew member connected' : 'crew connected now'}</div>
      </div>

      {/* ── Role breakdown ───────────────────────────────────── */}
      <div className="crew-air-roles">
        {roles.map(({ role, count }) => {
          const { plural, color, Icon } = ROLE_META[role];
          const share = crew.total ? (count / crew.total) * 100 : 0;
          return (
            <div key={role} className="crew-air-role">
              <span className="crew-air-role-ico" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
                <Icon size={16} />
              </span>
              <div className="crew-air-role-body">
                <div className="crew-air-role-head">
                  <span>{plural}</span>
                  <b>{isLoading ? '–' : count}</b>
                </div>
                <div className="crew-air-bar" role="img" aria-label={`${plural}: ${count} of ${crew.total} connected`}>
                  <span style={{ width: `${share}%`, background: color }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Readiness + who ──────────────────────────────────── */}
      <div className="crew-air-side">
        <CrewReadiness fullCrews={crew.fullCrews} shortBy={crew.shortBy} empty={crew.total === 0} loading={isLoading} />
        {crew.total > 0 && (
          <button
            type="button"
            className="crew-air-who"
            onClick={() => setShowRoster((s) => !s)}
            aria-expanded={showRoster}
            aria-controls="crew-air-roster"
          >
            <span className="crew-air-stack">
              {crew.members.slice(0, AVATAR_LIMIT).map((m) => (
                <span
                  key={m.userId}
                  className="crew-air-av"
                  title={`${m.name} · ${ROLE_META[m.role as CrewRole].label}`}
                  style={{ background: ROLE_META[m.role as CrewRole].color }}
                >
                  {initialsOf(m.name)}
                </span>
              ))}
              {crew.total > AVATAR_LIMIT && <span className="crew-air-av crew-air-av--more">+{crew.total - AVATAR_LIMIT}</span>}
            </span>
            <span className="crew-air-who-label">
              {showRoster ? 'Hide roster' : 'View roster'}
              <ChevronDown size={14} style={{ transform: showRoster ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
            </span>
          </button>
        )}
      </div>

      {/* ── Roster (expandable) ──────────────────────────────── */}
      {showRoster && crew.total > 0 && (
        <ul id="crew-air-roster" className="crew-air-roster">
          {crew.members.map((m) => {
            const meta = ROLE_META[m.role as CrewRole];
            return (
              <li key={m.userId} className="crew-air-person">
                <span className="crew-air-av" style={{ background: meta.color }}>{initialsOf(m.name)}</span>
                <div className="crew-air-person-main">
                  <b>{m.name}</b>
                  <span>{m.agencyName ?? 'No agency'}</span>
                </div>
                <span className="crew-air-role-tag" style={{ color: meta.color, borderColor: `color-mix(in srgb, ${meta.color} 40%, transparent)` }}>
                  {meta.label}
                </span>
                <span className="crew-air-since" title={`Connected ${new Date(m.connectedAt).toLocaleString()}`}>
                  online {onlineFor(m.connectedAt, now)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CrewReadiness({
  fullCrews,
  shortBy,
  empty,
  loading,
}: {
  fullCrews: number;
  shortBy: { drivers: number; medics: number } | null;
  empty: boolean;
  loading: boolean;
}) {
  if (loading) return <div className="crew-air-ready"><span className="crew-air-ready-sub">Checking who's connected…</span></div>;
  if (empty) {
    return (
      <div className="crew-air-ready">
        <span className="crew-air-ready-main crew-air-ready--warn"><TriangleAlert size={15} /> No field crew online</span>
        <span className="crew-air-ready-sub">Drivers and medics appear here the moment they open the crew app.</span>
      </div>
    );
  }
  const missing = shortBy
    ? [
        shortBy.drivers > 0 ? `${shortBy.drivers} driver` : null,
        shortBy.medics > 0 ? `${shortBy.medics} medic${shortBy.medics === 1 ? '' : 's'}` : null,
      ].filter(Boolean).join(' and ')
    : null;
  return (
    <div className="crew-air-ready">
      <span className={`crew-air-ready-main ${fullCrews > 0 ? 'crew-air-ready--ok' : 'crew-air-ready--warn'}`}>
        {fullCrews > 0 ? <CircleCheck size={15} /> : <TriangleAlert size={15} />}
        {fullCrews > 0 ? `Enough for ${fullCrews} full crew${fullCrews === 1 ? '' : 's'}` : 'No complete crew yet'}
      </span>
      <span className="crew-air-ready-sub">
        {missing ? `${missing} more for ${fullCrews > 0 ? 'another' : 'a full crew'}` : 'Everyone online is in a full crew'} · 1 driver + at least 1 medic each
      </span>
    </div>
  );
}
