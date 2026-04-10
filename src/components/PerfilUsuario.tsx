import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ESTADOS_VENEZUELA, getCiudadesPorEstado } from '../data/ciudadesVenezuela';
import { bannerEstadoCuentaNegocio } from '../utils/estadoCuentaVendedorTaller';
import { EstadoCuentaNegocioBanner } from './EstadoCuentaNegocioBanner';
import './PerfilUsuario.css';

function esCuentaRegistradaComoTaller(u: User | null): boolean {
  if (!u?.user_metadata) return false;
  const md = u.user_metadata as Record<string, unknown>;
  return md.tipo_cuenta === 'taller' || md.perfil_taller != null;
}

interface TiendaPerfil {
  id: string;
  nombre: string | null;
  nombre_comercial: string | null;
  rif: string | null;
  telefono?: string | null;
  telefono_whatsapp?: string | null;
  estado?: string | null;
  ciudad?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  metodos_pago?: string[] | null;
  bloqueado?: boolean | null;
  aprobacion_estado?: string | null;
  membresia_hasta?: string | null;
}

export function PerfilUsuario() {
  const { user } = useAuth();
  const [tienda, setTienda] = useState<TiendaPerfil | null>(null);
  const [tiendaSnapshot, setTiendaSnapshot] = useState<TiendaPerfil | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [refreshPerfil, setRefreshPerfil] = useState(0);
  const [editando, setEditando] = useState(false);
  const [estado, setEstado] = useState<'idle' | 'guardando' | 'ok' | 'error'>('idle');

  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [estadoPassword, setEstadoPassword] =
    useState<'idle' | 'guardando' | 'ok' | 'error'>('idle');
  const [mensajePassword, setMensajePassword] = useState('');
  const [errCargaTienda, setErrCargaTienda] = useState<string | null>(null);

  useEffect(() => {
    const cargar = async () => {
      if (!user) return;
      setCargando(true);
      setMensaje('');
      setErrCargaTienda(null);

      // Leemos como arreglo para evitar problemas con maybeSingle()/limit
      const { data, error } = await supabase
        .from('tiendas')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        setTienda(null);
        setErrCargaTienda(error.message || 'Error al cargar los datos de la tienda.');
        setTiendaSnapshot(null);
        setEditando(false);
        setCargando(false);
        return;
      }

      const rows = (data ?? []) as TiendaPerfil[];
      if (!rows.length) {
        // En vez de mostrar otra sección ("Registrar tienda"),
        // dejamos la misma pantalla lista.
        // Si el registro guardó datos en `user_metadata`, los mostramos aquí.
        const md = (user as any)?.user_metadata ?? {};
        const perfilVendedor = md?.perfil_vendedor ?? null;
        const esCuentaTaller = esCuentaRegistradaComoTaller(user);

        const normalizeMetodosPagoParaMostrar = (value: unknown): string[] => {
          if (!value) return [];
          if (Array.isArray(value)) return value.map((x) => String(x)).filter(Boolean);
          if (typeof value === 'string') {
            const s = value.trim();
            if (!s) return [];
            if (s.startsWith('[') && s.endsWith(']')) {
              try {
                const parsed = JSON.parse(s) as unknown;
                if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
              } catch {
                // ignore
              }
            }
            return s.split(',').map((x) => x.trim()).filter(Boolean);
          }
          return [];
        };

        const toNumberOrNull = (value: unknown): number | null => {
          if (value == null) return null;
          const raw = String(value).trim().replace(',', '.');
          if (!raw) return null;
          const n = parseFloat(raw);
          return Number.isFinite(n) ? n : null;
        };

        if (perfilVendedor) {
          setTienda({
            id: 'nuevo',
            nombre: perfilVendedor.nombre ?? null,
            nombre_comercial: perfilVendedor.nombre_comercial ?? null,
            rif: perfilVendedor.rif ?? null,
            telefono: perfilVendedor.telefono ?? null,
            estado: perfilVendedor.estado ?? null,
            ciudad: perfilVendedor.ciudad ?? null,
            latitud: toNumberOrNull(perfilVendedor.latitud),
            longitud: toNumberOrNull(perfilVendedor.longitud),
            metodos_pago: normalizeMetodosPagoParaMostrar(perfilVendedor.metodos_pago),
          });
          setMensaje('');
        } else if (esCuentaTaller) {
          setTienda(null);
          setMensaje('');
        } else {
          setTienda({
            id: 'nuevo',
            nombre: '',
            nombre_comercial: '',
            rif: '',
            telefono: null,
            estado: null,
            ciudad: null,
            latitud: null,
            longitud: null,
            metodos_pago: [],
          });
          setMensaje(
            'No se encontró una tienda asociada a tu cuenta. Completa los datos y guarda.'
          );
        }
        setTiendaSnapshot(null);
        setEditando(false);
        setCargando(false);
        return;
      }

      const t = rows[0];

      const normalizeMetodosPago = (value: unknown): string[] => {
        if (!value) return [];
        if (Array.isArray(value)) return value.map((x) => String(x)).filter(Boolean);
        if (typeof value === 'string') {
          const s = value.trim();
          if (!s) return [];
          // Caso JSON string: '["Efectivo","Pagomovil"]'
          if (s.startsWith('[') && s.endsWith(']')) {
            try {
              const parsed = JSON.parse(s) as unknown;
              if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
            } catch {
              // ignore
            }
          }
          // Caso texto separado por coma
          return s.split(',').map((x) => x.trim()).filter(Boolean);
        }
        return [];
      };

      const latN =
        t.latitud != null
          ? (() => {
              const raw = String(t.latitud).trim().replace(',', '.');
              if (!raw) return null;
              const n = parseFloat(raw);
              return Number.isFinite(n) ? n : null;
            })()
          : null;

      const lngN =
        t.longitud != null
          ? (() => {
              const raw = String(t.longitud).trim().replace(',', '.');
              if (!raw) return null;
              const n = parseFloat(raw);
              return Number.isFinite(n) ? n : null;
            })()
          : null;

      setTienda({
        ...t,
        telefono: t.telefono ?? t.telefono_whatsapp ?? null,
        latitud: latN,
        longitud: lngN,
        metodos_pago: normalizeMetodosPago(t.metodos_pago),
        membresia_hasta:
          t.membresia_hasta != null ? String(t.membresia_hasta).slice(0, 10) : null,
      });

      setTiendaSnapshot(null);
      setEditando(false);
      setCargando(false);
    };

    cargar();
  }, [user, refreshPerfil]);

  const parseCoord = (value: string): number | null => {
    const cleaned = value.trim().replace(',', '.');
    if (!cleaned) return null;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const normalizarMetodosPagoParaGuardar = (value: unknown): string[] | null => {
    if (!value) return null;
    if (Array.isArray(value)) {
      const normalized = value.map((x) => String(x)).filter(Boolean);
      return normalized.length ? normalized : null;
    }
    if (typeof value === 'string') {
      const normalized = value.split(',').map((x) => x.trim()).filter(Boolean);
      return normalized.length ? normalized : null;
    }
    return null;
  };

  const guardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !tienda) return;
    setEstado('guardando');
    setMensaje('');

    const nombreJuridico = tienda.nombre?.trim() || '';
    const nombreComercial = tienda.nombre_comercial?.trim() || nombreJuridico || '';
    const rif = tienda.rif?.trim() || '';

    const latitudOk = tienda.latitud != null && Number.isFinite(tienda.latitud);
    const longitudOk = tienda.longitud != null && Number.isFinite(tienda.longitud);

    if (!nombreComercial) {
      setEstado('error');
      setMensaje('Completa el nombre comercial.');
      return;
    }
    if (!rif) {
      setEstado('error');
      setMensaje('Completa el RIF.');
      return;
    }
    if (!latitudOk || !longitudOk) {
      setEstado('error');
      setMensaje('Completa latitud y longitud (ubicación).');
      return;
    }

    const payload = {
      user_id: user.id,
      nombre: nombreJuridico || null,
      nombre_comercial: nombreComercial || null,
      rif: rif || null,
      telefono: tienda.telefono?.trim() || null,
      estado: tienda.estado?.trim() || null,
      ciudad: tienda.ciudad?.trim() || null,
      latitud: tienda.latitud ?? null,
      longitud: tienda.longitud ?? null,
      metodos_pago: normalizarMetodosPagoParaGuardar(tienda.metodos_pago),
    };

    const creando = tienda.id === 'nuevo';
    const { error } = creando
      ? await supabase.from('tiendas').insert(payload)
      : await supabase.from('tiendas').update(payload).eq('id', tienda.id);

    if (error) {
      setEstado('error');
      setMensaje(error.message || 'Error al guardar los datos.');
      return;
    }

    setEstado('ok');
    setMensaje(creando ? 'Datos del vendedor guardados correctamente.' : 'Datos del vendedor actualizados correctamente.');
    setEditando(false);
    setRefreshPerfil((n) => n + 1);
  };

  const guardarPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setEstadoPassword('idle');
    setMensajePassword('');

    if (!passwordNueva || !passwordConfirm) {
      setEstadoPassword('error');
      setMensajePassword('Indica la nueva contraseña y su confirmación.');
      return;
    }
    if (passwordNueva !== passwordConfirm) {
      setEstadoPassword('error');
      setMensajePassword('Las contraseñas no coinciden.');
      return;
    }
    if (passwordNueva.length < 6) {
      setEstadoPassword('error');
      setMensajePassword('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setEstadoPassword('guardando');

    const { error } = await supabase.auth.updateUser({
      password: passwordNueva,
    });

    if (error) {
      setEstadoPassword('error');
      setMensajePassword(error.message || 'Error al actualizar la contraseña.');
      return;
    }

    setEstadoPassword('ok');
    setMensajePassword('Contraseña actualizada correctamente.');
    setPasswordNueva('');
    setPasswordConfirm('');
  };

  if (!user) {
    return (
      <p className="perfil-usuario-mensaje">
        No hay sesión activa. Vuelve a iniciar sesión para ver tu perfil.
      </p>
    );
  }

  if (cargando && !tienda) {
    return <p className="perfil-usuario-mensaje">Cargando tu perfil…</p>;
  }

  return (
    <div className="perfil-usuario">
      {tienda ? (
        <EstadoCuentaNegocioBanner
          etiqueta="Vendedor / tienda"
          banner={bannerEstadoCuentaNegocio({
            bloqueado: tienda.bloqueado,
            aprobacion_estado: tienda.aprobacion_estado,
            membresia_hasta: tienda.membresia_hasta ?? null,
            sinFilaEnBd: tienda.id === 'nuevo',
          })}
        />
      ) : null}
      <section className="perfil-usuario-seccion">
        <h3 className="perfil-usuario-titulo">Datos de acceso</h3>
        <div className="perfil-usuario-grid">
          <div className="perfil-usuario-campo">
            <label>Correo de acceso</label>
            <input type="email" value={user.email ?? ''} disabled />
          </div>
        </div>
      </section>

      {errCargaTienda && (
        <section className="perfil-usuario-seccion">
          <p className="perfil-usuario-mensaje error">{errCargaTienda}</p>
        </section>
      )}

      {!(esCuentaRegistradaComoTaller(user) && !tienda) && (
        <section className="perfil-usuario-seccion">
        <h3 className="perfil-usuario-titulo">Resumen del registro del vendedor</h3>
        {mensaje && (
          <p
            className={`perfil-usuario-mensaje ${
              estado === 'error' ? 'error' : estado === 'ok' ? 'ok' : ''
            }`}
          >
            {mensaje}
          </p>
        )}
        {tienda ? (
          <form onSubmit={guardarPerfil} className="perfil-usuario-form">
            <div className="perfil-usuario-grid">
              <div className="perfil-usuario-campo">
                <label>Nombre jurídico</label>
                <input
                  type="text"
                  value={tienda.nombre ?? ''}
                  onChange={(e) =>
                    setTienda({ ...tienda, nombre: e.target.value })
                  }
                  disabled={!editando || estado === 'guardando'}
                />
              </div>
              <div className="perfil-usuario-campo">
                <label>Nombre comercial</label>
                <input
                  type="text"
                  value={tienda.nombre_comercial ?? ''}
                  onChange={(e) =>
                    setTienda({ ...tienda, nombre_comercial: e.target.value })
                  }
                  disabled={!editando || estado === 'guardando'}
                />
              </div>
              <div className="perfil-usuario-campo">
                <label>RIF</label>
                <input
                  type="text"
                  value={tienda.rif ?? ''}
                  onChange={(e) =>
                    setTienda({ ...tienda, rif: e.target.value })
                  }
                  disabled={!editando || estado === 'guardando'}
                />
              </div>
              <div className="perfil-usuario-campo">
                <label>Teléfono</label>
                <input
                  type="text"
                  value={tienda.telefono ?? tienda.telefono_whatsapp ?? ''}
                  onChange={(e) =>
                    setTienda((prev) =>
                      prev
                        ? {
                            ...prev,
                            telefono: e.target.value,
                          }
                        : prev
                    )
                  }
                  disabled={!editando || estado === 'guardando'}
                />
              </div>
              <div className="perfil-usuario-campo">
                <label>Estado</label>
                <select
                  value={tienda.estado ?? ''}
                  onChange={(e) =>
                    setTienda({
                      ...tienda,
                      estado: e.target.value || null,
                      ciudad: '',
                    })
                  }
                  disabled={!editando || estado === 'guardando'}
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
                <label>Ciudad / Municipio</label>
                <select
                  value={tienda.ciudad ?? ''}
                  onChange={(e) =>
                    setTienda({
                      ...tienda,
                      ciudad: e.target.value || null,
                    })
                  }
                  disabled={!editando || estado === 'guardando' || !tienda.estado}
                >
                  <option value="">Selecciona ciudad o municipio</option>
                  {(tienda.estado ? getCiudadesPorEstado(tienda.estado) : []).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="perfil-usuario-campo">
                <label>Latitud</label>
                <input
                  type="text"
                  value={tienda.latitud != null ? String(tienda.latitud) : ''}
                  onChange={(e) =>
                    setTienda({ ...tienda, latitud: parseCoord(e.target.value) })
                  }
                  disabled={!editando || estado === 'guardando'}
                />
              </div>
              <div className="perfil-usuario-campo">
                <label>Longitud</label>
                <input
                  type="text"
                  value={tienda.longitud != null ? String(tienda.longitud) : ''}
                  onChange={(e) =>
                    setTienda({ ...tienda, longitud: parseCoord(e.target.value) })
                  }
                  disabled={!editando || estado === 'guardando'}
                />
              </div>
              <div className="perfil-usuario-campo perfil-usuario-campo-full">
                <label>Métodos de pago (separados por coma)</label>
                <input
                  type="text"
                  value={(tienda.metodos_pago ?? []).join(', ')}
                  onChange={(e) =>
                    setTienda({
                      ...tienda,
                      metodos_pago: e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                  disabled={!editando || estado === 'guardando'}
                />
              </div>
            </div>
            {mensaje && (
              <p
                className={`perfil-usuario-mensaje ${
                  estado === 'error' ? 'error' : estado === 'ok' ? 'ok' : ''
                }`}
              >
                {mensaje}
              </p>
            )}
            {!editando ? (
              <button
                type="button"
                className="perfil-usuario-boton-secundario"
                onClick={() => {
                  setTiendaSnapshot(
                    tienda
                      ? {
                          ...tienda,
                          metodos_pago: Array.isArray(tienda.metodos_pago)
                            ? [...tienda.metodos_pago]
                            : tienda.metodos_pago,
                        }
                      : null
                  );
                  setEstado('idle');
                  setMensaje('');
                  setEditando(true);
                }}
                disabled={estado === 'guardando'}
              >
                Editar perfil
              </button>
            ) : (
              <div className="perfil-usuario-botones-editar">
                <button
                  type="submit"
                  className="perfil-usuario-boton"
                  disabled={estado === 'guardando'}
                >
                  {estado === 'guardando' ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button
                  type="button"
                  className="btn-cancelar-editar"
                  onClick={() => {
                    setEditando(false);
                    setEstado('idle');
                    setMensaje('');
                    if (tiendaSnapshot) setTienda(tiendaSnapshot);
                    setTiendaSnapshot(null);
                  }}
                  disabled={estado === 'guardando'}
                >
                  Cancelar
                </button>
              </div>
            )}
          </form>
        ) : (
          <>
            <p className="perfil-usuario-mensaje">
              {mensaje || 'No se encontró una tienda registrada para este usuario.'}
            </p>
          </>
        )}
        </section>
      )}

      <section className="perfil-usuario-seccion">
        <h3 className="perfil-usuario-titulo">Cambiar contraseña</h3>
        <form onSubmit={guardarPassword} className="perfil-usuario-form">
          <div className="perfil-usuario-grid">
            <div className="perfil-usuario-campo">
              <label>Nueva contraseña</label>
              <input
                type="password"
                value={passwordNueva}
                onChange={(e) => setPasswordNueva(e.target.value)}
                disabled={estadoPassword === 'guardando'}
              />
            </div>
            <div className="perfil-usuario-campo">
              <label>Confirmar contraseña</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                disabled={estadoPassword === 'guardando'}
              />
            </div>
          </div>
          {mensajePassword && (
            <p
              className={`perfil-usuario-mensaje ${
                estadoPassword === 'error' ? 'error' : estadoPassword === 'ok' ? 'ok' : ''
              }`}
            >
              {mensajePassword}
            </p>
          )}
          <button
            type="submit"
            className="perfil-usuario-boton-secundario"
            disabled={estadoPassword === 'guardando'}
          >
            {estadoPassword === 'guardando'
              ? 'Actualizando...'
              : 'Actualizar contraseña'}
          </button>
        </form>
      </section>
    </div>
  );
}