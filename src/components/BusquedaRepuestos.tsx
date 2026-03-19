import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { MARCAS_MODELOS, ANOS } from '../data/marcasModelos';
import { MapVendedorUbicacion } from './MapaVendedorUbicacion';
import './BusquedaRepuestos.css';

/** Distancia en km entre dos puntos (Haversine) */
function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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

const MARCAS_OPCIONES = Object.keys(MARCAS_MODELOS).sort();

export function BusquedaRepuestos() {
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [anio, setAnio] = useState('');
  const [resultados, setResultados] = useState<ProductoResultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const modelosOpciones = marca ? (MARCAS_MODELOS[marca] ?? []) : [];

  const buscar = async () => {
    if (!marca.trim()) {
      setMensaje('Selecciona al menos la marca del vehículo.');
      return;
    }

    setBuscando(true);
    setMensaje('');

    let query = supabase
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
      .eq('marca', marca.trim());

    if (modelo.trim()) query = query.eq('modelo', modelo.trim());
    if (anio.trim()) query = query.eq('anio', parseInt(anio, 10));

    const { data, error } = await query.order('nombre');

    if (error) {
      setMensaje(error.message || 'Error al buscar.');
      setResultados([]);
      setBuscando(false);
      return;
    }

    setResultados((data as ProductoResultado[]) ?? []);
    if (!data?.length) setMensaje('No hay repuestos que coincidan con tu búsqueda.');
    setBuscando(false);
  };

  const nombreTienda = (p: ProductoResultado) => {
    const t = p.tiendas;
    return t?.nombre_comercial || t?.nombre || 'Vendedor';
  };

  const [contactarProducto, setContactarProducto] = useState<ProductoResultado | null>(null);
  const [ubicacionProducto, setUbicacionProducto] = useState<ProductoResultado | null>(null);
  const [preguntandoUbicacion, setPreguntandoUbicacion] = useState<ProductoResultado | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mostrarRutaEnModal, setMostrarRutaEnModal] = useState(false);

  const abrirContactar = (p: ProductoResultado) => {
    setContactarProducto(p);
    setMostrarRutaEnModal(false);
  };
  const cerrarContactar = () => {
    setContactarProducto(null);
    setMostrarRutaEnModal(false);
  };

  const tieneUbicacion = (p: ProductoResultado) => {
    const t = p.tiendas;
    return t && t.latitud != null && t.longitud != null;
  };

  const abrirUbicacion = (p: ProductoResultado) => {
    if (!tieneUbicacion(p)) return;
    setPreguntandoUbicacion(p);
  };

  const usarMiUbicacion = (p: ProductoResultado) => {
    setPreguntandoUbicacion(null);
    if (!navigator.geolocation) {
      setUbicacionProducto(p);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const u = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(u);
        setResultados((prev) =>
          [...prev].sort((a, b) => {
            const hasA = a.tiendas?.latitud != null && a.tiendas?.longitud != null;
            const hasB = b.tiendas?.latitud != null && b.tiendas?.longitud != null;
            if (!hasA && !hasB) return 0;
            if (!hasA) return 1;
            if (!hasB) return -1;
            const dA = distanciaKm(u.lat, u.lng, a.tiendas!.latitud!, a.tiendas!.longitud!);
            const dB = distanciaKm(u.lat, u.lng, b.tiendas!.latitud!, b.tiendas!.longitud!);
            return dA - dB;
          })
        );
        setUbicacionProducto(p);
      },
      () => {
        setUbicacionProducto(p);
      }
    );
  };

  const noUsarMiUbicacion = (p: ProductoResultado) => {
    setPreguntandoUbicacion(null);
    setUbicacionProducto(p);
  };

  const cerrarUbicacion = () => {
    setUbicacionProducto(null);
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
    <section className="busqueda-repuestos" id="buscar">
      <h2 className="busqueda-repuestos-titulo">Buscar repuestos</h2>
      <p className="busqueda-repuestos-subtitulo">
        Elige marca, modelo y año para ver repuestos de los vendedores registrados.
      </p>

      <div className="busqueda-repuestos-filtros">
        <div className="busqueda-repuestos-campo">
          <label htmlFor="marca">Marca</label>
          <select
            id="marca"
            value={marca}
            onChange={(e) => {
              setMarca(e.target.value);
              setModelo('');
            }}
            disabled={buscando}
          >
            <option value="">Selecciona la marca</option>
            {MARCAS_OPCIONES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="busqueda-repuestos-campo">
          <label htmlFor="modelo">Modelo</label>
          <select
            id="modelo"
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            disabled={buscando || !marca}
          >
            <option value="">Todos los modelos</option>
            {modelosOpciones.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="busqueda-repuestos-campo">
          <label htmlFor="anio">Año</label>
          <select
            id="anio"
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            disabled={buscando}
          >
            <option value="">Cualquier año</option>
            {ANOS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="busqueda-repuestos-btn"
          onClick={buscar}
          disabled={buscando}
        >
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {mensaje && (
        <p className={`busqueda-repuestos-mensaje ${resultados.length ? '' : 'aviso'}`}>
          {mensaje}
        </p>
      )}

      {resultados.length > 0 && (
        <div className="busqueda-repuestos-resultados">
          <h3 className="busqueda-repuestos-resultados-titulo">Resultados ({resultados.length})</h3>
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
                      onClick={() => abrirContactar(p)}
                    >
                      Contactar vendedor
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {preguntandoUbicacion && (
        <div className="busqueda-repuestos-modal-overlay" onClick={() => setPreguntandoUbicacion(null)} role="dialog" aria-modal="true">
          <div className="busqueda-repuestos-modal busqueda-repuestos-modal-ubicacion-pregunta" onClick={(e) => e.stopPropagation()}>
            <p className="busqueda-repuestos-modal-pregunta-texto">
              ¿Usar tu ubicación actual para ordenar los vendedores de más cercano a más lejano?
            </p>
            <div className="busqueda-repuestos-modal-botones">
              <button
                type="button"
                className="busqueda-repuestos-card-btn"
                onClick={() => usarMiUbicacion(preguntandoUbicacion)}
              >
                Sí
              </button>
              <button
                type="button"
                className="busqueda-repuestos-modal-cerrar"
                onClick={() => noUsarMiUbicacion(preguntandoUbicacion)}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {ubicacionProducto && ubicacionProducto.tiendas?.latitud != null && ubicacionProducto.tiendas?.longitud != null && (
        <div className="busqueda-repuestos-modal-overlay busqueda-repuestos-modal-overlay-mapa" onClick={cerrarUbicacion} role="dialog" aria-modal="true">
          <div className="busqueda-repuestos-modal busqueda-repuestos-modal-mapa" onClick={(e) => e.stopPropagation()}>
            <h3 className="busqueda-repuestos-modal-titulo-seccion">Ubicación del vendedor</h3>
            <p className="busqueda-repuestos-modal-vendedor-nombre">{nombreTienda(ubicacionProducto)}</p>
            <MapVendedorUbicacion
              lat={ubicacionProducto.tiendas.latitud}
              lng={ubicacionProducto.tiendas.longitud}
              nombreVendedor={nombreTienda(ubicacionProducto)}
              userLat={userLocation?.lat}
              userLng={userLocation?.lng}
            />
            <button type="button" className="busqueda-repuestos-modal-cerrar busqueda-repuestos-modal-cerrar-mapa" onClick={cerrarUbicacion}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {contactarProducto && (
        <div className="busqueda-repuestos-modal-overlay" onClick={cerrarContactar} role="dialog" aria-modal="true" aria-labelledby="modal-contactar-titulo">
          <div className={`busqueda-repuestos-modal ${tieneUbicacion(contactarProducto) ? 'busqueda-repuestos-modal-con-mapa' : ''}`} onClick={(e) => e.stopPropagation()}>
            <h3 id="modal-contactar-titulo" className="busqueda-repuestos-modal-titulo-seccion">Datos del vendedor</h3>
            {contactarProducto.tiendas && (
              <div className="busqueda-repuestos-modal-datos">
                <p className="busqueda-repuestos-modal-linea"><span className="busqueda-repuestos-modal-etiqueta">Nombre comercial</span> {contactarProducto.tiendas.nombre_comercial || contactarProducto.tiendas.nombre || '—'}</p>
                {contactarProducto.tiendas.rif != null && contactarProducto.tiendas.rif !== '' && (
                  <p className="busqueda-repuestos-modal-linea"><span className="busqueda-repuestos-modal-etiqueta">RIF</span> {contactarProducto.tiendas.rif}</p>
                )}
                {contactarProducto.tiendas.telefono && (
                  <p className="busqueda-repuestos-modal-linea"><span className="busqueda-repuestos-modal-etiqueta">Teléfono</span> {contactarProducto.tiendas.telefono}</p>
                )}
                {contactarProducto.tiendas.direccion && (
                  <p className="busqueda-repuestos-modal-linea"><span className="busqueda-repuestos-modal-etiqueta">Dirección</span> {contactarProducto.tiendas.direccion}</p>
                )}
                {Array.isArray(contactarProducto.tiendas.metodos_pago) && contactarProducto.tiendas.metodos_pago.length > 0 && (
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
            {contactarProducto.tiendas?.latitud != null && contactarProducto.tiendas?.longitud != null && (
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
            {contactarProducto.tiendas?.latitud != null && contactarProducto.tiendas?.longitud != null && (
              <div className="vendedores-cerca-modal-ruta">
                <p className="vendedores-cerca-modal-ruta-hint">
                  Usa <strong>Ver ruta en vivo</strong> cuando ya estés listo para ir a la tienda.
                </p>
                <button
                  type="button"
                  className="vendedores-cerca-modal-ruta-btn"
                  onClick={() => setMostrarRutaEnModal(true)}
                  disabled={!userLocation}
                >
                  Ver ruta en vivo en el mapa
                </button>
                {!userLocation && (
                  <p className="vendedores-cerca-modal-ruta-hint">
                    Primero permite usar tu ubicación cuando la app te lo pida.
                  </p>
                )}
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
            <button type="button" className="busqueda-repuestos-modal-cerrar" onClick={cerrarContactar}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
