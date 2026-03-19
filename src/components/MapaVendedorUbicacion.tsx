import { useState, useRef, useEffect } from 'react';
import { useLoadScript, GoogleMap, Marker, DirectionsService, DirectionsRenderer } from '@react-google-maps/api';
import './MapaVendedorUbicacion.css';

const LIBRARIES = ['places'] as const;
const containerStyle = { width: '100%', height: '280px' };

interface MapVendedorUbicacionProps {
  lat: number;
  lng: number;
  nombreVendedor: string;
  userLat?: number;
  userLng?: number;
  mostrarRutaDesdeUsuario?: boolean;
}

export function MapVendedorUbicacion({
  lat,
  lng,
  nombreVendedor,
  userLat,
  userLng,
  mostrarRutaDesdeUsuario,
}: MapVendedorUbicacionProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || '',
    libraries: LIBRARIES,
  });

  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [rutaInfo, setRutaInfo] = useState<{ duracion?: string; distancia?: string } | null>(null);
  const [directionsError, setDirectionsError] = useState<string | null>(null);
  const directionsRequested = useRef(false);

  useEffect(() => {
    directionsRequested.current = false;
  }, [lat, lng, userLat, userLng, mostrarRutaDesdeUsuario]);

  if (!apiKey) return <p className="mapa-vendedor-error">Falta la clave de API de Google Maps.</p>;
  if (loadError) return <p className="mapa-vendedor-error">No se pudo cargar el mapa.</p>;
  if (!isLoaded) return <p className="mapa-vendedor-cargando">Cargando mapa…</p>;

  const center = { lat, lng };
  const shouldRequestDirections =
    mostrarRutaDesdeUsuario && userLat != null && userLng != null && !directions && !directionsError;

  return (
    <div className="mapa-vendedor-ubicacion">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={15}
        options={{ zoomControl: true, mapTypeControl: true, fullscreenControl: true }}
      >
        <Marker position={center} title={nombreVendedor} />
        {userLat != null && userLng != null && (
          <Marker position={{ lat: userLat, lng: userLng }} title="Tu ubicación" label="Tú" />
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
        {directions && <DirectionsRenderer directions={directions} />}
      </GoogleMap>
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
