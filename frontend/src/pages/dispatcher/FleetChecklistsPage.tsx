import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2, CircleAlert, CircleDashed, Search, Truck, UserX, X as XIcon, Stethoscope, Wrench, Users, RefreshCw,
} from 'lucide-react';
import { getFleetChecklists, getVehicleChecklist } from '@/api/checklist';
import type { Vehicle, VehicleChecklistItem } from '@/types/api';
import { crewShortfall, isCrewComplete, medicsInline } from '@/utils/crew';
import LoadingState from '@/components/shared/LoadingState';
import AppLoader from '@/components/shared/AppLoader';

type Filter = 'ALL' | 'READY' | 'NOT_READY' | 'OFF';
type ItemFilter = 'ALL' | 'ISSUE' | 'PENDING' | 'OK';

function categoryLabel(value: string) {
  return value.split('_').map((w) => (w ? w[0] + w.slice(1).toLowerCase() : w)).join(' ');
}

/** Ready / needs checks / off duty - the one word dispatch needs about a unit. */
function readiness(v: Vehicle): { key: Exclude<Filter, 'ALL'>; label: string; color: string } {
  if (!v.currentDriver) return { key: 'OFF', label: 'No crew', color: 'var(--muted-2)' };
  if (v.checklistComplete) return { key: 'READY', label: 'Dispatch-ready', color: 'var(--green)' };
  return { key: 'NOT_READY', label: 'Checks pending', color: 'var(--amber)' };
}

function Progress({ done, total, color }: { done: number; total: number; color: string }) {
  return (
    <div className="inv-bar" style={{ marginTop: 6 }} aria-hidden="true">
      <span style={{ width: `${total ? (done / total) * 100 : 0}%`, background: color }} />
    </div>
  );
}

function ItemStatusIcon({ status }: { status: VehicleChecklistItem['status'] }) {
  if (status === 'OK') return <CheckCircle2 size={18} style={{ color: 'var(--green)' }} aria-label="Confirmed" />;
  if (status === 'ISSUE') return <CircleAlert size={18} style={{ color: 'var(--red)' }} aria-label="Issue reported" />;
  return <CircleDashed size={18} style={{ color: 'var(--muted-2)' }} aria-label="Not confirmed yet" />;
}

/** The selected unit: crew, readiness, then every item grouped Vehicle -> medical categories. */
function VehicleDetail({ vehicle }: { vehicle: Vehicle }) {
  const [itemFilter, setItemFilter] = useState<ItemFilter>('ALL');
  const { data: checklist, isLoading, isFetching } = useQuery({
    queryKey: ['dispatch', 'vehicle-checklist', vehicle.id],
    queryFn: () => getVehicleChecklist(vehicle.id),
    refetchInterval: 30000,
  });
  useEffect(() => setItemFilter('ALL'), [vehicle.id]);

  const r = readiness(vehicle);
  const items = checklist?.items ?? [];
  const counts = {
    ALL: items.length,
    ISSUE: items.filter((i) => i.status === 'ISSUE').length,
    PENDING: items.filter((i) => !i.status).length,
    OK: items.filter((i) => i.status === 'OK').length,
  };
  const shown = items.filter((i) =>
    itemFilter === 'ALL' ? true : itemFilter === 'ISSUE' ? i.status === 'ISSUE' : itemFilter === 'PENDING' ? !i.status : i.status === 'OK');

  const groups = useMemo(() => {
    const out: { key: string; label: string; Icon: typeof Truck; items: VehicleChecklistItem[] }[] = [];
    const veh = shown.filter((i) => i.itemType === 'VEHICLE');
    if (veh.length) out.push({ key: 'VEHICLE', label: 'Vehicle', Icon: Wrench, items: veh });
    const byCat = new Map<string, VehicleChecklistItem[]>();
    for (const i of shown.filter((x) => x.itemType === 'MEDICAL')) byCat.set(i.category, [...(byCat.get(i.category) ?? []), i]);
    for (const [cat, list] of byCat) out.push({ key: cat, label: categoryLabel(cat), Icon: Stethoscope, items: list });
    // Issues first inside each group, then unconfirmed, then confirmed.
    const rank = (s: VehicleChecklistItem['status']) => (s === 'ISSUE' ? 0 : s ? 2 : 1);
    out.forEach((g) => g.items.sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name)));
    return out;
  }, [shown]);

  const crewLine = vehicle.currentDriver
    ? `${vehicle.currentDriver.name}${medicsInline(vehicle)}`
    : 'No driver checked in';
  const shortfall = vehicle.currentDriver && !isCrewComplete(vehicle) ? crewShortfall(vehicle) : null;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Ambulance</p>
          <h3 className="text-xl font-bold leading-tight mt-0.5 mono" style={{ color: 'var(--ink)' }}>{vehicle.registrationNumber}</h3>
          <p className="text-sm mt-1 flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
            <Users size={14} /> <span className="truncate">{crewLine}</span>
          </p>
        </div>
        <span className="pill" style={{ background: `color-mix(in srgb, ${r.color} 14%, transparent)`, color: r.color, fontWeight: 700 }}>
          {r.label}
        </span>
      </div>

      {/* Readiness checks: what dispatch needs before assigning this unit */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
        {[
          { label: 'Medical items', ok: !!vehicle.checklistMedicalOk, note: vehicle.checklistMedicalOk ? 'At least one confirmed' : 'None confirmed yet' },
          { label: 'Vehicle items', ok: !!vehicle.checklistVehicleOk, note: vehicle.checklistVehicleOk ? 'At least one confirmed' : 'None confirmed yet' },
          { label: 'Crew', ok: !!vehicle.currentDriver && isCrewComplete(vehicle), note: !vehicle.currentDriver ? 'Off duty' : shortfall ?? 'Driver and medic on board' },
        ].map((c) => (
          <div key={c.label} className="flex items-start gap-2.5 rounded-xl border p-3" style={{ borderColor: c.ok ? 'color-mix(in srgb, var(--green) 30%, var(--border))' : 'var(--border)' }}>
            {c.ok ? <CheckCircle2 size={18} style={{ color: 'var(--green)', flexShrink: 0 }} /> : <CircleDashed size={18} style={{ color: 'var(--amber)', flexShrink: 0 }} />}
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{c.label}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{c.note}</p>
            </div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <LoadingState minHeight={200} />
      ) : !checklist || items.length === 0 ? (
        <p className="text-sm text-center py-12" style={{ color: 'var(--muted)' }}>No checklist items are set up. Mark inventory items as "Required for dispatch".</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
            <div className="seg" role="tablist" aria-label="Filter items">
              {([
                ['ALL', 'All'], ['ISSUE', 'Issues'], ['PENDING', 'Not checked'], ['OK', 'Confirmed'],
              ] as [ItemFilter, string][]).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={itemFilter === k} className={itemFilter === k ? 'on' : ''} onClick={() => setItemFilter(k)}>
                  {label}
                  <span className="text-[11px]" style={{ color: k === 'ISSUE' && counts.ISSUE ? 'var(--red)' : 'var(--muted)' }}>{counts[k]}</span>
                </button>
              ))}
            </div>
            <span className="text-xs inline-flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
              {isFetching ? <AppLoader size={12} /> : <RefreshCw size={12} />}
              Resets {new Date(checklist.resetAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>

          {shown.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--muted)' }}>
              {itemFilter === 'ISSUE' ? 'No issues reported this shift.' : itemFilter === 'PENDING' ? 'Every item has been checked.' : 'Nothing confirmed yet this shift.'}
            </p>
          ) : (
            <div className="col mt-4" style={{ gap: 18 }}>
              {groups.map((g) => {
                const done = g.items.filter((i) => i.status === 'OK').length;
                return (
                  <div key={g.key}>
                    <div className="flex items-center gap-2 mb-2">
                      <g.Icon size={14} style={{ color: 'var(--muted)' }} />
                      <p className="label" style={{ margin: 0 }}>{g.label}</p>
                      <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{done}/{g.items.length}</span>
                    </div>
                    <div className="nature-grid">
                      {g.items.map((i) => (
                        <div
                          key={i.id}
                          className="nature-item"
                          style={i.status === 'ISSUE' ? { borderColor: 'color-mix(in srgb, var(--red) 40%, var(--border))', background: 'color-mix(in srgb, var(--red) 5%, var(--surface))', alignItems: 'flex-start', paddingTop: 9, paddingBottom: 9 } : { alignItems: 'flex-start', paddingTop: 9, paddingBottom: 9 }}
                        >
                          <div className="min-w-0">
                            <p className="font-semibold truncate" title={i.name}>{i.name}</p>
                            {i.note && <p className="text-xs mt-0.5" style={{ color: i.status === 'ISSUE' ? 'var(--red)' : 'var(--muted)' }}>{i.note}</p>}
                            <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
                              {i.checkedByName
                                ? `${i.checkedByName}${i.checkedAt ? ` · ${new Date(i.checkedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}`
                                : 'Not checked this shift'}
                            </p>
                          </div>
                          <span className="flex-shrink-0 pt-0.5 pr-1"><ItemStatusIcon status={i.status} /></span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

function FleetChecklistsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['dispatch', 'fleet-checklists'],
    queryFn: getFleetChecklists,
    refetchInterval: 30000,
  });

  const counts = {
    ALL: vehicles.length,
    READY: vehicles.filter((v) => readiness(v).key === 'READY').length,
    NOT_READY: vehicles.filter((v) => readiness(v).key === 'NOT_READY').length,
    OFF: vehicles.filter((v) => readiness(v).key === 'OFF').length,
  };
  const q = query.trim().toLowerCase();
  // Units that need attention first: checks pending, then ready, then off duty.
  const order = { NOT_READY: 0, READY: 1, OFF: 2 } as const;
  const shown = vehicles
    .filter((v) => filter === 'ALL' || readiness(v).key === filter)
    .filter((v) => !q || v.registrationNumber.toLowerCase().includes(q) || (v.currentDriver?.name ?? '').toLowerCase().includes(q))
    .sort((a, b) => order[readiness(a).key] - order[readiness(b).key] || a.registrationNumber.localeCompare(b.registrationNumber));

  useEffect(() => {
    if (!shown.length) return;
    if (!selectedId || !shown.some((v) => v.id === selectedId)) setSelectedId(shown[0].id);
  }, [shown, selectedId]);
  const selected = vehicles.find((v) => v.id === selectedId) ?? null;

  return (
    <div className="col" style={{ gap: 20 }}>
      <div>
        <p className="eyebrow">Fleet</p>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1" style={{ color: 'var(--ink)' }}>Vehicle checklists</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          The equipment each crew confirms every shift before the unit can take a case.
        </p>
      </div>

      {/* Summary - doubles as the filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          { k: 'ALL', label: 'Ambulances', note: 'In the fleet', color: 'var(--ink)' },
          { k: 'READY', label: 'Dispatch-ready', note: 'Crewed and checked', color: 'var(--green)' },
          { k: 'NOT_READY', label: 'Checks pending', note: 'Crewed, checklist open', color: 'var(--amber)' },
          { k: 'OFF', label: 'No crew', note: 'No driver checked in', color: 'var(--muted)' },
        ] as { k: Filter; label: string; note: string; color: string }[]).map((s) => (
          <button
            key={s.k}
            type="button"
            onClick={() => setFilter(s.k)}
            className="card card-pad text-left"
            aria-pressed={filter === s.k}
            style={filter === s.k ? { borderColor: 'var(--green)', boxShadow: '0 0 0 1px var(--green)' } : undefined}
          >
            <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{s.label}</p>
            <p className="text-3xl font-bold mt-1 leading-none" style={{ color: s.color }}>{counts[s.k]}</p>
            <p className="text-[11.5px] mt-2" style={{ color: 'var(--muted)' }}>{s.note}</p>
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState minHeight={300} />
      ) : vehicles.length === 0 ? (
        <div className="card card-pad text-center" style={{ padding: 48 }}>
          <Truck size={40} style={{ color: 'var(--muted-2)' }} className="mx-auto mb-3" />
          <p className="font-bold" style={{ color: 'var(--ink)' }}>No vehicles found</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="nature-layout chk-layout">
            <aside className="nature-cats" aria-label="Ambulances">
              <div className="searchbox chk-search" style={{ maxWidth: 'none', minWidth: 0 }}>
                <Search size={15} />
                <input placeholder="Registration or driver…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search ambulances" />
                {query && <button onClick={() => setQuery('')} aria-label="Clear search" style={{ color: 'var(--muted)' }}><XIcon size={14} /></button>}
              </div>
              <div className="nature-cats-list">
                {shown.length === 0 && (
                  <p className="text-xs text-center py-6 px-2" style={{ color: 'var(--muted)' }}>No ambulances match.</p>
                )}
                {shown.map((v) => {
                  const r = readiness(v);
                  const done = v.checklistConfirmed ?? 0;
                  const total = v.checklistTotal ?? 0;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedId(v.id)}
                      className={`nature-cat chk-unit${v.id === selectedId ? ' on' : ''}`}
                      aria-current={v.id === selectedId}
                    >
                      <span className="flex items-center gap-2.5 min-w-0 w-full">
                        {r.key === 'READY' ? <CheckCircle2 size={17} style={{ color: r.color, flexShrink: 0 }} />
                          : r.key === 'OFF' ? <UserX size={17} style={{ color: r.color, flexShrink: 0 }} />
                          : <CircleDashed size={17} style={{ color: r.color, flexShrink: 0 }} />}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="mono font-bold truncate">{v.registrationNumber}</span>
                            <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: 'var(--muted)' }}>{done}/{total}</span>
                          </span>
                          <span className="block text-[11.5px] font-normal truncate chk-unit-sub" style={{ color: 'var(--muted)' }}>
                            {v.currentDriver?.name ?? 'No crew'}
                          </span>
                          <span className="chk-unit-sub block"><Progress done={done} total={total} color={r.color} /></span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="nature-panel">
              {selected ? <VehicleDetail vehicle={selected} /> : (
                <p className="text-sm text-center py-16" style={{ color: 'var(--muted)' }}>Choose an ambulance to see its checklist.</p>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

export default FleetChecklistsPage;
