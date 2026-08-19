import { useEffect, useRef, useState, ReactNode } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { loadMapsLibrary, mapsReady } from '@/lib/mapsLoader';
import { LiveVehicle, VehicleTrackingStatus, getVehicleTrackingStatus } from '@/hooks/useVehicleTracking';

import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

// ── Static marker ─────────────────────────────────────────────────────────────

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  type: 'incident' | 'vehicle' | 'facility';
}

const incidentIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// ── Vehicle marker system ─────────────────────────────────────────────────────

const STATUS_PALETTE: Record<VehicleTrackingStatus, { bg: string; light: string; ring: string }> = {
  ready:       { bg: '#15803d', light: '#22c55e', ring: 'rgba(34,197,94,0.18)' },
  'no-driver': { bg: '#a16207', light: '#eab308', ring: 'rgba(234,179,8,0.18)' },
  engaged:     { bg: '#b91c1c', light: '#ef4444', ring: 'rgba(239,68,68,0.16)' },
  unavailable: { bg: '#374151', light: '#6b7280', ring: 'rgba(107,114,128,0.12)' },
};

const STATUS_LABEL: Record<VehicleTrackingStatus, string> = {
  ready: 'READY', 'no-driver': 'NO DRIVER', engaged: 'ENGAGED', unavailable: 'UNAVAILABLE',
};

function secsAgo(ts: string): string {
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function vehicleSvg(status: VehicleTrackingStatus, speed: number): string {
  const p = STATUS_PALETTE[status];
  const isMoving = status === 'ready';
  const pulse = isMoving
    ? `<circle cx="37" cy="37" r="20" fill="none" stroke="${p.light}" stroke-width="2">
         <animate attributeName="r" values="18;26;18" dur="2s" repeatCount="indefinite"/>
         <animate attributeName="opacity" values="0.7;0;0.7" dur="2s" repeatCount="indefinite"/>
       </circle>` : '';
  const badge = speed > 2
    ? `<circle cx="62" cy="8" r="9" fill="${p.bg}" stroke="white" stroke-width="1.5"/>
       <text x="62" y="12" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="7" font-weight="800">${Math.round(speed)}</text>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="31" viewBox="0 0 74 44" overflow="visible">
      ${pulse}

      <!-- Ambulance body -->
      <rect x="4" y="10" width="46" height="23" rx="3" fill="${p.light}" stroke="${p.bg}" stroke-width="1.5"/>

      <!-- Cab -->
      <path d="M50,33 L50,17 Q50,10 57,10 L64,10 Q70,10 70,17 L70,33 Z" fill="${p.light}" stroke="${p.bg}" stroke-width="1.5"/>

      <!-- Cab windshield -->
      <path d="M53,31 L53,18 Q53,13 59,13 L68,13 L68,31 Z" fill="rgba(200,240,255,0.75)" stroke="${p.bg}" stroke-width="1"/>

      <!-- Roof siren bar -->
      <rect x="14" y="5" width="28" height="6" rx="2" fill="${p.bg}"/>
      <rect x="16" y="6" width="7" height="4" rx="1" fill="#ef4444"/>
      <rect x="25" y="6" width="7" height="4" rx="1" fill="#2563eb"/>

      <!-- Red cross panel -->
      <rect x="8" y="13" width="20" height="15" rx="2" fill="white" opacity="0.92"/>
      <rect x="15" y="14" width="4" height="13" rx="0.5" fill="#e11d48"/>
      <rect x="9" y="18" width="18" height="4" rx="0.5" fill="#e11d48"/>

      <!-- Undercarriage -->
      <rect x="4" y="31" width="66" height="3" rx="1" fill="${p.bg}" opacity="0.7"/>

      <!-- Rear door line -->
      <line x1="6" y1="12" x2="6" y2="31" stroke="${p.bg}" stroke-width="1.2"/>

      <!-- Front bumper -->
      <rect x="68" y="26" width="4" height="9" rx="2" fill="${p.bg}"/>

      <!-- Headlight -->
      <rect x="68" y="18" width="3" height="5" rx="1.5" fill="#fef08a"/>

      <!-- Rear light -->
      <rect x="4" y="18" width="3" height="5" rx="1.5" fill="#fca5a5"/>

      <!-- Wheels -->
      <circle cx="18" cy="35" r="7" fill="#1e293b" stroke="#94a3b8" stroke-width="1.5"/>
      <circle cx="18" cy="35" r="3.5" fill="#475569"/>
      <circle cx="18" cy="35" r="1.5" fill="#94a3b8"/>

      <circle cx="55" cy="35" r="7" fill="#1e293b" stroke="#94a3b8" stroke-width="1.5"/>
      <circle cx="55" cy="35" r="3.5" fill="#475569"/>
      <circle cx="55" cy="35" r="1.5" fill="#94a3b8"/>

      ${badge}
    </svg>`;
}

function createVehicleIcon(status: VehicleTrackingStatus, speed: number): L.DivIcon {
  return L.divIcon({
    html: vehicleSvg(status, speed),
    className: '',
    iconSize: [52, 31],
    iconAnchor: [26, 25],
    popupAnchor: [0, -25],
  });
}

function vehiclePopupHtml(v: LiveVehicle, status: VehicleTrackingStatus): string {
  const p = STATUS_PALETTE[status];
  return `<div style="font-family:system-ui,sans-serif;min-width:200px;padding:2px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span style="font-size:14px;font-weight:900;color:#000000;letter-spacing:-0.02em">${v.registration}</span>
      <span style="background:${p.bg};color:white;font-size:9px;font-weight:800;padding:3px 9px;border-radius:20px;letter-spacing:0.07em">${STATUS_LABEL[status]}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 16px;font-size:11px">
      <div style="color:#64748b;font-weight:600">Speed</div><div style="color:#000000;font-weight:800">${Math.round(v.speed)} km/h</div>
      <div style="color:#64748b;font-weight:600">Ignition</div><div style="color:${v.ignition ? '#15803d' : '#dc2626'};font-weight:800">${v.ignition ? 'ON' : 'OFF'}</div>
      <div style="color:#64748b;font-weight:600">Heading</div><div style="color:#000000;font-weight:800">${v.heading}°</div>
      <div style="color:#64748b;font-weight:600">Last seen</div><div style="color:#000000;font-weight:800">${secsAgo(v.timestamp)}</div>
    </div>
    <div style="margin-top:9px;padding-top:7px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;font-family:monospace;font-weight:700">IMEI ${v.imei}</div>
  </div>`;
}

// ── Google Maps canvas ────────────────────────────────────────────────────────

// AdvancedMarkerElement requires a mapId; DEMO_MAP_ID is Google's documented
// default for apps without a custom cloud style. Override via env if one is
// created in the Cloud Console later.
const MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || 'DEMO_MAP_ID';

interface VehicleEntry {
  marker: google.maps.marker.AdvancedMarkerElement;
  status: VehicleTrackingStatus;
  speed: number;
  vehicle: LiveVehicle;
}

interface GoogleCanvasProps {
  center: [number, number];
  zoom: number;
  markers: MapMarker[];
  vehicleMarkers: LiveVehicle[];
  layerType: 'light' | 'dark' | 'street';
  /** Turn-by-turn path (e.g. from fetchDrivingRoute) drawn as a line over the map. */
  routePath?: [number, number][];
  onLocationSelect?: (lat: number, lng: number) => void;
  /** Fired on vehicle marker click; parent decides between dispatch panel and fly-to */
  onVehicleMarkerClick: (v: LiveVehicle) => void;
  /** When false, vehicle clicks open the default info window */
  suppressVehiclePopup: boolean;
  flyTarget: [number, number, number] | null;
  onFail: () => void;
}

function GoogleCanvas({
  center, zoom, markers, vehicleMarkers, layerType, routePath,
  onLocationSelect, onVehicleMarkerClick, suppressVehiclePopup, flyTarget, onFail,
}: GoogleCanvasProps) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const trafficRef = useRef<google.maps.TrafficLayer | null>(null);
  const vehiclePool = useRef<Record<string, VehicleEntry>>({});
  const staticPool = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const staticSigRef = useRef('');
  const routeLineRef = useRef<google.maps.Polyline | null>(null);
  const [ready, setReady] = useState(false);
  const [traffic, setTraffic] = useState(false);

  const lat = center[0];
  const lng = center[1];

  // Init once
  useEffect(() => {
    let cancelled = false;
    // Google reports bad key / blocked referrer through this global - fall back to Leaflet
    (window as any).gm_authFailure = () => onFail();
    (async () => {
      try {
        await loadMapsLibrary('maps');
        await loadMapsLibrary('marker');
        if (cancelled || !divRef.current || mapRef.current) return;
        mapRef.current = new google.maps.Map(divRef.current, {
          center: { lat, lng },
          zoom,
          mapId: MAP_ID,
          colorScheme: (layerType === 'dark' ? 'DARK' : 'LIGHT') as google.maps.ColorScheme,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
        });
        infoRef.current = new google.maps.InfoWindow({ maxWidth: 260 });
        setReady(true);
      } catch {
        if (!cancelled) onFail();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync centre/zoom only when the actual values change - live-data re-renders
  // must not snap the view back while the dispatcher is panning
  useEffect(() => { if (ready) mapRef.current?.setCenter({ lat, lng }); }, [ready, lat, lng]);
  useEffect(() => { if (ready) mapRef.current?.setZoom(zoom); }, [ready, zoom]);

  // Fly-to (vehicle strip / fleet table / marker clicks)
  useEffect(() => {
    if (!ready || !flyTarget || !mapRef.current) return;
    mapRef.current.panTo({ lat: flyTarget[0], lng: flyTarget[1] });
    mapRef.current.setZoom(16);
  }, [ready, flyTarget]);

  // Click-to-select (incident wizard, facility pin)
  useEffect(() => {
    if (!ready || !onLocationSelect || !mapRef.current) return;
    const listener = mapRef.current.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) onLocationSelect(e.latLng.lat(), e.latLng.lng());
    });
    return () => listener.remove();
  }, [ready, onLocationSelect]);

  // Traffic layer toggle
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (traffic) {
      trafficRef.current = trafficRef.current ?? new google.maps.TrafficLayer();
      trafficRef.current.setMap(mapRef.current);
    } else {
      trafficRef.current?.setMap(null);
    }
  }, [ready, traffic]);

  // Static markers (incidents / facilities) - rebuilt only when they actually change
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const sig = markers.map(m => `${m.id}:${m.lat}:${m.lng}:${m.title}`).join('|');
    if (sig === staticSigRef.current) return;
    staticSigRef.current = sig;

    staticPool.current.forEach(m => { m.map = null; });
    staticPool.current = markers.map(m => {
      const pin = new google.maps.marker.PinElement({
        background: '#dc2626', borderColor: '#7f1d1d', glyphColor: '#ffffff', scale: 1.1,
      });
      const am = new google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current,
        position: { lat: m.lat, lng: m.lng },
        content: pin.element,
        title: m.title,
        zIndex: 10,
      });
      am.addListener('click', () => {
        const el = document.createElement('div');
        el.style.cssText = 'font-family:system-ui,sans-serif;font-weight:700;font-size:13px;padding:2px';
        el.textContent = m.title;
        infoRef.current?.setContent(el);
        infoRef.current?.open({ map: mapRef.current!, anchor: am });
      });
      return am;
    });
  }, [ready, markers]);

  // Route line (turn-by-turn path) - drawn once and repathed in place on change
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (!routePath || routePath.length < 2) {
      routeLineRef.current?.setMap(null);
      routeLineRef.current = null;
      return;
    }
    const path = routePath.map(([lat, lng]) => ({ lat, lng }));
    if (routeLineRef.current) {
      routeLineRef.current.setPath(path);
    } else {
      routeLineRef.current = new google.maps.Polyline({
        path,
        map: mapRef.current,
        strokeColor: '#2563EB',
        strokeWeight: 5,
        strokeOpacity: 0.9,
        zIndex: 5,
      });
    }
  }, [ready, routePath]);

  // Vehicle markers - pooled by vehicleId so positions update in place without
  // recreating DOM (keeps the pulse animation smooth on live updates)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const pool = vehiclePool.current;
    const seen = new Set<string>();

    vehicleMarkers.forEach(v => {
      const status = getVehicleTrackingStatus(v);
      const speed = Math.round(v.speed);
      seen.add(v.vehicleId);
      const existing = pool[v.vehicleId];

      if (existing) {
        existing.vehicle = v;
        existing.marker.position = { lat: v.lat, lng: v.lng };
        if (existing.status !== status || existing.speed !== speed) {
          const el = document.createElement('div');
          el.style.cssText = 'cursor:pointer;transform:translateY(28%)';
          el.innerHTML = vehicleSvg(status, v.speed);
          existing.marker.content = el;
          existing.status = status;
          existing.speed = speed;
        }
        return;
      }

      const el = document.createElement('div');
      el.style.cssText = 'cursor:pointer;transform:translateY(28%)';
      el.innerHTML = vehicleSvg(status, v.speed);
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current,
        position: { lat: v.lat, lng: v.lng },
        content: el,
        title: v.registration,
        zIndex: 20,
      });
      const entry: VehicleEntry = { marker, status, speed, vehicle: v };
      marker.addListener('click', () => {
        onVehicleMarkerClick(entry.vehicle);
        if (!suppressVehiclePopup) {
          const wrap = document.createElement('div');
          wrap.innerHTML = vehiclePopupHtml(entry.vehicle, getVehicleTrackingStatus(entry.vehicle));
          infoRef.current?.setContent(wrap);
          infoRef.current?.open({ map: mapRef.current!, anchor: marker });
        }
      });
      pool[v.vehicleId] = entry;
    });

    Object.keys(pool).forEach(id => {
      if (!seen.has(id)) {
        pool[id].marker.map = null;
        delete pool[id];
      }
    });
  }, [ready, vehicleMarkers, onVehicleMarkerClick, suppressVehiclePopup]);

  return (
    <>
      <div ref={divRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-slate-100 animate-pulse">
          <span className="text-xs font-semibold text-slate-400 tracking-wide">Loading map…</span>
        </div>
      )}
      {ready && (
        <button
          onClick={() => setTraffic(t => !t)}
          className={`absolute top-3 left-3 z-[1000] px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest shadow-lg border transition-all ${
            traffic
              ? 'bg-emerald-600 text-white border-emerald-700'
              : 'bg-white/95 text-slate-600 border-slate-200 hover:bg-white'
          }`}
          title="Toggle live traffic"
        >
          Traffic
        </button>
      )}
    </>
  );
}

// ── Leaflet fallback internals ────────────────────────────────────────────────

// Fly-to controller: reacts to a [lat, lng, timestamp] tuple so re-clicking same vehicle re-flies
function FlyToController({ target }: { target: [number, number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target[0], target[1]], 16, { animate: true, duration: 1.2 });
  }, [target, map]);
  return null;
}

function MapUpdater({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.setView([lat, lng], zoom); }, [lat, lng, zoom, map]);
  return null;
}

// Leaflet renders blank tile patches when its container is sized/resized after
// init (tabs, expanding panels, modals) - re-measure whenever the box changes
function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => { observer.disconnect(); clearTimeout(t); };
  }, [map]);
  return null;
}

function ClickHandler({ onLocationSelect }: { onLocationSelect: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onLocationSelect(e.latlng.lat, e.latlng.lng); } });
  return null;
}

const TILE_URLS = {
  light:  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark:   'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
};

interface LeafletCanvasProps {
  center: [number, number];
  zoom: number;
  markers: MapMarker[];
  vehicleMarkers: LiveVehicle[];
  layerType: 'light' | 'dark' | 'street';
  routePath?: [number, number][];
  onLocationSelect?: (lat: number, lng: number) => void;
  onVehicleClick?: (v: LiveVehicle) => void;
  onVehicleMarkerClick: (v: LiveVehicle) => void;
  flyTarget: [number, number, number] | null;
}

function LeafletCanvas({
  center, zoom, markers, vehicleMarkers, layerType, routePath,
  onLocationSelect, onVehicleClick, onVehicleMarkerClick, flyTarget,
}: LeafletCanvasProps) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom={true}
      style={{ height: '100%', width: '100%', zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url={TILE_URLS[layerType]}
      />
      <MapUpdater lat={center[0]} lng={center[1]} zoom={zoom} />
      <FlyToController target={flyTarget} />
      <ResizeFix />
      {onLocationSelect && <ClickHandler onLocationSelect={onLocationSelect} />}

      {routePath && routePath.length > 1 && (
        <Polyline positions={routePath} pathOptions={{ color: '#2563EB', weight: 5, opacity: 0.9 }} />
      )}

      {markers.map(m => (
        <Marker key={m.id} position={[m.lat, m.lng]} icon={incidentIcon}>
          <Popup><div className="font-sans font-bold text-sm">{m.title}</div></Popup>
        </Marker>
      ))}

      {vehicleMarkers.map(v => {
        const status = getVehicleTrackingStatus(v);
        return (
          <Marker
            key={`${v.vehicleId}-${status}`}
            position={[v.lat, v.lng]}
            icon={createVehicleIcon(status, v.speed)}
            eventHandlers={{ click: () => onVehicleMarkerClick(v) }}
          >
            {/* Suppress default popup when a click handler is wired - parent shows dispatch panel */}
            {!onVehicleClick && (
              <Popup maxWidth={220}>
                <div dangerouslySetInnerHTML={{ __html: vehiclePopupHtml(v, status) }} />
              </Popup>
            )}
          </Marker>
        );
      })}
    </MapContainer>
  );
}

// ── Overlay: LIVE badge ───────────────────────────────────────────────────────

function LiveBadge({ vehicleCount, incidentCount, lastUpdatedAt }: {
  vehicleCount: number; incidentCount: number; lastUpdatedAt: Date | null;
}) {
  const timeStr = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : null;
  return (
    <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-1.5 pointer-events-none">
      <div className="flex items-center gap-2 bg-black/85 backdrop-blur-sm text-white px-3 py-2 rounded-xl shadow-xl border border-white/10">
        <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse flex-shrink-0" />
        <span className="text-[10px] font-black tracking-[0.15em]">LIVE</span>
        {vehicleCount > 0 && <><span className="text-slate-500 text-[10px]">·</span><span className="text-[10px] font-bold text-slate-300">{vehicleCount} unit{vehicleCount !== 1 ? 's' : ''}</span></>}
        {incidentCount > 0 && <><span className="text-slate-500 text-[10px]">·</span><span className="text-[10px] font-bold text-red-400">{incidentCount} incident{incidentCount !== 1 ? 's' : ''}</span></>}
      </div>
      {timeStr && (
        <div className="bg-black/70 backdrop-blur-sm text-slate-400 px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold border border-white/5">{timeStr}</div>
      )}
    </div>
  );
}

// ── Overlay: Legend ───────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { color: '#22c55e', label: 'Ready' },
  { color: '#eab308', label: 'No Driver' },
  { color: '#ef4444', label: 'Engaged' },
  { color: '#6b7280', label: 'Unavailable' },
];

function MapLegend({ hasIncidents }: { hasIncidents: boolean }) {
  return (
    <div className="absolute bottom-14 left-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 px-3 py-2.5 pointer-events-none">
      <p className="text-[8px] font-black tracking-[0.18em] text-slate-400 mb-2">Legend</p>
      <div className="flex flex-col gap-1.5">
        {LEGEND_ITEMS.map(item => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
            <span className="text-[10px] font-semibold text-slate-600 leading-none">{item.label}</span>
          </div>
        ))}
        {hasIncidents && <>
          <div className="border-t border-slate-100 my-0.5" />
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-[#dc2626]" />
            <span className="text-[10px] font-semibold text-slate-600 leading-none">Incident</span>
          </div>
        </>}
      </div>
    </div>
  );
}

// ── Overlay: Vehicle strip (bottom bar) ──────────────────────────────────────

function VehicleStrip({
  vehicles,
  onFlyTo,
  onVehicleClick,
}: {
  vehicles: LiveVehicle[];
  onFlyTo: (v: LiveVehicle) => void;
  onVehicleClick?: (v: LiveVehicle) => void;
}) {
  const [visible, setVisible] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function handleSelect(v: LiveVehicle) {
    setSelectedId(v.vehicleId === selectedId ? null : v.vehicleId);
    onFlyTo(v);
    onVehicleClick?.(v);
  }

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] bg-black/80 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-white/10 hover:bg-black/90 transition-all"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
        {vehicles.length} units
      </button>
    );
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-black/80 backdrop-blur-md border-t border-white/10 flex items-center">
      {/* Label */}
      <div className="flex-shrink-0 px-3 border-r border-white/10 self-stretch flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse flex-shrink-0" />
        <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">{vehicles.length} units</span>
      </div>

      {/* Scrollable pills */}
      <div className="flex-1 overflow-x-auto hide-scrollbar">
        <div className="flex items-center gap-1 px-2 py-2">
          {vehicles.length === 0 && (
            <span className="text-[11px] text-slate-500 px-2">No units online</span>
          )}
          {vehicles.map(v => {
            const status = getVehicleTrackingStatus(v);
            const p = STATUS_PALETTE[status];
            const isSelected = selectedId === v.vehicleId;
            return (
              <button
                key={v.vehicleId}
                onClick={() => handleSelect(v)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all flex-shrink-0 border ${
                  isSelected
                    ? 'bg-white/15 border-white/20 text-white'
                    : 'border-transparent text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.light }} />
                <span className="font-semibold">{v.registration}</span>
                {v.speed > 2 && (
                  <span className="text-slate-500 text-[10px]">{Math.round(v.speed)} km/h</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Close */}
      <button
        onClick={() => setVisible(false)}
        className="flex-shrink-0 px-3 self-stretch flex items-center border-l border-white/10 text-slate-500 hover:text-slate-300 transition-colors"
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

interface MapProps {
  center: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  vehicleMarkers?: LiveVehicle[];
  className?: string;
  layerType?: 'light' | 'dark' | 'street';
  /** Turn-by-turn path (e.g. from fetchDrivingRoute) drawn as a line over the map. */
  routePath?: [number, number][];
  onLocationSelect?: (lat: number, lng: number) => void;
  /** When set, clicking a vehicle marker fires this callback instead of showing the default popup */
  onVehicleClick?: (vehicle: LiveVehicle) => void;
  showLegend?: boolean;
  showLiveBadge?: boolean;
  showVehicleList?: boolean;
  lastUpdatedAt?: Date | null;
  /** External trigger: pass a new [lat, lng] value to smoothly fly the map there */
  focusPosition?: [number, number];
  children?: ReactNode;
}

function Map({
  center,
  zoom = 13,
  markers = [],
  vehicleMarkers = [],
  className = 'h-full w-full',
  layerType = 'light',
  routePath,
  onLocationSelect,
  onVehicleClick,
  showLegend = false,
  showLiveBadge = false,
  showVehicleList = false,
  lastUpdatedAt = null,
  focusPosition,
  children,
}: MapProps) {
  // [lat, lng, timestamp] - timestamp ensures re-clicking same vehicle re-fires the effect
  const [flyTarget, setFlyTarget] = useState<[number, number, number] | null>(null);
  const [googleFailed, setGoogleFailed] = useState(false);
  const useGoogle = mapsReady && !googleFailed;

  const focusLat = focusPosition?.[0];
  const focusLng = focusPosition?.[1];

  // React to external focusPosition changes (e.g. fleet table row click)
  useEffect(() => {
    if (focusLat != null && focusLng != null) {
      setFlyTarget([focusLat, focusLng, Date.now()]);
    }
  }, [focusLat, focusLng]);

  function flyToVehicle(v: LiveVehicle) {
    setFlyTarget([v.lat, v.lng, Date.now()]);
  }

  function handleVehicleMarkerClick(v: LiveVehicle) {
    setFlyTarget([v.lat, v.lng, Date.now()]);
    onVehicleClick?.(v);
  }

  return (
    <div className={`relative z-0 ${className}`}>
      {useGoogle ? (
        <GoogleCanvas
          key={`gmap-${layerType === 'dark' ? 'dark' : 'light'}`}
          center={center}
          zoom={zoom}
          markers={markers}
          vehicleMarkers={vehicleMarkers}
          layerType={layerType}
          routePath={routePath}
          onLocationSelect={onLocationSelect}
          onVehicleMarkerClick={handleVehicleMarkerClick}
          suppressVehiclePopup={!!onVehicleClick}
          flyTarget={flyTarget}
          onFail={() => setGoogleFailed(true)}
        />
      ) : (
        <LeafletCanvas
          center={center}
          zoom={zoom}
          markers={markers}
          vehicleMarkers={vehicleMarkers}
          layerType={layerType}
          routePath={routePath}
          onLocationSelect={onLocationSelect}
          onVehicleClick={onVehicleClick}
          onVehicleMarkerClick={handleVehicleMarkerClick}
          flyTarget={flyTarget}
        />
      )}

      {/* Overlays */}
      {showLiveBadge && (
        <LiveBadge
          vehicleCount={vehicleMarkers.length}
          incidentCount={markers.length}
          lastUpdatedAt={lastUpdatedAt}
        />
      )}
      {showVehicleList && vehicleMarkers.length > 0 && (
        <VehicleStrip vehicles={vehicleMarkers} onFlyTo={flyToVehicle} onVehicleClick={onVehicleClick} />
      )}
      {showLegend && <MapLegend hasIncidents={markers.length > 0} />}
      {children}
    </div>
  );
}

export default Map;
