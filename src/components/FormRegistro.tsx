import { useCallback, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import {
  TIPOS_RIF,
  CODIGOS_TELEFONO,
  CODIGOS_AREA_FIJO,
  ESPECIALIDADES_TALLER,
} from '../data/registroVenezuela';
import { MARCAS_VEHICULOS } from '../data/marcasVehiculos';
import { ESTADOS_VENEZUELA, getCiudadesPorEstado } from '../data/ciudadesVenezuela';
import type { TipoRegistro } from './SelectorTipoRegistro';
import {
  geocodificacionInversaParaRegistro,
  mensajeUsuarioGeocodificacion,
  solicitarPosicionGpsPrecisa,
} from '../utils/geolocalizacionRegistro';
import { RegistroUbicacionMapa } from './RegistroUbicacionMapa';
import {
  POLITICA_DIVULGACION_VERSION,
  RUTA_POLITICA_DIVULGACION_DATOS,
} from '../constants/politicaDivulgacionDatos';

const MARCAS_TALLER = [
  'Multimarca',
  ...MARCAS_VEHICULOS.filter((m) => m !== 'Otra' && m !== 'Aplica varias marcas'),
];
import './FormRegistro.css';

const METODOS_PAGO = ['Efectivo', 'Pagomovil', 'Transferencia', 'Zelle', 'Binance', 'Cashea'] as const;

interface FormRegistroProps {
  tipo: TipoRegistro;
  onVolver: () => void;
  onExito: () => void;
}

export function FormRegistro({ tipo, onVolver, onExito }: FormRegistroProps) {
  const location = useLocation();
  const verticalNegocio = location.pathname.startsWith('/motos') ? 'moto' : 'auto';
  const rutaPoliticaDivulgacion = location.pathname.startsWith('/motos')
    ? '/motos/legal/politica-divulgacion-datos'
    : RUTA_POLITICA_DIVULGACION_DATOS;

  const [tipoPersona, setTipoPersona] = useState<'natural' | 'juridico'>('natural');
  const [nombreJuridico, setNombreJuridico] = useState('');
  const [nombreComercial, setNombreComercial] = useState('');
  const [codigoTel, setCodigoTel] = useState<string>(CODIGOS_TELEFONO[0].codigo);
  const [restoTel, setRestoTel] = useState('');
  const [esFijo, setEsFijo] = useState(false);
  const [tipoRif, setTipoRif] = useState<string>(TIPOS_RIF[0]);
  const [numeroRif, setNumeroRif] = useState('');
  const [email, setEmail] = useState('');
  const [ramoEspecifico, setRamoEspecifico] = useState('');
  const [especialidadesTaller, setEspecialidadesTaller] = useState<string[]>([]);
  const [marcaTaller, setMarcaTaller] = useState(MARCAS_TALLER[0]);
  const [acercaDeTaller, setAcercaDeTaller] = useState('');
  const [estadoTaller, setEstadoTaller] = useState('');
  const [ciudadTaller, setCiudadTaller] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [latitudGps, setLatitudGps] = useState('');
  const [longitudGps, setLongitudGps] = useState('');
  const [gpsDetectando, setGpsDetectando] = useState(false);
  const [gpsMensaje, setGpsMensaje] = useState('');
  const [gpsMensajeExito, setGpsMensajeExito] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(false);
  const [metodosPago, setMetodosPago] = useState<string[]>([]);
  const [aceptaPoliticaDivulgacion, setAceptaPoliticaDivulgacion] = useState(false);

  const titulo =
    tipo === 'vendedor'
      ? 'Registro de Vendedor'
      : tipo === 'usuario'
        ? 'Registro de Usuario'
        : 'Registro de Taller';

  const actualizarPosicionDesdeMapa = useCallback((lat: number, lng: number) => {
    setLatitudGps(lat.toFixed(6));
    setLongitudGps(lng.toFixed(6));
  }, []);

  const detectarUbicacion = useCallback(async () => {
    if (!navigator.geolocation) {
      setGpsMensajeExito(false);
      setGpsMensaje('Tu navegador no soporta geolocalización. Puedes escribir las coordenadas manualmente.');
      return;
    }
    setGpsMensaje('');
    setGpsMensajeExito(false);
    setGpsDetectando(true);
    try {
      const pos = await solicitarPosicionGpsPrecisa();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setLatitudGps(lat.toFixed(6));
      setLongitudGps(lng.toFixed(6));

      const precisionM =
        typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : null;
      const precisionLabel = precisionM != null ? `±${precisionM} m` : 'precisión desconocida';
      const baseGps = `Ubicación GPS (${precisionLabel}): ${lat.toFixed(5)}, ${lng.toFixed(5)}.`;
      const avisoGpsImpreciso =
        precisionM != null && precisionM > 800
          ? ' La precisión del GPS es baja: si puedes, sal al exterior o acércate a una ventana y vuelve a pulsar Obtener ubicación actual para afinar el punto.'
          : '';

      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
      let texto: string;
      let geoExito = false;

      if (apiKey && (tipo === 'vendedor' || tipo === 'taller' || tipo === 'usuario')) {
        const geoRes = await geocodificacionInversaParaRegistro(apiKey, lat, lng);
        if (!geoRes.ok) {
          texto = `${baseGps}${avisoGpsImpreciso} ${mensajeUsuarioGeocodificacion(geoRes)}`;
        } else if (geoRes.data?.estado) {
          geoExito = true;
          const geo = geoRes.data;
          setEstadoTaller(geo.estado ?? '');
          setCiudadTaller(geo.ciudad ?? '');
          const coordsActuales = `Coordenadas actuales: ${lat.toFixed(5)}, ${lng.toFixed(5)} (${precisionLabel}).`;
          texto = geo.ciudad
            ? 'Listo: Google encontró una dirección en la zona y rellenó estado y ciudad/municipio (revísalos).'
            : 'Listo: Google encontró una dirección en la zona y rellenó el estado (revísalos). Elige ciudad/municipio en la lista si hace falta.';
          if (geo.direccionFormateada) {
            texto += ` Dirección: ${geo.direccionFormateada}.`;
          }
          texto += ` ${coordsActuales}`;
          if (precisionM != null && precisionM > 800) {
            texto +=
              ' Con poca señal el resultado suele ser un código Plus (letras y números cortos) y no una calle exacta; puedes arrastrar el pin en el mapa o reintentar al aire libre.';
          }
        } else {
          texto = `${baseGps}${avisoGpsImpreciso} No se pudo enlazar la dirección con estado/ciudad de Venezuela; complétalos a mano.`;
        }
      } else if (!apiKey && (tipo === 'vendedor' || tipo === 'taller')) {
        texto = `${baseGps}${avisoGpsImpreciso} Configura VITE_GOOGLE_MAPS_API_KEY para rellenar automáticamente estado y ciudad con Google.`;
      } else {
        texto = `${baseGps}${avisoGpsImpreciso}`;
      }

      setGpsMensajeExito(geoExito);
      setGpsMensaje(texto.trim());
    } catch {
      setGpsMensajeExito(false);
      setGpsMensaje(
        'No se pudo obtener la ubicación. Permite el acceso al GPS, espera unos segundos (mejor al aire libre) o escribe las coordenadas manualmente.'
      );
    } finally {
      setGpsDetectando(false);
    }
  }, [tipo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje('');
    if (password !== passwordConfirm) {
      setMensaje('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 6) {
      setMensaje('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (!email.trim()) {
      setMensaje('Indica tu correo electrónico.');
      return;
    }
    if (tipo === 'taller' && especialidadesTaller.length === 0) {
      setMensaje('Selecciona al menos una especialidad del taller.');
      return;
    }
    if ((tipo === 'vendedor' || tipo === 'taller') && !aceptaPoliticaDivulgacion) {
      setMensaje('Debes leer y aceptar la Política de divulgación de datos para completar el registro.');
      return;
    }

    const politicaAceptacion =
      tipo === 'vendedor' || tipo === 'taller'
        ? {
            politica_divulgacion_aceptada: true as const,
            politica_divulgacion_version: POLITICA_DIVULGACION_VERSION,
            politica_divulgacion_aceptada_en: new Date().toISOString(),
          }
        : null;

    // Preparamos el metadata del registro para poder mostrar/recuperar
    // los datos del vendedor/taller aunque Supabase requiera confirmación de email
    // (cuando no hay sesión inmediata todavía).
    const latMeta = parseFloat(String(latitudGps).replace(',', '.')) || 0;
    const lngMeta = parseFloat(String(longitudGps).replace(',', '.')) || 0;
    const telefonoCompletoMeta = restoTel ? `${codigoTel}${restoTel}` : null;
    const rifCompletoMeta =
      tipo === 'vendedor'
        ? `${tipoRif}${numeroRif.replace(/\D/g, '')}`.trim() || null
        : null;

    const rifUsuarioOComun =
      `${tipoRif}${numeroRif.replace(/\D/g, '')}`.trim() || null;

    const signupMetadata =
      tipo === 'vendedor'
        ? {
            tipo_cuenta: 'vendedor',
            perfil_vendedor: {
              nombre: nombreJuridico.trim() || nombreComercial.trim() || 'Mi tienda',
              nombre_comercial:
                nombreComercial.trim() || nombreJuridico.trim() || 'Mi tienda',
              vertical: verticalNegocio,
              rif: rifCompletoMeta,
              estado: estadoTaller.trim() || null,
              ciudad: ciudadTaller.trim() || null,
              telefono: telefonoCompletoMeta,
              latitud: latMeta,
              longitud: lngMeta,
              metodos_pago: metodosPago.length ? metodosPago : null,
              ...politicaAceptacion,
            },
          }
        : tipo === 'taller'
          ? {
              tipo_cuenta: 'taller',
              perfil_taller: {
                nombre: nombreJuridico.trim() || nombreComercial.trim() || 'Mi taller',
                nombre_comercial:
                  nombreComercial.trim() || nombreJuridico.trim() || 'Mi taller',
                vertical: verticalNegocio,
                tipo_persona: tipoPersona,
                rif: rifUsuarioOComun || null,
                especialidad: especialidadesTaller,
                marca_vehiculo: marcaTaller || null,
                acerca_de: acercaDeTaller.trim() || null,
                estado: estadoTaller.trim() || null,
                ciudad: ciudadTaller.trim() || null,
                telefono: telefonoCompletoMeta,
                email: email.trim() || null,
                latitud: latMeta,
                longitud: lngMeta,
                metodos_pago: metodosPago.length ? metodosPago : null,
                ...politicaAceptacion,
              },
            }
          : tipo === 'usuario'
            ? {
                tipo_cuenta: 'comprador',
                perfil_comprador: {
                  tipo_persona: tipoPersona,
                  nombre: nombreJuridico.trim() || null,
                  nombre_comercial: nombreComercial.trim() || null,
                  rif: rifUsuarioOComun,
                estado: estadoTaller.trim() || null,
                ciudad: ciudadTaller.trim() || null,
                  telefono: telefonoCompletoMeta,
                  ramo: ramoEspecifico.trim() || null,
                  latitud: latMeta,
                  longitud: lngMeta,
                },
              }
            : {};

    setCargando(true);
    const { data: signUpData, error } = await supabase.auth.signUp(
      {
        email: email.trim(),
        password,
        options: {
          data: signupMetadata,
        },
      } as any
    );
    if (error) {
      setCargando(false);
      const msg = error.message?.toLowerCase().includes('rate limit')
        ? 'Se enviaron demasiados correos en poco tiempo. Espera unos minutos e intenta de nuevo.'
        : error.message;
      setMensaje(msg);
      return;
    }
    // Si el usuario requiere confirmación de correo, normalmente NO hay sesión todavía.
    // En ese caso NO intentamos insertar en `tiendas`/`talleres`, porque RLS usa auth.uid()
    // y auth.uid() no existe hasta que el usuario confirma e inicia sesión.
    const sessionUserId = signUpData?.session?.user?.id ?? null;
    if (!sessionUserId) {
      setCargando(false);
      setMensaje(
        tipo === 'vendedor' || tipo === 'taller'
          ? 'Cuenta creada. Confirma tu correo y entra con tu usuario y clave: tu negocio quedará registrado automáticamente con los mismos datos que ya ingresaste (no hace falta volver a llenar el perfil).'
          : 'Cuenta creada. Confirma tu correo y luego inicia sesión.'
      );
      return;
    }

    if (sessionUserId) {
      const lat = parseFloat(String(latitudGps).replace(',', '.')) || 0;
      const lng = parseFloat(String(longitudGps).replace(',', '.')) || 0;
      const telefonoCompleto = restoTel ? `${codigoTel}${restoTel}` : null;
      if (tipo === 'vendedor') {
        const rifCompleto = `${tipoRif}${numeroRif.replace(/\D/g, '')}`.trim() || null;
        const { error: insertError } = await supabase.from('tiendas').insert({
          user_id: sessionUserId,
          nombre: nombreJuridico.trim() || nombreComercial.trim() || 'Mi tienda',
          nombre_comercial: nombreComercial.trim() || nombreJuridico.trim() || 'Mi tienda',
          vertical: verticalNegocio,
          rif: rifCompleto,
          estado: estadoTaller.trim() || null,
          ciudad: ciudadTaller.trim() || null,
          telefono: telefonoCompleto,
          latitud: lat,
          longitud: lng,
          metodos_pago: metodosPago.length ? metodosPago : null,
          ...(politicaAceptacion ?? {}),
        });
        if (insertError) {
          setCargando(false);
          setMensaje(insertError.message || 'Error al guardar la tienda.');
          return;
        }
      } else if (tipo === 'taller') {
        const { error: insertError } = await supabase.from('talleres').insert({
          user_id: sessionUserId,
          nombre: nombreJuridico.trim() || nombreComercial.trim() || 'Mi taller',
          nombre_comercial: nombreComercial.trim() || nombreJuridico.trim() || 'Mi taller',
          vertical: verticalNegocio,
          tipo_persona: tipoPersona,
          rif: rifUsuarioOComun || null,
          especialidad: especialidadesTaller,
          marca_vehiculo: marcaTaller || null,
          acerca_de: acercaDeTaller.trim() || null,
          estado: estadoTaller.trim() || null,
          ciudad: ciudadTaller.trim() || null,
          telefono: telefonoCompleto,
          email: email.trim() || null,
          latitud: lat,
          longitud: lng,
          metodos_pago: metodosPago.length ? metodosPago : null,
          ...(politicaAceptacion ?? {}),
        });
        if (insertError) {
          setCargando(false);
          setMensaje(insertError.message || 'Error al guardar el taller. Revisa que en Supabase existan las columnas marca_vehiculo y acerca_de (ejecuta supabase-talleres-marca-acerca.sql).');
          return;
        }
      }
    }

    // Si ya hay sesión, significa que el usuario puede usar la cuenta y (en este flujo) ya creamos la fila
    // en `tiendas`/`talleres`. Mostramos éxito y salimos del registro.
    setCargando(false);
    const tituloExito =
      tipo === 'vendedor'
        ? 'Vendedor registrado exitosamente.'
        : tipo === 'taller'
          ? 'Taller registrado exitosamente.'
          : 'Cuenta registrada exitosamente.';
    setMensaje(tituloExito);
    onExito();
  };

  return (
    <div className="form-registro">
      <div
        className={`form-registro-card${tipo === 'vendedor' || tipo === 'taller' ? ' form-registro-card--con-mapa' : ''}`}
      >
        <button type="button" className="form-registro-volver" onClick={onVolver}>
          ← Volver
        </button>
        <h2 className="form-registro-titulo">{titulo}</h2>

        <form onSubmit={handleSubmit} className="form-registro-form">
          <div className="form-registro-campo form-registro-tipo-persona">
            <label>Tipo de persona</label>
            <div className="form-registro-botones-radio">
              <button
                type="button"
                className={tipoPersona === 'natural' ? 'activo' : ''}
                onClick={() => setTipoPersona('natural')}
              >
                Natural
              </button>
              <button
                type="button"
                className={tipoPersona === 'juridico' ? 'activo' : ''}
                onClick={() => setTipoPersona('juridico')}
              >
                Jurídico
              </button>
            </div>
          </div>

          <div className="form-registro-campo">
            <label htmlFor="nombreJuridico">Nombre Jurídico</label>
            <input
              id="nombreJuridico"
              type="text"
              value={nombreJuridico}
              onChange={(e) => setNombreJuridico(e.target.value)}
              placeholder="Razón social o nombre completo"
              disabled={cargando}
            />
          </div>

          <div className="form-registro-campo">
            <label htmlFor="nombreComercial">Nombre comercial</label>
            <input
              id="nombreComercial"
              type="text"
              value={nombreComercial}
              onChange={(e) => setNombreComercial(e.target.value)}
              placeholder="Nombre con el que te conocen"
              disabled={cargando}
            />
          </div>

          <div className="form-registro-campo form-registro-telefono">
            <label>Teléfono empresa</label>
            <div className="form-registro-telefono-tipo">
              <button
                type="button"
                className={!esFijo ? 'activo' : ''}
                onClick={() => { setEsFijo(false); setCodigoTel(CODIGOS_TELEFONO[0].codigo); }}
              >
                Móvil
              </button>
              <button
                type="button"
                className={esFijo ? 'activo' : ''}
                onClick={() => { setEsFijo(true); setCodigoTel(CODIGOS_AREA_FIJO[0].codigo); }}
              >
                Fijo
              </button>
            </div>
            <div className="form-registro-telefono-inputs">
              <select
                value={codigoTel}
                onChange={(e) => setCodigoTel(e.target.value)}
                disabled={cargando}
              >
                {!esFijo
                  ? CODIGOS_TELEFONO.map(({ codigo, compania }) => (
                      <option key={codigo} value={codigo}>
                        {codigo} ({compania})
                      </option>
                    ))
                  : CODIGOS_AREA_FIJO.map(({ codigo, ciudad }) => (
                      <option key={codigo} value={codigo}>
                        {codigo} ({ciudad})
                      </option>
                    ))}
              </select>
              <input
                type="tel"
                value={restoTel}
                onChange={(e) => setRestoTel(e.target.value.replace(/\D/g, '').slice(0, 7))}
                placeholder={esFijo ? "1234567" : "1234567"}
                maxLength={7}
                disabled={cargando}
              />
            </div>
          </div>

          <div className="form-registro-campo form-registro-rif">
            <label>RIF</label>
            <div className="form-registro-rif-inputs">
              <select
                value={tipoRif}
                onChange={(e) => setTipoRif(e.target.value)}
                disabled={cargando}
              >
                {TIPOS_RIF.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                type="text"
                value={numeroRif}
                onChange={(e) => setNumeroRif(e.target.value)}
                placeholder="12345678-9"
                disabled={cargando}
              />
            </div>
          </div>

          <div className="form-registro-campo">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              required
              disabled={cargando}
            />
          </div>

          {tipo === 'taller' ? (
            <>
              <div className="form-registro-campo form-registro-metodos-pago">
                <label>Especialidades del taller</label>
                <p className="form-registro-metodos-pago-hint">
                  Marca todas las ramas en las que trabajas; los clientes podrán encontrarte al filtrar por cualquiera de ellas.
                </p>
                <div className="form-registro-metodos-pago-opciones">
                  {ESPECIALIDADES_TALLER.map((esp) => (
                    <label key={esp} className="form-registro-metodos-pago-opcion">
                      <input
                        type="checkbox"
                        value={esp}
                        checked={especialidadesTaller.includes(esp)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEspecialidadesTaller((prev) => [...prev, esp]);
                          } else {
                            setEspecialidadesTaller((prev) => prev.filter((x) => x !== esp));
                          }
                        }}
                        disabled={cargando}
                      />
                      {esp}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-registro-campo">
                <label htmlFor="marcaTaller">Marca de vehículos</label>
                <select
                  id="marcaTaller"
                  value={marcaTaller}
                  onChange={(e) => setMarcaTaller(e.target.value)}
                  disabled={cargando}
                >
                  {MARCAS_TALLER.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className="form-registro-hint">Indica en qué marca te especializas o elige &quot;Multimarca&quot; si atiendes varias.</p>
              </div>
              <div className="form-registro-campo">
                <label htmlFor="acercaDeTaller">Acerca de nosotros</label>
                <textarea
                  id="acercaDeTaller"
                  value={acercaDeTaller}
                  onChange={(e) => setAcercaDeTaller(e.target.value)}
                  placeholder="Breve reseña de los servicios que ofrece el taller..."
                  rows={4}
                  disabled={cargando}
                  className="form-registro-textarea"
                />
              </div>
              <div className="form-registro-campo">
                <label htmlFor="estadoTaller">Estado</label>
                <select
                  id="estadoTaller"
                  value={estadoTaller}
                  onChange={(e) => { setEstadoTaller(e.target.value); setCiudadTaller(''); }}
                  disabled={cargando}
                >
                  <option value="">Selecciona el estado</option>
                  {ESTADOS_VENEZUELA.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
              <div className="form-registro-campo">
                <label htmlFor="ciudadTaller">Ciudad / Municipio</label>
                <select
                  id="ciudadTaller"
                  value={ciudadTaller}
                  onChange={(e) => setCiudadTaller(e.target.value)}
                  disabled={cargando || !estadoTaller}
                >
                  <option value="">Selecciona ciudad o municipio</option>
                  {(estadoTaller ? getCiudadesPorEstado(estadoTaller) : []).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <p className="form-registro-hint">Estado y ciudad permiten que te encuentren al buscar por ubicación.</p>
              </div>
            </>
          ) : (
            <>
              <div className="form-registro-campo">
                <label htmlFor="ramo">Ramo específico</label>
                <input
                  id="ramo"
                  type="text"
                  value={ramoEspecifico}
                  onChange={(e) => setRamoEspecifico(e.target.value)}
                  placeholder="Ej: Repuestos automotrices, Lubricantes"
                  disabled={cargando}
                />
              </div>
              <div className="form-registro-campo">
                <label htmlFor="estadoGeneral">Estado</label>
                <select
                  id="estadoGeneral"
                  value={estadoTaller}
                  onChange={(e) => {
                    setEstadoTaller(e.target.value);
                    setCiudadTaller('');
                  }}
                  disabled={cargando}
                >
                  <option value="">Selecciona el estado</option>
                  {ESTADOS_VENEZUELA.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-registro-campo">
                <label htmlFor="ciudadGeneral">Ciudad / Municipio</label>
                <select
                  id="ciudadGeneral"
                  value={ciudadTaller}
                  onChange={(e) => setCiudadTaller(e.target.value)}
                  disabled={cargando || !estadoTaller}
                >
                  <option value="">Selecciona ciudad o municipio</option>
                  {(estadoTaller ? getCiudadesPorEstado(estadoTaller) : []).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <p className="form-registro-hint">
                  Estado y ciudad ayudan a ubicar vendedores, talleres y compradores por zona.
                </p>
              </div>
            </>
          )}

          {(tipo === 'vendedor' || tipo === 'taller') && (
            <div className="form-registro-campo form-registro-metodos-pago">
              <label>Formas de pago que aceptas</label>
              <p className="form-registro-metodos-pago-hint">
                Selecciona cómo pueden pagarte los clientes. Se mostrará en tu ficha al contactar.
              </p>
              <div className="form-registro-metodos-pago-opciones">
                {METODOS_PAGO.map((metodo) => (
                  <label key={metodo} className="form-registro-metodos-pago-opcion">
                    <input
                      type="checkbox"
                      value={metodo}
                      checked={metodosPago.includes(metodo)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setMetodosPago((prev) => [...prev, metodo]);
                        } else {
                          setMetodosPago((prev) => prev.filter((m) => m !== metodo));
                        }
                      }}
                      disabled={cargando}
                    />
                    {metodo}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="form-registro-campo form-registro-gps">
            <label>Ubicación por coordenadas (GPS)</label>
            <p className="form-registro-gps-hint">
              {tipo === 'vendedor' || tipo === 'taller' ? (
                <>
                  Pulsa <strong>Obtener ubicación actual</strong> para el GPS en tiempo real; tómate tu tiempo y verifica
                  que la ubicación que estás colocando es la que coincide con tu local, esta información es{' '}
                  <strong>IMPORTANTE</strong> para que luego el sistema pueda ubicarte eficientemente cuando los usuarios
                  lo requieran. El mapa de abajo muestra el punto: puedes arrastrar el marcador o tocar el mapa para
                  ajustar; latitud y longitud se sincronizan. Con Google Maps también rellenamos estado y ciudad al usar
                  el botón.
                </>
              ) : (
                <>
                  Usa el botón para tomar el punto GPS en el momento. Con la clave de Google Maps, también rellenamos
                  estado y ciudad según la dirección detectada.
                </>
              )}
            </p>
            <div className="form-registro-gps-controles">
              <button
                type="button"
                onClick={() => void detectarUbicacion()}
                disabled={cargando || gpsDetectando}
                className="form-registro-gps-boton"
              >
                {gpsDetectando ? 'Obteniendo ubicación…' : 'Obtener ubicación actual'}
              </button>
            </div>
            {gpsDetectando && (
              <p className="form-registro-gps-mensaje form-registro-gps-mensaje--cargando" role="status" aria-live="polite">
                Estamos obteniendo tu ubicación actual, espera unos segundos por favor.
              </p>
            )}
            <div className="form-registro-gps-inputs">
              <input
                type="text"
                placeholder="Latitud (ej: 10.500000)"
                value={latitudGps}
                onChange={(e) => setLatitudGps(e.target.value)}
                disabled={cargando}
                inputMode="decimal"
                autoComplete="off"
              />
              <input
                type="text"
                placeholder="Longitud (ej: -66.900000)"
                value={longitudGps}
                onChange={(e) => setLongitudGps(e.target.value)}
                disabled={cargando}
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
            {(tipo === 'vendedor' || tipo === 'taller') && (
              <RegistroUbicacionMapa
                latitudStr={latitudGps}
                longitudStr={longitudGps}
                onPositionChange={actualizarPosicionDesdeMapa}
                disabled={cargando}
              />
            )}
            {!gpsDetectando && gpsMensaje ? (
              <p
                className={`form-registro-gps-mensaje${gpsMensajeExito ? ' form-registro-gps-mensaje--exito' : ''}`}
              >
                {gpsMensaje}
              </p>
            ) : null}
          </div>

          <div className="form-registro-campo">
            <label htmlFor="password">Contraseña</label>
            <div className="form-registro-password-wrap">
              <input
                id="password"
                type={mostrarPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
                disabled={cargando}
              />
              <button
                type="button"
                className="form-registro-toggle-password"
                onClick={() => setMostrarPassword((v) => !v)}
              >
                {mostrarPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <div className="form-registro-campo">
            <label htmlFor="passwordConfirm">Confirmar contraseña</label>
            <input
              id="passwordConfirm"
              type={mostrarPassword ? 'text' : 'password'}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="Repite la contraseña"
              required
              minLength={6}
              disabled={cargando}
            />
          </div>

          {(tipo === 'vendedor' || tipo === 'taller') && (
            <div className="form-registro-campo form-registro-politica">
              <label className="form-registro-politica-label" htmlFor="acepta-politica-divulgacion">
                <input
                  id="acepta-politica-divulgacion"
                  type="checkbox"
                  checked={aceptaPoliticaDivulgacion}
                  onChange={(e) => setAceptaPoliticaDivulgacion(e.target.checked)}
                  disabled={cargando}
                />
                <span className="form-registro-politica-texto">
                  Acepto los{' '}
                  <Link
                    to={rutaPoliticaDivulgacion}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="form-registro-politica-link"
                  >
                    Términos y Condiciones y la Divulgación de Datos de Contacto
                  </Link>
                  . Declaro haber leído el documento y autorizo la
                  publicación de mis datos e inventario según lo indicado allí.
                </span>
              </label>
              <p className="form-registro-politica-ayuda">
                Puedes abrir el documento en una pestaña nueva para leerlo con calma en el móvil.
              </p>
            </div>
          )}

          {mensaje && (
            <p className={`form-registro-mensaje ${mensaje.includes('no coinciden') || mensaje.includes('Error') ? 'error' : ''}`}>
              {mensaje}
            </p>
          )}

          <button type="submit" className="form-registro-submit" disabled={cargando}>
            {cargando ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  );
}
