import { esCoordenadaNegocioValida } from '../utils/validarDatosNegocio';

type Props = {
  latitud?: number | null;
  longitud?: number | null;
  onEditar: () => void;
  guardando?: boolean;
};

function resumenCoords(lat?: number | null, lng?: number | null): string {
  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return 'Sin ubicación';
  }
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}

export function AdminCeldaUbicacion({ latitud, longitud, onEditar, guardando = false }: Props) {
  const valido = esCoordenadaNegocioValida(
    latitud != null && Number.isFinite(Number(latitud)) ? Number(latitud) : null,
    longitud != null && Number.isFinite(Number(longitud)) ? Number(longitud) : null
  );
  const resumen = resumenCoords(latitud, longitud);

  return (
    <button
      type="button"
      className={`dashboard-admin-ubicacion-btn${valido ? '' : ' dashboard-admin-ubicacion-btn--sin'}`}
      onClick={onEditar}
      disabled={guardando}
      title={valido ? `${resumen} — Editar ubicación` : 'Sin ubicación válida — Asignar GPS'}
      aria-label={valido ? `Editar ubicación: ${resumen}` : 'Asignar ubicación GPS'}
    >
      {guardando ? '…' : valido ? 'GPS' : 'Sin'}
    </button>
  );
}
