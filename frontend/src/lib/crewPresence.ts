import type { PresenceUser } from '@/hooks/usePresence';
import { MIN_MEDICS } from '@/utils/crew';

/** Field roles that make up an ambulance crew. */
export const CREW_ROLES = ['DRIVER', 'EMT', 'NURSE'] as const;
export type CrewRole = (typeof CREW_ROLES)[number];

/** Each ambulance needs one driver and at least one medic (EMT or nurse). */
export const MEDICS_PER_CREW = MIN_MEDICS;

export interface CrewSummary {
  total: number;
  drivers: number;
  emts: number;
  nurses: number;
  medics: number;
  /** Complete crews (1 driver + MEDICS_PER_CREW medics) the people online could form. */
  fullCrews: number;
  /** What's holding back one more full crew, or null when nothing is. */
  shortBy: { drivers: number; medics: number } | null;
  /** Crew online, longest-connected first. */
  members: PresenceUser[];
}

const isCrew = (u: PresenceUser): boolean => (CREW_ROLES as readonly string[]).includes(u.role);

/**
 * Field-crew view of the live presence feed: who is connected, split by role,
 * and how many complete ambulance crews that adds up to.
 */
export function summarizeCrew(all: PresenceUser[]): CrewSummary {
  const members = all
    .filter(isCrew)
    .sort((a, b) => new Date(a.connectedAt).getTime() - new Date(b.connectedAt).getTime());

  const drivers = members.filter((u) => u.role === 'DRIVER').length;
  const emts = members.filter((u) => u.role === 'EMT').length;
  const nurses = members.filter((u) => u.role === 'NURSE').length;
  const medics = emts + nurses;
  const fullCrews = Math.min(drivers, Math.floor(medics / MEDICS_PER_CREW));

  // Leftovers that can't form a crew yet - what the next one is missing.
  const spareDrivers = drivers - fullCrews;
  const spareMedics = medics - fullCrews * MEDICS_PER_CREW;
  const shortBy =
    spareDrivers === 0 && spareMedics === 0
      ? null
      : { drivers: Math.max(0, 1 - spareDrivers), medics: Math.max(0, MEDICS_PER_CREW - spareMedics) };

  return { total: members.length, drivers, emts, nurses, medics, fullCrews, shortBy, members };
}

/** "45m", "2h 10m" - how long someone has been online. */
export function onlineFor(connectedAt: string, now: number = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - new Date(connectedAt).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
