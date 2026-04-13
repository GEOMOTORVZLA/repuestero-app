import { useCallback, useMemo, type CSSProperties } from 'react';
import { GoogleMap, Marker, useLoadScript } from '@react-google-maps/api';
import './RegistroUbicacionMapa.css';

const LIBRARIES: never[] = [];
const DEFAULT_CENTER = { lat: 8.0, lng: -66.0 };
const ZOOM_AMPLIO = 6;
const ZOOM_CERCA = 17;

const containerStyle: CSSProperties = {
  width: '100%',
  height: '240px',
  borderRadius: '8px',
};

export interface RegistroUbicacionMapaProps {
  latitudStr: string;
  longitudStr: string;
  onPositionChange: (lat: number, lng: number) => void;
  disabled?: boolean;
}

function parseCoord(s: string): number | null {
  const v = parseFloat(s.replace(',', '.').trim());
  return Number.isFinite(v) ? v : null;
}

export function RegistroUbicacionMapa({
  latitudStr,
  longitudStr,
  onPositionChange,
  disabled = false,
}: RegistroUbicacionMapaProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || '',
    libraries: LIBRARIES,
  });

  const lat = parseCoord(latitudStr);
  const lng = parseCoord(longitudStr);
  const valid =
    lat != null &&
    lng != null &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;

  const center = useMemo(
    () => (valid ? { lat: lat!, lng: lng! } : DEFAULT_CENTER),
    [valid, lat, lng]
  );

  const zoom = valid ? ZOOM_CERCA : ZOOM_AMPLIO;

  const aplicarDesdeEvento = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (disabled || !e.latLng) return;
      onPositionChange(e.latLng.lat(), e.latLng.lng());
    },
    [disabled, onPositionChange]
  );

  if (!apiKey) {
    return (
      <div className="registro-ubicacion-mapa registro-ubicacion-mapa--aviso">
        <p>
          Configura <code>VITE_GOOGLE_MAPS_API_KEY</code> para ver el mapa y comprobar o ajustar el punto en vivo.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="registro-ubicacion-mapa registro-ubicacion-mapa--aviso registro-ubicacion-mapa--error">
        <p>No se pudo cargar el mapa. Revisa la clave y las restricciones en Google Cloud.</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="registro-ubicacion-mapa registro-ubicacion-mapa--aviso">
        <p>Cargando mapa…</p>
      </div>
    );
  }

  return (
    <div className="registro-ubicacion-mapa">
      <p className="registro-ubicacion-mapa-leyenda">
        {valid
          ? 'Arrastra el marcador o toca el mapa para afinar la ubicación. Los valores de latitud y longitud se actualizan solos.'
          : 'Toca el mapa para colocar el punto de tu negocio, u obtén el GPS con el botón de arriba.'}
      </p>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={zoom}
        onClick={aplicarDesdeEvento}
        options={{
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
        }}
      >
        {valid && (
          <Marker
            position={{ lat: lat!, lng: lng! }}
            draggable={!disabled}
            onDragEnd={aplicarDesdeEvento}
          />
        )}
      </GoogleMap>
    </div>
  );
}
