/** URLs para Google Maps (direcciones). */

import { emitirMapsNavSinUbicacion } from './mapsNavToastBridge';

const MAPS_DIR = 'https://www.google.com/maps/dir/';

/** HTML en la pestaña nueva mientras llega el GPS (evita pantalla blanca en móvil). */
const HTML_PESTANA_CARGANDO_MAPS =
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maps</title></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f1f5f9;color:#334155;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:1rem"><p style="margin:0;max-width:22rem;line-height:1.45;font-size:15px">Obteniendo tu ubicacion. En unos segundos se abrira la ruta en Google Maps.</p></body></html>';

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
 * Si falla el GPS, abre solo destino.
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
    // Con noopener muchos navegadores devuelven null: la pestaña about:blank queda sin poder redirigir.
    pestana = window.open('about:blank', '_blank');
  } catch {
    pestana = null;
  }

  if (pestana && !pestana.closed) {
    try {
      pestana.document.open();
      pestana.document.write(HTML_PESTANA_CARGANDO_MAPS);
      pestana.document.close();
    } catch {
      /* algunos entornos restringen escritura en about:blank */
    }
  }

  const aplicarUrl = (url: string) => {
    if (pestana && !pestana.closed) {
      try {
        pestana.location.href = url;
        return;
      } catch {
        try {
          pestana.location.replace(url);
          return;
        } catch {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      }
    }
    window.location.href = url;
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
    { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
  );
}