import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ambulance, MapPin, Phone } from 'lucide-react';
import { getAgencyVehicles, getMyCheckIn, getPartnerAmbulances } from '@/api/responder';
import Map from '@/components/shared/Map';
import type { PartnerAmbulance, Vehicle } from '@/types/api';

function statusLabel(v: Vehicle) {
  if (v.isActive === false) return 'Offline';
  if (v.status === 'BUSY') return 'On case';
  if (v.status === 'MAINTENANCE') return 'Maintenance';
  if (v.currentDriver) return 'Available';
  return 'No driver';
}

function statusColor(v: Vehicle) {
  if (v.status === 'BUSY') return 'var(--green)';
  if (v.status === 'MAINTENANCE') return 'var(--muted)';
  if (v.currentDriver) return 'var(--green)';
  return 'var(--red)';
}

function placeLabel(v: Vehicle) {
  const name = v.lastLocationName || v.checkInLocationName;
  if (name && !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(name.trim())) return name;
  if (v.lastLat != null && v.lastLng != null) return 'Resolving place name…';
  return 'No GPS yet';
}

function formatShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function PartnerRow({ p }: { p: PartnerAmbulance }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border p-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <span className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: 'var(--muted)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{p.registrationNumber}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          No GPS · {p.agency?.name ?? 'County / EOC'}{p.vehicleType ? ` · ${p.vehicleType}` : ''}
        </p>
        {(p.baseLocation || p.notes) && (
          <div className="flex items-center gap-1 mt-1">
            <MapPin size={12} style={{ color: 'var(--green)' }} />
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{p.baseLocation || p.notes}</p>
          </div>
        )}
        {p.contactPhone && (
          <a href={`tel:${p.contactPhone}`} className="flex items-center gap-1 mt-1">
            <Phone size={12} style={{ color: 'var(--green)' }} />
            <span className="text-xs" style={{ color: 'var(--green)' }}>
              {p.contactName ? `${p.contactName} · ` : ''}{p.contactPhone}
            </span>
          </a>
        )}
      </div>
    </div>
  );
}

function AvailableAmbulancesCard() {
  const { data: vehicles = [], isLoading } = useQuery({ queryKey: ['operator', 'agency-vehicles'], queryFn: getAgencyVehicles });
  const { data: partnerAmbulances = [] } = useQuery({ queryKey: ['operator', 'partner-ambulances'], queryFn: getPartnerAmbulances });
  const { data: myVehicle } = useQuery({ queryKey: ['operator', 'my-checkin'], queryFn: getMyCheckIn });

  const withCoords = useMemo(() => vehicles.filter((v) => v.lastLat != null && v.lastLng != null), [vehicles]);
  const available = useMemo(() => vehicles.filter((v) => v.status === 'READY' && !!v.currentDriver && v.isActive !== false), [vehicles]);

  const center = useMemo((): [number, number] => {
    const focus = myVehicle?.lastLat != null && myVehicle?.lastLng != null ? myVehicle : withCoords[0];
    if (!focus?.lastLat || !focus?.lastLng) return [-1.2921, 36.8219];
    return [focus.lastLat, focus.lastLng];
  }, [myVehicle, withCoords]);

  const markers = withCoords.map((v) => ({
    id: v.id,
    lat: v.lastLat!,
    lng: v.lastLng!,
    title: `${v.registrationNumber} · ${statusLabel(v)}`,
    type: 'vehicle' as const,
  }));

  return (
    <div className="card card-pad">
      <div className="flex gap-3.5 mb-3.5">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--nav-bg)' }}>
          <Ambulance size={22} color="#fff" />
        </div>
        <div className="flex-1">
          <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Ambulances &amp; locations</p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            {available.length} tracked ready · {partnerAmbulances.length} no tracker
          </p>
        </div>
      </div>

      {withCoords.length > 0 && (
        <div className="rounded-xl overflow-hidden border mb-3.5" style={{ height: 220, borderColor: 'var(--border)' }}>
          <Map center={center} zoom={11} markers={markers} />
        </div>
      )}

      {isLoading ? (
        <div className="skel" style={{ height: 60 }} />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between mt-2">
            <p className="label">With tracker</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{vehicles.length}</p>
          </div>
          {vehicles.length === 0 ? (
            <p className="text-sm mb-2" style={{ color: 'var(--muted)' }}>No GPS-tracked ambulances found for your agency.</p>
          ) : (
            vehicles.map((v) => {
              const isMine = myVehicle?.id === v.id;
              return (
                <div
                  key={v.id}
                  className="flex items-start gap-2.5 rounded-xl border p-3"
                  style={{ background: isMine ? 'var(--green-light)' : 'var(--surface)', borderColor: isMine ? 'var(--green)' : 'var(--border)' }}
                >
                  <span className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: statusColor(v) }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{v.registrationNumber}{isMine ? ' · You' : ''}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                      {statusLabel(v)}{v.currentDriver ? ` · ${v.currentDriver.name}` : ''}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin size={12} style={{ color: 'var(--green)' }} />
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        {placeLabel(v)}{v.checkedInAt && v.currentDriver ? ` · since ${formatShortTime(v.checkedInAt)}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          <div className="flex items-center justify-between mt-3">
            <p className="label">No tracker · reference only</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{partnerAmbulances.length}</p>
          </div>
          {partnerAmbulances.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No no-tracker ambulances on the roster.</p>
          ) : (
            partnerAmbulances.map((p) => <PartnerRow key={p.id} p={p} />)
          )}
        </div>
      )}
    </div>
  );
}

export default AvailableAmbulancesCard;
