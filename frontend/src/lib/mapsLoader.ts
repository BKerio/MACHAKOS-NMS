import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;

export const mapsReady = !!KEY;

let _initialised = false;

function ensureOptions() {
  if (_initialised) return;
  _initialised = true;
  setOptions({ key: KEY ?? '', v: 'weekly', libraries: ['places', 'routes'] });
}

export async function loadMapsLibrary(lib: Parameters<typeof importLibrary>[0]) {
  ensureOptions();
  return importLibrary(lib);
}
