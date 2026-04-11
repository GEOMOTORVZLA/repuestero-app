import { useState, useRef, useEffect, useCallback } from 'react';
import { useLoadScript, GoogleMap, Marker, DirectionsService, DirectionsRenderer } from '@react-google-maps/api';
import './MapaVendedorUbicacion.css';

const LIBRARIES = ['places'] as const;
const containerStyle = { width: '100%', height: '280px' };

interface MapVendedorUbicacionProps {
  lat: number;
  lng: number;
  nombreVendedor: string;
  tipoPunto?: 'tienda' | 'taller';
  userLat?: number;
  userLng?: number;
  mostrarRutaDesdeUsuario?: boolean;
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

function markerPinSvg(color: string) {
  const svg = `<svg width="34" height="46" viewBox="0 0 34 46" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 1C8.16 1 1 8.16 1 17c0 12.2 16 28 16 28s16-15.8 16-28C33 8.16 25.84 1 17 1z"
      fill="${color}" stroke="#ffffff" stroke-width="2"/>
    <!-- carro frontal en blanco -->
    <g fill="#ffffff">
      <rect x="10.2" y="14.4" width="13.6" height="6.6" rx="2.2"/>
      <rect x="12.2" y="12.1" width="9.6" height="3.1" rx="1.4"/>
      <circle cx="12.8" cy="21.6" r="1.35"/>
      <circle cx="21.2" cy="21.6" r="1.35"/>
    </g>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function MapVendedorUbicacion({
  lat,
  lng,
  nombreVendedor,
  tipoPunto = 'tienda',
  userLat,
  userLng,
  mostrarRutaDesdeUsuario,
}: MapVendedorUbicacionProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || '',
    libraries: [...LIBRARIES],
  });

  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [rutaInfo, setRutaInfo] = useState<{ duracion?: string; distancia?: string } | null>(null);
  const [directionsError, setDirectionsError] = useState<string | null>(null);
  const directionsRequested = useRef(false);
  const mapRef = useRef<google.maps.Map | null>(null);

  const redimensionarMapa = useCallback(
    (map: google.maps.Map) => {
      const c = { lat, lng };
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          google.maps.event.trigger(map, 'resize');
          map.setCenter(c);
        });
      });
    },
    [lat, lng]
  );

  useEffect(() => {
    directionsRequested.current = false;
  }, [lat, lng, userLat, userLng, mostrarRutaDesdeUsuario]);

  /** Dentro de modales con overflow/flex el mapa suele medir 0×0 hasta forzar resize */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;
    const t = window.setTimeout(() => redimensionarMapa(map), 50);
    return () => clearTimeout(t);
  }, [isLoaded, lat, lng, redimensionarMapa]);

  if (!apiKey) return <p className="mapa-vendedor-error">Falta la clave de API de Google Maps.</p>;
  if (loadError) return <p className="mapa-vendedor-error">No se pudo cargar el mapa.</p>;
  if (!isLoaded) return <p className="mapa-vendedor-cargando">Cargando mapa…</p>;

  const center = { lat, lng };
  const shouldRequestDirections =
    mostrarRutaDesdeUsuario && userLat != null && userLng != null && !directions && !directionsError;
  const distanciaRectaKm =
    userLat != null && userLng != null ? distanciaKm(userLat, userLng, lat, lng).toFixed(1) : null;
  const colorPunto = tipoPunto === 'taller' ? '#1e5bff' : '#111111';
  const textoTipo = tipoPunto === 'taller' ? 'Taller' : 'Vendedor';

  return (
    <div className="mapa-vendedor-ubicacion">
      <div className="mapa-vendedor-mapa-wrap">
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={center}
          zoom={15}
          options={{ zoomControl: true, mapTypeControl: true, fullscreenControl: true }}
          onLoad={(map) => {
            mapRef.current = map;
            redimensionarMapa(map);
          }}
          onUnmount={() => {
            mapRef.current = null;
          }}
        >
          <Marker
            position={center}
            title={nombreVendedor}
            icon={{
              url: markerPinSvg(colorPunto),
              scaledSize: new google.maps.Size(34, 46),
              anchor: new google.maps.Point(17, 44),
            }}
          />
          {userLat != null && userLng != null && (
            <Marker
              position={{ lat: userLat, lng: userLng }}
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
          {shouldRequestDirections && (
            <DirectionsService
              options={{
                origin: { lat: userLat!, lng: userLng! },
                destination: { lat, lng },
                travelMode: google.maps.TravelMode.DRIVING,
              }}
              callback={(result, status) => {
                if (directionsRequested.current) return;
                directionsRequested.current = true;
                if (status === google.maps.DirectionsStatus.OK && result) {
                  setDirections(result);
                  const leg = result.routes[0]?.legs[0];
                  if (leg) {
                    setRutaInfo({
                      duracion: leg.duration?.text,
                      distancia: leg.distance?.text,
                    });
                  }
                } else {
                  setDirectionsError(
                    status === 'REQUEST_DENIED'
                      ? 'La API key no tiene permiso para rutas. En Google Cloud → Credentials → tu API key → Restricciones de API, agrega "Directions API" y "Maps JavaScript API".'
                      : 'No se pudo calcular la ruta.'
                  );
                }
              }}
            />
          )}
        {directions && (
          <DirectionsRenderer
            directions={directions}
            options={{
              suppressMarkers: true,
            }}
          />
        )}
        </GoogleMap>

        <div className="mapa-vendedor-ficha">
          <div className="mapa-vendedor-ficha-row">
            <p className="mapa-vendedor-ficha-nombre">{nombreVendedor}</p>
          </div>
          <p className="mapa-vendedor-ficha-distancia">
            {rutaInfo?.distancia
              ? `Distancia desde tu ubicación: ${rutaInfo.distancia}`
              : distanciaRectaKm
                ? `Distancia aproximada: ${distanciaRectaKm} km`
                : 'Permite tu ubicación para ver la distancia en km.'}
          </p>
          <div className="mapa-vendedor-ficha-chip-row">
            <span className="mapa-vendedor-chip" style={{ backgroundColor: colorPunto }}>
              {textoTipo}
            </span>
          </div>
        </div>
      </div>
      {mostrarRutaDesdeUsuario && directionsError && (
        <p className="mapa-vendedor-error mapa-vendedor-ruta-error">{directionsError}</p>
      )}
      {mostrarRutaDesdeUsuario && rutaInfo && !directionsError && (
        <div className="mapa-vendedor-ruta-info">
          {rutaInfo.duracion && (
            <span>
              Tiempo estimado: <strong>{rutaInfo.duracion}</strong>
            </span>
          )}
          {rutaInfo.distancia && (
            <span>
              {' '}
              ({rutaInfo.distancia})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
