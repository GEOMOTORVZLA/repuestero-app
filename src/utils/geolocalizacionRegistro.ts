import { ESTADOS_VENEZUELA, getCiudadesPorEstado } from '../data/ciudadesVenezuela';

const OPCIONES_GEO: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 28000,
};

function normalizarTextoUbicacion(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Evita posiciones cacheadas (movil suele devolver la ultima conocida si maximumAge no es 0). */
export function solicitarPosicionGpsPrecisa(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('NO_GEO'));
      return;
    }

    let mejor: GeolocationPosition | null = null;
    let listo = false;
    let watchId: number;
    let timeoutId: ReturnType<typeof window.setTimeout>;

    const terminar = (pos: GeolocationPosition | null) => {
      if (listo) return;
      listo = true;
      window.clearTimeout(timeoutId);
      navigator.geolocation.clearWatch(watchId);
      if (pos) {
        resolve(pos);
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, OPCIONES_GEO);
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (
          !mejor ||
          (typeof pos.coords.accuracy === 'number' &&
            typeof mejor.coords.accuracy === 'number' &&
            pos.coords.accuracy < mejor.coords.accuracy)
        ) {
          mejor = pos;
        }
        if (typeof pos.coords.accuracy === 'number' && pos.coords.accuracy <= 35) {
          terminar(pos);
        }
      },
      () => {
        /* Errores puntuales del watch no cancelan: al vencer el tiempo usamos la mejor lectura o getCurrentPosition. */
      },
      OPCIONES_GEO
    );

    timeoutId = window.setTimeout(() => terminar(mejor), 12000);
  });
}

let mapsCarga: Promise<void> | null = null;

function esperarGoogleMapsGeocoder(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const id = window.setInterval(() => {
      if (window.google?.maps?.Geocoder) {
        window.clearInterval(id);
        resolve();
      } else if (Date.now() - t0 > timeoutMs) {
        window.clearInterval(id);
        reject(new Error('MAPS_TIMEOUT'));
      }
    }, 80);
  });
}

/** Carga Maps JS si hace falta (mismo patron que el resto de la app; evita duplicar script). */
export function asegurarGoogleMapsJs(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('NO_WINDOW'));
  if (window.google?.maps?.Geocoder) return Promise.resolve();
  if (mapsCarga) return mapsCarga;

  const promesa = (async () => {
    const existente = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );
    if (existente) {
      await esperarGoogleMapsGeocoder(25000);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const cbName = `__geomotor_maps_cb_${Date.now()}`;
      (window as unknown as Record<string, () => void>)[cbName] = () => {
        delete (window as unknown as Record<string, unknown>)[cbName];
        resolve();
      };
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${cbName}&loading=async&language=es&region=VE`;
      s.onerror = () => reject(new Error('MAPS_SCRIPT'));
      document.head.appendChild(s);
    });
    await esperarGoogleMapsGeocoder(5000);
  })();

  mapsCarga = promesa.catch((e) => {
    mapsCarga = null;
    throw e;
  });
  return mapsCarga;
}

function componentePorTipo(
  components: google.maps.GeocoderAddressComponent[],
  tipos: string[]
): string | undefined {
  const c = components.find((x) => tipos.some((t) => x.types.includes(t)));
  return c?.long_name;
}

function emparejarEstadoVenezuela(admin1: string | undefined): string | null {
  if (!admin1?.trim()) return null;
  const n = normalizarTextoUbicacion(admin1);
  const sinPrefijo = n.replace(/^estado\s+/, '');

  for (const e of ESTADOS_VENEZUELA) {
    const ne = normalizarTextoUbicacion(e);
    if (ne === sinPrefijo || ne === n) return e;
  }
  for (const e of ESTADOS_VENEZUELA) {
    const ne = normalizarTextoUbicacion(e);
    if (sinPrefijo.includes(ne) || ne.includes(sinPrefijo)) return e;
  }

  if (n.includes('distrito capital') || n === 'caracas' || n.includes('capital district')) {
    return 'Distrito Capital';
  }
  if (n.includes('la guaira') || n.includes('vargas')) return 'La Guaira';

  return null;
}

function emparejarCiudadEnEstado(estado: string, ...candidatos: (string | undefined)[]): string | null {
  const ciudades = getCiudadesPorEstado(estado);
  if (!ciudades.length) return null;

  const partes = candidatos
    .filter((x): x is string => Boolean(x?.trim()))
    .map((x) => normalizarTextoUbicacion(x));

  for (const p of partes) {
    for (const c of ciudades) {
      if (normalizarTextoUbicacion(c) === p) return c;
    }
  }
  for (const p of partes) {
    for (const c of ciudades) {
      const nc = normalizarTextoUbicacion(c);
      if (p.includes(nc) || nc.includes(p)) return c;
    }
  }
  return null;
}

export type ResultadoGeocodificacionRegistro = {
  estado: string | null;
  ciudad: string | null;
  direccionFormateada: string | null;
};

/** Geocodificacion inversa con Maps JavaScript API (evita CORS del endpoint JSON). */
export async function geocodificacionInversaParaRegistro(
  apiKey: string,
  lat: number,
  lng: number
): Promise<ResultadoGeocodificacionRegistro | null> {
  await asegurarGoogleMapsJs(apiKey);
  const geocoder = new google.maps.Geocoder();

  const resultado = await new Promise<google.maps.GeocoderResult | null>((resolve, reject) => {
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results?.[0]) resolve(results[0]);
      else if (status === 'ZERO_RESULTS') resolve(null);
      else reject(new Error(String(status)));
    });
  });

  if (!resultado) return null;

  const comps = resultado.address_components;
  const admin1 = componentePorTipo(comps, ['administrative_area_level_1']);
  const locality = componentePorTipo(comps, ['locality']);
  const admin2 = componentePorTipo(comps, ['administrative_area_level_2']);
  const subLoc = componentePorTipo(comps, ['sublocality', 'sublocality_level_1']);
  const barrio = componentePorTipo(comps, ['neighborhood']);

  const estado = emparejarEstadoVenezuela(admin1);
  const ciudad = estado
    ? emparejarCiudadEnEstado(estado, locality, admin2, subLoc, barrio)
    : null;

  return {
    estado,
    ciudad,
    direccionFormateada: resultado.formatted_address ?? null,
  };
}
