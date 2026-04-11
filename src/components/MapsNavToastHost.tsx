import { useEffect, useRef, useState } from 'react';
import { MENSAJE_TOAST_MAPS_SIN_UBICACION } from '../constants/googleMapsNavUi';
import { MAPS_NAV_SIN_UBICACION_EVENT } from '../utils/mapsNavToastBridge';
import './MapsNavToastHost.css';

const DURACION_MS = 4500;

export function MapsNavToastHost() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onFallback = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setVisible(true);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        timerRef.current = null;
      }, DURACION_MS);
    };
    window.addEventListener(MAPS_NAV_SIN_UBICACION_EVENT, onFallback);
    return () => {
      window.removeEventListener(MAPS_NAV_SIN_UBICACION_EVENT, onFallback);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="maps-nav-toast-host" role="status" aria-live="polite">
      <div className="maps-nav-toast">{MENSAJE_TOAST_MAPS_SIN_UBICACION}</div>
    </div>
  );
}