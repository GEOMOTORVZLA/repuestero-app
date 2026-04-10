import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ESTADOS_VENEZUELA, getCiudadesPorEstado } from '../data/ciudadesVenezuela';
import { MARCAS_VEHICULOS } from '../data/marcasVehiculos';
import { ESPECIALIDADES_TALLER } from '../data/registroVenezuela';
import { normalizeEspecialidadesTallerDb } from '../utils/tallerEspecialidades';
import { bannerEstadoCuentaNegocio } from '../utils/estadoCuentaVendedorTaller';
import { EstadoCuentaNegocioBanner } from './EstadoCuentaNegocioBanner';
import './PerfilTaller.css';

const METODOS_PAGO = ['Efectivo', 'Pagomovil', 'Transferencia', 'Zelle', 'Binance', 'Cashea'] as const;

const MARCAS_TALLER = [
  'Multimarca',
  ...MARCAS_VEHICULOS.filter((m) => m !== 'Otra' && m !== 'Aplica varias marcas'),
];

type TallerPerfilFull = {
  id: string;
  nombre: string | null;
  nombre_comercial: string | null;
  rif: string | null;
  tipo_persona: string | null;
  telefono: string | null;
  email: string | null;
  estado: string | null;
  ciudad: string | null;
  latitud: number | null;
  longitud: number | null;
  marca_vehiculo: string | null;
  acerca_de: string | null;
  direccion: string | null;
  especialidad: unknown;
  metodos_pago: string[] | null;
  aprobacion_estado: string | null;
  membresia_hasta: string | null;
  bloqueado: boolean | null;
  created_at: string | null;
};

function normalizeMetodos(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((x) => String(x)).filter(Boolean);
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return [];
    if (s.startsWith('[')) {
      try {
        const p = JSON.parse(s) as unknown;
        if (Array.isArray(p)) return p.map((x) => String(x)).filter(Boolean);
      } catch {
        /* noop */
      }
    }
    return s.split(',').map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function parseCoord(value: string): number | null {
  const cleaned = value.trim().replace(',', '.');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Cuando confirmaste correo pero aún no hay fila en `talleres` (el insert del registro no se ejecutó sin sesión). */
function perfilDesdeSoloMetadata(
  meta: Record<string, unknown>,
  emailCuenta: string | undefined
): TallerPerfilFull {
  return {
    id: 'nuevo',
    nombre: meta.nombre != null ? String(meta.nombre) : null,
    nombre_comercial: meta.nombre_comercial != null ? String(meta.nombre_comercial) : null,
    rif: meta.rif != null ? String(meta.rif) : null,
    tipo_persona: meta.tipo_persona != null ? String(meta.tipo_persona) : null,
    telefono: meta.telefono != null ? String(meta.telefono) : null,
    email: meta.email != null ? String(meta.email) : emailCuenta ?? null,
    estado: meta.estado != null ? String(meta.estado) : null,
    ciudad: meta.ciudad != null ? String(meta.ciudad) : null,
    latitud: numOrNull(meta.latitud),
    longitud: numOrNull(meta.longitud),
    marca_vehiculo: meta.marca_vehiculo != null ? String(meta.marca_vehiculo) : null,
    acerca_de: meta.acerca_de != null ? String(meta.acerca_de) : null,
    direccion: null,
    especialidad: meta.especialidad,
    metodos_pago: normalizeMetodos(meta.metodos_pago),
    aprobacion_estado: null,
    membresia_hasta: null,
    bloqueado: null,
    created_at: null,
  };
}

function perfilDesdeFila(
  row: Record<string, unknown>,
  metaTaller: Record<string, unknown> | null
): TallerPerfilFull {
  return {
    id: String(row.id),
    nombre: (row.nombre as string) ?? null,
    nombre_comercial: (row.nombre_comercial as string) ?? null,
    rif: (row.rif as string) ?? (metaTaller?.rif != null ? String(metaTaller.rif) : null),
    tipo_persona:
      (row.tipo_persona as string) ??
      (metaTaller?.tipo_persona != null ? String(metaTaller.tipo_persona) : null),
    telefono: (row.telefono as string) ?? null,
    email: (row.email as string) ?? null,
    estado: (row.estado as string) ?? null,
    ciudad: (row.ciudad as string) ?? null,
    latitud: numOrNull(row.latitud),
    longitud: numOrNull(row.longitud),
    marca_vehiculo: (row.marca_vehiculo as string) ?? null,
    acerca_de: (row.acerca_de as string) ?? null,
    direccion: (row.direccion as string) ?? null,
    especialidad: row.especialidad,
    metodos_pago: normalizeMetodos(row.metodos_pago),
    aprobacion_estado: (row.aprobacion_estado as string) ?? null,
    membresia_hasta: row.membresia_hasta != null ? String(row.membresia_hasta).slice(0, 10) : null,
    bloqueado: row.bloqueado != null ? Boolean(row.bloqueado) : null,
    created_at: row.created_at != null ? String(row.created_at) : null,
  };
}

function etiquetaTipoPersona(v: string | null): string {
  if (v === 'natural') return 'Persona natural';
  if (v === 'juridico') return 'Persona jurídica';
  return v && v.trim() ? v : '—';
}

function extraerMetaTaller(u: { user_metadata?: Record<string, unknown> } | null): Record<string, unknown> | null {
  if (!u?.user_metadata) return null;
  const raw = u.user_metadata.perfil_taller;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

/** Cuerpo para insert/update; null si faltan mínimos (especialidad, nombre comercial). */
function cuerpoTallerDesdePerfil(d: TallerPerfilFull): Record<string, unknown> | null {
  const esp = normalizeEspecialidadesTallerDb(d.especialidad);
  const nomCom = d.nombre_comercial?.trim() || '';
  if (esp.length === 0 || !nomCom) return null;
  return {
    nombre: d.nombre?.trim() || null,
    nombre_comercial: nomCom,
    tipo_persona: d.tipo_persona || null,
    rif: d.rif?.trim() || null,
    telefono: d.telefono?.trim() || null,
    email: d.email?.trim() || null,
    estado: d.estado?.trim() || null,
    ciudad: d.ciudad?.trim() || null,
    latitud: d.latitud,
    longitud: d.longitud,
    marca_vehiculo: d.marca_vehiculo || null,
    acerca_de: d.acerca_de?.trim() || null,
    direccion: d.direccion?.trim() || null,
    especialidad: esp,
    metodos_pago: d.metodos_pago && d.metodos_pago.length ? d.metodos_pago : null,
  };
}

function perfilTallerCompletoParaGuardar(d: TallerPerfilFull): boolean {
  return cuerpoTallerDesdePerfil(d) != null;
}

export function PerfilTaller() {
  const { user } = useAuth();
  const [datos, setDatos] = useState<TallerPerfilFull | null>(null);
  const [snapshot, setSnapshot] = useState<TallerPerfilFull | null>(null);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  /** Evita dos inserciones en paralelo (p. ej. React StrictMode en desarrollo). */
  const syncEnCursoRef = useRef(false);

  /** Solo lectura desde BD (tras guardar manual o cuando ya existe fila). */
  const recargarSoloDb = async () => {
    if (!user) return;
    setCargando(true);
    setMensaje('');
    const { data: authData } = await supabase.auth.getUser();
    const u = authData?.user ?? user;
    const metaTaller = extraerMetaTaller(u);

    const { data, error } = await supabase.from('talleres').select('*').eq('user_id', u.id).maybeSingle();

    if (error) {
      setDatos(null);
      setMensaje(error.message || 'No se pudo cargar el perfil de taller.');
      setCargando(false);
      return;
    }

    if (data) {
      setDatos(perfilDesdeFila(data as unknown as Record<string, unknown>, metaTaller));
      setEditando(false);
      setSnapshot(null);
    } else {
      setDatos(null);
    }
    setCargando(false);
  };

  useEffect(() => {
    if (!user) {
      setDatos(null);
      setCargando(false);
      return;
    }

    let cancelled = false;

    const inicializar = async () => {
      setCargando(true);
      setMensaje('');
      const { data: authData } = await supabase.auth.getUser();
      const u = authData?.user ?? user;
      const metaTaller = extraerMetaTaller(u);

      const leerFila = async () => {
        const { data, error } = await supabase.from('talleres').select('*').eq('user_id', u.id).maybeSingle();
        return { data, error } as const;
      };

      let { data, error } = await leerFila();

      if (cancelled) return;

      if (error) {
        setDatos(null);
        setMensaje(error.message || 'No se pudo cargar el perfil de taller.');
        setCargando(false);
        return;
      }

      if (data) {
        setDatos(perfilDesdeFila(data as unknown as Record<string, unknown>, metaTaller));
        setEditando(false);
        setSnapshot(null);
        setCargando(false);
        return;
      }

      if (metaTaller && Object.keys(metaTaller).length > 0) {
        const perfilMeta = perfilDesdeSoloMetadata(metaTaller, u.email ?? undefined);
        const cuerpo = cuerpoTallerDesdePerfil(perfilMeta);

        if (!cuerpo) {
          if (!cancelled) {
            setDatos(perfilMeta);
            setEditando(true);
            setMensaje('Completa nombre comercial y al menos una especialidad, luego guarda.');
          }
          setCargando(false);
          return;
        }

        if (!syncEnCursoRef.current) {
          syncEnCursoRef.current = true;
          const { error: insErr } = await supabase.from('talleres').insert({ user_id: u.id, ...cuerpo });
          syncEnCursoRef.current = false;

          if (cancelled) return;

          if (insErr) {
            const retry = await leerFila();
            if (retry.data && !cancelled) {
              setDatos(perfilDesdeFila(retry.data as unknown as Record<string, unknown>, metaTaller));
              setEditando(false);
              setSnapshot(null);
              setCargando(false);
              return;
            }
            if (!cancelled) {
              setDatos(perfilMeta);
              setEditando(false);
              setSnapshot(null);
              setMensaje(
                insErr.message ||
                  'No se pudo activar el perfil automáticamente. Pulsa «Editar perfil», revisa los datos y guarda.'
              );
            }
            setCargando(false);
            return;
          }

          const segunda = await leerFila();
          if (cancelled) return;
          if (segunda.data) {
            setDatos(perfilDesdeFila(segunda.data as unknown as Record<string, unknown>, metaTaller));
            setEditando(false);
            setSnapshot(null);
          } else {
            setDatos(perfilMeta);
            setEditando(false);
            setSnapshot(null);
            setMensaje('No se pudo leer el perfil recién creado. Intenta recargar la página.');
          }
        } else {
          const otra = await leerFila();
          if (!cancelled && otra.data) {
            setDatos(perfilDesdeFila(otra.data as unknown as Record<string, unknown>, metaTaller));
            setEditando(false);
            setSnapshot(null);
          }
        }
        setCargando(false);
        return;
      }

      if (!cancelled) setDatos(null);
      setCargando(false);
    };

    void inicializar();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !datos) return;

    const esp = normalizeEspecialidadesTallerDb(datos.especialidad);
    if (esp.length === 0) {
      setMensaje('Selecciona al menos una especialidad.');
      return;
    }
    const nomCom = datos.nombre_comercial?.trim() || '';
    if (!nomCom) {
      setMensaje('Indica el nombre comercial.');
      return;
    }

    setGuardando(true);
    setMensaje('');

    const payload = cuerpoTallerDesdePerfil({ ...datos, nombre_comercial: nomCom, especialidad: esp });
    if (!payload) {
      setGuardando(false);
      setMensaje('Selecciona al menos una especialidad e indica el nombre comercial.');
      return;
    }

    const esNuevo = datos.id === 'nuevo';
    const { error } = esNuevo
      ? await supabase.from('talleres').insert({ user_id: user.id, ...payload })
      : await supabase.from('talleres').update(payload).eq('id', datos.id).eq('user_id', user.id);

    setGuardando(false);
    if (error) {
      setMensaje(
        error.message ||
          'Error al guardar. Si falta RIF/tipo de persona en la tabla, ejecuta supabase-talleres-rif-tipo-persona.sql en Supabase.'
      );
      return;
    }

    setMensaje(esNuevo ? 'Perfil activado correctamente.' : 'Cambios guardados correctamente.');
    setEditando(false);
    setSnapshot(null);
    await recargarSoloDb();
  };

  if (!user) return null;

  if (cargando) {
    return (
      <div className="perfil-taller">
        <p className="perfil-taller-mensaje">Preparando tu perfil…</p>
      </div>
    );
  }

  if (!datos) {
    return (
      <div className="perfil-taller">
        <h3 className="perfil-taller-titulo">Perfil de taller</h3>
        <p className="perfil-taller-mensaje perfil-taller-mensaje--muted">
          No hay un taller asociado a esta cuenta. Esta sección aparece cuando te registras como taller.
        </p>
      </div>
    );
  }

  const especialidadesSel = normalizeEspecialidadesTallerDb(datos.especialidad);
  const metodosPago = datos.metodos_pago ?? [];
  const esNuevo = datos.id === 'nuevo';
  const perfilCompleto = perfilTallerCompletoParaGuardar(datos);
  /** Datos mínimos incompletos: hay que poder editar hasta el primer guardado exitoso. */
  const modoEdicionObligatoria = !perfilCompleto;
  const camposEditables = modoEdicionObligatoria || editando;
  const disabledCampo = !camposEditables || guardando;

  return (
    <div className="perfil-taller">
      <h3 className="perfil-taller-titulo">Perfil de taller</h3>
      <p className="perfil-taller-subtitulo">Datos de tu registro y lo que verán los clientes cuando tu perfil esté activo.</p>

      <EstadoCuentaNegocioBanner
        etiqueta="Taller"
        banner={bannerEstadoCuentaNegocio({
          bloqueado: datos.bloqueado,
          aprobacion_estado: datos.aprobacion_estado,
          membresia_hasta: datos.membresia_hasta,
          sinFilaEnBd: datos.id === 'nuevo',
        })}
      />

      <form onSubmit={guardar} className="perfil-taller-form">
        <section className="perfil-taller-seccion">
          <h4 className="perfil-taller-seccion-titulo">Identificación</h4>
          <div className="perfil-taller-grid">
            <div className="perfil-taller-campo">
              <label>Tipo de persona</label>
              {camposEditables ? (
                <div className="perfil-taller-radio-fila">
                  <label className="perfil-taller-check">
                    <input
                      type="radio"
                      name="tipo_persona"
                      checked={datos.tipo_persona === 'natural'}
                      disabled={disabledCampo}
                      onChange={() => setDatos({ ...datos, tipo_persona: 'natural' })}
                    />
                    Natural
                  </label>
                  <label className="perfil-taller-check">
                    <input
                      type="radio"
                      name="tipo_persona"
                      checked={datos.tipo_persona === 'juridico'}
                      disabled={disabledCampo}
                      onChange={() => setDatos({ ...datos, tipo_persona: 'juridico' })}
                    />
                    Jurídico
                  </label>
                </div>
              ) : (
                <p className="perfil-taller-valor-solo">{etiquetaTipoPersona(datos.tipo_persona)}</p>
              )}
            </div>
            <div className="perfil-taller-campo">
              <label htmlFor="pt-nombre">Nombre jurídico / razón social</label>
              <input
                id="pt-nombre"
                type="text"
                value={datos.nombre ?? ''}
                disabled={disabledCampo}
                onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
              />
            </div>
            <div className="perfil-taller-campo">
              <label htmlFor="pt-nombre-comercial">Nombre comercial</label>
              <input
                id="pt-nombre-comercial"
                type="text"
                value={datos.nombre_comercial ?? ''}
                disabled={disabledCampo}
                onChange={(e) => setDatos({ ...datos, nombre_comercial: e.target.value })}
              />
            </div>
            <div className="perfil-taller-campo">
              <label htmlFor="pt-rif">RIF</label>
              <input
                id="pt-rif"
                type="text"
                value={datos.rif ?? ''}
                disabled={disabledCampo}
                onChange={(e) => setDatos({ ...datos, rif: e.target.value })}
              />
            </div>
            <div className="perfil-taller-campo">
              <label htmlFor="pt-email-reg">Correo de contacto (registro)</label>
              <input
                id="pt-email-reg"
                type="email"
                value={datos.email ?? ''}
                disabled={disabledCampo}
                onChange={(e) => setDatos({ ...datos, email: e.target.value })}
              />
            </div>
            <div className="perfil-taller-campo">
              <label>Correo de acceso a la cuenta</label>
              <input type="email" value={user.email ?? ''} disabled className="perfil-taller-input-sololectura" />
            </div>
            <div className="perfil-taller-campo">
              <label htmlFor="pt-tel">Teléfono empresa</label>
              <input
                id="pt-tel"
                type="text"
                value={datos.telefono ?? ''}
                disabled={disabledCampo}
                onChange={(e) => setDatos({ ...datos, telefono: e.target.value })}
              />
            </div>
          </div>
        </section>

        <section className="perfil-taller-seccion">
          <h4 className="perfil-taller-seccion-titulo">Ubicación y mapa</h4>
          <div className="perfil-taller-grid">
            <div className="perfil-taller-campo">
              <label htmlFor="pt-estado">Estado</label>
              <select
                id="pt-estado"
                value={datos.estado ?? ''}
                disabled={disabledCampo}
                onChange={(e) => setDatos({ ...datos, estado: e.target.value || null, ciudad: null })}
              >
                <option value="">—</option>
                {ESTADOS_VENEZUELA.map((est) => (
                  <option key={est} value={est}>
                    {est}
                  </option>
                ))}
              </select>
            </div>
            <div className="perfil-taller-campo">
              <label htmlFor="pt-ciudad">Ciudad / municipio</label>
              <select
                id="pt-ciudad"
                value={datos.ciudad ?? ''}
                disabled={disabledCampo || !datos.estado}
                onChange={(e) => setDatos({ ...datos, ciudad: e.target.value || null })}
              >
                <option value="">—</option>
                {(datos.estado ? getCiudadesPorEstado(datos.estado) : []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="perfil-taller-campo">
              <label htmlFor="pt-lat">Latitud (GPS)</label>
              <input
                id="pt-lat"
                type="text"
                value={datos.latitud != null ? String(datos.latitud) : ''}
                disabled={disabledCampo}
                onChange={(e) => setDatos({ ...datos, latitud: parseCoord(e.target.value) })}
              />
            </div>
            <div className="perfil-taller-campo">
              <label htmlFor="pt-lng">Longitud (GPS)</label>
              <input
                id="pt-lng"
                type="text"
                value={datos.longitud != null ? String(datos.longitud) : ''}
                disabled={disabledCampo}
                onChange={(e) => setDatos({ ...datos, longitud: parseCoord(e.target.value) })}
              />
            </div>
            <div className="perfil-taller-campo perfil-taller-campo-full">
              <label htmlFor="pt-dir">Dirección (opcional)</label>
              <input
                id="pt-dir"
                type="text"
                value={datos.direccion ?? ''}
                disabled={disabledCampo}
                onChange={(e) => setDatos({ ...datos, direccion: e.target.value })}
              />
            </div>
          </div>
        </section>

        <section className="perfil-taller-seccion">
          <h4 className="perfil-taller-seccion-titulo">Especialidad y actividad</h4>
          <div className="perfil-taller-grid">
            <div className="perfil-taller-campo perfil-taller-campo-full">
              <label htmlFor="pt-marca">Marca de vehículos</label>
              <select
                id="pt-marca"
                value={datos.marca_vehiculo ?? ''}
                disabled={disabledCampo}
                onChange={(e) => setDatos({ ...datos, marca_vehiculo: e.target.value || null })}
              >
                <option value="">—</option>
                {MARCAS_TALLER.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="perfil-taller-campo perfil-taller-campo-full">
              <label htmlFor="pt-acerca">Acerca de nosotros</label>
              <textarea
                id="pt-acerca"
                rows={4}
                value={datos.acerca_de ?? ''}
                disabled={disabledCampo}
                onChange={(e) => setDatos({ ...datos, acerca_de: e.target.value })}
                className="perfil-taller-textarea"
              />
            </div>
          </div>
        </section>

        <section className="perfil-taller-seccion">
          <h4 className="perfil-taller-seccion-titulo">Especialidades del taller</h4>
          <p className="perfil-taller-hint">Marca todas las ramas en las que trabajas.</p>
          <div className="perfil-taller-check-grid">
            {ESPECIALIDADES_TALLER.map((esp) => (
              <label key={esp} className="perfil-taller-check">
                <input
                  type="checkbox"
                  checked={especialidadesSel.includes(esp)}
                  disabled={disabledCampo}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...especialidadesSel, esp]
                      : especialidadesSel.filter((x) => x !== esp);
                    setDatos({ ...datos, especialidad: next });
                  }}
                />
                {esp}
              </label>
            ))}
          </div>
        </section>

        <section className="perfil-taller-seccion">
          <h4 className="perfil-taller-seccion-titulo">Formas de pago</h4>
          <div className="perfil-taller-check-grid">
            {METODOS_PAGO.map((metodo) => (
              <label key={metodo} className="perfil-taller-check">
                <input
                  type="checkbox"
                  checked={metodosPago.includes(metodo)}
                  disabled={disabledCampo}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...metodosPago, metodo]
                      : metodosPago.filter((m) => m !== metodo);
                    setDatos({ ...datos, metodos_pago: next });
                  }}
                />
                {metodo}
              </label>
            ))}
          </div>
        </section>

        <section className="perfil-taller-seccion perfil-taller-seccion--lectura">
          <h4 className="perfil-taller-seccion-titulo">Estado de la cuenta (solo lectura)</h4>
          <dl className="perfil-taller-dl">
            <dt>Aprobación pública</dt>
            <dd>{esNuevo ? '—' : datos.aprobacion_estado ?? '—'}</dd>
            <dt>Membresía hasta</dt>
            <dd>{esNuevo ? '—' : datos.membresia_hasta ?? '—'}</dd>
            <dt>Registrado el</dt>
            <dd>{esNuevo ? '—' : datos.created_at ? new Date(datos.created_at).toLocaleString() : '—'}</dd>
          </dl>
        </section>

        {mensaje && (
          <p className={`perfil-taller-mensaje ${mensaje.includes('Error') || mensaje.includes('Selecciona') || mensaje.includes('Indica') ? 'error' : 'ok'}`}>
            {mensaje}
          </p>
        )}

        {modoEdicionObligatoria ? (
          <div className="perfil-taller-botones">
            <button type="submit" className="perfil-taller-btn" disabled={guardando}>
              {guardando ? 'Guardando…' : esNuevo ? 'Guardar perfil' : 'Guardar cambios'}
            </button>
          </div>
        ) : !editando ? (
          <button
            type="button"
            className="perfil-taller-btn-sec"
            onClick={() => {
              setSnapshot(structuredClone(datos));
              setEditando(true);
              setMensaje('');
            }}
          >
            Editar perfil
          </button>
        ) : (
          <div className="perfil-taller-botones">
            <button type="submit" className="perfil-taller-btn" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              className="perfil-taller-btn-sec"
              disabled={guardando}
              onClick={() => {
                if (snapshot) setDatos(structuredClone(snapshot));
                setSnapshot(null);
                setEditando(false);
                setMensaje('');
              }}
            >
              Cancelar
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
