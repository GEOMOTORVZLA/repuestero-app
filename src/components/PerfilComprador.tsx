import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ESTADOS_VENEZUELA, getCiudadesPorEstado } from '../data/ciudadesVenezuela';
import './PerfilUsuario.css';

type PerfilCompradorData = {
  tipo_persona: 'natural' | 'juridico';
  nombre: string;
  nombre_comercial: string;
  rif: string;
  telefono: string;
  ramo: string;
  estado: string;
  ciudad: string;
  latitud: string;
  longitud: string;
};

const vacio: PerfilCompradorData = {
  tipo_persona: 'natural',
  nombre: '',
  nombre_comercial: '',
  rif: '',
  telefono: '',
  ramo: '',
  estado: '',
  ciudad: '',
  latitud: '',
  longitud: '',
};

function perfilDesdeMetadata(md: Record<string, unknown>): PerfilCompradorData {
  const p = (md?.perfil_comprador ?? {}) as Record<string, unknown>;
  return {
    tipo_persona: p.tipo_persona === 'juridico' ? 'juridico' : 'natural',
    nombre: String(p.nombre ?? ''),
    nombre_comercial: String(p.nombre_comercial ?? ''),
    rif: String(p.rif ?? ''),
    telefono: String(p.telefono ?? ''),
    ramo: String(p.ramo ?? ''),
    estado: String(p.estado ?? ''),
    ciudad: String(p.ciudad ?? ''),
    latitud: p.latitud != null ? String(p.latitud) : '',
    longitud: p.longitud != null ? String(p.longitud) : '',
  };
}

export function PerfilComprador() {
  const { user } = useAuth();
  const [perfil, setPerfil] = useState<PerfilCompradorData>(vacio);
  const [snapshot, setSnapshot] = useState<PerfilCompradorData | null>(null);
  const [editando, setEditando] = useState(false);
  const [estado, setEstado] = useState<'idle' | 'guardando' | 'ok' | 'error'>('idle');
  const [mensaje, setMensaje] = useState('');
  const [hayDatosRegistro, setHayDatosRegistro] = useState(true);

  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [estadoPassword, setEstadoPassword] =
    useState<'idle' | 'guardando' | 'ok' | 'error'>('idle');
  const [mensajePassword, setMensajePassword] = useState('');

  useEffect(() => {
    if (!user) return;
    const md = (user.user_metadata ?? {}) as Record<string, unknown>;
    const perfilCargado = perfilDesdeMetadata(md);
    setPerfil(perfilCargado);

    const p = (md?.perfil_comprador ?? {}) as Record<string, unknown>;
    const datosReales =
      String(p?.nombre ?? '').trim() ||
      String(p?.nombre_comercial ?? '').trim() ||
      String(p?.rif ?? '').trim() ||
      String(p?.telefono ?? '').trim() ||
      String(p?.ramo ?? '').trim() ||
      String(p?.estado ?? '').trim() ||
      String(p?.ciudad ?? '').trim();
    setHayDatosRegistro(Boolean(datosReales));

    setEditando(false);
    setSnapshot(null);
    setMensaje('');
    setEstado('idle');
  }, [user]);

  const guardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setEstado('guardando');
    setMensaje('');

    const lat = parseFloat(String(perfil.latitud).replace(',', '.'));
    const lng = parseFloat(String(perfil.longitud).replace(',', '.'));
    const perfil_comprador = {
      tipo_persona: perfil.tipo_persona,
      nombre: perfil.nombre.trim() || null,
      nombre_comercial: perfil.nombre_comercial.trim() || null,
      rif: perfil.rif.trim() || null,
      telefono: perfil.telefono.trim() || null,
      ramo: perfil.ramo.trim() || null,
      estado: perfil.estado.trim() || null,
      ciudad: perfil.ciudad.trim() || null,
      latitud: Number.isFinite(lat) ? lat : null,
      longitud: Number.isFinite(lng) ? lng : null,
    };

    const mdPrev = (user.user_metadata ?? {}) as Record<string, unknown>;
    const { error } = await supabase.auth.updateUser({
      data: {
        ...mdPrev,
        tipo_cuenta: 'comprador',
        perfil_comprador,
      },
    });

    if (error) {
      setEstado('error');
      setMensaje(error.message || 'No se pudieron guardar los datos.');
      return;
    }

    setEstado('ok');
    setMensaje('Datos guardados correctamente.');
    setEditando(false);
    setSnapshot(null);
  };

  const guardarPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensajePassword('');
    if (passwordNueva.length < 6) {
      setEstadoPassword('error');
      setMensajePassword('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (passwordNueva !== passwordConfirm) {
      setEstadoPassword('error');
      setMensajePassword('Las contraseñas no coinciden.');
      return;
    }
    setEstadoPassword('guardando');
    const { error } = await supabase.auth.updateUser({ password: passwordNueva });
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

  return (
    <div className="perfil-usuario">
      <section className="perfil-usuario-seccion">
        <h3 className="perfil-usuario-titulo">Datos de acceso</h3>
        <div className="perfil-usuario-grid">
          <div className="perfil-usuario-campo">
            <label>Correo electrónico</label>
            <input type="email" value={user.email ?? ''} disabled />
          </div>
        </div>
      </section>

      <section className="perfil-usuario-seccion">
        <h3 className="perfil-usuario-titulo">Datos de tu registro</h3>
        {mensaje && (
          <p
            className={`perfil-usuario-mensaje ${
              estado === 'error' ? 'error' : estado === 'ok' ? 'ok' : ''
            }`}
          >
            {mensaje}
          </p>
        )}
        {!hayDatosRegistro && (
          <p className="perfil-usuario-mensaje">
            No se encontraron tus datos de registro del comprador en <code>user_metadata</code>.
            Si creaste la cuenta antes de esta función, tendrás que abrir <strong>Editar perfil</strong> y
            guardar para completar la información.
          </p>
        )}
        <form onSubmit={guardarPerfil} className="perfil-usuario-form">
          <div className="perfil-usuario-grid">
            <div className="perfil-usuario-campo">
              <label>Tipo de persona</label>
              <select
                value={perfil.tipo_persona}
                onChange={(e) =>
                  setPerfil({
                    ...perfil,
                    tipo_persona: e.target.value === 'juridico' ? 'juridico' : 'natural',
                  })
                }
                disabled={!editando || estado === 'guardando'}
              >
                <option value="natural">Natural</option>
                <option value="juridico">Jurídico</option>
              </select>
            </div>
            <div className="perfil-usuario-campo">
              <label>Nombre / razón social</label>
              <input
                type="text"
                value={perfil.nombre}
                onChange={(e) => setPerfil({ ...perfil, nombre: e.target.value })}
                disabled={!editando || estado === 'guardando'}
              />
            </div>
            <div className="perfil-usuario-campo">
              <label>Nombre comercial</label>
              <input
                type="text"
                value={perfil.nombre_comercial}
                onChange={(e) => setPerfil({ ...perfil, nombre_comercial: e.target.value })}
                disabled={!editando || estado === 'guardando'}
              />
            </div>
            <div className="perfil-usuario-campo">
              <label>RIF</label>
              <input
                type="text"
                value={perfil.rif}
                onChange={(e) => setPerfil({ ...perfil, rif: e.target.value })}
                disabled={!editando || estado === 'guardando'}
              />
            </div>
            <div className="perfil-usuario-campo">
              <label>Teléfono</label>
              <input
                type="text"
                value={perfil.telefono}
                onChange={(e) => setPerfil({ ...perfil, telefono: e.target.value })}
                disabled={!editando || estado === 'guardando'}
              />
            </div>
            <div className="perfil-usuario-campo perfil-usuario-campo-full">
              <label>Ramo específico</label>
              <input
                type="text"
                value={perfil.ramo}
                onChange={(e) => setPerfil({ ...perfil, ramo: e.target.value })}
                disabled={!editando || estado === 'guardando'}
                placeholder="Ej: Repuestos automotrices"
              />
            </div>
            <div className="perfil-usuario-campo">
              <label>Estado</label>
              <select
                value={perfil.estado}
                onChange={(e) =>
                  setPerfil({
                    ...perfil,
                    estado: e.target.value,
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
                value={perfil.ciudad}
                onChange={(e) => setPerfil({ ...perfil, ciudad: e.target.value })}
                disabled={!editando || estado === 'guardando' || !perfil.estado}
              >
                <option value="">Selecciona ciudad o municipio</option>
                {(perfil.estado ? getCiudadesPorEstado(perfil.estado) : []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="perfil-usuario-campo">
              <label>Latitud (GPS)</label>
              <input
                type="text"
                value={perfil.latitud}
                onChange={(e) => setPerfil({ ...perfil, latitud: e.target.value })}
                disabled={!editando || estado === 'guardando'}
              />
            </div>
            <div className="perfil-usuario-campo">
              <label>Longitud (GPS)</label>
              <input
                type="text"
                value={perfil.longitud}
                onChange={(e) => setPerfil({ ...perfil, longitud: e.target.value })}
                disabled={!editando || estado === 'guardando'}
              />
            </div>
          </div>
          {!editando ? (
            <button
              type="button"
              className="perfil-usuario-boton-secundario"
              onClick={() => {
                setSnapshot({ ...perfil });
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
              <button type="submit" className="perfil-usuario-boton" disabled={estado === 'guardando'}>
                {estado === 'guardando' ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button
                type="button"
                className="btn-cancelar-editar"
                onClick={() => {
                  setEditando(false);
                  setEstado('idle');
                  setMensaje('');
                  if (snapshot) setPerfil(snapshot);
                  setSnapshot(null);
                }}
                disabled={estado === 'guardando'}
              >
                Cancelar
              </button>
            </div>
          )}
        </form>
      </section>

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
            {estadoPassword === 'guardando' ? 'Actualizando...' : 'Actualizar contraseña'}
          </button>
        </form>
      </section>
    </div>
  );
}
