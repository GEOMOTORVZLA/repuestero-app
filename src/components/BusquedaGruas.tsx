import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { ESTADOS_VENEZUELA, getCiudadesPorEstado, valoresCiudadFiltroBd } from '../data/ciudadesVenezuela';
import { nombreTipoGrua, TIPOS_GRUA, type TipoGruaId } from '../data/tiposGrua';
import { PAGE_SIZE_GRUAS_BUSQUEDA } from '../constants/limitesConsultaPublica';
import { MapVendedorUbicacion } from './MapaVendedorUbicacion';
import {
  MENSAJE_AVISO_NAVEGACION_MAPS_GRUA,
  TEXTO_ENLACE_NAVEGACION_GOOGLE_MAPS,
} from '../constants/googleMapsNavUi';
import { abrirNavegacionGoogleMapsDesdeAqui, urlGoogleMapsDirSoloDestino } from '../utils/googleMapsNavegar';
import { mensajeWhatsappGrua, urlWhatsAppGeomotor } from '../utils/linkWhatsAppGeomotor';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO } from '../utils/verticalVehiculo';
import './avisoSeleccionarEstado.css';
import './BusquedaRepuestos.css';
import './VendedoresCercaDeMi.css';
import './BusquedaTalleres.css';
import './BusquedaGruas.css';

export type Grua = {
  id: string;
  nombre: string | null;
  nombre_comercial: string | null;
  rif: string | null;
  tipos: string[] | null;
  servicio_24h: boolean | null;
  auxilio_vial: boolean | null;
  acerca_de: string | null;
  estado: string | null;
  ciudad: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
};

type BusquedaGruasProps = {
  vertical?: VerticalVehiculo;
};

function nombreGrua(g: Grua) {
  return g.nombre_comercial || g.nombre || 'Sin nombre';
}

export function BusquedaGruas({ vertical = VERTICAL_AUTO }: BusquedaGruasProps) {
  const [tipo, setTipo] = useState<TipoGruaId | ''>(vertical === 'moto' ? 'motos' : '');
  const [solo24h, setSolo24h] = useState(false);
  const [soloAuxilio, setSoloAuxilio] = useState(false);
  const [estado, setEstado] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [gruas, setGruas] = useState<Grua[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [avisoSeleccionarEstado, setAvisoSeleccionarEstado] = useState(false);
  const [errorDirectorio, setErrorDirectorio] = useState(false);
  const [contactar, setContactar] = useState<Grua | null>(null);
  const ciudadesOpciones = estado ? getCiudadesPorEstado(estado) : [];

  useEffect(() => {
    setTipo(vertical === 'moto' ? 'motos' : '');
    setSolo24h(false);
    setSoloAuxilio(false);
    setBuscado(false);
    setGruas([]);
    setHayMas(false);
    setAvisoSeleccionarEstado(false);
    setErrorDirectorio(false);
  }, [vertical]);

  const construirQuery = (filtros?: {
    tipo?: TipoGruaId | '';
    solo24h?: boolean;
    soloAuxilio?: boolean;
  }) => {
    const tipoQ = filtros?.tipo ?? tipo;
    const h24 = filtros?.solo24h ?? solo24h;
    const auxilio = filtros?.soloAuxilio ?? soloAuxilio;
    let query = supabase
      .from('gruas')
      .select(
        'id, nombre, nombre_comercial, rif, tipos, servicio_24h, auxilio_vial, acerca_de, estado, ciudad, telefono, email, direccion, latitud, longitud'
      );

    if (tipoQ) query = query.contains('tipos', [tipoQ]);
    if (h24) query = query.eq('servicio_24h', true);
    if (auxilio) query = query.eq('auxilio_vial', true);
    query = query.eq('estado', estado);
    if (ciudad) {
      const ciudadesBd = valoresCiudadFiltroBd(estado, ciudad);
      query =
        ciudadesBd.length === 1 ? query.eq('ciudad', ciudadesBd[0]) : query.in('ciudad', ciudadesBd);
    }

    return query
      .order('nombre_comercial', { ascending: true, nullsFirst: false })
      .order('nombre', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });
  };

  const buscar = async (filtros?: {
    tipo?: TipoGruaId | '';
    solo24h?: boolean;
    soloAuxilio?: boolean;
  }) => {
    setBuscado(true);
    setGruas([]);
    setErrorDirectorio(false);

    if (!estado.trim()) {
      setAvisoSeleccionarEstado(true);
      setCargando(false);
      return;
    }

    setAvisoSeleccionarEstado(false);
    setCargando(true);
    setHayMas(false);

    const { data, error } = await construirQuery(filtros).range(0, PAGE_SIZE_GRUAS_BUSQUEDA);

    if (error) {
      setGruas([]);
      setHayMas(false);
      setErrorDirectorio(true);
      console.error('Error buscando grúas:', error);
    } else {
      const filas = ((data ?? []) as Grua[]).filter((g) => g && typeof g.id === 'string');
      const mas = filas.length > PAGE_SIZE_GRUAS_BUSQUEDA;
      setGruas(mas ? filas.slice(0, PAGE_SIZE_GRUAS_BUSQUEDA) : filas);
      setHayMas(mas);
    }
    setCargando(false);
  };

  const cargarMas = async () => {
    if (cargando || cargandoMas || !hayMas || !estado.trim()) return;
    setCargandoMas(true);
    const offset = gruas.length;
    const { data, error } = await construirQuery().range(offset, offset + PAGE_SIZE_GRUAS_BUSQUEDA);
    if (error) {
      console.error('Error cargando más grúas:', error);
      setCargandoMas(false);
      return;
    }
    const filas = ((data ?? []) as Grua[]).filter((g) => g && typeof g.id === 'string');
    const mas = filas.length > PAGE_SIZE_GRUAS_BUSQUEDA;
    const chunk = mas ? filas.slice(0, PAGE_SIZE_GRUAS_BUSQUEDA) : filas;
    setGruas((prev) => [...prev, ...chunk]);
    setHayMas(mas);
    setCargandoMas(false);
  };

  const cerrarPanel = useCallback(() => {
    setBuscado(false);
    setGruas([]);
    setHayMas(false);
    setAvisoSeleccionarEstado(false);
    setErrorDirectorio(false);
  }, []);

  useEffect(() => {
    if (!buscado && !contactar) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [buscado, contactar]);

  useEffect(() => {
    if (!buscado) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (contactar) {
        setContactar(null);
        return;
      }
      cerrarPanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [buscado, contactar, cerrarPanel]);

  const tieneUbicacion = (g: Grua) => g.latitud != null && g.longitud != null;
  const urlWa = contactar?.telefono
    ? urlWhatsAppGeomotor(contactar.telefono, mensajeWhatsappGrua())
    : null;

  const resetLista = () => {
    setBuscado(false);
    setGruas([]);
    setHayMas(false);
    setAvisoSeleccionarEstado(false);
  };

  const filtrosTipoOverlay = (
    <>
      <div className="busqueda-gruas-tipos busqueda-gruas-tipos--overlay" role="group" aria-label="Tipo de grúa">
        {TIPOS_GRUA.map((t) => {
          const activo = tipo === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`busqueda-gruas-tipo${activo ? ' busqueda-gruas-tipo--activo' : ''}`}
              aria-pressed={activo}
              onClick={() => {
                const next = activo ? '' : t.id;
                setTipo(next);
                void buscar({ tipo: next });
              }}
            >
              <span className="busqueda-gruas-tipo-nombre">{t.nombre}</span>
              <span className="busqueda-gruas-tipo-desc">{t.descripcion}</span>
            </button>
          );
        })}
      </div>
      <div className="busqueda-gruas-badges busqueda-gruas-badges--overlay">
        <button
          type="button"
          className={`busqueda-gruas-badge${solo24h ? ' busqueda-gruas-badge--activo' : ''}`}
          aria-pressed={solo24h}
          onClick={() => {
            const next = !solo24h;
            setSolo24h(next);
            void buscar({ solo24h: next });
          }}
        >
          Servicio 24 horas
        </button>
        <button
          type="button"
          className={`busqueda-gruas-badge${soloAuxilio ? ' busqueda-gruas-badge--activo' : ''}`}
          aria-pressed={soloAuxilio}
          onClick={() => {
            const next = !soloAuxilio;
            setSoloAuxilio(next);
            void buscar({ soloAuxilio: next });
          }}
        >
          Auxilio vial (sin arrastre)
        </button>
      </div>
    </>
  );

  return (
    <div className="busqueda-gruas">
      <div className="busqueda-talleres-filtros">
        <div className="busqueda-talleres-campo">
          <label htmlFor="grua-estado">Estado</label>
          <select
            id="grua-estado"
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value);
              setCiudad('');
              resetLista();
            }}
          >
            <option value="">Selecciona el estado</option>
            {ESTADOS_VENEZUELA.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div className="busqueda-talleres-campo">
          <label htmlFor="grua-ciudad">Ciudad</label>
          <select
            id="grua-ciudad"
            value={ciudad}
            onChange={(e) => {
              setCiudad(e.target.value);
              resetLista();
            }}
            disabled={!estado}
          >
            <option value="">Todas</option>
            {ciudadesOpciones.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="busqueda-talleres-btn busqueda-gruas-btn" onClick={() => void buscar()} disabled={cargando}>
          {cargando ? 'Buscando…' : 'Buscar grúa'}
        </button>
      </div>

      {buscado && (
        <div
          className="resultados-busqueda-pagina-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="busqueda-gruas-overlay-titulo"
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrarPanel();
          }}
        >
          <div className="resultados-busqueda-pagina-panel" onClick={(e) => e.stopPropagation()}>
            <div className="resultados-busqueda-pagina-panel-header">
              <h3 id="busqueda-gruas-overlay-titulo">Grúas y emergencias</h3>
              <button type="button" className="resultados-busqueda-pagina-panel-cerrar" onClick={cerrarPanel}>
                Cerrar
              </button>
            </div>
            <div className="resultados-busqueda-pagina-panel-scroll">
              {!avisoSeleccionarEstado ? filtrosTipoOverlay : null}
              {cargando ? (
                <p className="busqueda-talleres-mensaje">Buscando servicios de emergencia…</p>
              ) : avisoSeleccionarEstado ? (
                <p className="aviso-seleccionar-estado" role="status">
                  Debes seleccionar un estado
                </p>
              ) : errorDirectorio ? (
                <p className="busqueda-talleres-sin-resultados">
                  El directorio de grúas se está activando. Mientras tanto puedes escribir a Geomotor por WhatsApp.
                </p>
              ) : gruas.length === 0 ? (
                <p className="busqueda-talleres-sin-resultados">
                  No hay grúas con estos filtros. Revisa el tipo, el estado y si pediste 24 horas o auxilio vial.
                </p>
              ) : (
                <div className="busqueda-talleres-resultados busqueda-talleres-resultados--en-overlay">
                  <div className="busqueda-talleres-grid">
                    {gruas.map((g) => {
                      const tipos = Array.isArray(g.tipos) ? g.tipos : [];
                      return (
                        <article key={g.id} className="vendedores-cerca-card busqueda-talleres-card">
                          <button
                            type="button"
                            className="busqueda-talleres-card-resumen"
                            onClick={() => setContactar(g)}
                            aria-label={`Ver datos de ${nombreGrua(g)}`}
                          >
                            <div className="vendedores-cerca-card-cuerpo busqueda-talleres-card-cuerpo-solo">
                              <div className="vendedores-cerca-card-info">
                                <h4 className="vendedores-cerca-card-nombre">{nombreGrua(g)}</h4>
                                <div className="vendedores-cerca-card-meta">
                                  {(g.ciudad || g.estado) && (
                                    <span className="vendedores-cerca-card-ubicacion">
                                      {[g.ciudad, g.estado].filter(Boolean).join(', ')}
                                    </span>
                                  )}
                                  <span className="vendedores-cerca-card-subtitulo">Grúa</span>
                                </div>
                                <div className="busqueda-gruas-card-chips">
                                  {g.servicio_24h ? <span className="busqueda-gruas-chip">24 h</span> : null}
                                  {g.auxilio_vial ? <span className="busqueda-gruas-chip">Auxilio</span> : null}
                                  {tipos.map((id) => (
                                    <span key={id} className="busqueda-gruas-chip busqueda-gruas-chip--tipo">
                                      {nombreTipoGrua(id)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </button>
                        </article>
                      );
                    })}
                  </div>
                  {hayMas && (
                    <div className="vendedores-cerca-cargar-mas">
                      <button
                        type="button"
                        className="vendedores-cerca-cargar-mas-btn"
                        onClick={() => void cargarMas()}
                        disabled={cargandoMas}
                      >
                        {cargandoMas ? 'Cargando…' : 'Ver más grúas'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {contactar && (
        <div
          className="busqueda-repuestos-modal-overlay busqueda-repuestos-modal-overlay--detalle"
          onClick={() => setContactar(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-grua-titulo"
        >
          <div
            className="busqueda-repuestos-modal vendedores-cerca-modal-contactar busqueda-repuestos-modal--panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="busqueda-repuestos-modal-header-bar">
              <h3 id="modal-grua-titulo" className="busqueda-repuestos-modal-header-titulo">
                Datos de la grúa
              </h3>
              <button
                type="button"
                className="busqueda-repuestos-modal-cerrar-x"
                onClick={() => setContactar(null)}
                aria-label="Cerrar ventana"
              >
                ×
              </button>
            </div>
            <div className="busqueda-repuestos-modal-body-scroll">
              <div className="busqueda-repuestos-modal-producto-box">
                <div className="busqueda-repuestos-modal-datos">
                  <p className="busqueda-repuestos-modal-linea">
                    <span className="busqueda-repuestos-modal-etiqueta">Nombre comercial</span>
                    <span className="busqueda-repuestos-modal-valor-negrita">{nombreGrua(contactar)}</span>
                  </p>
                  {(contactar.ciudad || contactar.estado) && (
                    <p className="busqueda-repuestos-modal-linea">
                      <span className="busqueda-repuestos-modal-etiqueta">Ubicación</span>
                      <span>{[contactar.ciudad, contactar.estado].filter(Boolean).join(', ')}</span>
                    </p>
                  )}
                  {contactar.telefono && (
                    <p className="busqueda-repuestos-modal-linea">
                      <span className="busqueda-repuestos-modal-etiqueta">Teléfono</span>
                      <span>{contactar.telefono}</span>
                    </p>
                  )}
                  {contactar.direccion && (
                    <p className="busqueda-repuestos-modal-linea">
                      <span className="busqueda-repuestos-modal-etiqueta">Dirección</span>
                      <span>{contactar.direccion}</span>
                    </p>
                  )}
                  {Array.isArray(contactar.tipos) && contactar.tipos.length > 0 && (
                    <div className="busqueda-repuestos-modal-linea busqueda-repuestos-modal-metodos-pago">
                      <span className="busqueda-repuestos-modal-etiqueta">Tipos de grúa</span>
                      <div className="busqueda-repuestos-modal-metodos-pago-lista">
                        {contactar.tipos.map((id) => (
                          <span key={id} className="busqueda-repuestos-modal-metodo-pago-chip">
                            {nombreTipoGrua(id)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {contactar.acerca_de && (
                    <p className="busqueda-repuestos-modal-linea busqueda-talleres-modal-acerca">
                      <span className="busqueda-repuestos-modal-etiqueta">Acerca del servicio</span>
                      <span className="busqueda-talleres-modal-acerca-texto">{contactar.acerca_de}</span>
                    </p>
                  )}
                </div>
              </div>

              {tieneUbicacion(contactar) && (
                <>
                  <h4 className="busqueda-repuestos-modal-titulo-seccion">Ubicación</h4>
                  <MapVendedorUbicacion
                    lat={contactar.latitud!}
                    lng={contactar.longitud!}
                    nombreVendedor={nombreGrua(contactar)}
                    tipoPunto="grua"
                  />
                </>
              )}

              <div className="busqueda-repuestos-modal-botones">
                {urlWa ? (
                  <a href={urlWa} target="_blank" rel="noopener noreferrer" className="busqueda-repuestos-modal-whatsapp">
                    Contactar por WhatsApp
                  </a>
                ) : (
                  <p className="busqueda-repuestos-modal-sin-contacto">Sin teléfono registrado.</p>
                )}
              </div>
              {tieneUbicacion(contactar) && (
                <div className="vendedores-cerca-modal-ruta">
                  <p className="maps-nav-aviso-confirmacion" role="note">
                    {MENSAJE_AVISO_NAVEGACION_MAPS_GRUA}
                  </p>
                  <a
                    href={urlGoogleMapsDirSoloDestino(contactar.latitud!, contactar.longitud!)}
                    className="vendedores-cerca-modal-ruta-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      abrirNavegacionGoogleMapsDesdeAqui(contactar.latitud!, contactar.longitud!);
                    }}
                  >
                    {TEXTO_ENLACE_NAVEGACION_GOOGLE_MAPS}
                  </a>
                </div>
              )}
              <button type="button" className="busqueda-repuestos-modal-cerrar" onClick={() => setContactar(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
