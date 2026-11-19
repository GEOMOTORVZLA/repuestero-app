import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { CODIGOS_TELEFONO, ESPECIALIDADES_TALLER, ESPECIALIDADES_TALLER_MOTO, TIPOS_RIF } from '../data/registroVenezuela';
import { ESTADOS_VENEZUELA, getCiudadesPorEstado } from '../data/ciudadesVenezuela';
import { TIPOS_GRUA, type TipoGruaId } from '../data/tiposGrua';
import { RegistroUbicacionMapa } from './RegistroUbicacionMapa';
import { permitirAccionCliente } from '../utils/rateLimitCliente';
import {
  esRestoTelefonoValido,
  esRifValido,
  mensajeValidacionDatosNegocio,
  parseCoordenadaRegistro,
  rifDesdeFormularioRegistro,
} from '../utils/validarDatosNegocio';
import { correoAccesoInterno, mensajeErrorFuncion, usuarioAccesoDesdeNombre } from '../utils/correoAcceso';
import { VERTICAL_AUTO, VERTICAL_MOTO, type VerticalVehiculo } from '../utils/verticalVehiculo';
import './ImportarProductosCSV.css';
import './CrearUsuarioAdmin.css';

type TipoNegocio = 'vendedor' | 'taller' | 'grua';
type Respuesta = { ok?: boolean; error?: string; email?: string; nombre?: string };

const ETIQUETA: Record<TipoNegocio, string> = {
  vendedor: 'tienda',
  taller: 'taller',
  grua: 'grúa',
};

type NegocioCreado = {
  id: string;
  user_id: string;
  email: string;
  tipo: TipoNegocio;
  nombre: string | null;
  nombre_comercial: string | null;
  rif: string | null;
  telefono: string | null;
  estado: string | null;
  ciudad: string | null;
  latitud: number | null;
  longitud: number | null;
  vertical?: string | null;
  especialidad?: string[] | string | null;
  tipos?: string[] | null;
  servicio_24h?: boolean | null;
  auxilio_vial?: boolean | null;
};

function partirTelefono(telefono: string | null): { codigo: string; resto: string } {
  const digitos = String(telefono ?? '').replace(/\D/g, '');
  const codigo = [...CODIGOS_TELEFONO.map((c) => c.codigo)].sort((a, b) => b.length - a.length).find((c) =>
    digitos.startsWith(c)
  );
  if (!codigo) return { codigo: CODIGOS_TELEFONO[0].codigo, resto: digitos.slice(0, 7) };
  return { codigo, resto: digitos.slice(codigo.length, codigo.length + 7) };
}

function partirRif(rif: string | null): { tipo: string; numero: string } {
  const limpio = String(rif ?? '').trim().toUpperCase();
  const tipo = TIPOS_RIF.find((item) => limpio.startsWith(item)) ?? TIPOS_RIF[0];
  return { tipo, numero: limpio.startsWith(tipo) ? limpio.slice(tipo.length) : limpio };
}

function comoLista(valor: string[] | string | null | undefined): string[] {
  if (Array.isArray(valor)) return valor.filter((item) => typeof item === 'string');
  if (typeof valor === 'string' && valor.trim()) return [valor.trim()];
  return [];
}

export function CrearUsuarioAdmin({ onCreado }: { onCreado?: () => void }) {
  const [tipo, setTipo] = useState<TipoNegocio>('vendedor');
  const [vertical, setVertical] = useState<VerticalVehiculo>(VERTICAL_AUTO);
  const [nombre, setNombre] = useState('');
  const [nombreComercial, setNombreComercial] = useState('');
  const [usuarioTocado, setUsuarioTocado] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [codigoTel, setCodigoTel] = useState<string>(CODIGOS_TELEFONO[0].codigo);
  const [restoTel, setRestoTel] = useState('');
  const [tipoRif, setTipoRif] = useState<string>(TIPOS_RIF[0]);
  const [numeroRif, setNumeroRif] = useState('');
  const [estado, setEstado] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [latitud, setLatitud] = useState('');
  const [longitud, setLongitud] = useState('');
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  const [tiposGrua, setTiposGrua] = useState<TipoGruaId[]>([]);
  const [servicio24h, setServicio24h] = useState(false);
  const [auxilioVial, setAuxilioVial] = useState(false);
  const [fase, setFase] = useState<'idle' | 'creando' | 'guardando' | 'ok' | 'error'>('idle');
  const [mensaje, setMensaje] = useState('');
  const [lista, setLista] = useState<NegocioCreado[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<NegocioCreado | null>(null);

  const ciudades = useMemo(() => {
    const base = estado ? getCiudadesPorEstado(estado) : [];
    if (ciudad && !base.includes(ciudad)) return [ciudad, ...base];
    return base;
  }, [estado, ciudad]);
  const especialidadOpciones = vertical === 'moto' ? ESPECIALIDADES_TALLER_MOTO : ESPECIALIDADES_TALLER;
  const usuarioVisible = usuarioTocado ? usuario : usuarioAccesoDesdeNombre(nombreComercial || nombre);
  const ocupado = fase === 'creando' || fase === 'guardando';
  const listaFiltrada = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((fila) =>
      [fila.nombre, fila.nombre_comercial, fila.telefono, fila.rif, fila.email, ETIQUETA[fila.tipo]]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [lista, busqueda]);

  const cargarLista = async () => {
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string; filas?: NegocioCreado[] }>(
      'admin-negocios-creados',
      { body: { accion: 'listar' } }
    );
    if (error || data?.ok === false) return;
    setLista(Array.isArray(data?.filas) ? data.filas : []);
  };

  useEffect(() => {
    void cargarLista();
  }, []);

  const limpiarAlta = () => {
    setEditando(null);
    setTipo('vendedor');
    setVertical(VERTICAL_AUTO);
    setNombre('');
    setNombreComercial('');
    setUsuarioTocado(false);
    setUsuario('');
    setPassword('');
    setPassword2('');
    setCodigoTel(CODIGOS_TELEFONO[0].codigo);
    setRestoTel('');
    setTipoRif(TIPOS_RIF[0]);
    setNumeroRif('');
    setEstado('');
    setCiudad('');
    setLatitud('');
    setLongitud('');
    setEspecialidades([]);
    setTiposGrua([]);
    setServicio24h(false);
    setAuxilioVial(false);
    setFase('idle');
    setMensaje('');
  };

  const abrirEdicion = (fila: NegocioCreado) => {
    const tel = partirTelefono(fila.telefono);
    const rif = partirRif(fila.rif);
    const tipoFila: TipoNegocio = fila.tipo === 'taller' || fila.tipo === 'grua' ? fila.tipo : 'vendedor';
    setEditando(fila);
    setTipo(tipoFila);
    setVertical(fila.vertical === 'moto' ? VERTICAL_MOTO : VERTICAL_AUTO);
    setNombre(fila.nombre ?? '');
    setNombreComercial(fila.nombre_comercial ?? '');
    setUsuarioTocado(true);
    setUsuario(fila.email);
    setPassword('');
    setPassword2('');
    setCodigoTel(tel.codigo);
    setRestoTel(tel.resto);
    setTipoRif(rif.tipo);
    setNumeroRif(rif.numero);
    setEstado(fila.estado ?? '');
    setCiudad(fila.ciudad ?? '');
    setLatitud(fila.latitud == null ? '' : String(fila.latitud));
    setLongitud(fila.longitud == null ? '' : String(fila.longitud));
    setEspecialidades(comoLista(fila.especialidad));
    setTiposGrua(comoLista(fila.tipos).filter((item): item is TipoGruaId => TIPOS_GRUA.some((op) => op.id === item)));
    setServicio24h(fila.servicio_24h === true);
    setAuxilioVial(fila.auxilio_vial === true);
    setFase('idle');
    setMensaje('');
  };

  const alCambiarComercial = (valor: string) => {
    setNombreComercial(valor);
    if (!usuarioTocado) setUsuario(usuarioAccesoDesdeNombre(valor || nombre));
  };

  const alternar = (lista: string[], valor: string, poner: (next: string[]) => void) => {
    poner(lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]);
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje('');
    const telefono = `${codigoTel}${restoTel.replace(/\D/g, '')}`;
    const rif = rifDesdeFormularioRegistro(tipoRif, numeroRif);
    const lat = parseCoordenadaRegistro(latitud);
    const lng = parseCoordenadaRegistro(longitud);
    if (!esRestoTelefonoValido(restoTel)) {
      setFase('error');
      setMensaje('Indica el teléfono completo (7 dígitos después del código).');
      return;
    }
    if (!esRifValido(tipoRif, numeroRif)) {
      setFase('error');
      setMensaje('Indica el RIF.');
      return;
    }
    const errorDatos = mensajeValidacionDatosNegocio({
      nombre,
      nombre_comercial: nombreComercial,
      telefono,
      estado,
      ciudad,
      latitud: lat,
      longitud: lng,
      rif,
    });
    if (errorDatos) {
      setFase('error');
      setMensaje(errorDatos);
      return;
    }
    if (tipo === 'taller' && especialidades.length === 0) {
      setFase('error');
      setMensaje('Selecciona al menos una especialidad del taller.');
      return;
    }
    if (tipo === 'grua' && tiposGrua.length === 0) {
      setFase('error');
      setMensaje('Selecciona al menos un tipo de grúa.');
      return;
    }
    if (password.length < 6) {
      setFase('error');
      setMensaje('La clave debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== password2) {
      setFase('error');
      setMensaje('Las claves no coinciden.');
      return;
    }
    const local = usuarioVisible.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{1,46}$/.test(local)) {
      setFase('error');
      setMensaje('El usuario debe usar letras, números o guiones, sin espacios.');
      return;
    }
    const rl = permitirAccionCliente('admin-crear-usuario', {
      maxIntentos: 12,
      ventanaMs: 10 * 60 * 1000,
      bloqueoMs: 3 * 60 * 1000,
    });
    if (!rl.ok) {
      setFase('error');
      setMensaje(rl.mensaje);
      return;
    }

    setFase('creando');
    const { data, error } = await supabase.functions.invoke<Respuesta>('admin-crear-negocio', {
      body: {
        tipo,
        vertical,
        nombre: nombre.trim(),
        nombre_comercial: nombreComercial.trim(),
        telefono,
        rif,
        estado,
        ciudad,
        latitud: lat,
        longitud: lng,
        usuario: local,
        password,
        especialidad: especialidades,
        tipos: tiposGrua,
        servicio_24h: servicio24h,
        auxilio_vial: auxilioVial,
      },
    });
    if (error || data?.ok === false || !data?.email) {
      setFase('error');
      setMensaje(await mensajeErrorFuncion(error, data));
      return;
    }
    setFase('ok');
    setMensaje(
      `Listo. ${data.nombre || nombreComercial || nombre} ya está en la página. Usuario: ${data.email}. Clave: ${password}. Entrégale esos datos. Cuando tengan su correo, lo cambian en el perfil.`
    );
    setPassword('');
    setPassword2('');
    onCreado?.();
    void cargarLista();
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setMensaje('');
    const telefono = `${codigoTel}${restoTel.replace(/\D/g, '')}`;
    const rif = rifDesdeFormularioRegistro(tipoRif, numeroRif);
    const lat = parseCoordenadaRegistro(latitud);
    const lng = parseCoordenadaRegistro(longitud);
    if (!esRestoTelefonoValido(restoTel)) {
      setFase('error');
      setMensaje('Indica el teléfono completo (7 dígitos después del código).');
      return;
    }
    if (!esRifValido(tipoRif, numeroRif)) {
      setFase('error');
      setMensaje('Indica el RIF.');
      return;
    }
    const errorDatos = mensajeValidacionDatosNegocio({
      nombre,
      nombre_comercial: nombreComercial,
      telefono,
      estado,
      ciudad,
      latitud: lat,
      longitud: lng,
      rif,
    });
    if (errorDatos) {
      setFase('error');
      setMensaje(errorDatos);
      return;
    }
    if (tipo === 'taller' && especialidades.length === 0) {
      setFase('error');
      setMensaje('Selecciona al menos una especialidad del taller.');
      return;
    }
    if (tipo === 'grua' && tiposGrua.length === 0) {
      setFase('error');
      setMensaje('Selecciona al menos un tipo de grúa.');
      return;
    }
    if ((password || password2) && password.length < 6) {
      setFase('error');
      setMensaje('La clave nueva debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== password2) {
      setFase('error');
      setMensaje('Las claves no coinciden.');
      return;
    }
    setFase('guardando');
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string; nombre?: string }>(
      'admin-negocios-creados',
      {
        body: {
          accion: 'actualizar',
          userId: editando.user_id,
          negocioId: editando.id,
          tipo,
          vertical,
          nombre: nombre.trim(),
          nombre_comercial: nombreComercial.trim(),
          telefono,
          rif,
          estado,
          ciudad,
          latitud: lat,
          longitud: lng,
          password,
          especialidad: especialidades,
          tipos: tiposGrua,
          servicio_24h: servicio24h,
          auxilio_vial: auxilioVial,
        },
      }
    );
    if (error || data?.ok === false) {
      setFase('error');
      setMensaje(await mensajeErrorFuncion(error, data));
      return;
    }
    setFase('ok');
    setPassword('');
    setPassword2('');
    setMensaje(
      `Listo. ${data?.nombre || nombreComercial || nombre} quedó actualizado.${
        password ? ' La clave también cambió.' : ''
      }`
    );
    onCreado?.();
    void cargarLista();
  };

  return (
    <section className="dashboard-seccion">
      <h2 className="dashboard-seccion-titulo">Crear usuario</h2>
      <p className="dashboard-kpi-grid-hint">
        Crea una tienda, un taller o una grúa sin correo de confirmación. El acceso es un correo inventado que no
        recibe mensajes, con la clave que tú asignas. El negocio queda publicado en la página. Abajo puedes corregir
        los que ya creaste aquí.
      </p>
      <div className="crear-usuario-lista">
        <h3 className="crear-usuario-lista-titulo">Negocios creados aquí</h3>
        <label className="crear-usuario-buscar">
          Buscar
          <input
            type="search"
            value={busqueda}
            placeholder="Nombre, teléfono, RIF o usuario"
            onChange={(ev) => setBusqueda(ev.target.value)}
          />
        </label>
        {listaFiltrada.length === 0 ? (
          <p className="dashboard-texto-placeholder">Todavía no hay negocios creados desde esta sección.</p>
        ) : (
          <div className="dashboard-admin-table-wrap">
            <table className="dashboard-admin-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Teléfono</th>
                  <th>Usuario</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map((fila) => (
                  <tr key={fila.id}>
                    <td className="dashboard-admin-texto-td">{fila.nombre_comercial || fila.nombre || '—'}</td>
                    <td>{ETIQUETA[fila.tipo] ?? fila.tipo}</td>
                    <td>{fila.telefono || '—'}</td>
                    <td className="dashboard-admin-texto-td">{fila.email}</td>
                    <td>
                      <button type="button" className="dashboard-btn-accion" onClick={() => abrirEdicion(fila)}>
                        Modificar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <form onSubmit={(ev) => void (editando ? guardar(ev) : crear(ev))}>
        <div className="crear-usuario-grid">
          <label>
            Tipo
            <select
              value={tipo}
              disabled={ocupado || Boolean(editando)}
              onChange={(ev) => {
                setTipo(ev.target.value as TipoNegocio);
                setEspecialidades([]);
                setTiposGrua([]);
              }}
            >
              <option value="vendedor">Tienda de repuestos</option>
              <option value="taller">Taller</option>
              <option value="grua">Grúa</option>
            </select>
          </label>
          {tipo !== 'grua' && (
            <label>
              Vertical
              <select
                value={vertical}
                disabled={ocupado}
                onChange={(ev) => {
                  setVertical(ev.target.value === VERTICAL_MOTO ? VERTICAL_MOTO : VERTICAL_AUTO);
                  setEspecialidades([]);
                }}
              >
                <option value={VERTICAL_AUTO}>Automóvil</option>
                <option value={VERTICAL_MOTO}>Motocicleta</option>
              </select>
            </label>
          )}
          <label>
            Nombre jurídico
            <input value={nombre} disabled={ocupado} maxLength={120} onChange={(ev) => setNombre(ev.target.value)} />
          </label>
          <label>
            Nombre comercial
            <input
              value={nombreComercial}
              disabled={ocupado}
              maxLength={120}
              onChange={(ev) => alCambiarComercial(ev.target.value)}
            />
          </label>
          <label>
            Teléfono
            <span className="crear-usuario-usuario">
              <select value={codigoTel} disabled={ocupado} onChange={(ev) => setCodigoTel(ev.target.value)}>
                {CODIGOS_TELEFONO.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.codigo}
                  </option>
                ))}
              </select>
              <input
                value={restoTel}
                disabled={ocupado}
                inputMode="numeric"
                maxLength={7}
                placeholder="1234567"
                onChange={(ev) => setRestoTel(ev.target.value.replace(/\D/g, '').slice(0, 7))}
              />
            </span>
          </label>
          <label>
            RIF
            <span className="crear-usuario-usuario">
              <select value={tipoRif} disabled={ocupado} onChange={(ev) => setTipoRif(ev.target.value)}>
                {TIPOS_RIF.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                value={numeroRif}
                disabled={ocupado}
                maxLength={20}
                onChange={(ev) => setNumeroRif(ev.target.value)}
              />
            </span>
          </label>
          <label>
            Estado
            <select
              value={estado}
              disabled={ocupado}
              onChange={(ev) => {
                setEstado(ev.target.value);
                setCiudad('');
              }}
            >
              <option value="">Selecciona el estado</option>
              {ESTADOS_VENEZUELA.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ciudad
            <select value={ciudad} disabled={ocupado || !estado} onChange={(ev) => setCiudad(ev.target.value)}>
              <option value="">{estado ? 'Selecciona la ciudad' : 'Primero el estado'}</option>
              {ciudades.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        {tipo === 'taller' && (
          <div className="crear-usuario-ancho">
            <span>Especialidades</span>
            <div className="crear-usuario-checks">
              {especialidadOpciones.map((op) => (
                <label key={op}>
                  <input
                    type="checkbox"
                    checked={especialidades.includes(op)}
                    disabled={ocupado}
                    onChange={() => alternar(especialidades, op, setEspecialidades)}
                  />
                  {op}
                </label>
              ))}
            </div>
          </div>
        )}

        {tipo === 'grua' && (
          <div className="crear-usuario-ancho">
            <span>Tipo de grúa</span>
            <div className="crear-usuario-checks">
              {TIPOS_GRUA.map((op) => (
                <label key={op.id}>
                  <input
                    type="checkbox"
                    checked={tiposGrua.includes(op.id)}
                    disabled={ocupado}
                    onChange={() =>
                      setTiposGrua((prev) =>
                        prev.includes(op.id) ? prev.filter((x) => x !== op.id) : [...prev, op.id]
                      )
                    }
                  />
                  {op.nombre}
                </label>
              ))}
              <label>
                <input type="checkbox" checked={servicio24h} disabled={ocupado} onChange={(ev) => setServicio24h(ev.target.checked)} />
                Servicio 24 horas
              </label>
              <label>
                <input type="checkbox" checked={auxilioVial} disabled={ocupado} onChange={(ev) => setAuxilioVial(ev.target.checked)} />
                Auxilio vial
              </label>
            </div>
          </div>
        )}

        <div className="crear-usuario-mapa">
          <p className="dashboard-kpi-grid-hint">
            Escribe la latitud y la longitud, o marca el punto en el mapa. Los dos quedan sincronizados.
          </p>
          <div className="crear-usuario-grid">
            <label>
              Latitud
              <input
                type="text"
                value={latitud}
                disabled={ocupado}
                inputMode="decimal"
                autoComplete="off"
                placeholder="Latitud (ej: 10.500000)"
                onChange={(ev) => setLatitud(ev.target.value)}
              />
            </label>
            <label>
              Longitud
              <input
                type="text"
                value={longitud}
                disabled={ocupado}
                inputMode="decimal"
                autoComplete="off"
                placeholder="Longitud (ej: -66.900000)"
                onChange={(ev) => setLongitud(ev.target.value)}
              />
            </label>
          </div>
          <RegistroUbicacionMapa
            latitudStr={latitud}
            longitudStr={longitud}
            disabled={ocupado}
            onPositionChange={(lat, lng) => {
              setLatitud(lat.toFixed(6));
              setLongitud(lng.toFixed(6));
            }}
          />
        </div>

        <div className="crear-usuario-grid">
          <label>
            Usuario de acceso
            {editando ? (
              <input value={editando.email} disabled />
            ) : (
              <span className="crear-usuario-usuario">
                <input
                  value={usuarioVisible}
                  disabled={ocupado}
                  maxLength={48}
                  autoComplete="off"
                  onChange={(ev) => {
                    setUsuarioTocado(true);
                    setUsuario(ev.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
                  }}
                />
                <span className="crear-usuario-dominio">@{correoAccesoInterno('x').split('@')[1]}</span>
              </span>
            )}
          </label>
          <label>
            {editando ? 'Nueva clave' : 'Clave'}
            <input
              type="text"
              value={password}
              disabled={ocupado}
              autoComplete="new-password"
              placeholder={editando ? 'Vacía si no cambia' : ''}
              onChange={(ev) => setPassword(ev.target.value)}
            />
          </label>
          <label>
            Repite la clave
            <input
              type="text"
              value={password2}
              disabled={ocupado}
              autoComplete="new-password"
              placeholder={editando ? 'Vacía si no cambia' : ''}
              onChange={(ev) => setPassword2(ev.target.value)}
            />
          </label>
        </div>

        <div className="importar-productos-botones-row">
          {editando && (
            <button type="button" className="importar-productos-boton-cancelar" disabled={ocupado} onClick={limpiarAlta}>
              Volver a crear uno nuevo
            </button>
          )}
          <button type="submit" className="importar-productos-boton" disabled={ocupado}>
            {ocupado ? 'Guardando...' : editando ? 'Guardar cambios' : `Crear ${ETIQUETA[tipo]}`}
          </button>
        </div>
      </form>
      {mensaje && (
        <p className={`importar-productos-mensaje ${fase === 'error' ? 'error' : fase === 'ok' ? 'ok' : ''}`}>{mensaje}</p>
      )}
    </section>
  );
}
