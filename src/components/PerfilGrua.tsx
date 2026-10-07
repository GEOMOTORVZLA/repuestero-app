import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ESTADOS_VENEZUELA, getCiudadesPorEstado } from '../data/ciudadesVenezuela';
import { TIPOS_GRUA, type TipoGruaId } from '../data/tiposGrua';
import { mensajeValidacionDatosNegocio } from '../utils/validarDatosNegocio';
import './PerfilTaller.css';

const METODOS_PAGO = ['Efectivo', 'Pagomovil', 'Transferencia', 'Zelle', 'Binance', 'Cashea'] as const;

type GruaPerfil = {
  id: string | null;
  nombre: string;
  nombre_comercial: string;
  rif: string;
  telefono: string;
  estado: string;
  ciudad: string;
  tipos: TipoGruaId[];
  servicio_24h: boolean;
  auxilio_vial: boolean;
  acerca_de: string;
  metodos_pago: string[];
};

function tiposDesdeDb(value: unknown): TipoGruaId[] {
  const ids = TIPOS_GRUA.map((t) => t.id);
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is TipoGruaId => typeof x === 'string' && ids.includes(x as TipoGruaId));
}

export function PerfilGrua() {
  const { user } = useAuth();
  const [datos, setDatos] = useState<GruaPerfil | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('gruas')
        .select(
          'id, nombre, nombre_comercial, rif, telefono, estado, ciudad, tipos, servicio_24h, auxilio_vial, acerca_de, metodos_pago'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        const row = data as Record<string, unknown>;
        setDatos({
          id: typeof row.id === 'string' ? row.id : null,
          nombre: String(row.nombre ?? ''),
          nombre_comercial: String(row.nombre_comercial ?? ''),
          rif: String(row.rif ?? ''),
          telefono: String(row.telefono ?? ''),
          estado: String(row.estado ?? ''),
          ciudad: String(row.ciudad ?? ''),
          tipos: tiposDesdeDb(row.tipos),
          servicio_24h: row.servicio_24h === true,
          auxilio_vial: row.auxilio_vial === true,
          acerca_de: String(row.acerca_de ?? ''),
          metodos_pago: Array.isArray(row.metodos_pago) ? row.metodos_pago.map(String) : [],
        });
        return;
      }
      const md = (user.user_metadata ?? {}) as Record<string, unknown>;
      const p = (md.perfil_grua ?? {}) as Record<string, unknown>;
      setDatos({
        id: null,
        nombre: String(p.nombre ?? ''),
        nombre_comercial: String(p.nombre_comercial ?? ''),
        rif: String(p.rif ?? ''),
        telefono: String(p.telefono ?? ''),
        estado: String(p.estado ?? ''),
        ciudad: String(p.ciudad ?? ''),
        tipos: tiposDesdeDb(p.tipos),
        servicio_24h: p.servicio_24h === true,
        auxilio_vial: p.auxilio_vial === true,
        acerca_de: String(p.acerca_de ?? ''),
        metodos_pago: Array.isArray(p.metodos_pago) ? p.metodos_pago.map(String) : [],
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !datos) return;
    setMensaje('');
    setError(false);
    if (datos.tipos.length === 0) {
      setError(true);
      setMensaje('Selecciona al menos un tipo de grúa.');
      return;
    }
    if (!datos.nombre.trim() && !datos.nombre_comercial.trim()) {
      setError(true);
      setMensaje('Indica el nombre jurídico o comercial.');
      return;
    }
    const err = mensajeValidacionDatosNegocio({
      nombre: datos.nombre,
      nombre_comercial: datos.nombre_comercial,
      rif: datos.rif,
      telefono: datos.telefono,
      estado: datos.estado,
      ciudad: datos.ciudad,
      latitud: 10.5,
      longitud: -66.9,
    });
    if (err && !err.includes('ubicación')) {
      setError(true);
      setMensaje(err);
      return;
    }
    setGuardando(true);
    const cuerpo = {
      nombre: datos.nombre.trim() || datos.nombre_comercial.trim(),
      nombre_comercial: datos.nombre_comercial.trim() || datos.nombre.trim(),
      rif: datos.rif.trim() || null,
      telefono: datos.telefono.trim() || null,
      estado: datos.estado.trim() || null,
      ciudad: datos.ciudad.trim() || null,
      tipos: datos.tipos,
      servicio_24h: datos.servicio_24h,
      auxilio_vial: datos.auxilio_vial,
      acerca_de: datos.acerca_de.trim() || null,
      metodos_pago: datos.metodos_pago.length ? datos.metodos_pago : null,
    };
    const { error: upErr } = datos.id
      ? await supabase.from('gruas').update(cuerpo).eq('id', datos.id)
      : await supabase.from('gruas').insert({ ...cuerpo, user_id: user.id });
    setGuardando(false);
    if (upErr) {
      setError(true);
      setMensaje(upErr.message || 'No se pudo guardar.');
      return;
    }
    setMensaje('Datos actualizados.');
  };

  if (!datos) return <p>Cargando datos…</p>;

  return (
    <form onSubmit={(e) => void guardar(e)} className="perfil-usuario-form">
      <div className="perfil-usuario-grid">
        <div className="perfil-usuario-campo">
          <label htmlFor="grua-nombre">Nombre jurídico</label>
          <input
            id="grua-nombre"
            value={datos.nombre}
            onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
            disabled={guardando}
          />
        </div>
        <div className="perfil-usuario-campo">
          <label htmlFor="grua-nombre-com">Nombre comercial</label>
          <input
            id="grua-nombre-com"
            value={datos.nombre_comercial}
            onChange={(e) => setDatos({ ...datos, nombre_comercial: e.target.value })}
            disabled={guardando}
          />
        </div>
        <div className="perfil-usuario-campo">
          <label htmlFor="grua-tel">Teléfono</label>
          <input
            id="grua-tel"
            value={datos.telefono}
            onChange={(e) => setDatos({ ...datos, telefono: e.target.value })}
            disabled={guardando}
          />
        </div>
        <div className="perfil-usuario-campo">
          <label htmlFor="grua-rif">RIF</label>
          <input
            id="grua-rif"
            value={datos.rif}
            onChange={(e) => setDatos({ ...datos, rif: e.target.value })}
            disabled={guardando}
          />
        </div>
        <div className="perfil-usuario-campo">
          <label htmlFor="grua-estado">Estado</label>
          <select
            id="grua-estado"
            value={datos.estado}
            onChange={(e) => setDatos({ ...datos, estado: e.target.value, ciudad: '' })}
            disabled={guardando}
          >
            <option value="">Selecciona el estado</option>
            {ESTADOS_VENEZUELA.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div className="perfil-usuario-campo">
          <label htmlFor="grua-ciudad">Ciudad / Municipio</label>
          <select
            id="grua-ciudad"
            value={datos.ciudad}
            onChange={(e) => setDatos({ ...datos, ciudad: e.target.value })}
            disabled={guardando || !datos.estado}
          >
            <option value="">Selecciona ciudad o municipio</option>
            {(datos.estado ? getCiudadesPorEstado(datos.estado) : []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="form-registro-metodos-pago-hint">Tipos de grúa</p>
      <div className="form-registro-metodos-pago-opciones">
        {TIPOS_GRUA.map((t) => (
          <label key={t.id} className="form-registro-metodos-pago-opcion">
            <input
              type="checkbox"
              checked={datos.tipos.includes(t.id)}
              onChange={(e) => {
                setDatos({
                  ...datos,
                  tipos: e.target.checked
                    ? [...datos.tipos, t.id]
                    : datos.tipos.filter((x) => x !== t.id),
                });
              }}
              disabled={guardando}
            />
            {t.nombre}
          </label>
        ))}
      </div>
      <div className="form-registro-metodos-pago-opciones">
        <label className="form-registro-metodos-pago-opcion">
          <input
            type="checkbox"
            checked={datos.servicio_24h}
            onChange={(e) => setDatos({ ...datos, servicio_24h: e.target.checked })}
            disabled={guardando}
          />
          Servicio 24 horas
        </label>
        <label className="form-registro-metodos-pago-opcion">
          <input
            type="checkbox"
            checked={datos.auxilio_vial}
            onChange={(e) => setDatos({ ...datos, auxilio_vial: e.target.checked })}
            disabled={guardando}
          />
          Auxilio vial
        </label>
      </div>
      <div className="perfil-usuario-campo">
        <label htmlFor="grua-acerca">Acerca de nosotros</label>
        <textarea
          id="grua-acerca"
          value={datos.acerca_de}
          onChange={(e) => setDatos({ ...datos, acerca_de: e.target.value })}
          rows={3}
          disabled={guardando}
          className="form-registro-textarea"
        />
      </div>
      <div className="form-registro-metodos-pago-opciones">
        {METODOS_PAGO.map((m) => (
          <label key={m} className="form-registro-metodos-pago-opcion">
            <input
              type="checkbox"
              checked={datos.metodos_pago.includes(m)}
              onChange={(e) => {
                setDatos({
                  ...datos,
                  metodos_pago: e.target.checked
                    ? [...datos.metodos_pago, m]
                    : datos.metodos_pago.filter((x) => x !== m),
                });
              }}
              disabled={guardando}
            />
            {m}
          </label>
        ))}
      </div>
      {mensaje && <p className={`perfil-usuario-mensaje ${error ? 'error' : 'ok'}`}>{mensaje}</p>}
      <button type="submit" className="perfil-usuario-boton-secundario" disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </form>
  );
}
