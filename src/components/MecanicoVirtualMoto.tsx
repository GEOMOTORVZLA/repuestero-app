import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { MARCAS_MOTOS, getModelosPorMarcaMoto } from '../data/marcasMotos';
import { VERTICAL_MOTO } from '../utils/verticalVehiculo';
import { mensajeWhatsappVendedorProducto, urlWhatsAppGeomotor } from '../utils/linkWhatsAppGeomotor';
import { TarjetaProductoBusqueda, type ProductoTarjetaBusqueda } from './TarjetaProductoBusqueda';
import './MecanicoVirtualObd.css';

interface ProductoMecanicoVirtualMoto extends ProductoTarjetaBusqueda {
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

type RespuestaIaMoto = {
  diagnosticoPrincipal?: string;
  descripcion: string;
  explicacionTecnica?: string;
  componente: string;
  causas: string[];
  soluciones: string[];
  queRevisarPrimero?: string[];
  pruebasRecomendadas?: string[];
  advertenciaSeguridad?: string;
  terminosBusqueda: string[];
};

const SINTOMAS_MOTO = [
  'No prende',
  'Se apaga al acelerar',
  'Pierde fuerza',
  'Falla en mínimo',
  'No carga batería',
  'Huele a gasolina',
  'Bota humo',
  'Falla inyección',
  'No enciende luz del tablero',
  'Hace ruido en motor',
  'Falla al cambiar velocidades',
  'Vibra demasiado',
  'Recalienta',
  'Falla frenos',
  'Patina correa CVT',
];

const MARCAS_MOTO_MODELO_OBLIGATORIO = new Set([
  'Yamaha',
  'Kawasaki',
  'Honda',
  'Suzuki',
  'KTM',
  'Ducati',
  'Benelli',
  'Zontes',
]);

const TERMINOS_GENERICOS_REPUESTO = new Set([
  'base',
  'componente',
  'componentes',
  'falla',
  'fallas',
  'moto',
  'motor',
  'parte',
  'partes',
  'principal',
  'repuesto',
  'repuestos',
  'sistema',
  'sistemas',
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
  producto: ProductoMecanicoVirtualMoto,
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

export function MecanicoVirtualMoto({
  onIaModalCapaDelta,
}: {
  onIaModalCapaDelta?: (delta: number) => void;
} = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null);
  const [marcaMoto, setMarcaMoto] = useState('');
  const [modeloMoto, setModeloMoto] = useState('');
  const [cilindraje, setCilindraje] = useState('');
  const [anio, setAnio] = useState('');
  const [codigoFalla, setCodigoFalla] = useState('');
  const [sintoma, setSintoma] = useState('');
  const [detalleSintoma, setDetalleSintoma] = useState('');
  const [diagnostico, setDiagnostico] = useState<RespuestaIaMoto | null>(null);
  const [cargandoIa, setCargandoIa] = useState(false);
  const [errorIa, setErrorIa] = useState<string | null>(null);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [productos, setProductos] = useState<ProductoMecanicoVirtualMoto[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(false);
  const [errorProductos, setErrorProductos] = useState<string | null>(null);
  const [productoExpandidoId, setProductoExpandidoId] = useState<string | null>(null);

  const modelosMoto = useMemo(() => getModelosPorMarcaMoto(marcaMoto), [marcaMoto]);
  const modeloEsObligatorio = MARCAS_MOTO_MODELO_OBLIGATORIO.has(marcaMoto);
  const anios = useMemo(() => {
    const actual = new Date().getFullYear();
    return Array.from({ length: actual - 1980 + 1 }, (_, i) => String(actual - i));
  }, []);

  useEffect(() => {
    if (!onIaModalCapaDelta) return;
    if (!modalAbierto) return;
    onIaModalCapaDelta(1);
    return () => onIaModalCapaDelta(-1);
  }, [modalAbierto, onIaModalCapaDelta]);

  const volverAlInicio = () => {
    setModalAbierto(false);
    navigate('/motos');
  };

  const consultarIa = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorIa(null);
    setDiagnostico(null);
    setMostrarResultados(false);
    setProductos([]);
    setProductoExpandidoId(null);

    const sintomasTexto = [sintoma, detalleSintoma].map((v) => v.trim()).filter(Boolean).join('. ');
    if (!marcaMoto || !sintomasTexto) {
      setErrorIa('Selecciona marca y describe al menos un síntoma de la moto.');
      return;
    }
    if (modeloEsObligatorio && !modeloMoto.trim()) {
      setErrorIa('Para esta marca necesitamos el modelo de la moto para orientar mejor el diagnóstico.');
      return;
    }

    setCargandoIa(true);
    try {
      const { data, error } = await supabase.functions.invoke<RespuestaIaMoto>('mecanico-virtual-obd', {
        body: {
          tipoConsulta: 'moto',
          marcaVehiculo: marcaMoto,
          modeloVehiculo: modeloMoto,
          cilindraje: cilindraje || null,
          anio: anio || null,
          codigo: codigoFalla.trim() || null,
          sintomas: sintomasTexto,
        },
      });
      if (error) throw error;
      if (data?.descripcion && data?.componente) {
        setDiagnostico(data);
      } else {
        setErrorIa('No se pudo generar un diagnóstico para esta falla.');
      }
    } catch {
      setErrorIa('No se pudo consultar la IA para esta falla de moto.');
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
    const terminosModelo = terminosBusquedaIa(modeloMoto.trim() ? [modeloMoto.trim()] : []).slice(0, 6);

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
          tiendas ( nombre_comercial, nombre, rif, telefono, direccion, latitud, longitud, metodos_pago )
        `
        )
        .eq('activo', true)
        .eq('aprobacion_publica', 'aprobado')
        .eq('vertical', VERTICAL_MOTO);

      if (marcaMoto) query = query.eq('marca', marcaMoto);

      const filtrosRepuesto = filtrosIlike(terminosRepuesto, ['nombre', 'descripcion', 'comentarios', 'categoria']);
      if (filtrosRepuesto) query = query.or(filtrosRepuesto);

      const filtrosModelo = filtrosIlike(terminosModelo, ['nombre', 'descripcion', 'comentarios', 'marca', 'modelo', 'categoria']);
      if (filtrosModelo) query = query.or(filtrosModelo);

      const { data, error } = await query.order('nombre').limit(24);
      if (error) throw error;
      const filas = ((data ?? []) as unknown as ProductoMecanicoVirtualMoto[])
        .map((p) => {
          const tiendas = p.tiendas as ProductoMecanicoVirtualMoto['tiendas'] | ProductoMecanicoVirtualMoto['tiendas'][];
          return { ...p, tiendas: Array.isArray(tiendas) ? tiendas[0] ?? null : tiendas };
        })
        .filter((p) => productoCoincideConTerminosRepuesto(p, terminosRepuesto));
      setProductos(filas);
    } catch (e) {
      setErrorProductos(e instanceof Error ? e.message : 'No se pudieron buscar repuestos relacionados.');
    } finally {
      setCargandoProductos(false);
    }
  };

  const resetearConsulta = () => {
    setCodigoFalla('');
    setSintoma('');
    setDetalleSintoma('');
    setDiagnostico(null);
    setErrorIa(null);
    setMostrarResultados(false);
    setProductos([]);
    setErrorProductos(null);
    setProductoExpandidoId(null);
  };

  const contactarProducto = (p: ProductoMecanicoVirtualMoto) => {
    const telefono = p.tiendas?.telefono;
    if (!telefono) return;
    const url = urlWhatsAppGeomotor(telefono, mensajeWhatsappVendedorProducto(p.nombre));
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
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
    <section className="mecanico-virtual mecanico-virtual--moto" aria-labelledby="mecanico-virtual-moto-titulo">
      {avisoLogin && <p className="mecanico-virtual-login-aviso">{avisoLogin}</p>}

      <div className="mecanico-virtual-card mecanico-virtual-moto-card">
        <button
          type="button"
          className="mecanico-virtual-resumen mecanico-virtual-moto-resumen landing-ia-tarjeta-cerrada"
          onClick={abrirAsistente}
          aria-label="Abrir consulta de falla de moto con IA"
        >
          <img
            src="/Motor.png"
            alt=""
            className="mecanico-virtual-imagen landing-ia-tarjeta-imagen"
            width={56}
            height={56}
            loading="lazy"
            decoding="async"
          />
          <div className="mecanico-virtual-resumen-texto landing-ia-tarjeta-texto-solo-titulo">
            <h2 id="mecanico-virtual-moto-titulo" className="landing-seccion-titulo mecanico-virtual-moto-titulo">
              Consulta la falla de tu moto con nuestra IA
            </h2>
          </div>
        </button>
      </div>

      {modalAbierto && (
        <div
          className="mecanico-virtual-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mecanico-virtual-moto-modal-titulo"
          onClick={() => setModalAbierto(false)}
        >
          <div className="mecanico-virtual-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mecanico-virtual-modal-header">
              <h3 id="mecanico-virtual-moto-modal-titulo">Consulta la falla de tu moto con nuestra IA</h3>
              <button type="button" onClick={() => setModalAbierto(false)}>
                Cerrar
              </button>
            </div>

            <div className="mecanico-virtual-modal-scroll">
              <p className="landing-ia-modal-enunciado">
                Describe el síntoma de tu moto, agrega marca y modelo, y la IA te orienta sobre posibles
                causas y repuestos relacionados.
              </p>
              <div className="mecanico-virtual-intro">
                <p>
                  En motos el diagnóstico puede depender mucho de la marca y del sistema. Puedes escribir un
                  código si lo tienes, pero también basta con describir el síntoma.
                </p>
              </div>

              <form className="mecanico-virtual-controles" onSubmit={(e) => void consultarIa(e)}>
                <div className="mecanico-virtual-vehiculo-grid">
                  <label className="mecanico-virtual-selector">
                    Marca de la moto
                    <select
                      value={marcaMoto}
                      onChange={(e) => {
                        setMarcaMoto(e.target.value);
                        setModeloMoto('');
                      }}
                    >
                      <option value="">Selecciona la marca</option>
                      {MARCAS_MOTOS.map((marca) => (
                        <option key={marca} value={marca}>
                          {marca}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="mecanico-virtual-selector">
                    Modelo de la moto {modeloEsObligatorio ? '' : '(opcional)'}
                    <input
                      type="text"
                      value={modeloMoto}
                      onChange={(e) => setModeloMoto(e.target.value.slice(0, 60))}
                      list={modelosMoto.length > 0 ? 'mecanico-virtual-modelos-moto' : undefined}
                      disabled={!marcaMoto}
                      placeholder={
                        marcaMoto
                          ? modeloEsObligatorio
                            ? 'Escribe o selecciona el modelo'
                            : 'Opcional: escribe el modelo si lo conoces'
                          : 'Primero selecciona marca'
                      }
                    />
                    {modelosMoto.length > 0 && (
                      <datalist id="mecanico-virtual-modelos-moto">
                        {modelosMoto.map((modelo) => (
                          <option key={modelo} value={modelo} />
                        ))}
                      </datalist>
                    )}
                  </label>
                </div>

                <div className="mecanico-virtual-vehiculo-grid">
                  <label className="mecanico-virtual-selector">
                    Cilindraje opcional
                    <input
                      type="text"
                      value={cilindraje}
                      onChange={(e) => setCilindraje(e.target.value.slice(0, 12))}
                      placeholder="Ej: 150cc"
                    />
                  </label>

                  <label className="mecanico-virtual-selector">
                    Año opcional
                    <select value={anio} onChange={(e) => setAnio(e.target.value)}>
                      <option value="">Selecciona año</option>
                      {anios.map((valor) => (
                        <option key={valor} value={valor}>
                          {valor}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="mecanico-virtual-selector">
                  Síntoma principal
                  <select value={sintoma} onChange={(e) => setSintoma(e.target.value)}>
                    <option value="">Selecciona un síntoma</option>
                    {SINTOMAS_MOTO.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mecanico-virtual-selector">
                  Código de falla opcional
                  <input
                    type="text"
                    value={codigoFalla}
                    onChange={(e) => setCodigoFalla(e.target.value.toUpperCase().slice(0, 20))}
                    placeholder="Ej: 12, 33, P0335 o FI"
                  />
                </label>

                <label className="mecanico-virtual-selector">
                  Describe lo que hace la moto
                  <textarea
                    value={detalleSintoma}
                    onChange={(e) => setDetalleSintoma(e.target.value.slice(0, 600))}
                    placeholder="Ej: prende en frío, luego se apaga al acelerar y huele a gasolina..."
                  />
                </label>

                <button type="submit" className="mecanico-virtual-submit" disabled={cargandoIa}>
                  {cargandoIa ? 'Consultando IA...' : 'Consultar IA'}
                </button>
              </form>

              {errorIa && <p className="mecanico-virtual-aviso">{errorIa}</p>}

              {diagnostico && (
                <div className="mecanico-virtual-diagnostico">
                  <div className="mecanico-virtual-diagnostico-header">
                    <div>
                      <p className="mecanico-virtual-codigo">{marcaMoto} {modeloMoto}</p>
                      <h3>{diagnostico.diagnosticoPrincipal ?? diagnostico.descripcion}</h3>
                    </div>
                    <span className="mecanico-virtual-gravedad mecanico-virtual-gravedad--media">
                      Orientativo
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
                      <h4>Repuesto o sistema sugerido</h4>
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
                      para motos en Geomotor?
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
          aria-labelledby="mecanico-virtual-moto-resultados-titulo"
          onClick={() => setMostrarResultados(false)}
        >
          <div className="mecanico-virtual-resultados-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mecanico-virtual-resultados-header">
              <h3 id="mecanico-virtual-moto-resultados-titulo">
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
                  No encontramos repuestos publicados con esos términos para la moto seleccionada por ahora.
                </p>
              ) : (
                <div className="busqueda-repuestos-grid">
                  {productos.map((p) => (
                    <TarjetaProductoBusqueda
                      key={p.id}
                      producto={p}
                      vertical={VERTICAL_MOTO}
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
