import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Phone, Ambulance, Navigation as NavigationIcon, Car, HeartPulse, Stethoscope } from 'lucide-react';
import { getActiveTask, getMyCheckIn } from '@/api/responder';
import { useAuthStore } from '@/stores/authStore';
import ShiftCheckInCard from '@/components/operator/ShiftCheckInCard';
import CrewAssignmentCard from '@/components/operator/CrewAssignmentCard';
import AvailableAmbulancesCard from '@/components/operator/AvailableAmbulancesCard';
import StatusBadge from '@/components/operator/StatusBadge';
import { inAppNavigateUrl } from '@/utils/navigateUrl';

function CrewMemberRow({ icon, role, name, phone }: { icon: React.ReactNode; role: string; name: string; phone?: string | null }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)' }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--muted)' }}>{role}</p>
        <p className="text-base font-bold mt-0.5" style={{ color: 'var(--ink)' }}>{name}</p>
        {phone && <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{phone}</p>}
      </div>
      {phone && (
        <a href={`tel:${phone}`} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--green)' }}>
          <Phone size={16} color="#fff" />
        </a>
      )}
    </div>
  );
}

function CrewPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { data: task } = useQuery({ queryKey: ['operator', 'active-task'], queryFn: getActiveTask });
  const { data: myVehicle } = useQuery({ queryKey: ['operator', 'my-checkin'], queryFn: getMyCheckIn });

  // Drivers get the in-app map (see NavigatePage); other crew still open Google Maps.
  const inAppMapsUrl = task ? inAppNavigateUrl(task.incident.lat, task.incident.lng, task.incident.locationName) : null;
  const externalMapsUrl = task?.incident.lat != null && task?.incident.lng != null
    ? `https://maps.google.com/?q=${task.incident.lat},${task.incident.lng}`
    : null;

  return (
    <div className="col" style={{ gap: 20 }}>
      <div>
        <p className="eyebrow">Field Operations</p>
        <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Crew</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Check-in, locations &amp; team</p>
      </div>

      <ShiftCheckInCard />
      {myVehicle && <CrewAssignmentCard myVehicle={myVehicle} />}
      <AvailableAmbulancesCard />

      {task ? (
        <>
          <div className="card card-pad">
            <div className="flex items-center justify-between">
              <p className="label">Active case</p>
              <StatusBadge status={task.status} />
            </div>
            <p className="text-xl font-bold mt-2" style={{ color: 'var(--ink)' }}>{task.incident.caseNumber}</p>
          </div>

          <div className="card card-pad">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--nav-bg)' }}>
                <Ambulance size={26} color="#fff" />
              </div>
              <div>
                <p className="eyebrow">Ambulance</p>
                <p className="text-lg font-bold mt-0.5" style={{ color: 'var(--ink)' }}>{task.vehicle.registrationNumber}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>IMEI {task.vehicle.imei}</p>
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <p className="label mb-1">Crew members</p>
            {task.driver ? (
              <CrewMemberRow icon={<Car size={18} style={{ color: 'var(--green)' }} />} role="Driver" name={task.driver.name} phone={task.driver.phone} />
            ) : null}
            {task.emt ? (
              <CrewMemberRow icon={<Stethoscope size={18} style={{ color: 'var(--green)' }} />} role="EMT" name={task.emt.name} phone={task.emt.phone} />
            ) : (
              <p className="text-sm py-2" style={{ color: 'var(--muted)' }}>No EMT assigned to this case.</p>
            )}
            {task.nurse && (
              <CrewMemberRow icon={<HeartPulse size={18} style={{ color: 'var(--green)' }} />} role="Nurse" name={task.nurse.name} phone={task.nurse.phone} />
            )}
          </div>

          {user?.role === 'DRIVER' && inAppMapsUrl ? (
            <button onClick={() => navigate(inAppMapsUrl)} className="btn btn-block" style={{ background: 'var(--nav-bg)', color: '#fff' }}>
              <NavigationIcon size={18} /> Navigate to scene
            </button>
          ) : externalMapsUrl && (
            <a href={externalMapsUrl} target="_blank" rel="noreferrer" className="btn btn-block" style={{ background: 'var(--nav-bg)', color: '#fff' }}>
              <NavigationIcon size={18} /> Navigate to scene
            </a>
          )}
        </>
      ) : null}
    </div>
  );
}

export default CrewPage;
