import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, MapPin, X } from 'lucide-react';
import api from '@/api/client';
import Map from '@/components/shared/Map';
import AppLoader from '@/components/shared/AppLoader';
import { usePlacesAutocomplete } from '@/hooks/usePlacesAutocomplete';
import { Facility } from '@/types/api';

/*
 * Add a facility that isn't on the list, while assigning one to a case.
 * The dispatcher types the name (Google suggestions pin it), or clicks the map
 * to drop the pin by hand, then confirms type, KEPH level and sub-county.
 */

const FACILITY_TYPES = ['Hospital', 'Health Centre', 'Clinic', 'Dispensary', 'Nursing Home', 'Maternity'];
// Machakos town, when the case itself has no coordinates.
const DEFAULT_CENTER: [number, number] = [-1.5177, 37.2634];

export default function AddFacilityModal({
  near,
  defaultSubCounty,
  onClose,
  onCreated,
}: {
  near: { lat: number; lng: number } | null;
  defaultSubCounty?: string;
  onClose: () => void;
  onCreated: (facility: Facility) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('Hospital');
  const [ownership, setOwnership] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [kephLevel, setKephLevel] = useState(4);
  const [subCounty, setSubCounty] = useState(defaultSubCounty ?? '');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [focus, setFocus] = useState<[number, number] | undefined>();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const places = usePlacesAutocomplete();

  const { data: subCounties = [] } = useQuery({
    queryKey: ['sub-counties'],
    queryFn: async () => (await api.get('/incidents/sub-counties')).data.data as string[],
    staleTime: 30 * 60_000,
  });

  async function pickSuggestion(placeId: string) {
    setShowSuggestions(false);
    places.clear();
    try {
      const d = await places.getDetails(placeId);
      setName(d.name);
      setPin({ lat: d.lat, lng: d.lng });
      setFocus([d.lat, d.lng]);
      const match = subCounties.find(s => d.subCountyCandidates.some(c => c.toLowerCase().includes(s.toLowerCase())));
      if (match) setSubCounty(match);
    } catch {
      setError('Could not look that place up - click the map to pin it instead.');
    }
  }

  async function save() {
    setError('');
    if (name.trim().length < 2) return setError('Enter the facility name.');
    if (!pin) return setError('Pin the facility on the map.');
    if (!subCounty) return setError('Choose the sub-county.');
    setSaving(true);
    try {
      const res = await api.post('/incidents/facilities', {
        name: name.trim(), type, ownership, kephLevel, subCounty, lat: pin.lat, lng: pin.lng,
      });
      onCreated(res.data.data as Facility);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not add the facility.');
    } finally {
      setSaving(false);
    }
  }

  const center: [number, number] = pin ? [pin.lat, pin.lng] : near ? [near.lat, near.lng] : DEFAULT_CENTER;
  const field = 'w-full border border-surface-border rounded-lg px-3 py-2 text-sm text-brand-teal outline-none focus:ring-2 focus:ring-brand-green';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl border border-surface-border w-full max-w-2xl mx-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-surface-border">
          <div className="w-9 h-9 rounded-full bg-brand-green/10 flex items-center justify-center">
            <Building2 size={18} className="text-brand-green" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-brand-teal">Add a facility</h3>
            <p className="text-xs text-slate-text">Not on the list? Enter it and pin it on the map. It's saved for everyone.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div className="relative">
            <label className="text-xs font-medium text-slate-text block mb-1">Facility name <span className="text-status-danger">*</span></label>
            <input
              autoFocus
              className={field}
              value={name}
              placeholder={places.available ? 'Start typing to search Google Maps…' : 'e.g. Kangundo Level 4 Hospital'}
              onChange={e => {
                setName(e.target.value);
                if (places.available) { places.search(e.target.value); setShowSuggestions(true); }
              }}
            />
            {showSuggestions && places.suggestions.length > 0 && (
              <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-surface-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {places.suggestions.map(s => (
                  <li key={s.placeId}>
                    <button
                      type="button"
                      onClick={() => pickSuggestion(s.placeId)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-start gap-2"
                    >
                      <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" /> {s.description}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-text block mb-1">Location <span className="text-status-danger">*</span></label>
            <div className="rounded-lg border border-surface-border overflow-hidden">
              <Map
                center={center}
                zoom={pin ? 15 : 12}
                focusPosition={focus}
                markers={[
                  ...(near ? [{ id: 'scene', lat: near.lat, lng: near.lng, title: 'Scene', type: 'incident' as const }] : []),
                  ...(pin ? [{ id: 'new-facility', lat: pin.lat, lng: pin.lng, title: name || 'New facility', type: 'facility' as const }] : []),
                ]}
                onLocationSelect={(lat, lng) => setPin({ lat, lng })}
                layerType="street"
                hideTrafficToggle
                className="h-72 w-full"
              />
              <div className="px-3 py-2 text-xs flex items-center gap-1.5 bg-slate-50 border-t border-surface-border text-slate-text">
                <MapPin size={12} />
                {pin ? `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)} - click the map to move the pin` : 'Click the map where the facility is.'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-text block mb-1">Type</label>
              <select className={field} value={type} onChange={e => setType(e.target.value)}>
                {FACILITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-text block mb-1">KEPH level</label>
              <select className={field} value={kephLevel} onChange={e => setKephLevel(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map(l => <option key={l} value={l}>Level {l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-text block mb-1">Sub-county <span className="text-status-danger">*</span></label>
              <select className={field} value={subCounty} onChange={e => setSubCounty(e.target.value)}>
                <option value="">Choose…</option>
                {subCounty && !subCounties.includes(subCounty) && <option value={subCounty}>{subCounty}</option>}
                {subCounties.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-text block mb-1">Ownership</label>
              <select className={field} value={ownership} onChange={e => setOwnership(e.target.value as 'PUBLIC' | 'PRIVATE')}>
                <option value="PUBLIC">Public</option>
                <option value="PRIVATE">Private</option>
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-status-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-brand-green text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving ? <><AppLoader size={16} /> Saving…</> : 'Add & select'}
          </button>
        </div>
      </div>
    </div>
  );
}
