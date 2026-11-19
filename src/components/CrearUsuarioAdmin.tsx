import { useMemo, useState } from 'react';
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
  const [fase, setFase] = useState<'idle' | 'creando' | 'ok' | 'error'>('idle');
  const [mensaje, setMensaje] = useState('');

  const ciudades = useMemo(() => (estado ? getCiudadesPorEstado(estado) : []), [estado]);
  const especialidadOpciones = vertical === 'moto' ? ESPECIALIDADES_TALLER_MOTO : ESPECIALIDADES_TALLER;
  const usuarioVisible = usuarioTocado ? usuario : usuarioAccesoDesdeNombre(nombreComercial || nombre);
  const ocupado = fase === 'creando';

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
      latitud: latitud ? Number(latitud) : null,
      longitud: longitud ? Number(longitud) : null,
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
        latitud: Number(latitud),
        longitud: Number(longitud),
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
  };

  return (
    <section className="dashboard-seccion">
      <h2 className="dashboard-seccion-titulo">Crear usuario</h2>
      <p className="dashboard-kpi-grid-hint">
        Crea una tienda, un taller o una grúa sin correo de confirmación. El acceso es un correo inventado que no
        recibe mensajes, con la clave que tú asignas. El negocio queda publicado en la página.
      </p>
      <form onSubmit={(ev) => void crear(ev)}>
        <div className="crear-usuario-grid">
          <label>
            Tipo
            <select
              value={tipo}
              disabled={ocupado}
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
          </label>
          <label>
            Clave
            <input
              type="text"
              value={password}
              disabled={ocupado}
              autoComplete="new-password"
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
              onChange={(ev) => setPassword2(ev.target.value)}
            />
          </label>
        </div>

        <div className="importar-productos-botones-row">
          <button type="submit" className="importar-productos-boton" disabled={ocupado}>
            {ocupado ? 'Creando...' : `Crear ${ETIQUETA[tipo]}`}
          </button>
        </div>
      </form>
      {mensaje && (
        <p className={`importar-productos-mensaje ${fase === 'error' ? 'error' : fase === 'ok' ? 'ok' : ''}`}>{mensaje}</p>
      )}
    </section>
  );
}
