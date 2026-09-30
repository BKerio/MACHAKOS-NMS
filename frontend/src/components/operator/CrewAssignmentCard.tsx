import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Check, AlertTriangle, Lock } from 'lucide-react';
import AppLoader from '@/components/shared/AppLoader';
import { getAssignableCrew, assignVehicleCrew, getErrorMessage } from '@/api/responder';
import { useNotificationStore } from '@/stores/notificationStore';
import { useAuthStore } from '@/stores/authStore';
import { socket } from '@/lib/socket';
import { crewShortfall } from '@/utils/crew';
import type { AssignableCrewMember, Vehicle } from '@/types/api';

type SlotKey = 'emtId' | 'emt2Id' | 'nurseId' | 'nurse2Id';

function roleLabel(role: 'EMT' | 'NURSE') {
  return role === 'EMT' ? 'EMT' : 'nurse';
}

function CrewAssignmentCard({ myVehicle }: { myVehicle: Vehicle }) {
  const user = useAuthStore((s) => s.user);
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();
  const isDriver = user?.role === 'DRIVER';

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['operator', 'assignable-crew'],
    queryFn: getAssignableCrew,
    enabled: isDriver,
  });

  // Live refresh when another driver assigns/clears crew
  useEffect(() => {
    if (!isDriver) return;
    const onCrewUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['operator', 'assignable-crew'] });
      queryClient.invalidateQueries({ queryKey: ['operator', 'my-checkin'] });
    };
    socket.on('vehicle:crew', onCrewUpdate);
    return () => {
      socket.off('vehicle:crew', onCrewUpdate);
    };
  }, [isDriver, queryClient]);

  const setSlotMutation = useMutation({
    mutationFn: ({ slot, userId }: { role: 'EMT' | 'NURSE'; slot: SlotKey; userId: string | null }) =>
      assignVehicleCrew(myVehicle.id, { [slot]: userId }),
    onSuccess: (_data, { role, userId }) => {
      queryClient.invalidateQueries({ queryKey: ['operator', 'my-checkin'] });
      queryClient.invalidateQueries({ queryKey: ['operator', 'assignable-crew'] });
      addNotification({
        type: 'success',
        title: userId ? 'You’re all set' : 'Crew cleared',
        message: userId ? `${roleLabel(role)} added to ${myVehicle.registrationNumber}.` : `${roleLabel(role)} removed from this ambulance.`,
      });
    },
    onError: (err) => {
      const message = getErrorMessage(err);
      const alreadyTaken = /already on ambulance|taken/i.test(message);
      addNotification({ type: 'error', title: alreadyTaken ? 'Someone else got there first' : 'Couldn’t update crew', message });
    },
  });

  if (!isDriver) return null;

  const emts = members.filter((m) => m.role === 'EMT');
  const nurses = members.filter((m) => m.role === 'NURSE');
  const shortfall = crewShortfall(myVehicle);

  // Two slots per role; toggling a person fills the first free one or empties theirs.
  const slotsFor = (role: 'EMT' | 'NURSE'): { key: SlotKey; id: string | undefined }[] =>
    role === 'EMT'
      ? [{ key: 'emtId', id: myVehicle.currentEmt?.id }, { key: 'emt2Id', id: myVehicle.currentEmt2?.id }]
      : [{ key: 'nurseId', id: myVehicle.currentNurse?.id }, { key: 'nurse2Id', id: myVehicle.currentNurse2?.id }];

  const toggle = (role: 'EMT' | 'NURSE', personId: string) => {
    const slots = slotsFor(role);
    const held = slots.find((s) => s.id === personId);
    if (held) {
      setSlotMutation.mutate({ role, slot: held.key, userId: null });
      return;
    }
    const free = slots.find((s) => !s.id);
    if (!free) {
      addNotification({
        type: 'info',
        title: `Two ${role === 'EMT' ? 'EMTs' : 'nurses'} already assigned`,
        message: 'Remove one first to swap someone in.',
      });
      return;
    }
    setSlotMutation.mutate({ role, slot: free.key, userId: personId });
  };

  // On the crew of a different ambulance: shown, but locked - one medic, one
  // ambulance (the server refuses it too).
  const elsewhere = (p: AssignableCrewMember) => p.assignedVehicleId != null && p.assignedVehicleId !== myVehicle.id;

  const renderPicker = (role: 'EMT' | 'NURSE', unsorted: AssignableCrewMember[]) => {
    const assignedIds = slotsFor(role).map((s) => s.id).filter(Boolean);
    const busy = setSlotMutation.isPending && setSlotMutation.variables?.role === role;
    // Free medics first; those locked to another ambulance sink to the end.
    const options = [...unsorted].sort((a, b) => Number(elsewhere(a)) - Number(elsewhere(b)));
    const lockedCount = options.filter(elsewhere).length;
    return (
      <div className="mb-4">
        <p className="label mb-2">
          {role === 'EMT' ? 'EMTs' : 'Nurses'} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>({assignedIds.length} of 2)</span>
          {lockedCount > 0 && (
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}> · {lockedCount} on another ambulance</span>
          )}
        </p>
        {isLoading ? (
          <div className="skel" style={{ height: 40 }} />
        ) : options.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            No {role === 'EMT' ? 'EMTs' : 'nurses'} in your agency yet. Ask an admin to add them.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {options.map((person) => {
              const active = assignedIds.includes(person.id);
              const takenElsewhere = !active && elsewhere(person);
              const otherAmbulance = person.assignedVehicleRegistration ?? 'another ambulance';
              return (
                <button
                  key={person.id}
                  onClick={() => {
                    if (takenElsewhere || setSlotMutation.isPending) return;
                    toggle(role, person.id);
                  }}
                  disabled={takenElsewhere || setSlotMutation.isPending}
                  aria-disabled={takenElsewhere}
                  title={takenElsewhere ? `On the crew of ${otherAmbulance}. Their driver must remove them first.` : undefined}
                  className="flex items-center gap-2.5 text-left px-3.5 py-2.5 rounded-xl border-2 transition-all"
                  style={{
                    borderColor: active ? 'var(--green)' : 'var(--border)',
                    background: active ? 'var(--green-light)' : takenElsewhere ? 'var(--surface-2)' : 'var(--surface)',
                    opacity: takenElsewhere ? 0.6 : 1,
                    cursor: takenElsewhere ? 'not-allowed' : undefined,
                  }}
                >
                  <div className="flex-1">
                    <p className={`text-sm ${active ? 'font-bold' : ''}`} style={{ color: 'var(--ink)' }}>{person.name}</p>
                    {person.phone && <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{person.phone}</p>}
                    {active && <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Tap to remove - they stay on shift</p>}
                  </div>
                  {busy && active ? (
                    <AppLoader size={22} style={{ color: 'var(--green)' }} />
                  ) : active ? (
                    <Check size={18} style={{ color: 'var(--green)' }} />
                  ) : takenElsewhere ? (
                    <span className="flex items-center gap-1.5 flex-shrink-0">
                      <Lock size={14} style={{ color: 'var(--muted)' }} />
                      <span className="text-[11px] font-bold px-2 py-1 rounded-full border" style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}>
                        On {otherAmbulance}
                      </span>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card card-pad">
      <div className="flex gap-3.5 mb-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--green-dark)' }}>
          <UserPlus size={22} color="#fff" />
        </div>
        <div className="flex-1">
          <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Assign crew</p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            {myVehicle.registrationNumber} needs two medics to take calls: an EMT and a nurse, two EMTs, or two
            nurses. Medics already on another ambulance are locked until their driver removes them.
          </p>
        </div>
      </div>

      <div
        className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl mb-4 text-sm font-semibold"
        style={
          shortfall
            ? { background: 'var(--amber-soft)', color: 'var(--amber)' }
            : { background: 'var(--green-light)', color: 'var(--green)' }
        }
      >
        {shortfall ? <AlertTriangle size={16} /> : <Check size={16} />}
        {shortfall ? `Not ready for dispatch - ${shortfall}` : 'Crew ready for dispatch'}
      </div>

      {renderPicker('EMT', emts)}
      {renderPicker('NURSE', nurses)}
    </div>
  );
}

export default CrewAssignmentCard;
