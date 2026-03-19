import { useRef, useCallback, useState, useEffect } from 'react';
import { useLoadScript, GoogleMap, Autocomplete, Marker } from '@react-google-maps/api';
import { supabase } from '../supabaseClient';
import './Mapa.css';

const LIBRARIES: ('places')[] = ['places'];
const DEFAULT_CENTER = { lat: 10.4806, lng: -66.9036 }; // Caracas
const DEFAULT_ZOOM = 10;

const containerStyle = {
  width: '100%',
  height: '400px',
};

export interface PuntoMapa {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
  tipo: 'taller' | 'tienda';
  especialidad?: string | null;
  telefono?: string | null;
}

export function Mapa() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [puntos, setPuntos] = useState<PuntoMapa[]>([]);
  const mapRef = useRef<google.maps.Map | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || '',
    libraries: LIBRARIES,
  });

  const cargarPuntos = useCallback(async () => {
    const [resTalleres, resTiendas] = await Promise.all([
      supabase
        .from('talleres')
        .select('id, nombre, nombre_comercial, latitud, longitud, especialidad, telefono')
        .not('latitud', 'is', null)
        .not('longitud', 'is', null),
      supabase
        .from('tiendas')
        .select('id, nombre, latitud, longitud')
        .not('latitud', 'is', null)
        .not('longitud', 'is', null),
    ]);

    const talleres = (resTalleres.data ?? []) as Array<{
      id: string;
      nombre: string | null;
      nombre_comercial: string | null;
      latitud: number;
      longitud: number;
      especialidad?: string | null;
      telefono?: string | null;
    }>;
    const tiendas = (resTiendas.data ?? []) as Array<{
      id: string;
      nombre: string | null;
      latitud: number;
      longitud: number;
    }>;

    const pts: PuntoMapa[] = [
      ...talleres.map((t) => ({
        id: t.id,
        nombre: t.nombre_comercial || t.nombre || 'Sin nombre',
        lat: t.latitud,
        lng: t.longitud,
        tipo: 'taller' as const,
        especialidad: t.especialidad ?? null,
        telefono: t.telefono ?? null,
      })),
      ...tiendas.map((t) => ({
        id: t.id,
        nombre: t.nombre || 'Sin nombre',
        lat: t.latitud,
        lng: t.longitud,
        tipo: 'tienda' as const,
      })),
    ];
    setPuntos(pts);
  }, []);

  useEffect(() => {
    if (isLoaded) cargarPuntos();
  }, [isLoaded, cargarPuntos]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const onAutocompleteLoad = useCallback((autocomplete: google.maps.places.Autocomplete) => {
    autocompleteRef.current = autocomplete;
  }, []);

  const onPlaceChanged = useCallback(() => {
    if (!autocompleteRef.current) return;
    const place = autocompleteRef.current.getPlace();
    const location = place.geometry?.location;
    if (location) {
      const lat = location.lat();
      const lng = location.lng();
      setCenter({ lat, lng });
      setZoom(14);
      mapRef.current?.panTo({ lat, lng });
    }
  }, []);

  if (loadError) {
    return (
      <div className="mapa mapa-error">
        <p>No se pudo cargar el mapa. Verifica tu clave de API de Google Maps.</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="mapa mapa-cargando">
        <p>Cargando mapa…</p>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="mapa mapa-error">
        <p>Falta la variable VITE_GOOGLE_MAPS_API_KEY en tu archivo .env</p>
      </div>
    );
  }

  return (
    <div className="mapa">
      <div className="mapa-contenedor">
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={center}
          zoom={zoom}
          onLoad={onMapLoad}
          options={{
            zoomControl: true,
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true,
          }}
        >
          {puntos.map((p) => (
            <Marker
              key={`${p.tipo}-${p.id}`}
              position={{ lat: p.lat, lng: p.lng }}
              title={`${p.nombre}${p.especialidad ? ` - ${p.especialidad}` : ''}`}
              label={p.tipo === 'taller' ? 'T' : 'V'}
            />
          ))}
          <div className="mapa-buscador-overlay">
            <Autocomplete
              onLoad={onAutocompleteLoad}
              onPlaceChanged={onPlaceChanged}
              options={{
                componentRestrictions: { country: 've' },
                fields: ['geometry', 'name', 'formatted_address'],
              }}
            >
              <input
                type="text"
                placeholder="Busca tu ubicación (ej. Caracas, Valencia…)"
                className="mapa-input"
                aria-label="Buscar ubicación"
              />
            </Autocomplete>
          </div>
        </GoogleMap>
      </div>
      <div className="mapa-leyenda">
        <span><strong>T</strong> Taller</span>
        <span><strong>V</strong> Vendedor / Tienda</span>
      </div>
    </div>
  );
}
