import { useState, useEffect, useRef, useCallback } from 'react';
import { loadMapsLibrary, mapsReady } from '@/lib/mapsLoader';

export interface PlaceSuggestion {
  placeId: string;
  description: string;
}

export interface PlaceDetails {
  lat: number;
  lng: number;
  name: string;
  // Address-component names useful for detecting the sub-county / constituency.
  subCountyCandidates: string[];
}

// Google address-component types that can carry a Nairobi sub-county/constituency.
const SUBCOUNTY_TYPES = new Set([
  'administrative_area_level_2',
  'administrative_area_level_3',
  'administrative_area_level_4',
  'sublocality',
  'sublocality_level_1',
  'sublocality_level_2',
  'locality',
  'neighborhood',
]);

export function usePlacesAutocomplete(countryCode = 'ke') {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);

  useEffect(() => {
    if (!mapsReady) return;
    loadMapsLibrary('places')
      .then(() => {
        serviceRef.current = new google.maps.places.AutocompleteService();
        geocoderRef.current = new google.maps.Geocoder();
        // PlacesService requires a DOM node or map - a detached div works fine,
        // it's never attached to the page.
        placesServiceRef.current = new google.maps.places.PlacesService(document.createElement('div'));
      })
      .catch(() => {});
  }, []);

  const search = useCallback(
    (input: string) => {
      if (!input || input.length < 3 || !serviceRef.current) {
        setSuggestions([]);
        return;
      }
      setIsLoading(true);
      serviceRef.current.getPlacePredictions(
        {
          input,
          componentRestrictions: { country: countryCode },
          types: ['geocode', 'establishment'],
        },
        (predictions, status) => {
          setIsLoading(false);
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
            setSuggestions(
              predictions.map(p => ({ placeId: p.place_id, description: p.description }))
            );
          } else {
            setSuggestions([]);
          }
        }
      );
    },
    [countryCode]
  );

  const getDetails = useCallback((placeId: string): Promise<PlaceDetails> => {
    return new Promise((resolve, reject) => {
      // NOTE: this intentionally uses PlacesService.getDetails, not
      // Geocoder.geocode({ placeId }). The Geocoding API's reverse lookup for a
      // placeId often resolves to the nearest street address rather than the
      // establishment itself (e.g. picking "Kayole 2 Sub County Hospital" could
      // silently resolve to "Masimba Road" instead) - Places is the correct,
      // reliable API for turning an Autocomplete prediction back into the exact
      // place the user selected.
      if (!placesServiceRef.current) { reject(new Error('Places service not ready')); return; }
      placesServiceRef.current.getDetails(
        { placeId, fields: ['name', 'formatted_address', 'geometry', 'address_components'] },
        (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
            const subCountyCandidates = (place.address_components ?? [])
              .filter(c => c.types.some(t => SUBCOUNTY_TYPES.has(t)))
              .map(c => c.long_name);
            resolve({
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
              // Prefer the place's own name (what the watcher actually clicked);
              // fall back to the formatted address only if Places has no name.
              name: place.name || (place.formatted_address ?? '').split(',').slice(0, 2).join(',').trim(),
              subCountyCandidates,
            });
          } else {
            reject(new Error('Place details lookup failed'));
          }
        },
      );
    });
  }, []);

  const clear = useCallback(() => setSuggestions([]), []);

  return { suggestions, isLoading, search, getDetails, clear, available: mapsReady };
}
