/**
 * Offline sub-county lookup for Machakos County - no maps API, paid or free.
 *
 * Two signals, used by the New Incident form when the watcher types a place
 * or drops a pin:
 *  - subCountyFromText: town / ward / estate names -> the sub-county they sit in.
 *  - nearestSubCounty:  a pin inside the county -> the sub-county with the
 *                       closest centre (a coarse fallback when no name matched).
 *
 * Results are always mapped onto the admin-maintained official list, so a
 * sub-county the county has removed or renamed is never returned.
 */

/** Towns, wards and well-known places per sub-county (the 8 Machakos constituencies). */
const PLACES: Record<string, string[]> = {
  'Machakos Town': [
    'machakos', 'machakos town', 'mjini', 'mumbuni', 'mutituni', 'kalama', 'muvuti', 'kiima kimwe', 'mua', 'mua hills',
    'kola', 'katoloni', 'kimutwa', 'kasinga', 'mitamboni', 'kenyatta stadium', 'machakos level 5', 'machakos university',
    'eastleigh machakos', 'kariobangi machakos', 'makutano machakos', 'muthini', 'ngelani', 'kyumbi', 'kimiti', 'mwanyani',
  ],
  Mavoko: [
    'athi river', 'athiriver', 'mavoko', 'syokimau', 'mlolongo', 'katani', 'kinanie', 'muthwani', 'greenpark',
    'great wall', 'sabaki', 'lukenya', 'small world', 'daystar',
    'export processing zone', 'epz', 'ngelani athi', 'kyumvi',
  ],
  Kathiani: ['kathiani', 'mitaboni', 'iveti', 'kaewa', 'upper kaewa', 'lower kaewa', 'kauti', 'kakuyuni kathiani', 'mbee'],
  Matungulu: [
    'matungulu', 'tala', 'kantafu', 'kyeleni', 'koma', 'koma rock', 'joska', 'kalandini', 'tala town', 'kathithyamaa',
    'kinyui', 'ngunga', 'kyaume',
  ],
  Kangundo: ['kangundo', 'kivaani', 'kanzalu', 'kawethei', 'kakuyuni', 'mbilini', 'nyalani', 'kangundo town'],
  Mwala: [
    'mwala', 'masii', 'wamunyu', 'mbiuni', 'makutano mwala', 'miu', 'muthetheni', 'kibauni', 'kyawango', 'ikalaasa',
    'yathui', 'vyulya', 'kavumbu', 'kalawa machakos',
  ],
  Yatta: [
    'yatta', 'matuu', 'kithimani', 'ndalani', 'ikombe', 'katangi', 'kinyaata', 'kyua', 'kwa vonza', 'kwavonza',
    'mananja', 'kakumuti', 'thika road matuu', 'ndithini yatta',
  ],
  Masinga: [
    'masinga', 'ekalakala', 'kivaa', 'muthesya', 'ndithini', 'kithyoko', 'masinga dam', 'kangonde', 'kitheuni',
    'mutitu', 'mbiuni masinga',
  ],
};

/** Approximate centre of each sub-county (lat, lng) for the nearest-centre fallback. */
const CENTRES: Record<string, [number, number]> = {
  'Machakos Town': [-1.522, 37.264],
  Mavoko: [-1.43, 36.99],
  Kathiani: [-1.42, 37.33],
  Matungulu: [-1.27, 37.24],
  Kangundo: [-1.29, 37.4],
  Mwala: [-1.41, 37.46],
  Yatta: [-1.17, 37.47],
  Masinga: [-0.98, 37.6],
};

/** Rough bounding box of Machakos County - outside it we don't guess. */
const BOUNDS = { south: -1.9, north: -0.75, west: 36.85, east: 37.85 };

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const hasPhrase = (haystack: string, needle: string) => (` ${haystack} `).includes(` ${needle} `);

/** The official list's spelling of a sub-county, or '' if it isn't (any longer) official. */
function official(name: string, officialList: string[]): string {
  const n = norm(name);
  return officialList.find((o) => norm(o) === n) ?? '';
}

/**
 * Sub-county named or implied by free text, e.g. "Athi river" -> "Mavoko",
 * "Tala market" -> "Matungulu". Official names win over places; longer place
 * names win over shorter ones ("kakuyuni kathiani" over "kakuyuni").
 */
export function subCountyFromText(text: string, officialList: string[]): string {
  const t = norm(text);
  if (t.length < 3) return '';

  for (const o of officialList) {
    if (hasPhrase(t, norm(o))) return o;
  }

  let best: { sub: string; len: number } | null = null;
  for (const [sub, places] of Object.entries(PLACES)) {
    for (const p of places) {
      if (hasPhrase(t, p) && (!best || p.length > best.len)) best = { sub, len: p.length };
    }
  }
  return best ? official(best.sub, officialList) : '';
}

export function inMachakos(lat: number, lng: number): boolean {
  return lat >= BOUNDS.south && lat <= BOUNDS.north && lng >= BOUNDS.west && lng <= BOUNDS.east;
}

/** Sub-county whose centre is closest to the pin, or '' when the pin is outside the county. */
export function nearestSubCounty(lat: number, lng: number, officialList: string[]): string {
  if (!inMachakos(lat, lng)) return '';
  let best: { sub: string; d: number } | null = null;
  for (const [sub, [clat, clng]] of Object.entries(CENTRES)) {
    // Equirectangular distance is plenty at county scale.
    const dx = (lng - clng) * Math.cos((lat * Math.PI) / 180);
    const dy = lat - clat;
    const d = dx * dx + dy * dy;
    if (!best || d < best.d) best = { sub, d };
  }
  return best ? official(best.sub, officialList) : '';
}
