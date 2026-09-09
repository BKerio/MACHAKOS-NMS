import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, TriangleAlert, ChevronRight, Truck } from 'lucide-react';
import { getFleetChecklists, getVehicleChecklist } from '@/api/checklist';
import type { VehicleChecklistItem } from '@/types/api';

function categoryLabel(value: string) {
  return value
    .split('_')
    .map((w) => (w ? w[0] + w.slice(1).toLowerCase() : w))
    .join(' ');
}

function GroupTag({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <span
      className="text-[10px] font-black tracking-wide px-2 py-1 rounded-md"
      style={{
        background: ok ? 'var(--green-light, #e7f0fa)' : 'var(--surface-2)',
        color: ok ? 'var(--green)' : 'var(--muted)',
        border: '1px solid',
        borderColor: ok ? 'transparent' : 'var(--border)',
      }}
    >
      {ok ? '✓' : '·'} {label}
    </span>
  );
}

function StatusPill({ status }: { status: VehicleChecklistItem['status'] }) {
  if (status === 'OK') {
    return <span className="pill pill-green text-[11px]">Confirmed</span>;
  }
  if (status === 'ISSUE') {
    return <span className="pill pill-red text-[11px]">Issue</span>;
  }
  return <span className="pill pill-gray text-[11px]">Unconfirmed</span>;
}

function VehicleChecklistDetail({ vehicleId }: { vehicleId: string }) {
  const { data: checklist, isLoading } = useQuery({
    queryKey: ['dispatch', 'vehicle-checklist', vehicleId],
    queryFn: () => getVehicleChecklist(vehicleId),
  });

  if (isLoading) return <div className="skel" style={{ height: 160 }} />;
  if (!checklist) return null;

  const vehicleItems = checklist.items.filter((i) => i.itemType === 'VEHICLE');
  const medicalItems = checklist.items.filter((i) => i.itemType === 'MEDICAL');
  const medicalByCategory = medicalItems.reduce<Record<string, VehicleChecklistItem[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  const Row = ({ item }: { item: VehicleChecklistItem }) => (
    <div className="flex items-center justify-between gap-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{item.name}</p>
        {item.note && (
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{item.note}</p>
        )}
        {item.checkedByName && (
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
            {item.checkedByName}{item.checkedAt ? ` · ${new Date(item.checkedAt).toLocaleTimeString()}` : ''}
          </p>
        )}
      </div>
      <StatusPill status={item.status} />
    </div>
  );

  return (
    <div className="col" style={{ gap: 16, padding: '4px 4px 4px' }}>
      {vehicleItems.length > 0 && (
        <div>
          <p className="label mb-1">Vehicle</p>
          {vehicleItems.map((i) => <Row key={i.id} item={i} />)}
        </div>
      )}
      {Object.entries(medicalByCategory).map(([category, items]) => (
        <div key={category}>
          <p className="label mb-1">{categoryLabel(category)}</p>
          {items.map((i) => <Row key={i.id} item={i} />)}
        </div>
      ))}
    </div>
  );
}

function FleetChecklistsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['dispatch', 'fleet-checklists'],
    queryFn: getFleetChecklists,
    refetchInterval: 30000,
  });

  const readyCount = vehicles.filter((v) => v.checklistComplete).length;

  return (
    <div className="col" style={{ gap: 20 }}>
      <div>
        <p className="eyebrow">Fleet</p>
        <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Vehicle Checklists</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          {readyCount}/{vehicles.length} vehicles dispatch-ready · expand a unit to see its full checklist
        </p>
      </div>

      {isLoading ? (
        <div className="skel" style={{ height: 300 }} />
      ) : vehicles.length === 0 ? (
        <div className="card card-pad text-center" style={{ padding: 48 }}>
          <Truck size={40} style={{ color: 'var(--muted-2)' }} className="mx-auto mb-3" />
          <p className="font-bold" style={{ color: 'var(--ink)' }}>No vehicles found</p>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {vehicles.map((v) => {
            const isOpen = expanded === v.id;
            return (
              <div key={v.id} className="card" style={{ overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : v.id)}
                  className="w-full flex items-center gap-3 card-pad"
                  style={{ textAlign: 'left' }}
                >
                  {v.checklistComplete ? (
                    <CheckCircle2 size={20} style={{ color: 'var(--green)' }} className="flex-shrink-0" />
                  ) : (
                    <TriangleAlert size={20} style={{ color: 'var(--amber)' }} className="flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{v.registrationNumber}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                      {v.currentDriver ? v.currentDriver.name : 'No driver checked in'}
                      {v.currentEmt ? ` · EMT ${v.currentEmt.name}` : ''}
                      {v.currentNurse ? ` · Nurse ${v.currentNurse.name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <GroupTag label="Medical" ok={v.checklistMedicalOk} />
                    <GroupTag label="Vehicle" ok={v.checklistVehicleOk} />
                  </div>
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--muted)', minWidth: 56, textAlign: 'right' }}>
                    {v.checklistConfirmed}/{v.checklistTotal}
                  </span>
                  <ChevronRight
                    size={16}
                    style={{ color: 'var(--muted)', transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4" style={{ borderTop: '1px solid var(--border)' }}>
                    <VehicleChecklistDetail vehicleId={v.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default FleetChecklistsPage;
