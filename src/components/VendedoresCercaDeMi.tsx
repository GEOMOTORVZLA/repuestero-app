import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { ESTADOS_VENEZUELA, getCiudadesPorEstado } from '../data/ciudadesVenezuela';
import { MapVendedorUbicacion } from './MapaVendedorUbicacion';
import {
  MENSAJE_AVISO_NAVEGACION_MAPS_TIENDA,
  TEXTO_ENLACE_NAVEGACION_GOOGLE_MAPS,
} from '../constants/googleMapsNavUi';
import { abrirNavegacionGoogleMapsDesdeAqui, urlGoogleMapsDirSoloDestino } from '../utils/googleMapsNavegar';
import './VendedoresCercaDeMi.css';
import './avisoSeleccionarEstado.css';
import './BusquedaRepuestos.css';

const PAGE_SIZE_VENDEDORES = 30;

export interface TiendaCerca {
  id: string;
  nombre: string | null;
  nombre_comercial: string | null;
  estado: string | null;
  ciudad: string | null;
  latitud: number;
  longitud: number;
  telefono: string | null;
  direccion: string | null;
  rif: string | null;
  metodos_pago: string[] | null;
  distanciaKm?: number;
}

/** Distancia aproximada en km entre dos puntos (fórmula de Haversine) */
function distanciaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // radio Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function VendedoresCercaDeMi() {
  const [tiendas, setTiendas] = useState<TiendaCerca[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [ciudadFiltro, setCiudadFiltro] = useState('');
  const [usandoGps, setUsandoGps] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsObteniendo, setGpsObteniendo] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const construirQueryTiendas = () => {
    let query = supabase
      .from('tiendas')
      .select('id, nombre, nombre_comercial, rif, estado, ciudad, latitud, longitud, telefono, direccion, metodos_pago')
      .order('estado', { ascending: true, nullsFirst: false })
      .order('ciudad', { ascending: true, nullsFirst: false })
      .order('nombre_comercial', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });

    if (estadoFiltro) query = query.eq('estado', estadoFiltro);
    if (ciudadFiltro) query = query.eq('ciudad', ciudadFiltro);

    return query;
  };

  const cargarTiendas = async () => {
    setCargando(true);
    setError(null);
    setHayMas(false);
    const { data, error } = await construirQueryTiendas().range(0, PAGE_SIZE_VENDEDORES);

    if (error) {
      setError(
        error.message ||
          'No se pudo cargar vendedores. Verifica políticas RLS de SELECT en public.tiendas.'
      );
      setTiendas([]);
      setHayMas(false);
    } else {
      const filas = ((data ?? []) as TiendaCerca[]).filter(
        (t) => t && typeof t.id === 'string'
      );
      const mas = filas.length > PAGE_SIZE_VENDEDORES;
      const primeras = mas ? filas.slice(0, PAGE_SIZE_VENDEDORES) : filas;
      setTiendas(primeras);
      setHayMas(mas);
    }
    setCargando(false);
  };

  const cargarMasTiendas = async () => {
    if (cargando || cargandoMas || !hayMas) return;
    setCargandoMas(true);
    setError(null);
    const offset = tiendas.length;
    const { data, error } = await construirQueryTiendas().range(
      offset,
      offset + PAGE_SIZE_VENDEDORES
    );

    if (error) {
      setError(error.message || 'No se pudo cargar más vendedores.');
      setCargandoMas(false);
      return;
    }

    const filas = ((data ?? []) as TiendaCerca[]).filter(
      (t) => t && typeof t.id === 'string'
    );
    const mas = filas.length > PAGE_SIZE_VENDEDORES;
    const chunk = mas ? filas.slice(0, PAGE_SIZE_VENDEDORES) : filas;
    setTiendas((prev) => [...prev, ...chunk]);
    setHayMas(mas);
    setCargandoMas(false);
  };

  const obtenerMiUbicacion = () => {
    setGpsError(null);
    setGpsObteniendo(true);
    if (!navigator.geolocation) {
      setGpsError('Tu navegador no soporta geolocalización.');
      setGpsObteniendo(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setUsandoGps(true);
        setGpsObteniendo(false);
      },
      () => {
        setGpsError('No se pudo obtener tu ubicación. Revisa los permisos del navegador.');
        setGpsObteniendo(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const quitarGps = () => {
    setUsandoGps(false);
    setGpsCoords(null);
    setGpsError(null);
  };

  const ciudadesOpciones = estadoFiltro ? getCiudadesPorEstado(estadoFiltro) : [];

  // Lista a mostrar: orden por distancia si hay GPS.
  // El filtrado principal ya se hace en la consulta paginada.
  const listaMostrar = ((): TiendaCerca[] => {
    let list = [...tiendas];

    if (usandoGps && gpsCoords) {
      list = list.map((t) => ({
        ...t,
        distanciaKm: distanciaKm(gpsCoords.lat, gpsCoords.lng, t.latitud, t.longitud),
      }));
      list.sort((a, b) => (a.distanciaKm ?? 0) - (b.distanciaKm ?? 0));
    } else {
      // Ordenar por estado y ciudad para vista por zona
      list.sort((a, b) => {
        const estA = (a.estado ?? '').localeCompare(b.estado ?? '');
        if (estA !== 0) return estA;
        return (a.ciudad ?? '').localeCompare(b.ciudad ?? '');
      });
    }

    return list;
  })();

  const nombreTienda = (t: TiendaCerca) => t.nombre_comercial || t.nombre || 'Sin nombre';
  const linkWhatsApp = (t: TiendaCerca) => {
    const tel = (t.telefono ?? '').replace(/\D/g, '');
    if (!tel) return null;
    const full = tel.startsWith('58') ? tel : `58${tel}`;
    return `https://wa.me/${full}`;
  };

  const [contactarTienda, setContactarTienda] = useState<TiendaCerca | null>(null);
  const [ubicado, setUbicado] = useState(false);
  const cerrarContactar = () => {
    setContactarTienda(null);
  };

  useEffect(() => {
    if (!contactarTienda) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContactarTienda(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [contactarTienda]);

  const overlayVendedoresActivo = ubicado && Boolean(estadoFiltro.trim());

  useEffect(() => {
    if (!overlayVendedoresActivo) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [overlayVendedoresActivo]);

  useEffect(() => {
    if (!overlayVendedoresActivo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (contactarTienda) return;
      setUbicado(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayVendedoresActivo, contactarTienda]);

  const cerrarOverlayVendedores = () => {
    setUbicado(false);
  };

  const ubicar = () => {
    if (!estadoFiltro.trim()) {
      setMensaje('Debes seleccionar un estado');
      setUbicado(false);
      setTiendas([]);
      setHayMas(false);
      return;
    }
    setMensaje('');
    setUbicado(true);
    // En móvil/calle: solicitar ubicación actual al iniciar la búsqueda por zona.
    if (!usandoGps && !gpsObteniendo) {
      obtenerMiUbicacion();
    }
    void cargarTiendas();
  };

  const abrirContactar = (t: TiendaCerca) => {
    setContactarTienda(t);
  };

  return (
    <section className="vendedores-cerca" id="vendedores-cerca">
      <h2 className="vendedores-cerca-titulo">VENTAS DE PRODUCTOS CERCA DE MI ZONA</h2>
      <p className="vendedores-cerca-subtitulo">
        Encuentra a nuestros vendedores de repuestos: por ciudad o por cercanía con tu ubicación.
      </p>

      <div className="vendedores-cerca-filtros">
        <div className="vendedores-cerca-filtros-campos">
          <label htmlFor="vendedores-estado">Estado</label>
          <select
            id="vendedores-estado"
            value={estadoFiltro}
            onChange={(e) => {
              setEstadoFiltro(e.target.value);
              setCiudadFiltro('');
              setUbicado(false);
              setMensaje('');
            }}
          >
            <option value="">Selecciona el estado</option>
            {ESTADOS_VENEZUELA.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div className="vendedores-cerca-filtros-campos">
          <label htmlFor="vendedores-ciudad">Ciudad / Municipio</label>
          <select
            id="vendedores-ciudad"
            value={ciudadFiltro}
            onChange={(e) => {
              setCiudadFiltro(e.target.value);
              setUbicado(false);
              setMensaje('');
            }}
            disabled={!estadoFiltro}
          >
            <option value="">Selecciona municipio</option>
            {ciudadesOpciones.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="vendedores-cerca-btn-ubicar"
          onClick={ubicar}
        >
          Buscar
        </button>
      </div>

      {mensaje && (
        <p className="aviso-seleccionar-estado" role="status">
          {mensaje}
        </p>
      )}

      {ubicado && estadoFiltro && (
        <div
          className="resultados-busqueda-pagina-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vendedores-cerca-overlay-titulo"
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrarOverlayVendedores();
          }}
        >
          <div
            className="resultados-busqueda-pagina-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="resultados-busqueda-pagina-panel-header">
              <h3 id="vendedores-cerca-overlay-titulo">
                {`Vendedores en ${ciudadFiltro ? `${ciudadFiltro}, ` : ''}${estadoFiltro} (${listaMostrar.length}${hayMas ? '+' : ''})`}
              </h3>
              <button
                type="button"
                className="resultados-busqueda-pagina-panel-cerrar"
                onClick={cerrarOverlayVendedores}
              >
                Volver
              </button>
            </div>
            <div className="resultados-busqueda-pagina-panel-scroll">
              <div className="vendedores-cerca-resultados vendedores-cerca-resultados--en-overlay">
                <div className="vendedores-cerca-resultados-header vendedores-cerca-resultados-header--en-overlay">
                  <div className="vendedores-cerca-gps">
                    {!usandoGps ? (
                      <button
                        type="button"
                        className="vendedores-cerca-btn-gps"
                        onClick={obtenerMiUbicacion}
                        disabled={gpsObteniendo}
                      >
                        {gpsObteniendo ? 'Obteniendo…' : '📍 Ordenar por cercanía'}
                      </button>
                    ) : (
                      <button type="button" className="vendedores-cerca-btn-quitar-gps" onClick={quitarGps}>
                        Quitar orden por cercanía
                      </button>
                    )}
                  </div>
                </div>
                {gpsError && <p className="vendedores-cerca-gps-error">{gpsError}</p>}
                {usandoGps && (
                  <p className="vendedores-cerca-gps-ok">
                    Listado ordenado del más cercano al más lejano según tu ubicación.
                  </p>
                )}
                {cargando ? (
                  <p className="vendedores-cerca-cargando">Cargando vendedores…</p>
                ) : error ? (
                  <p className="vendedores-cerca-error">{error}</p>
                ) : listaMostrar.length === 0 ? (
                  <p className="vendedores-cerca-sin-resultados">
                    No hay vendedores con ese filtro de zona. Prueba con otro estado o municipio.
                  </p>
                ) : (
                  <>
                    <div className="vendedores-cerca-grid">
                      {listaMostrar.map((t) => (
                        <article key={t.id} className="vendedores-cerca-card">
                          <div className="vendedores-cerca-card-cuerpo">
                            <div className="vendedores-cerca-card-info">
                              <h4 className="vendedores-cerca-card-nombre">{nombreTienda(t)}</h4>
                              <div className="vendedores-cerca-card-meta">
                                {(t.ciudad || t.estado) && (
                                  <span className="vendedores-cerca-card-ubicacion">
                                    {[t.ciudad, t.estado].filter(Boolean).join(', ')}
                                  </span>
                                )}
                                {t.distanciaKm != null && (
                                  <span className="vendedores-cerca-card-distancia">
                                    {t.distanciaKm.toFixed(1)} km
                                  </span>
                                )}
                                {!t.distanciaKm && (
                                  <span className="vendedores-cerca-card-subtitulo">Vendedor de repuestos</span>
                                )}
                              </div>
                            </div>
                            <div className="vendedores-cerca-card-botones">
                              <button
                                type="button"
                                className="vendedores-cerca-card-btn"
                                onClick={() => abrirContactar(t)}
                              >
                                Contactar vendedor
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    {hayMas && (
                      <div className="busqueda-repuestos-cargar-mas">
                        <button
                          type="button"
                          className="busqueda-repuestos-btn busqueda-repuestos-btn--cargar-mas"
                          onClick={() => void cargarMasTiendas()}
                          disabled={cargandoMas || cargando}
                        >
                          {cargandoMas ? 'Cargando…' : 'Cargar más vendedores'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {contactarTienda && (
        <div
          className="busqueda-repuestos-modal-overlay busqueda-repuestos-modal-overlay--detalle"
          onClick={cerrarContactar}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-contactar-vendedor-titulo"
        >
          <div
            className="busqueda-repuestos-modal vendedores-cerca-modal-contactar busqueda-repuestos-modal--panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="busqueda-repuestos-modal-header-bar">
              <h3 id="modal-contactar-vendedor-titulo" className="busqueda-repuestos-modal-header-titulo">
                Datos del vendedor
              </h3>
              <button
                type="button"
                className="busqueda-repuestos-modal-cerrar-x"
                onClick={cerrarContactar}
                aria-label="Cerrar ventana"
              >
                ×
              </button>
            </div>
            <div className="busqueda-repuestos-modal-body-scroll">
            <div className="busqueda-repuestos-modal-datos">
              <p className="busqueda-repuestos-modal-linea"><span className="busqueda-repuestos-modal-etiqueta">Nombre comercial</span> {nombreTienda(contactarTienda)}</p>
              {contactarTienda.rif != null && contactarTienda.rif !== '' && (
                <p className="busqueda-repuestos-modal-linea"><span className="busqueda-repuestos-modal-etiqueta">RIF</span> {contactarTienda.rif}</p>
              )}
              {(contactarTienda.ciudad || contactarTienda.estado) && (
                <p className="busqueda-repuestos-modal-linea"><span className="busqueda-repuestos-modal-etiqueta">Ubicación</span> {[contactarTienda.ciudad, contactarTienda.estado].filter(Boolean).join(', ')}</p>
              )}
              {contactarTienda.telefono && (
                <p className="busqueda-repuestos-modal-linea"><span className="busqueda-repuestos-modal-etiqueta">Teléfono</span> {contactarTienda.telefono}</p>
              )}
              {contactarTienda.direccion && (
                <p className="busqueda-repuestos-modal-linea"><span className="busqueda-repuestos-modal-etiqueta">Dirección</span> {contactarTienda.direccion}</p>
              )}
              {Array.isArray(contactarTienda.metodos_pago) && contactarTienda.metodos_pago.length > 0 && (
                <div className="busqueda-repuestos-modal-linea busqueda-repuestos-modal-metodos-pago">
                  <span className="busqueda-repuestos-modal-etiqueta">Formas de pago</span>
                  <div className="busqueda-repuestos-modal-metodos-pago-lista">
                    {contactarTienda.metodos_pago.map((m) => (
                      <span key={m} className="busqueda-repuestos-modal-metodo-pago-chip">{m}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <h4 className="busqueda-repuestos-modal-titulo-seccion">Ubicación</h4>
            <MapVendedorUbicacion
              lat={contactarTienda.latitud}
              lng={contactarTienda.longitud}
              nombreVendedor={nombreTienda(contactarTienda)}
              userLat={gpsCoords?.lat}
              userLng={gpsCoords?.lng}
            />
            <div className="busqueda-repuestos-modal-botones">
              {contactarTienda.telefono && linkWhatsApp(contactarTienda) ? (
                <a
                  href={linkWhatsApp(contactarTienda)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="busqueda-repuestos-modal-whatsapp"
                >
                  Contactar por WhatsApp
                </a>
              ) : (
                <p className="busqueda-repuestos-modal-sin-contacto">Sin teléfono registrado.</p>
              )}
              {contactarTienda.latitud != null && contactarTienda.longitud != null && (
                <div className="vendedores-cerca-modal-ruta">
                  <p className="maps-nav-aviso-confirmacion" role="note">
                    {MENSAJE_AVISO_NAVEGACION_MAPS_TIENDA}
                  </p>
                  <a
                    href={urlGoogleMapsDirSoloDestino(contactarTienda.latitud, contactarTienda.longitud)}
                    className="vendedores-cerca-modal-ruta-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      abrirNavegacionGoogleMapsDesdeAqui(contactarTienda.latitud, contactarTienda.longitud);
                    }}
                  >
                    {TEXTO_ENLACE_NAVEGACION_GOOGLE_MAPS}
                  </a>
                </div>
              )}
              <button type="button" className="busqueda-repuestos-modal-cerrar" onClick={cerrarContactar}>
                Cerrar
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
