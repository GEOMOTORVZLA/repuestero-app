import { useMemo, useState } from 'react';
import { ESTADOS_VENEZUELA, getCiudadesPorEstado } from '../data/ciudadesVenezuela';
import {
  esCoordenadaNegocioValida,
  mensajeValidacionDatosNegocio,
  parseCoordenadaRegistro,
} from '../utils/validarDatosNegocio';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';

export type PerfilVendedorAdminEditable = {
  id: string;
  user_id: string;
  nombre: string | null;
  nombre_comercial: string | null;
  rif: string | null;
  telefono: string | null;
  email?: string | null;
  estado: string | null;
  ciudad: string | null;
  vertical?: string | null;
  latitud?: number | null;
  longitud?: number | null;
};

export type PerfilVendedorAdminGuardar = {
  nombre: string;
  nombre_comercial: string;
  rif: string;
  telefono: string;
  email: string;
  estado: string;
  ciudad: string;
  vertical: VerticalVehiculo;
  latitud: number | null;
  longitud: number | null;
};

type Props = {
  tienda: PerfilVendedorAdminEditable;
  correoFallback?: string | null;
  guardando?: boolean;
  onGuardar: (datos: PerfilVendedorAdminGuardar) => void;
  onCerrar: () => void;
};

function coordStr(v?: number | null): string {
  if (v == null || !Number.isFinite(Number(v))) return '';
  return String(v);
}

export function AdminModalEditarPerfilVendedor({
  tienda,
  correoFallback,
  guardando = false,
  onGuardar,
  onCerrar,
}: Props) {
  const [nombre, setNombre] = useState(tienda.nombre?.trim() || '');
  const [nombreComercial, setNombreComercial] = useState(tienda.nombre_comercial?.trim() || '');
  const [rif, setRif] = useState(tienda.rif?.trim() || '');
  const [telefono, setTelefono] = useState(tienda.telefono?.trim() || '');
  const [email, setEmail] = useState(tienda.email?.trim() || correoFallback?.trim() || '');
  const [estado, setEstado] = useState(tienda.estado?.trim() || '');
  const [ciudad, setCiudad] = useState(tienda.ciudad?.trim() || '');
  const [vertical, setVertical] = useState<VerticalVehiculo>(
    tienda.vertical === 'moto' ? 'moto' : 'auto'
  );
  const [latitudStr, setLatitudStr] = useState(() => coordStr(tienda.latitud));
  const [longitudStr, setLongitudStr] = useState(() => coordStr(tienda.longitud));
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const ciudades = useMemo(() => (estado ? getCiudadesPorEstado(estado) : []), [estado]);

  const guardar = () => {
    const lat = parseCoordenadaRegistro(latitudStr);
    const lng = parseCoordenadaRegistro(longitudStr);
    const err = mensajeValidacionDatosNegocio({
      nombre: nombre.trim() || null,
      nombre_comercial: nombreComercial.trim() || null,
      rif: rif.trim() || null,
      telefono: telefono.trim() || null,
      estado: estado.trim() || null,
      ciudad: ciudad.trim() || null,
      latitud: lat,
      longitud: lng,
    });
    if (err) {
      setErrorLocal(err);
      return;
    }
    if (!esCoordenadaNegocioValida(lat, lng)) {
      setErrorLocal('Indica coordenadas GPS validas en Venezuela.');
      return;
    }
    setErrorLocal(null);
    onGuardar({
      nombre: nombre.trim(),
      nombre_comercial: nombreComercial.trim() || nombre.trim(),
      rif: rif.trim(),
      telefono: telefono.trim(),
      email: email.trim(),
      estado: estado.trim(),
      ciudad: ciudad.trim(),
      vertical,
      latitud: lat,
      longitud: lng,
    });
  };

  return (
    <div
      className="dashboard-admin-perfil-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-admin-perfil-titulo"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="dashboard-kpi-modal-header">
        <h3 id="dashboard-admin-perfil-titulo" className="dashboard-kpi-modal-titulo">
          Editar perfil - {tienda.nombre_comercial || tienda.nombre || 'Vendedor'}
        </h3>
        <button type="button" className="dashboard-kpi-modal-cerrar" onClick={onCerrar} disabled={guardando}>
          Cerrar
        </button>
      </div>

      <div className="dashboard-admin-perfil-cuerpo">
        <p className="dashboard-admin-perfil-ayuda">
          Puedes corregir datos del vendedor (incluido auto/moto). Los cambios se guardan en la tienda y en el
          perfil de registro.
        </p>

        <div className="dashboard-admin-perfil-grid">
          <label>
            <span>Nombre juridico</span>
            <input value={nombre} disabled={guardando} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label>
            <span>Nombre comercial</span>
            <input
              value={nombreComercial}
              disabled={guardando}
              onChange={(e) => setNombreComercial(e.target.value)}
            />
          </label>
          <label>
            <span>RIF</span>
            <input value={rif} disabled={guardando} onChange={(e) => setRif(e.target.value)} />
          </label>
          <label>
            <span>Telefono</span>
            <input
              value={telefono}
              disabled={guardando}
              inputMode="tel"
              onChange={(e) => setTelefono(e.target.value)}
            />
          </label>
          <label>
            <span>Correo (tienda)</span>
            <input
              type="email"
              value={email}
              disabled={guardando}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            <span>Vertical</span>
            <select
              value={vertical}
              disabled={guardando}
              onChange={(e) => setVertical(e.target.value === 'moto' ? 'moto' : 'auto')}
            >
              <option value="auto">Automovil</option>
              <option value="moto">Motocicleta</option>
            </select>
          </label>
          <label>
            <span>Estado</span>
            <select
              value={estado}
              disabled={guardando}
              onChange={(e) => {
                setEstado(e.target.value);
                setCiudad('');
              }}
            >
              <option value="">Selecciona...</option>
              {ESTADOS_VENEZUELA.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Ciudad</span>
            <select value={ciudad} disabled={guardando || !estado} onChange={(e) => setCiudad(e.target.value)}>
              <option value="">Selecciona...</option>
              {ciudades.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Latitud</span>
            <input
              value={latitudStr}
              disabled={guardando}
              inputMode="decimal"
              onChange={(e) => setLatitudStr(e.target.value)}
            />
          </label>
          <label>
            <span>Longitud</span>
            <input
              value={longitudStr}
              disabled={guardando}
              inputMode="decimal"
              onChange={(e) => setLongitudStr(e.target.value)}
            />
          </label>
        </div>

        {errorLocal && <p className="dashboard-admin-ubicacion-error">{errorLocal}</p>}

        <div className="dashboard-admin-ubicacion-acciones">
          <button type="button" className="dashboard-admin-btn ok" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando...' : 'Guardar perfil'}
          </button>
          <button type="button" className="dashboard-admin-btn" disabled={guardando} onClick={onCerrar}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
