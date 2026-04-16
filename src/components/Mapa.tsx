import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useLoadScript, GoogleMap, Autocomplete, Marker } from '@react-google-maps/api';
import { supabase } from '../supabaseClient';
import { verticalDesdePathname } from '../utils/verticalVehiculo';
import { normalizeEspecialidadesTallerDb } from '../utils/tallerEspecialidades';
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

function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function Mapa() {
  const location = useLocation();
  const vertical = verticalDesdePathname(location.pathname);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [puntos, setPuntos] = useState<PuntoMapa[]>([]);
  const [seleccionado, setSeleccionado] = useState<PuntoMapa | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
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
        .eq('vertical', vertical)
        .not('latitud', 'is', null)
        .not('longitud', 'is', null),
      supabase
        .from('tiendas')
        .select('id, nombre, latitud, longitud')
        .eq('vertical', vertical)
        .not('latitud', 'is', null)
        .not('longitud', 'is', null),
    ]);

    const talleres = (resTalleres.data ?? []) as Array<{
      id: string;
      nombre: string | null;
      nombre_comercial: string | null;
      latitud: number;
      longitud: number;
      especialidad?: string[] | string | null;
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
        especialidad: (() => {
          const esp = normalizeEspecialidadesTallerDb(t.especialidad);
          return esp.length ? esp.join(' · ') : null;
        })(),
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
  }, [vertical]);

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

  const usarMiUbicacion = () => {
    setGpsError('');
    if (!navigator.geolocation) {
      setGpsError('Tu navegador no soporta geolocalización.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setCenter(loc);
        setZoom(13);
        mapRef.current?.panTo(loc);
      },
      () => setGpsError('No se pudo obtener tu ubicación.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const distanciaSeleccionado = useMemo(() => {
    if (!userLocation || !seleccionado) return null;
    return distanciaKm(userLocation.lat, userLocation.lng, seleccionado.lat, seleccionado.lng);
  }, [userLocation, seleccionado]);

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
              onClick={() => setSeleccionado(p)}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 9,
                fillColor: p.tipo === 'tienda' ? '#111111' : '#1e5bff',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
              }}
            />
          ))}
          {userLocation && (
            <Marker
              position={userLocation}
              title="Tu ubicación"
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: '#16a34a',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
              }}
            />
          )}
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
            <button type="button" className="mapa-btn-ubicacion" onClick={usarMiUbicacion}>
              Usar mi ubicación
            </button>
            {gpsError && <p className="mapa-gps-error">{gpsError}</p>}
          </div>
          {seleccionado && (
            <div className="mapa-ficha mapa-ficha-overlay">
              <div className="mapa-ficha-row">
                <p className="mapa-ficha-nombre">{seleccionado.nombre}</p>
                <span
                  className={`mapa-chip ${
                    seleccionado.tipo === 'tienda' ? 'mapa-chip-vendedor' : 'mapa-chip-taller'
                  }`}
                >
                  {seleccionado.tipo === 'tienda' ? 'Vendedor' : 'Taller'}
                </span>
              </div>
              <p className="mapa-ficha-detalle">
                {seleccionado.especialidad ||
                  (seleccionado.tipo === 'tienda' ? 'Venta de repuestos' : 'Servicio técnico')}
              </p>
              <p className="mapa-ficha-distancia">
                {distanciaSeleccionado != null
                  ? `Distancia desde tu ubicación: ${distanciaSeleccionado.toFixed(1)} km`
                  : 'Activa "Usar mi ubicación" para ver la distancia en km.'}
              </p>
            </div>
          )}
        </GoogleMap>
      </div>
      <div className="mapa-leyenda">
        <span><strong style={{ color: '#111111' }}>●</strong> Vendedor / Tienda</span>
        <span><strong style={{ color: '#1e5bff' }}>●</strong> Taller</span>
      </div>
    </div>
  );
}
