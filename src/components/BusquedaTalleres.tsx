import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { ESTADOS_VENEZUELA, getCiudadesPorEstado } from '../data/ciudadesVenezuela';
import { ESPECIALIDADES_TALLER } from '../data/registroVenezuela';
import { normalizeEspecialidadesTallerDb } from '../utils/tallerEspecialidades';
import { MapVendedorUbicacion } from './MapaVendedorUbicacion';
import './avisoSeleccionarEstado.css';
import './BusquedaRepuestos.css';
import './VendedoresCercaDeMi.css';
import './BusquedaTalleres.css';

export interface Taller {
  id: string;
  nombre: string | null;
  nombre_comercial: string | null;
  rif: string | null;
  /** text[] en Supabase; el cliente acepta también string legacy */
  especialidad: string[] | string | null;
  marca_vehiculo: string | null;
  acerca_de: string | null;
  estado: string | null;
  ciudad: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  metodos_pago: string[] | null;
}

interface BusquedaTalleresProps {
  onBuscar?: () => void;
}

export function BusquedaTalleres({ onBuscar }: BusquedaTalleresProps) {
  const [especialidad, setEspecialidad] = useState('');
  const [estado, setEstado] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [talleres, setTalleres] = useState<Taller[]>([]);
  const [cargando, setCargando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [avisoSeleccionarEstado, setAvisoSeleccionarEstado] = useState(false);
  const [contactarTaller, setContactarTaller] = useState<Taller | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mostrarRutaEnModal, setMostrarRutaEnModal] = useState(false);

  const ciudadesOpciones = estado ? getCiudadesPorEstado(estado) : [];

  const buscar = async () => {
    onBuscar?.();
    setBuscado(true);
    setTalleres([]);

    if (!estado.trim()) {
      setAvisoSeleccionarEstado(true);
      setCargando(false);
      return;
    }

    setAvisoSeleccionarEstado(false);
    setCargando(true);

    let query = supabase
      .from('talleres')
      .select(
        'id, nombre, nombre_comercial, rif, especialidad, marca_vehiculo, acerca_de, estado, ciudad, telefono, email, direccion, latitud, longitud, metodos_pago'
      );

    if (especialidad) {
      query = query.contains('especialidad', [especialidad]);
    }
    query = query.eq('estado', estado);
    if (ciudad) {
      query = query.eq('ciudad', ciudad);
    }

    const { data, error } = await query;

    if (error) {
      setTalleres([]);
      console.error('Error buscando talleres:', error);
    } else {
      setTalleres((data ?? []) as Taller[]);
    }
    setCargando(false);
  };

  const nombreTaller = (t: Taller) => t.nombre_comercial || t.nombre || 'Sin nombre';
  const contactoWhatsApp = (t: Taller) => {
    const tel = (t.telefono ?? '').replace(/\D/g, '');
    if (!tel) return null;
    const num = tel.startsWith('58') ? tel : `58${tel}`;
    return `https://wa.me/${num}`;
  };

  const abrirDetalleTaller = (t: Taller) => {
    setContactarTaller(t);
    setMostrarRutaEnModal(false);
  };
  const cerrarContactar = () => {
    setContactarTaller(null);
    setMostrarRutaEnModal(false);
  };

  useEffect(() => {
    if (!contactarTaller) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContactarTaller(null);
        setMostrarRutaEnModal(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [contactarTaller]);

  const cerrarPanelResultadosTalleres = useCallback(() => {
    setBuscado(false);
    setTalleres([]);
    setAvisoSeleccionarEstado(false);
  }, []);

  useEffect(() => {
    if (!buscado) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [buscado]);

  useEffect(() => {
    if (!buscado) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (contactarTaller) return;
      cerrarPanelResultadosTalleres();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [buscado, contactarTaller, cerrarPanelResultadosTalleres]);

  const tieneUbicacion = (t: Taller) =>
    t.latitud != null && t.longitud != null;

  const linkRutaGoogleMaps = (t: Taller) => {
    if (t.latitud == null || t.longitud == null) return null;
    const dest = `${t.latitud},${t.longitud}`;
    if (userLocation) {
      const origin = `${userLocation.lat},${userLocation.lng}`;
      return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
        origin
      )}&destination=${encodeURIComponent(dest)}&travelmode=driving`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      dest
    )}&travelmode=driving`;
  };

  return (
    <div className="busqueda-talleres">
      <div className="busqueda-talleres-filtros">
        <div className="busqueda-talleres-campo">
          <label htmlFor="taller-especialidad">Especialidad</label>
          <select
            id="taller-especialidad"
            value={especialidad}
            onChange={(e) => {
              setEspecialidad(e.target.value);
              setBuscado(false);
              setTalleres([]);
              setAvisoSeleccionarEstado(false);
            }}
          >
            <option value="">Todas</option>
            {ESPECIALIDADES_TALLER.map((esp) => (
              <option key={esp} value={esp}>{esp}</option>
            ))}
          </select>
        </div>
        <div className="busqueda-talleres-campo">
          <label htmlFor="taller-estado">Estado</label>
          <select
            id="taller-estado"
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value);
              setCiudad('');
              setAvisoSeleccionarEstado(false);
              setBuscado(false);
              setTalleres([]);
            }}
          >
            <option value="">Selecciona el estado</option>
            {ESTADOS_VENEZUELA.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div className="busqueda-talleres-campo">
          <label htmlFor="taller-ciudad">Ciudad</label>
          <select
            id="taller-ciudad"
            value={ciudad}
            onChange={(e) => {
              setCiudad(e.target.value);
              setBuscado(false);
              setTalleres([]);
              setAvisoSeleccionarEstado(false);
            }}
            disabled={!estado}
          >
            <option value="">Todas</option>
            {ciudadesOpciones.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="busqueda-talleres-btn"
          onClick={buscar}
          disabled={cargando}
        >
          {cargando ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {buscado && (
        <div
          className="resultados-busqueda-pagina-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="busqueda-talleres-overlay-titulo"
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrarPanelResultadosTalleres();
          }}
        >
          <div
            className="resultados-busqueda-pagina-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="resultados-busqueda-pagina-panel-header">
              <h3 id="busqueda-talleres-overlay-titulo">Talleres</h3>
              <button
                type="button"
                className="resultados-busqueda-pagina-panel-cerrar"
                onClick={cerrarPanelResultadosTalleres}
              >
                Cerrar
              </button>
            </div>
            <div className="resultados-busqueda-pagina-panel-scroll">
              {cargando ? (
                <p className="busqueda-talleres-mensaje">Buscando talleres…</p>
              ) : avisoSeleccionarEstado ? (
                <p className="aviso-seleccionar-estado" role="status">
                  Debes seleccionar un estado
                </p>
              ) : talleres.length === 0 ? (
                <p className="busqueda-talleres-sin-resultados">
                  No hay talleres con estos filtros: revisa <strong>estado</strong> y <strong>ciudad</strong>{' '}
                  (deben coincidir con el registro). En la web solo se listan talleres{' '}
                  <strong>aprobados</strong> y con <strong>membresía vigente</strong>. Si ya aprobaste uno en
                  admin y no aparece, en Supabase ejecuta una vez{' '}
                  <code className="busqueda-talleres-sin-resultados-code">
                    supabase-talleres-membresia-inicial.sql
                  </code>{' '}
                  (o vuelve a pulsar &quot;Aprobar&quot; tras desplegar el SQL actualizado del repositorio).
                </p>
              ) : (
                <div className="busqueda-talleres-resultados busqueda-talleres-resultados--en-overlay">
                  <div className="busqueda-talleres-grid">
                    {talleres.map((t) => {
                      const espList = normalizeEspecialidadesTallerDb(t.especialidad);
                      const labelCard = `Ver datos de ${nombreTaller(t)}`;
                      return (
                        <article key={t.id} className="vendedores-cerca-card">
                          <button
                            type="button"
                            className="busqueda-talleres-card-resumen"
                            onClick={() => abrirDetalleTaller(t)}
                            aria-label={labelCard}
                          >
                            <div className="vendedores-cerca-card-cuerpo busqueda-talleres-card-cuerpo-solo">
                              <div className="vendedores-cerca-card-info">
                                <h4 className="vendedores-cerca-card-nombre">{nombreTaller(t)}</h4>
                                <div className="vendedores-cerca-card-meta">
                                  {(t.ciudad || t.estado) && (
                                    <span className="vendedores-cerca-card-ubicacion">
                                      {[t.ciudad, t.estado].filter(Boolean).join(', ')}
                                    </span>
                                  )}
                                  <span className="vendedores-cerca-card-subtitulo">Taller</span>
                                </div>
                                {espList.length > 0 && (
                                  <div className="busqueda-talleres-card-chips-row" aria-label="Especialidades">
                                    {espList.map((esp) => (
                                      <span key={esp} className="busqueda-talleres-chip">
                                        {esp}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {contactarTaller && (
        <div
          className="busqueda-repuestos-modal-overlay busqueda-repuestos-modal-overlay--detalle"
          onClick={cerrarContactar}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-taller-titulo"
        >
          <div
            className="busqueda-repuestos-modal vendedores-cerca-modal-contactar busqueda-repuestos-modal--panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="busqueda-repuestos-modal-header-bar">
              <h3 id="modal-taller-titulo" className="busqueda-repuestos-modal-header-titulo">
                Datos del taller
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
            <div className="busqueda-repuestos-modal-producto-box">
              <div className="busqueda-repuestos-modal-datos">
                <p className="busqueda-repuestos-modal-linea">
                  <span className="busqueda-repuestos-modal-etiqueta">Nombre comercial</span>
                  <span className="busqueda-repuestos-modal-valor-negrita">{nombreTaller(contactarTaller)}</span>
                </p>
                {contactarTaller.rif != null && String(contactarTaller.rif).trim() !== '' && (
                  <p className="busqueda-repuestos-modal-linea">
                    <span className="busqueda-repuestos-modal-etiqueta">RIF</span>
                    <span>{contactarTaller.rif}</span>
                  </p>
                )}
                {(contactarTaller.ciudad || contactarTaller.estado) && (
                  <p className="busqueda-repuestos-modal-linea">
                    <span className="busqueda-repuestos-modal-etiqueta">Ubicación</span>
                    <span>{[contactarTaller.ciudad, contactarTaller.estado].filter(Boolean).join(', ')}</span>
                  </p>
                )}
                {contactarTaller.telefono && (
                  <p className="busqueda-repuestos-modal-linea">
                    <span className="busqueda-repuestos-modal-etiqueta">Teléfono</span>
                    <span>{contactarTaller.telefono}</span>
                  </p>
                )}
                {contactarTaller.email && (
                  <p className="busqueda-repuestos-modal-linea">
                    <span className="busqueda-repuestos-modal-etiqueta">Correo</span>
                    <span>{contactarTaller.email}</span>
                  </p>
                )}
                {contactarTaller.direccion && (
                  <p className="busqueda-repuestos-modal-linea">
                    <span className="busqueda-repuestos-modal-etiqueta">Dirección</span>
                    <span>{contactarTaller.direccion}</span>
                  </p>
                )}
                {(() => {
                  const list = normalizeEspecialidadesTallerDb(contactarTaller.especialidad);
                  if (!list.length) return null;
                  return (
                    <div className="busqueda-repuestos-modal-linea busqueda-repuestos-modal-metodos-pago">
                      <span className="busqueda-repuestos-modal-etiqueta">Especialidades</span>
                      <div className="busqueda-repuestos-modal-metodos-pago-lista">
                        {list.map((esp) => (
                          <span key={esp} className="busqueda-repuestos-modal-metodo-pago-chip">
                            {esp}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {contactarTaller.marca_vehiculo && (
                  <p className="busqueda-repuestos-modal-linea">
                    <span className="busqueda-repuestos-modal-etiqueta">Marca de vehículos</span>
                    <span>{contactarTaller.marca_vehiculo}</span>
                  </p>
                )}
                {contactarTaller.acerca_de && (
                  <p className="busqueda-repuestos-modal-linea busqueda-talleres-modal-acerca">
                    <span className="busqueda-repuestos-modal-etiqueta busqueda-talleres-modal-acerca-etiq">
                      Acerca del taller
                    </span>
                    <span className="busqueda-talleres-modal-acerca-texto">{contactarTaller.acerca_de}</span>
                  </p>
                )}
                {Array.isArray(contactarTaller.metodos_pago) && contactarTaller.metodos_pago.length > 0 && (
                  <div className="busqueda-repuestos-modal-linea busqueda-repuestos-modal-metodos-pago">
                    <span className="busqueda-repuestos-modal-etiqueta">Formas de pago</span>
                    <div className="busqueda-repuestos-modal-metodos-pago-lista">
                      {contactarTaller.metodos_pago.map((m) => (
                        <span key={m} className="busqueda-repuestos-modal-metodo-pago-chip">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {tieneUbicacion(contactarTaller) && (
              <>
                <h4 className="busqueda-repuestos-modal-titulo-seccion">Ubicación</h4>
                <MapVendedorUbicacion
                  lat={contactarTaller.latitud!}
                  lng={contactarTaller.longitud!}
                  nombreVendedor={nombreTaller(contactarTaller)}
                  tipoPunto="taller"
                  userLat={userLocation?.lat}
                  userLng={userLocation?.lng}
                  mostrarRutaDesdeUsuario={mostrarRutaEnModal}
                />
              </>
            )}

            <div className="busqueda-repuestos-modal-botones">
              {contactarTaller.telefono && contactoWhatsApp(contactarTaller) ? (
                <a
                  href={contactoWhatsApp(contactarTaller)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="busqueda-repuestos-modal-whatsapp"
                >
                  Contactar por WhatsApp
                </a>
              ) : (
                <p className="busqueda-repuestos-modal-sin-contacto">Sin teléfono registrado.</p>
              )}
            </div>
            {tieneUbicacion(contactarTaller) && (
              <div className="vendedores-cerca-modal-ruta">
                <p className="vendedores-cerca-modal-ruta-hint">
                  Usa <strong>Ver ruta en vivo</strong> cuando ya estés listo para ir al taller.
                </p>
                <button
                  type="button"
                  className="vendedores-cerca-modal-ruta-btn"
                  onClick={() => {
                    if (userLocation) {
                      setMostrarRutaEnModal(true);
                      return;
                    }
                    if (!navigator.geolocation) return;
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setUserLocation({
                          lat: pos.coords.latitude,
                          lng: pos.coords.longitude,
                        });
                        setMostrarRutaEnModal(true);
                      },
                      () => {},
                      { enableHighAccuracy: true, timeout: 10000 }
                    );
                  }}
                >
                  Ver ruta en vivo en el mapa
                </button>
                {!userLocation && (
                  <p className="vendedores-cerca-modal-ruta-hint">
                    Al pulsar, el navegador te pedirá permiso para usar tu ubicación y trazar la ruta.
                  </p>
                )}
                {linkRutaGoogleMaps(contactarTaller) && (
                  <a
                    href={linkRutaGoogleMaps(contactarTaller)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="vendedores-cerca-modal-ruta-btn"
                  >
                    Abrir en Google Maps para navegar
                  </a>
                )}
              </div>
            )}
            <button type="button" className="busqueda-repuestos-modal-cerrar" onClick={cerrarContactar}>
              Cerrar
            </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
