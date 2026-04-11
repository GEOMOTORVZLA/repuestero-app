/** URLs para Google Maps (direcciones). */

import { emitirMapsNavSinUbicacion } from './mapsNavToastBridge';

const MAPS_DIR = 'https://www.google.com/maps/dir/';

export function urlGoogleMapsDirSoloDestino(destLat: number, destLng: number): string {
  return `${MAPS_DIR}?api=1&destination=${destLat},${destLng}`;
}

export function urlGoogleMapsDirConOrigen(
  destLat: number,
  destLng: number,
  originLat: number,
  originLng: number
): string {
  return `${MAPS_DIR}?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}`;
}

/**
 * Pide la ubicacion actual y abre Maps con origen + destino.
 * Si el usuario deniega o falla el GPS, abre solo destino.
 */
export function abrirNavegacionGoogleMapsDesdeAqui(destLat: number, destLng: number): void {
  if (typeof window === 'undefined') return;

  const destinoUrl = urlGoogleMapsDirSoloDestino(destLat, destLng);

  if (!window.navigator?.geolocation) {
    emitirMapsNavSinUbicacion();
    window.open(destinoUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  let pestana: Window | null = null;
  try {
    pestana = window.open('about:blank', '_blank', 'noopener,noreferrer');
  } catch {
    pestana = null;
  }

  const aplicarUrl = (url: string) => {
    if (pestana && !pestana.closed) {
      try {
        pestana.location.replace(url);
      } catch {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } else {
      window.location.assign(url);
    }
  };

  window.navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: oLat, longitude: oLng } = pos.coords;
      aplicarUrl(urlGoogleMapsDirConOrigen(destLat, destLng, oLat, oLng));
    },
    () => {
      emitirMapsNavSinUbicacion();
      aplicarUrl(destinoUrl);
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 18000 }
  );
}