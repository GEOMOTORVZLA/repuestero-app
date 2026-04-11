export const MAPS_NAV_SIN_UBICACION_EVENT = 'geomotor:maps-nav-sin-ubicacion';

export function emitirMapsNavSinUbicacion(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MAPS_NAV_SIN_UBICACION_EVENT));
}