import { Ambulance, Check, Hospital, Truck } from 'lucide-react';
import type { CrewTask, TaskStatus } from '@/types/api';
import { STATUS_LABELS } from '@/utils/taskStatus';
import { formatKm } from '@/utils/caseFlow';

/** The case's stages, one bar each (the app's taskFlow). */
const FLOW: TaskStatus[] = ['ACCEPTED', 'EN_ROUTE', 'AT_SCENE', 'PATIENT_PICKED', 'EN_ROUTE_TO_FACILITY', 'AT_HOSPITAL'];
const MOVING: TaskStatus[] = ['ACCEPTED', 'EN_ROUTE', 'EN_ROUTE_TO_FACILITY'];
const ORDER: TaskStatus[] = ['PENDING', ...FLOW, 'COMPLETED'];

const reachedStage = (task: CrewTask, s: TaskStatus) => ORDER.indexOf(task.status) >= ORDER.indexOf(s);

/**
 * Case progress as a road, after the app's CaseRoadProgress: one bar per
 * stage, the ambulance riding at the front of the completed bars (bouncing
 * while the crew is on the move), and the two legs underneath.
 */
export function CaseProgress({ task }: { task: CrewTask }) {
  const reached = FLOW.indexOf(task.status); // -1 while it's a new call
  const front = Math.min(Math.max(reached + 1, 0), FLOW.length) / FLOW.length;
  const moving = MOVING.includes(task.status);
  const firstLeg = task.pickupLat != null ? 'To patient' : 'To scene';
  const facility = task.incident.targetFacility?.name;

  return (
    <div className="card card-pad" aria-label={`Case progress: ${STATUS_LABELS[task.status]}`}>
      <div className="relative" style={{ height: 46 }}>
        <div
          className={`case-road-amb${moving ? ' moving' : ''}`}
          style={{ left: `calc(${front * 100}% - ${front === 0 ? 0 : 30}px)` }}
          aria-hidden="true"
        >
          <Ambulance size={26} />
        </div>
        <div className="absolute left-0 right-0 bottom-0 flex gap-1.5">
          {FLOW.map((s, i) => (
            <div
              key={s}
              title={STATUS_LABELS[s]}
              className="flex-1 rounded-full"
              style={{
                height: 7,
                background: i <= reached ? 'var(--green)' : 'var(--border)',
                transition: 'background .5s',
                marginRight: i === 2 ? 6 : 0, // a gap at the scene splits the two legs
              }}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Leg title={firstLeg} done={reached >= 2} km={task.distanceToSceneKm} />
        <Leg title={facility ? `To ${facility}` : 'To hospital'} done={reached >= 5} km={task.sceneToFacilityKm} alignRight />
      </div>
    </div>
  );
}

function Leg({ title, done, km, alignRight }: { title: string; done: boolean; km?: number | null; alignRight?: boolean }) {
  return (
    <div className={alignRight ? 'text-right min-w-0' : 'min-w-0'}>
      <p className="text-xs font-semibold truncate" style={{ color: done ? 'var(--green)' : 'var(--muted)' }}>
        {done ? '✓ ' : ''}{title}
      </p>
      <p className="text-sm font-bold mono" style={{ color: km != null ? 'var(--ink)' : 'var(--muted-2)' }}>
        {km != null ? formatKm(km) : '—'}
      </p>
    </div>
  );
}

/**
 * The case's two legs as the server recorded them (the app's _JourneyCard):
 * ambulance GPS -> scene at accept, scene -> recommended facility at pickup.
 * Straight-line distances, labelled as such.
 */
export function JourneyCard({ task }: { task: CrewTask }) {
  const facility = task.incident.targetFacility;
  const collects = task.pickupLat != null && task.pickupLng != null;
  const toScene = task.distanceToSceneKm;
  const toFacility = task.sceneToFacilityKm;

  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between mb-3">
        <p className="label" style={{ margin: 0 }}>Journey</p>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>Direct distance</span>
      </div>
      <LegRow
        Icon={Truck}
        title={collects ? 'Ambulance to patient' : 'Ambulance to scene'}
        value={toScene}
        done={reachedStage(task, 'AT_SCENE')}
        note={
          toScene != null
            ? "From the ambulance's GPS when the call was accepted"
            : reachedStage(task, 'ACCEPTED')
              ? "Not recorded: the ambulance's GPS had no position at accept"
              : 'Measured when you accept the call'
        }
      />
      <div style={{ width: 2, height: 14, background: 'var(--border)', marginLeft: 21 }} />
      <LegRow
        Icon={Hospital}
        title={facility ? `Scene to ${facility.name}` : 'Scene to facility'}
        value={toFacility}
        done={reachedStage(task, 'AT_HOSPITAL')}
        note={
          toFacility != null
            ? 'Recommended facility, measured at patient pickup'
            : !facility
              ? "Dispatch hasn't set a receiving facility yet"
              : reachedStage(task, 'PATIENT_PICKED')
                ? 'Not recorded: the scene or facility had no map position'
                : 'Measured when the patient is on board'
        }
      />
    </div>
  );
}

function LegRow({ Icon, title, note, value, done }: {
  Icon: typeof Truck; title: string; note: string; value?: number | null; done: boolean;
}) {
  const measured = value != null;
  return (
    <div className="flex items-start gap-3">
      <span
        className="grid place-items-center rounded-xl flex-shrink-0"
        style={{ width: 44, height: 44, background: measured ? 'var(--green-light)' : 'var(--surface-3)' }}
      >
        {done ? <Check size={20} style={{ color: 'var(--green)' }} /> : <Icon size={20} style={{ color: measured ? 'var(--green)' : 'var(--muted)' }} />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{title}</p>
        <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--muted)' }}>{note}</p>
      </div>
      <p className="mono font-bold" style={{ fontSize: 19, color: measured ? 'var(--ink)' : 'var(--muted-2)' }}>
        {measured ? formatKm(value!) : '—'}
      </p>
    </div>
  );
}
