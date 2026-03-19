import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { CATEGORIAS_KEYWORDS } from '../data/categoriasKeywords';
import { MapVendedorUbicacion } from './MapaVendedorUbicacion';
import './BusquedaRepuestos.css';

interface TiendaContacto {
  nombre_comercial: string | null;
  nombre: string | null;
  rif: string | null;
  telefono: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  metodos_pago: string[] | null;
}

interface ProductoResultado {
  id: string;
  nombre: string;
  descripcion: string | null;
  comentarios: string | null;
  precio_usd: number;
  moneda: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  imagen_url: string | null;
  tiendas: TiendaContacto | null;
}

interface ListaRepuestosPorCategoriaProps {
  categoria: string;
  onCerrar: () => void;
}

function buildOrFilter(keywords: string[]): string {
  const conditions: string[] = [];
  for (const kw of keywords) {
    const pattern = `%${kw}%`;
    conditions.push(`nombre.ilike.${pattern}`);
    conditions.push(`descripcion.ilike.${pattern}`);
  }
  return conditions.join(',');
}

export function ListaRepuestosPorCategoria({ categoria, onCerrar }: ListaRepuestosPorCategoriaProps) {
  const [resultados, setResultados] = useState<ProductoResultado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [contactarProducto, setContactarProducto] = useState<ProductoResultado | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mostrarRutaEnModal, setMostrarRutaEnModal] = useState(false);

  useEffect(() => {
    const keywords = CATEGORIAS_KEYWORDS[categoria] ?? [categoria.toLowerCase()];
    const buscar = async () => {
      setCargando(true);
      const orFilter = buildOrFilter(keywords);
      const { data, error } = await supabase
        .from('productos')
        .select(`
          id,
          activo,
          nombre,
          descripcion,
          comentarios,
          precio_usd,
          moneda,
          marca,
          modelo,
          anio,
          imagen_url,
          tiendas ( nombre_comercial, nombre, rif, telefono, direccion, latitud, longitud, metodos_pago )
        `)
        .eq('activo', true)
        .or(orFilter)
        .order('nombre');

      if (error) {
        setResultados([]);
      } else {
        setResultados((data as unknown as ProductoResultado[]) ?? []);
      }
      setCargando(false);
    };

    buscar();
  }, [categoria]);

  const nombreTienda = (p: ProductoResultado) => {
    const t = p.tiendas;
    return t?.nombre_comercial || t?.nombre || 'Vendedor';
  };

  const tieneUbicacion = (p: ProductoResultado) => {
    const t = p.tiendas;
    return t && t.latitud != null && t.longitud != null;
  };

  const linkWhatsApp = (telefono: string) => {
    const num = telefono.replace(/\D/g, '');
    const full = num.startsWith('58') ? num : `58${num}`;
    return `https://wa.me/${full}`;
  };

  const linkRutaGoogleMaps = (p: ProductoResultado) => {
    const t = p.tiendas;
    if (!t || t.latitud == null || t.longitud == null) return null;
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
    <div className="lista-repuestos-categoria">
      <div className="lista-repuestos-categoria-header">
        <h3 className="busqueda-repuestos-resultados-titulo">
          Repuestos en {categoria} ({resultados.length})
        </h3>
        <button
          type="button"
          className="busqueda-repuestos-modal-cerrar"
          onClick={onCerrar}
        >
          Cerrar
        </button>
      </div>

      {cargando ? (
        <p className="busqueda-repuestos-mensaje aviso">Cargando repuestos...</p>
      ) : resultados.length === 0 ? (
        <p className="busqueda-repuestos-mensaje aviso">
          No hay repuestos registrados en esta categoría por el momento.
        </p>
      ) : (
        <div className="busqueda-repuestos-grid">
          {resultados.map((p) => (
            <article key={p.id} className="busqueda-repuestos-card">
              <div className="busqueda-repuestos-card-foto">
                {p.imagen_url ? (
                  <img src={p.imagen_url} alt="" />
                ) : (
                  <div className="busqueda-repuestos-card-foto-placeholder">Sin foto</div>
                )}
              </div>
              <div className="busqueda-repuestos-card-cuerpo">
                <div className="busqueda-repuestos-card-info">
                  <h4 className="busqueda-repuestos-card-nombre">{p.nombre}</h4>
                  {(p.marca || p.modelo || p.anio) && (
                    <p className="busqueda-repuestos-card-vehiculo">
                      {[p.marca, p.modelo, p.anio].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {p.descripcion && (
                    <p className="busqueda-repuestos-card-desc">{p.descripcion}</p>
                  )}
                  <p className="busqueda-repuestos-card-precio">
                    {p.moneda === 'BS' ? 'Bs' : 'USD'} {Number(p.precio_usd).toLocaleString()}
                  </p>
                </div>
                <div className="busqueda-repuestos-card-botones">
                  <button
                    type="button"
                    className="busqueda-repuestos-card-btn"
                  onClick={() => {
                    setContactarProducto(p);
                    setMostrarRutaEnModal(false);
                  }}
                  >
                    Contactar vendedor
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {contactarProducto && (
        <div
          className="busqueda-repuestos-modal-overlay"
          onClick={() => {
            setContactarProducto(null);
            setMostrarRutaEnModal(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-contactar-cat-titulo"
        >
          <div
            className={`busqueda-repuestos-modal ${tieneUbicacion(contactarProducto) ? 'busqueda-repuestos-modal-con-mapa' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="modal-contactar-cat-titulo" className="busqueda-repuestos-modal-titulo-seccion">
              Datos del vendedor
            </h3>
            {contactarProducto.tiendas && (
              <div className="busqueda-repuestos-modal-datos">
                <p className="busqueda-repuestos-modal-linea">
                  <span className="busqueda-repuestos-modal-etiqueta">Nombre comercial</span>{' '}
                  {contactarProducto.tiendas.nombre_comercial || contactarProducto.tiendas.nombre || '—'}
                </p>
                {contactarProducto.tiendas.rif != null && contactarProducto.tiendas.rif !== '' && (
                  <p className="busqueda-repuestos-modal-linea">
                    <span className="busqueda-repuestos-modal-etiqueta">RIF</span>{' '}
                    {contactarProducto.tiendas.rif}
                  </p>
                )}
                {contactarProducto.tiendas.telefono && (
                  <p className="busqueda-repuestos-modal-linea">
                    <span className="busqueda-repuestos-modal-etiqueta">Teléfono</span>{' '}
                    {contactarProducto.tiendas.telefono}
                  </p>
                )}
                {contactarProducto.tiendas.direccion && (
                  <p className="busqueda-repuestos-modal-linea">
                    <span className="busqueda-repuestos-modal-etiqueta">Dirección</span>{' '}
                    {contactarProducto.tiendas.direccion}
                  </p>
                )}
                {Array.isArray(contactarProducto.tiendas.metodos_pago) &&
                  contactarProducto.tiendas.metodos_pago.length > 0 && (
                    <div className="busqueda-repuestos-modal-linea busqueda-repuestos-modal-metodos-pago">
                      <span className="busqueda-repuestos-modal-etiqueta">Formas de pago</span>
                      <div className="busqueda-repuestos-modal-metodos-pago-lista">
                        {contactarProducto.tiendas.metodos_pago.map((m) => (
                          <span key={m} className="busqueda-repuestos-modal-metodo-pago-chip">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}
            <div className="busqueda-repuestos-modal-producto-box">
              <h4 className="busqueda-repuestos-modal-titulo-seccion">Producto seleccionado</h4>
              <p className="busqueda-repuestos-modal-repuesto">{contactarProducto.nombre}</p>
              {contactarProducto.descripcion && (
                <p className="busqueda-repuestos-modal-descripcion">{contactarProducto.descripcion}</p>
              )}
              {contactarProducto.comentarios && (
                <p className="busqueda-repuestos-modal-comentarios">
                  {contactarProducto.comentarios}
                </p>
              )}
            </div>
            {contactarProducto.tiendas?.latitud != null &&
              contactarProducto.tiendas?.longitud != null && (
                <>
                  <h4 className="busqueda-repuestos-modal-titulo-seccion">Ubicación</h4>
                  <MapVendedorUbicacion
                    lat={contactarProducto.tiendas.latitud}
                    lng={contactarProducto.tiendas.longitud}
                    nombreVendedor={nombreTienda(contactarProducto)}
                    userLat={userLocation?.lat}
                    userLng={userLocation?.lng}
                    mostrarRutaDesdeUsuario={mostrarRutaEnModal}
                  />
                </>
              )}
            <div className="busqueda-repuestos-modal-botones">
              {contactarProducto.tiendas?.telefono ? (
                <a
                  href={linkWhatsApp(contactarProducto.tiendas.telefono)}
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
            {contactarProducto.tiendas?.latitud != null &&
              contactarProducto.tiendas?.longitud != null && (
                <div className="vendedores-cerca-modal-ruta">
                  <p className="vendedores-cerca-modal-ruta-hint">
                    Usa <strong>Ver ruta en vivo</strong> cuando ya estés listo para ir a la tienda.
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
                          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                          setMostrarRutaEnModal(true);
                        },
                        () => {},
                        { enableHighAccuracy: true }
                      );
                    }}
                  >
                    Ver ruta en vivo en el mapa
                  </button>
                  {linkRutaGoogleMaps(contactarProducto) && (
                    <a
                      href={linkRutaGoogleMaps(contactarProducto)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="vendedores-cerca-modal-ruta-btn"
                    >
                      Abrir en Google Maps para navegar
                    </a>
                  )}
                </div>
              )}
            <button
              type="button"
              className="busqueda-repuestos-modal-cerrar"
              onClick={() => {
                setContactarProducto(null);
                setMostrarRutaEnModal(false);
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
