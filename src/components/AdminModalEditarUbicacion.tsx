import { useCallback, useState } from 'react';
import { RegistroUbicacionMapa } from './RegistroUbicacionMapa';
import {
  esCoordenadaNegocioValida,
  parseCoordenadaRegistro,
} from '../utils/validarDatosNegocio';

type Props = {
  nombre: string;
  latitudInicial?: number | null;
  longitudInicial?: number | null;
  guardando?: boolean;
  onGuardar: (latitud: number, longitud: number) => void;
  onCerrar: () => void;
};

function coordInicialStr(v?: number | null): string {
  if (v == null || !Number.isFinite(Number(v))) return '';
  return String(v);
}

export function AdminModalEditarUbicacion({
  nombre,
  latitudInicial,
  longitudInicial,
  guardando = false,
  onGuardar,
  onCerrar,
}: Props) {
  const [latitudStr, setLatitudStr] = useState(() => coordInicialStr(latitudInicial));
  const [longitudStr, setLongitudStr] = useState(() => coordInicialStr(longitudInicial));
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const aplicarPosicion = useCallback((lat: number, lng: number) => {
    setLatitudStr(String(lat));
    setLongitudStr(String(lng));
    setErrorLocal(null);
  }, []);

  const guardar = () => {
    const lat = parseCoordenadaRegistro(latitudStr);
    const lng = parseCoordenadaRegistro(longitudStr);
    if (!esCoordenadaNegocioValida(lat, lng)) {
      setErrorLocal(
        'Indica coordenadas válidas en Venezuela (no se acepta 0,0). Usa el mapa o escribe latitud y longitud.'
      );
      return;
    }
    onGuardar(lat!, lng!);
  };

  return (
    <div
      className="dashboard-admin-ubicacion-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-ubicacion-titulo"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="dashboard-kpi-modal-header">
        <h3 id="dashboard-ubicacion-titulo" className="dashboard-kpi-modal-titulo">
          Ubicación — {nombre}
        </h3>
        <button type="button" className="dashboard-kpi-modal-cerrar" onClick={onCerrar} disabled={guardando}>
          Cerrar
        </button>
      </div>
      <div className="dashboard-admin-ubicacion-cuerpo">
        <div className="dashboard-admin-ubicacion-campos">
          <label className="dashboard-admin-ubicacion-campo">
            <span>Latitud</span>
            <input
              type="text"
              inputMode="decimal"
              value={latitudStr}
              disabled={guardando}
              onChange={(e) => {
                setLatitudStr(e.target.value);
                setErrorLocal(null);
              }}
            />
          </label>
          <label className="dashboard-admin-ubicacion-campo">
            <span>Longitud</span>
            <input
              type="text"
              inputMode="decimal"
              value={longitudStr}
              disabled={guardando}
              onChange={(e) => {
                setLongitudStr(e.target.value);
                setErrorLocal(null);
              }}
            />
          </label>
        </div>
        <RegistroUbicacionMapa
          latitudStr={latitudStr}
          longitudStr={longitudStr}
          onPositionChange={aplicarPosicion}
          disabled={guardando}
        />
        {errorLocal && <p className="dashboard-admin-ubicacion-error">{errorLocal}</p>}
        <div className="dashboard-admin-ubicacion-acciones">
          <button
            type="button"
            className="dashboard-admin-btn dashboard-admin-btn--compacto"
            onClick={onCerrar}
            disabled={guardando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="dashboard-admin-btn ok dashboard-admin-btn--compacto"
            onClick={guardar}
            disabled={guardando}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
