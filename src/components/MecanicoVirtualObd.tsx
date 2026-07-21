import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { CODIGOS_OBD_COMUNES, buscarCodigoObd, type CodigoObd } from '../data/codigosObd';
import { MARCAS_MODELOS } from '../data/marcasModelos';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO, VERTICAL_MOTO } from '../utils/verticalVehiculo';
import { mensajeWhatsappVendedorProducto, urlWhatsAppGeomotor } from '../utils/linkWhatsAppGeomotor';
import { TarjetaProductoBusqueda, type ProductoTarjetaBusqueda } from './TarjetaProductoBusqueda';
import './MecanicoVirtualObd.css';

interface MecanicoVirtualObdProps {
  vertical?: VerticalVehiculo;
  /** Landing: +1 al abrir modal IA, -1 al cerrar (stack por si hubiera varios) */
  onIaModalCapaDelta?: (delta: number) => void;
}

interface ProductoMecanicoVirtual extends ProductoTarjetaBusqueda {
  comentarios: string | null;
  categoria: string | null;
  tiendas: {
    nombre_comercial: string | null;
    nombre: string | null;
    rif: string | null;
    telefono: string | null;
    direccion: string | null;
    latitud: number | null;
    longitud: number | null;
    metodos_pago: string[] | null;
  } | null;
}

type RespuestaIaObd = Pick<CodigoObd, 'descripcion' | 'componente' | 'causas' | 'soluciones' | 'terminosBusqueda'> & {
  diagnosticoPrincipal?: string;
  explicacionTecnica?: string;
  queRevisarPrimero?: string[];
  pruebasRecomendadas?: string[];
  advertenciaSeguridad?: string;
};

const TERMINOS_GENERICOS_REPUESTO = new Set([
  'base',
  'carro',
  'componente',
  'componentes',
  'falla',
  'fallas',
  'motor',
  'parte',
  'partes',
  'principal',
  'repuesto',
  'repuestos',
  'sistema',
  'sistemas',
  'vehiculo',
]);

function normalizarTerminoBusqueda(valor: string): string {
  return valor.replace(/[%_]/g, '').trim();
}

function comillasFiltroPostgrest(valor: string): string {
  if (/[",()]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

function patronIlikeTermino(termino: string): string {
  return comillasFiltroPostgrest(`%${normalizarTerminoBusqueda(termino)}%`);
}

function terminosBusquedaIa(valores: string[]): string[] {
  const vistos = new Set<string>();
  return valores
    .flatMap((valor) => [valor, ...valor.split(/\s+/)])
    .map((valor) => normalizarTerminoBusqueda(valor))
    .filter((valor) => valor.length >= 2)
    .filter((valor) => {
      const clave = valor.toLocaleLowerCase();
      return valor.includes(' ') || !TERMINOS_GENERICOS_REPUESTO.has(clave);
    })
    .filter((valor) => {
      const clave = valor.toLocaleLowerCase();
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
}

function filtrosIlike(terminos: string[], campos: string[]): string {
  return terminos
    .flatMap((termino) => {
      const patron = patronIlikeTermino(termino);
      return campos.map((campo) => `${campo}.ilike.${patron}`);
    })
    .join(',');
}

function normalizarTextoCoincidencia(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function productoCoincideConTerminosRepuesto(
  producto: ProductoMecanicoVirtual,
  terminos: string[]
): boolean {
  const texto = normalizarTextoCoincidencia(
    [
      producto.nombre,
      producto.descripcion,
      producto.comentarios,
      producto.categoria,
    ].filter(Boolean).join(' ')
  );

  return terminos.some((termino) => {
    const limpio = normalizarTextoCoincidencia(termino);
    if (limpio.length < 2) return false;
    if (limpio.includes(' ')) return limpio.split(/\s+/).every((parte) => texto.includes(parte));
    return texto.includes(limpio);
  });
}

function normalizarCodigoObd(valor: string): string {
  return valor.trim().toUpperCase().replace(/\s+/g, '');
}

function esCodigoObdValido(valor: string): boolean {
  return /^[PBCU][0-9A-F]{4}$/.test(valor);
}

export function MecanicoVirtualObd({
  vertical = VERTICAL_AUTO,
  onIaModalCapaDelta,
}: MecanicoVirtualObdProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null);
  const [codigoSeleccionado, setCodigoSeleccionado] = useState('');
  const [codigoManual, setCodigoManual] = useState('');
  const [marcaVehiculo, setMarcaVehiculo] = useState('');
  const [modeloVehiculo, setModeloVehiculo] = useState('');
  const [sintomasVehiculo, setSintomasVehiculo] = useState('');
  const [referenciaDiagnostico, setReferenciaDiagnostico] = useState('');
  const [respuestaIa, setRespuestaIa] = useState<RespuestaIaObd | null>(null);
  const [cargandoIa, setCargandoIa] = useState(false);
  const [errorIa, setErrorIa] = useState<string | null>(null);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [productos, setProductos] = useState<ProductoMecanicoVirtual[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(false);
  const [errorProductos, setErrorProductos] = useState<string | null>(null);
  const [productoExpandidoId, setProductoExpandidoId] = useState<string | null>(null);

  const codigoBase = useMemo(
    () => (codigoSeleccionado ? buscarCodigoObd(codigoSeleccionado) : null),
    [codigoSeleccionado]
  );
  const diagnostico: RespuestaIaObd | null = respuestaIa ?? codigoBase;
  const codigosOpciones = useMemo(() => CODIGOS_OBD_COMUNES, []);
  const marcasVehiculo = useMemo(() => Object.keys(MARCAS_MODELOS).sort(), []);
  const modelosVehiculo = useMemo(
    () => (marcaVehiculo ? MARCAS_MODELOS[marcaVehiculo] ?? [] : []),
    [marcaVehiculo]
  );

  const rutaInicioLanding = vertical === VERTICAL_MOTO ? '/motos' : '/';

  useEffect(() => {
    if (!onIaModalCapaDelta) return;
    if (!modalAbierto) return;
    onIaModalCapaDelta(1);
    return () => onIaModalCapaDelta(-1);
  }, [modalAbierto, onIaModalCapaDelta]);

  const consultarCodigo = async (codigoRaw: string) => {
    const codigo = normalizarCodigoObd(codigoRaw);
    setCodigoSeleccionado(codigo);
    setRespuestaIa(null);
    setErrorIa(null);
    setMostrarResultados(false);
    setProductos([]);
    setProductoExpandidoId(null);
    setReferenciaDiagnostico(codigo);
    if (!codigo) return;
    if (!esCodigoObdValido(codigo)) {
      setErrorIa('Escribe un código OBDII válido, por ejemplo P0300, C0561, B0020 o U0100.');
      return;
    }

    const base = buscarCodigoObd(codigo);
    setCargandoIa(true);
    try {
      const { data, error } = await supabase.functions.invoke<RespuestaIaObd>('mecanico-virtual-obd', {
        body: {
          codigo,
          descripcion: base?.descripcion ?? null,
          componente: base?.componente ?? null,
          causas: base?.causas ?? [],
          soluciones: base?.soluciones ?? [],
          terminosBusqueda: base?.terminosBusqueda ?? [],
          requiereDiagnosticoAbierto: !base,
          marcaVehiculo: marcaVehiculo || null,
          modeloVehiculo: modeloVehiculo || null,
        },
      });
      if (error) throw error;
      if (data?.descripcion && data?.componente) {
        setRespuestaIa(data);
      } else if (!base) {
        setErrorIa('Para diagnosticar códigos fuera de la lista hay que activar la IA avanzada con OPENAI_API_KEY.');
      }
    } catch {
      setErrorIa(
        base
          ? 'Mostrando diagnóstico base. La IA avanzada se activará cuando esté configurada.'
          : 'No se pudo consultar la IA avanzada para este código.'
      );
    } finally {
      setCargandoIa(false);
    }
  };

  const seleccionarCodigo = async (codigo: string) => {
    setCodigoManual('');
    await consultarCodigo(codigo);
  };

  const consultarCodigoManual = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await consultarCodigo(codigoManual);
  };

  const consultarSintomas = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCodigoSeleccionado('');
    setCodigoManual('');
    setRespuestaIa(null);
    setErrorIa(null);
    setMostrarResultados(false);
    setProductos([]);
    setProductoExpandidoId(null);

    const sintomas = sintomasVehiculo.trim();
    if (!marcaVehiculo || !modeloVehiculo || sintomas.length < 8) {
      setErrorIa('Selecciona marca, modelo y describe brevemente los síntomas del vehículo.');
      return;
    }

    setReferenciaDiagnostico(`${marcaVehiculo} ${modeloVehiculo}`);
    setCargandoIa(true);
    try {
      const { data, error } = await supabase.functions.invoke<RespuestaIaObd>('mecanico-virtual-obd', {
        body: {
          tipoConsulta: 'auto_sintomas',
          marcaVehiculo,
          modeloVehiculo,
          sintomas,
        },
      });
      if (error) throw error;
      if (data?.descripcion && data?.componente) {
        setRespuestaIa(data);
      } else {
        setErrorIa('No se pudo generar un diagnóstico con esos síntomas.');
      }
    } catch {
      setErrorIa('No se pudo consultar la IA avanzada para estos síntomas.');
    } finally {
      setCargandoIa(false);
    }
  };

  const buscarRepuestoSugerido = async () => {
    if (!diagnostico) return;
    setMostrarResultados(true);
    setCargandoProductos(true);
    setErrorProductos(null);
    setProductos([]);
    setProductoExpandidoId(null);

    const terminosRepuesto = terminosBusquedaIa([diagnostico.componente, ...diagnostico.terminosBusqueda]).slice(0, 14);
    const terminosModelo = terminosBusquedaIa(modeloVehiculo ? [modeloVehiculo] : []).slice(0, 6);

    try {
      let query = supabase
        .from('productos')
        .select(
          `
          id,
          nombre,
          descripcion,
          comentarios,
          categoria,
          precio_usd,
          moneda,
          marca,
          modelo,
          anio,
          imagen_url,
          imagenes_extra,
          disponibilidad_aviso,
          es_oferta,
          tiendas ( nombre_comercial, nombre, rif, telefono, direccion, latitud, longitud, metodos_pago )
        `
        )
        .eq('activo', true)
        .eq('aprobacion_publica', 'aprobado')
        .eq('vertical', vertical);

      if (marcaVehiculo) query = query.eq('marca', marcaVehiculo);

      const filtrosRepuesto = filtrosIlike(terminosRepuesto, ['nombre', 'descripcion', 'comentarios', 'categoria']);
      if (filtrosRepuesto) query = query.or(filtrosRepuesto);

      const filtrosModelo = filtrosIlike(terminosModelo, ['nombre', 'descripcion', 'comentarios', 'marca', 'modelo', 'categoria']);
      if (filtrosModelo) query = query.or(filtrosModelo);

      const { data, error } = await query.order('nombre').limit(24);
      if (error) throw error;
      const filas = ((data ?? []) as unknown as ProductoMecanicoVirtual[])
        .map((p) => {
          const tiendas = p.tiendas as ProductoMecanicoVirtual['tiendas'] | ProductoMecanicoVirtual['tiendas'][];
          return { ...p, tiendas: Array.isArray(tiendas) ? tiendas[0] ?? null : tiendas };
        })
        .filter((p) => productoCoincideConTerminosRepuesto(p, terminosRepuesto));
      setProductos(filas);
    } catch (e) {
      setErrorProductos(
        e instanceof Error ? e.message : 'No se pudieron buscar repuestos relacionados.'
      );
    } finally {
      setCargandoProductos(false);
    }
  };

  const resetearConsulta = () => {
    setCodigoSeleccionado('');
    setCodigoManual('');
    setSintomasVehiculo('');
    setReferenciaDiagnostico('');
    setRespuestaIa(null);
    setErrorIa(null);
    setMostrarResultados(false);
    setProductos([]);
    setErrorProductos(null);
    setProductoExpandidoId(null);
  };

  const contactarProducto = (p: ProductoMecanicoVirtual) => {
    const telefono = p.tiendas?.telefono;
    if (!telefono) return;
    const url = urlWhatsAppGeomotor(telefono, mensajeWhatsappVendedorProducto(p.nombre));
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const cerrarModal = () => {
    setModalAbierto(false);
  };

  const volverAlInicio = () => {
    cerrarModal();
    navigate(rutaInicioLanding);
  };

  const abrirAsistente = () => {
    if (!user) {
      setAvisoLogin('Debes iniciar sesión o registrarte para usar el asistente de IA.');
      return;
    }
    setAvisoLogin(null);
    setModalAbierto(true);
  };

  return (
    <section className="mecanico-virtual" aria-labelledby="mecanico-virtual-titulo">
      {avisoLogin && <p className="mecanico-virtual-login-aviso">{avisoLogin}</p>}

      <div className="mecanico-virtual-card">
        <button
          type="button"
          className="mecanico-virtual-resumen landing-ia-tarjeta-cerrada"
          onClick={abrirAsistente}
          aria-label="Abrir consulta de falla con IA"
        >
          <img
            src="/mecanico.png"
            alt=""
            className="mecanico-virtual-imagen landing-ia-tarjeta-imagen"
            width={56}
            height={56}
            loading="lazy"
            decoding="async"
          />
          <div className="mecanico-virtual-resumen-texto landing-ia-tarjeta-texto-solo-titulo">
            <h2 id="mecanico-virtual-titulo" className="landing-seccion-titulo">
              Consulta tu falla con nuestra IA
            </h2>
          </div>
        </button>
      </div>

      {modalAbierto && (
        <div
          className="mecanico-virtual-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mecanico-virtual-modal-titulo"
          onClick={cerrarModal}
        >
          <div className="mecanico-virtual-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mecanico-virtual-modal-header">
              <h3 id="mecanico-virtual-modal-titulo">Consulta tu falla con nuestra IA</h3>
              <button type="button" onClick={cerrarModal}>
                Cerrar
              </button>
            </div>

            <div className="mecanico-virtual-modal-scroll">
              <div className="mecanico-virtual-intro">
                <p>
                  Indica la marca y modelo del vehículo. Puedes consultar por código OBDII o describir los
                  síntomas si no tienes scanner.
                </p>
              </div>

              <div className="mecanico-virtual-controles">
                <div className="mecanico-virtual-vehiculo-grid">
                  <label className="mecanico-virtual-selector">
                    Marca del vehículo
                    <select
                      value={marcaVehiculo}
                      onChange={(e) => {
                        setMarcaVehiculo(e.target.value);
                        setModeloVehiculo('');
                      }}
                    >
                      <option value="">Selecciona la marca</option>
                      {marcasVehiculo.map((marca) => (
                        <option key={marca} value={marca}>
                          {marca}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="mecanico-virtual-selector">
                    Modelo del vehículo
                    <select
                      value={modeloVehiculo}
                      onChange={(e) => setModeloVehiculo(e.target.value)}
                      disabled={!marcaVehiculo}
                    >
                      <option value="">{marcaVehiculo ? 'Selecciona el modelo' : 'Primero selecciona marca'}</option>
                      {modelosVehiculo.map((modelo) => (
                        <option key={modelo} value={modelo}>
                          {modelo}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="mecanico-virtual-selector">
                  Código OBDII común
                  <select
                    value={codigoSeleccionado && buscarCodigoObd(codigoSeleccionado) ? codigoSeleccionado : ''}
                    onChange={(e) => void seleccionarCodigo(e.target.value)}
                  >
                    <option value="">Selecciona un código</option>
                    {codigosOpciones.map((item) => (
                      <option key={item.codigo} value={item.codigo}>
                        {item.codigo} - {item.descripcion}
                      </option>
                    ))}
                  </select>
                </label>

                <form className="mecanico-virtual-manual" onSubmit={(e) => void consultarCodigoManual(e)}>
                  <label htmlFor="mecanico-virtual-codigo-manual">
                    ¿No ves tu código? Escríbelo aquí
                  </label>
                  <div className="mecanico-virtual-manual-fila">
                    <input
                      id="mecanico-virtual-codigo-manual"
                      type="text"
                      value={codigoManual}
                      onChange={(e) => setCodigoManual(normalizarCodigoObd(e.target.value).slice(0, 5))}
                      placeholder="Ej: U0100"
                      inputMode="text"
                    />
                    <button type="submit" disabled={cargandoIa || !codigoManual.trim()}>
                      Consultar IA
                    </button>
                  </div>
                </form>

                <form className="mecanico-virtual-sintomas" onSubmit={(e) => void consultarSintomas(e)}>
                  <label className="mecanico-virtual-selector" htmlFor="mecanico-virtual-sintomas-auto">
                    Describe brevemente los síntomas si no conoces el código OBDII
                    <textarea
                      id="mecanico-virtual-sintomas-auto"
                      value={sintomasVehiculo}
                      onChange={(e) => setSintomasVehiculo(e.target.value.slice(0, 700))}
                      placeholder="Ej: tiembla en mínimo, huele a gasolina, pierde fuerza al acelerar..."
                    />
                  </label>
                  <button
                    type="submit"
                    className="mecanico-virtual-submit"
                    disabled={cargandoIa || sintomasVehiculo.trim().length < 8}
                  >
                    {cargandoIa ? 'Consultando IA...' : 'Consultar síntomas con IA'}
                  </button>
                </form>
              </div>

              {cargandoIa && <p className="mecanico-virtual-aviso">Consultando mecánico virtual...</p>}
              {errorIa && <p className="mecanico-virtual-aviso">{errorIa}</p>}

              {diagnostico && referenciaDiagnostico && (
                <div className="mecanico-virtual-diagnostico">
                  <div className="mecanico-virtual-diagnostico-header">
                    <div>
                      <p className="mecanico-virtual-codigo">{referenciaDiagnostico}</p>
                      <h3>{diagnostico.diagnosticoPrincipal ?? diagnostico.descripcion}</h3>
                    </div>
                    <span className={`mecanico-virtual-gravedad mecanico-virtual-gravedad--${codigoBase?.gravedad ?? 'media'}`}>
                      Gravedad {codigoBase?.gravedad ?? 'media'}
                    </span>
                  </div>

                  {(diagnostico.diagnosticoPrincipal || diagnostico.explicacionTecnica) && (
                    <div className="mecanico-virtual-explicacion">
                      {diagnostico.diagnosticoPrincipal && <p>{diagnostico.descripcion}</p>}
                      {diagnostico.explicacionTecnica && <p>{diagnostico.explicacionTecnica}</p>}
                    </div>
                  )}

                  <div className="mecanico-virtual-bloques">
                    <div>
                      <h4>Componente principal sugerido</h4>
                      <p className="mecanico-virtual-componente">{diagnostico.componente}</p>
                    </div>
                    <div>
                      <h4>Causas probables</h4>
                      <ul>
                        {diagnostico.causas.map((causa) => (
                          <li key={causa}>{causa}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4>Soluciones recomendadas</h4>
                      <ul>
                        {diagnostico.soluciones.map((solucion) => (
                          <li key={solucion}>{solucion}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {((diagnostico.queRevisarPrimero?.length ?? 0) > 0 ||
                    (diagnostico.pruebasRecomendadas?.length ?? 0) > 0) && (
                    <div className="mecanico-virtual-bloques mecanico-virtual-bloques--extendido">
                      {(diagnostico.queRevisarPrimero?.length ?? 0) > 0 && (
                        <div>
                          <h4>Qué revisar primero</h4>
                          <ul>
                            {diagnostico.queRevisarPrimero?.map((revision) => (
                              <li key={revision}>{revision}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(diagnostico.pruebasRecomendadas?.length ?? 0) > 0 && (
                        <div>
                          <h4>Pruebas recomendadas</h4>
                          <ul>
                            {diagnostico.pruebasRecomendadas?.map((prueba) => (
                              <li key={prueba}>{prueba}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="mecanico-virtual-responsable">
                    Te sugerimos contrastar esta opinión con un profesional de la mecánica, esto es solo una herramienta orientativa.
                  </p>

                  <div className="mecanico-virtual-cta">
                    <p>
                      ¿Quieres que busquemos <strong>{diagnostico.componente}</strong> y repuestos relacionados
                      en Geomotor?
                    </p>
                    <button type="button" onClick={() => void buscarRepuestoSugerido()}>
                      Sí, buscar repuesto en Geomotor
                    </button>
                    <button
                      type="button"
                      className="mecanico-virtual-cta-secundario"
                      onClick={resetearConsulta}
                    >
                      Nueva consulta
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="mecanico-virtual-modal-pie">
              <button type="button" className="mecanico-virtual-modal-volver" onClick={volverAlInicio}>
                Volver
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarResultados && (
        <div
          className="mecanico-virtual-resultados-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mecanico-virtual-resultados-titulo"
          onClick={() => setMostrarResultados(false)}
        >
          <div className="mecanico-virtual-resultados-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mecanico-virtual-resultados-header">
              <h3 id="mecanico-virtual-resultados-titulo">
                Repuestos sugeridos para {diagnostico?.componente}
              </h3>
              <button type="button" onClick={() => setMostrarResultados(false)}>
                Volver
              </button>
            </div>
            <div className="mecanico-virtual-resultados-scroll">
              {cargandoProductos ? (
                <p className="mecanico-virtual-aviso">Buscando repuestos...</p>
              ) : errorProductos ? (
                <p className="mecanico-virtual-aviso error">{errorProductos}</p>
              ) : productos.length === 0 ? (
                <p className="mecanico-virtual-aviso">
                  No encontramos repuestos publicados con esos términos para la marca y modelo seleccionados por ahora.
                </p>
              ) : (
                <div className="busqueda-repuestos-grid">
                  {productos.map((p) => (
                    <TarjetaProductoBusqueda
                      key={p.id}
                      producto={p}
                      vertical={vertical}
                      expandida={productoExpandidoId === p.id}
                      onExpand={() => setProductoExpandidoId(p.id)}
                      onContraer={() => setProductoExpandidoId(null)}
                      onContactar={contactarProducto}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default MecanicoVirtualObd;
