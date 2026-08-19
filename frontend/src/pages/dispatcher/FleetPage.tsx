import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CirclePlus as PlusCircle,
  Search as MagnifyingGlass,
  Download,
  X,
  Map as MapTrifold,
  Crosshair,
  Gauge,
  Hash,
  Navigation as NavigationArrow,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '@/api/client';
import { Vehicle } from '@/types/api';
import Map from '@/components/shared/Map';
import AddVehicleModal from '@/components/shared/AddVehicleModal';
import { useVehicleTracking, getVehicleTrackingStatus, LiveVehicle } from '@/hooks/useVehicleTracking';
import { useNotificationStore } from '@/stores/notificationStore';
import VehicleDispatchPanel from '@/components/shared/VehicleDispatchPanel';

type StatusFilter = 'ALL' | 'ready' | 'no-driver' | 'engaged' | 'unavailable';

const S_PILL: Record<string, string> = {
  ready:       'pill-green',
  'no-driver': 'pill-amber',
  engaged:     'pill-red',
  unavailable: 'pill-gray',
};

const S_LABEL: Record<string, string> = {
  ready:       'Ready',
  'no-driver': 'No Driver',
  engaged:     'Engaged',
  unavailable: 'Unavailable',
};

function FleetPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [focusPos, setFocusPos] = useState<[number, number] | undefined>();
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clickedVehicle, setClickedVehicle] = useState<LiveVehicle | null>(null);

  const { addNotification } = useNotificationStore();
  const { vehicles: liveVehicles, lastUpdatedAt } = useVehicleTracking();

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['admin', 'vehicles'],
    queryFn: async () => {
      const res = await api.get('/dispatch/vehicles');
      return res.data.data as Vehicle[];
    },
  });

  const total = vehicles.length;
  const readyCount = liveVehicles.filter((v) => getVehicleTrackingStatus(v) === 'ready').length;
  const engagedCount = liveVehicles.filter((v) => getVehicleTrackingStatus(v) === 'engaged').length
    || vehicles.filter((v) => v.status === 'BUSY').length;
  const noDriverCount = liveVehicles.filter((v) => getVehicleTrackingStatus(v) === 'no-driver').length;
  const unavailableCount = liveVehicles.filter((v) => getVehicleTrackingStatus(v) === 'unavailable').length;

  const filtered = vehicles.filter((v) => {
    const q = search.toLowerCase();
    const matchSearch = !q || v.registrationNumber.toLowerCase().includes(q) || v.imei.toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (statusFilter === 'ALL') return true;
    const live = liveVehicles.find((lv) => lv.registration === v.registrationNumber);
    const s = live
      ? getVehicleTrackingStatus(live)
      : v.status === 'MAINTENANCE' ? 'unavailable' : v.isActive ? 'no-driver' : 'unavailable';
    return s === statusFilter;
  });

  function exportCSV() {
    const headers = ['Registration', 'IMEI', 'Status', 'Speed (km/h)', 'Last Seen', 'Lat', 'Lng'];
    const rows = filtered.map((v) => {
      const live = liveVehicles.find((lv) => lv.registration === v.registrationNumber);
      const s = live ? getVehicleTrackingStatus(live) : 'offline';
      return [
        v.registrationNumber, v.imei, S_LABEL[s] ?? s,
        live?.speed ?? '-',
        live?.timestamp ? new Date(live.timestamp).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' }) : v.lastLocationAt ? new Date(v.lastLocationAt).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' }) : 'N/A',
        live?.lat ?? v.lastLat ?? '', live?.lng ?? v.lastLng ?? '',
      ];
    });
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Fleet_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    addNotification({ type: 'success', title: 'Exported', message: 'Fleet roster downloaded.' });
  }

  const selectedLive = selected
    ? liveVehicles.find((lv) => lv.registration === selected.registrationNumber)
    : null;

  return (
    <div style={{ display: 'flex', minHeight: '100%' }}>
      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, transition: 'margin .2s', marginRight: selected ? 360 : 0 }}>

        {/* Page header */}
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
            <div className="section-title" style={{ fontSize: 20 }}>Fleet Management</div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>Ambulance fleet status and GPS tracking</div>
          </div>
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <PlusCircle size={16} /> Add Vehicle
          </button>
        </div>

        {/* Stat grid */}
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          {[
            { label: 'Total Fleet',  value: total,            note: `${liveVehicles.length} with GPS` },
            { label: 'Ready',        value: readyCount,       note: 'Has driver, available' },
            { label: 'Engaged',      value: engagedCount,     note: 'On active mission' },
            { label: 'Unavailable',  value: unavailableCount, note: 'Maintenance / offline' },
          ].map((card) => (
            <div className="stat" key={card.label}>
              <div className="stat-label">{card.label}</div>
              <div className="stat-val">{card.value}</div>
              <div className="stat-foot">{card.note}</div>
            </div>
          ))}
        </div>

        {/* Vehicle table */}
        <div className="card" style={{ marginBottom: 16 }}>
          {/* Toolbar */}
          <div className="card-head">
            <span className="card-title">Active Vehicles</span>
            <div className="row" style={{ gap: 8 }}>
              <div className="searchbox" style={{ minWidth: 180 }}>
                <MagnifyingGlass size={15} />
                <input
                  placeholder="Registration or IMEI…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className="eoc-select"
                style={{ height: 36, width: 'auto', padding: '0 10px' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              >
                <option value="ALL">All Status</option>
                <option value="ready">Ready</option>
                <option value="no-driver">No Driver</option>
                <option value="engaged">Engaged</option>
                <option value="unavailable">Unavailable</option>
              </select>
              <button className="icon-btn" onClick={exportCSV} title="Download CSV">
                <Download size={16} />
              </button>
            </div>
          </div>

          <div className="tbl-wrap">
            <table className="tbl" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Status</th>
                  <th>Registration</th>
                  <th>IMEI</th>
                  <th>Last Seen</th>
                  <th>Coordinates</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>Syncing fleet…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>No units match filter</td></tr>
                ) : filtered.map((v) => {
                  const live = liveVehicles.find((lv) => lv.registration === v.registrationNumber);
                  const s = live
                    ? getVehicleTrackingStatus(live)
                    : v.status === 'MAINTENANCE' ? 'unavailable' : v.isActive ? 'no-driver' : 'unavailable';
                  const lat = live?.lat ?? v.lastLat;
                  const lng = live?.lng ?? v.lastLng;
                  const ts = live?.timestamp ?? v.lastLocationAt;
                  const unitLabel = `UNIT-${v.registrationNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(-4)}`;
                  const isSelected = selected?.id === v.id;

                  return (
                    <tr key={v.id} onClick={() => setSelected(isSelected ? null : v)} style={isSelected ? { background: 'color-mix(in srgb, var(--green) 6%, transparent)' } : undefined}>
                      <td>
                        <div className="row" style={{ gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <NavigationArrow
                              size={16}
                              color={s === 'ready' ? 'var(--green)' : s === 'engaged' ? 'var(--red)' : s === 'no-driver' ? 'var(--amber)' : 'var(--muted-2)'}
                              style={{ transform: live?.heading ? `rotate(${live.heading}deg)` : undefined }}
                            />
                          </div>
                          <div>
                            <div className="strong" style={{ fontSize: 13.5 }}>{unitLabel}</div>
                            <div className="muted" style={{ fontSize: 12 }}>Ambulance</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${S_PILL[s] ?? 'pill-gray'}`}>
                          <span className="dot" style={{ animation: s === 'ready' ? 'pulse-ring 2s infinite' : undefined }} />
                          {S_LABEL[s] ?? s}
                        </span>
                      </td>
                      <td className="mono strong" style={{ fontSize: 13 }}>{v.registrationNumber}</td>
                      <td className="mono muted" style={{ fontSize: 12 }}>{v.imei}</td>
                      <td>
                        <div style={{ fontSize: 13.5 }}>{ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : 'N/A'}</div>
                        {live && live.speed > 0 && (
                          <div className="muted row" style={{ fontSize: 12, gap: 4, marginTop: 2 }}>
                            <Gauge size={11} /> {live.speed} km/h
                          </div>
                        )}
                      </td>
                      <td className="mono" style={{ fontSize: 12, color: lat && lng ? 'var(--green)' : 'var(--muted-2)' }}>
                        {lat && lng ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : 'No signal'}
                      </td>
                      <td>
                        <button
                          className="icon-btn"
                          disabled={!lat || !lng}
                          onClick={(e) => { e.stopPropagation(); if (lat && lng) setFocusPos([lat, lng]); }}
                          title="Locate on map"
                          style={{ width: 30, height: 30 }}
                        >
                          <Crosshair size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
            Showing {filtered.length} of {total} unit{total !== 1 ? 's' : ''}
            {lastUpdatedAt && ` · GPS updated ${formatDistanceToNow(lastUpdatedAt, { addSuffix: true })}`}
          </div>
        </div>

        {/* Telemetry + Live Map */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          {/* Telemetry */}
          <div className="card card-pad">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
              <span className="card-title">Real-time Telemetry</span>
              <span className="live-badge"><span className="dot live-dot" /> Live</span>
            </div>
            <div className="bars" style={{ height: 120 }}>
              {liveVehicles.length > 0 ? liveVehicles.map((v) => {
                const s = getVehicleTrackingStatus(v);
                const h = s === 'ready' ? Math.max(40, Math.min(95, 40 + (v.speed / 120) * 55)) : s === 'engaged' ? 65 : s === 'no-driver' ? 35 : 12;
                const bg = s === 'ready' ? 'var(--green)' : s === 'engaged' ? 'var(--red)' : s === 'no-driver' ? 'var(--amber)' : 'var(--muted-2)';
                return (
                  <div key={v.vehicleId} className="bar" title={`${v.registration} · ${S_LABEL[s] ?? s}`}>
                    <span style={{ background: bg, height: `${h}%`, width: '100%', display: 'block', borderRadius: '5px 5px 0 0', position: 'absolute', bottom: 0 }} />
                  </div>
                );
              }) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-2)' }}>
                  <NavigationArrow size={32} />
                </div>
              )}
            </div>
            <div className="divider" style={{ margin: '12px 0' }} />
            <div className="row" style={{ gap: 24 }}>
              {[
                { label: 'Ready',       value: readyCount,       color: 'var(--green)' },
                { label: 'Engaged',     value: engagedCount,     color: 'var(--red)' },
                { label: 'No Driver',   value: noDriverCount,    color: 'var(--amber)' },
                { label: 'Unavailable', value: unavailableCount, color: 'var(--muted-2)' },
              ].map((d) => (
                <div key={d.label}>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>{d.label}</div>
                  <div className="mono strong" style={{ fontSize: 18, color: d.color }}>{d.value}</div>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={exportCSV}>
                <Download size={14} /> Export CSV
              </button>
            </div>
          </div>

          {/* Live map panel */}
          <div style={{ background: 'var(--nav-bg)', borderRadius: 'var(--radius)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 8 }}>
                <MapTrifold size={16} color="var(--green-bright)" />
                <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Live Map</span>
              </div>
              <span className="live-badge" style={{ color: '#5FD79A' }}><span className="dot live-dot" /> Live</span>
            </div>
            <div style={{ flex: 1, minHeight: 220, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,.1)' }}>
              <Map
                center={[-1.2921, 36.8219]}
                zoom={11}
                vehicleMarkers={liveVehicles}
                layerType="dark"
                showLiveBadge
                showLegend
                focusPosition={focusPos}
                lastUpdatedAt={lastUpdatedAt}
                onVehicleClick={(v) => setClickedVehicle(v)}
              />
            </div>
            <button className="btn btn-ghost" style={{ borderColor: 'rgba(95,215,154,.3)', color: '#5FD79A' }} onClick={() => setIsFullscreen(true)}>
              <MapTrifold size={14} /> Full screen map
            </button>
          </div>
        </div>
      </div>

      {/* Vehicle detail drawer */}
      {selected && (
        <div className="drawer" style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 360, zIndex: 30 }}>
          <div className="card-head" style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
            <div>
              <div className="eyebrow">Vehicle Detail</div>
              <div className="card-title">{selected.registrationNumber}</div>
            </div>
            <button className="icon-btn" onClick={() => setSelected(null)}><X size={16} /></button>
          </div>
          <div className="card-pad col" style={{ gap: 16, overflowY: 'auto', flex: 1 }}>
            {(() => {
              const s = selectedLive ? getVehicleTrackingStatus(selectedLive) : selected.status === 'MAINTENANCE' ? 'maintenance' : selected.isActive ? 'stopped' : 'offline';
              return (
                <span className={`pill ${S_PILL[s] ?? 'pill-gray'}`} style={{ alignSelf: 'flex-start', fontSize: 13, padding: '6px 12px' }}>
                  <span className="dot" style={{ animation: s === 'ready' ? 'pulse-ring 2s infinite' : undefined }} />
                  {S_LABEL[s] ?? s}
                  {selectedLive?.speed ? ` · ${selectedLive.speed} km/h` : ''}
                </span>
              );
            })()}

            {(selectedLive?.lat ?? selected.lastLat) && (selectedLive?.lng ?? selected.lastLng) && (
              <div style={{ height: 176, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <Map
                  center={[selectedLive?.lat ?? selected.lastLat!, selectedLive?.lng ?? selected.lastLng!]}
                  zoom={14}
                  vehicleMarkers={selectedLive ? [selectedLive] : []}
                />
              </div>
            )}

            {[
              { Icon: Hash, label: 'IMEI', value: selected.imei },
              { Icon: NavigationArrow, label: 'Heading', value: selectedLive?.heading != null ? `${selectedLive.heading}°` : '-' },
              { Icon: Gauge, label: 'Speed', value: selectedLive?.speed != null ? `${selectedLive.speed} km/h` : '-' },
              {
                Icon: MapTrifold, label: 'Location',
                value: selected.lastLocationName
                  || ((selectedLive?.lat ?? selected.lastLat)
                    ? `${(selectedLive?.lat ?? selected.lastLat)!.toFixed(5)}, ${(selectedLive?.lng ?? selected.lastLng)!.toFixed(5)}`
                    : 'No signal'),
              },
              {
                Icon: MapTrifold, label: 'Coordinates',
                value: (selectedLive?.lat ?? selected.lastLat)
                  ? `${(selectedLive?.lat ?? selected.lastLat)!.toFixed(5)}, ${(selectedLive?.lng ?? selected.lastLng)!.toFixed(5)}`
                  : 'No signal',
              },
            ].map(({ Icon, label, value }) => (
              <div key={label} className="row" style={{ gap: 12, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon size={15} color="var(--muted)" />
                </div>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 2 }}>{label}</div>
                  <div className="mono" style={{ fontSize: 13, color: 'var(--ink)' }}>{value}</div>
                </div>
              </div>
            ))}

            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                <div className="eyebrow">Current Crew</div>
              </div>
              {[
                { role: 'Driver', person: selected.currentDriver },
                { role: 'EMT', person: selected.currentEmt },
                { role: 'Nurse', person: selected.currentNurse },
              ].map(({ role, person }) => (
                <div key={role} className="row" style={{ justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 600, width: 50 }}>{role}</div>
                  {person ? (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{person.name}</div>
                      {person.phone && <div className="muted" style={{ fontSize: 12 }}>{person.phone}</div>}
                    </div>
                  ) : (
                    <div className="muted" style={{ fontSize: 12, fontStyle: 'italic' }}>Not checked in</div>
                  )}
                </div>
              ))}
            </div>

            {(selectedLive?.timestamp ?? selected.lastLocationAt) && (
              <div className="muted" style={{ textAlign: 'center', fontSize: 12 }}>
                Last GPS ping {formatDistanceToNow(new Date(selectedLive?.timestamp ?? selected.lastLocationAt!), { addSuffix: true })}
              </div>
            )}

            <button
              className="btn btn-primary btn-block"
              disabled={!selectedLive?.lat && !selected.lastLat}
              onClick={() => {
                const lat = selectedLive?.lat ?? selected.lastLat;
                const lng = selectedLive?.lng ?? selected.lastLng;
                if (lat && lng) { setFocusPos([lat, lng]); setSelected(null); }
              }}
            >
              <Crosshair size={16} /> Locate on map
            </button>
          </div>
        </div>
      )}

      <AddVehicleModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {/* Fullscreen map overlay */}
      {isFullscreen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#000', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', background: 'var(--nav-bg)', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
            <MapTrifold size={16} color="var(--green-bright)" />
            <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Live Fleet Map</span>
            <span className="live-badge" style={{ color: '#5FD79A', marginLeft: 8 }}><span className="dot live-dot" /> Live</span>
            <button className="icon-btn" style={{ marginLeft: 'auto', borderColor: 'rgba(255,255,255,.15)', background: 'transparent', color: 'rgba(255,255,255,.6)' }} onClick={() => setIsFullscreen(false)}>
              <X size={16} />
            </button>
          </div>
          <div style={{ flex: 1 }}>
            <Map
              center={[-1.2921, 36.8219]}
              zoom={11}
              vehicleMarkers={liveVehicles}
              layerType="dark"
              showLiveBadge
              showLegend
              focusPosition={focusPos}
              lastUpdatedAt={lastUpdatedAt}
              onVehicleClick={(v) => setClickedVehicle(v)}
            />
          </div>
        </div>
      )}

      {clickedVehicle && (
        <VehicleDispatchPanel
          clickedVehicle={clickedVehicle}
          onClose={() => setClickedVehicle(null)}
        />
      )}
    </div>
  );
}

export default FleetPage;
