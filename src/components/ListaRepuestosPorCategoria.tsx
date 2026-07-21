import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  registrarContactoProducto,
  usuarioDebeRegistrarHistorialContactos,
} from '../services/historialContactosProducto';
import { MapVendedorUbicacion } from './MapaVendedorUbicacion';
import { TarjetaProductoBusqueda } from './TarjetaProductoBusqueda';
import {
  MENSAJE_AVISO_NAVEGACION_MAPS_TIENDA,
  TEXTO_ENLACE_NAVEGACION_GOOGLE_MAPS,
} from '../constants/googleMapsNavUi';
import { abrirNavegacionGoogleMapsDesdeAqui, urlGoogleMapsDirSoloDestino } from '../utils/googleMapsNavegar';
import { mensajeWhatsappVendedorProducto, urlWhatsAppGeomotor } from '../utils/linkWhatsAppGeomotor';
import {
  aplicarTerminosTextoABusquedaProductos,
  terminosBusquedaProducto,
} from '../utils/busquedaProductosTexto';
import { permitirAccionCliente } from '../utils/rateLimitCliente';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO } from '../utils/verticalVehiculo';
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
  imagenes_extra: string[] | null;
  disponibilidad_aviso?: string | null;
  es_oferta?: boolean | null;
  tiendas: TiendaContacto | null;
}

interface ListaRepuestosPorCategoriaProps {
  categoria: string;
  vertical?: VerticalVehiculo;
  onCerrar: () => void;
}

const PAGE_SIZE_LISTA_CATEGORIA = 24;

const SELECT_PRODUCTOS_CATEGORIA = `
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
  imagenes_extra,
  disponibilidad_aviso,
  es_oferta,
  tiendas ( nombre_comercial, nombre, rif, telefono, direccion, latitud, longitud, metodos_pago )
`;

export function ListaRepuestosPorCategoria({
  categoria,
  vertical = VERTICAL_AUTO,
  onCerrar,
}: ListaRepuestosPorCategoriaProps) {
  const { user } = useAuth();
  const esMoto = vertical === 'moto';
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [textoActivo, setTextoActivo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ProductoResultado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [productoExpandidoId, setProductoExpandidoId] = useState<string | null>(null);
  const [contactarProducto, setContactarProducto] = useState<ProductoResultado | null>(null);

  const armarQuery = useCallback(
    (texto: string) => {
      let query = supabase
        .from('productos')
        .select(SELECT_PRODUCTOS_CATEGORIA)
        .eq('activo', true)
        .eq('aprobacion_publica', 'aprobado')
        .eq('vertical', vertical)
        .eq('categoria', categoria);

      query = aplicarTerminosTextoABusquedaProductos(query, texto);
      return query.order('nombre').order('id');
    },
    [categoria, vertical]
  );

  const cargarPagina = useCallback(
    async (texto: string, offset: number, reemplazar: boolean) => {
      const { data, error } = await armarQuery(texto).range(offset, offset + PAGE_SIZE_LISTA_CATEGORIA);

      if (error) {
        if (reemplazar) {
          setResultados([]);
          setHayMas(false);
        }
        return { ok: false as const };
      }

      const filas = (data as unknown as ProductoResultado[]) ?? [];
      const mas = filas.length > PAGE_SIZE_LISTA_CATEGORIA;
      const chunk = mas ? filas.slice(0, PAGE_SIZE_LISTA_CATEGORIA) : filas;

      if (reemplazar) {
        setResultados(chunk);
      } else {
        setResultados((prev) => [...prev, ...chunk]);
      }
      setHayMas(mas);
      return { ok: true as const };
    },
    [armarQuery]
  );

  useEffect(() => {
    setTextoBusqueda('');
    setTextoActivo('');
    setMensaje('');
    setProductoExpandidoId(null);

    const primeraPagina = async () => {
      setCargando(true);
      setResultados([]);
      setHayMas(false);
      await cargarPagina('', 0, true);
      setCargando(false);
    };

    void primeraPagina();
  }, [categoria, vertical, cargarPagina]);

  useEffect(() => {
    if (!contactarProducto) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContactarProducto(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [contactarProducto]);

  const buscar = async (textoOverride?: string) => {
    const texto = (textoOverride !== undefined ? textoOverride : textoBusqueda).trim();

    if (texto && terminosBusquedaProducto(texto).length === 0) {
      setMensaje('Escribe al menos una palabra clave de 2 caracteres o más.');
      return;
    }

    const rl = permitirAccionCliente('busqueda-repuestos-categoria', {
      maxIntentos: 35,
      ventanaMs: 60 * 1000,
      bloqueoMs: 60 * 1000,
    });
    if (!rl.ok) {
      setMensaje(rl.mensaje);
      return;
    }

    if (textoOverride !== undefined) {
      setTextoBusqueda(textoOverride);
    }

    setBuscando(true);
    setMensaje('');
    setProductoExpandidoId(null);
    setResultados([]);
    setHayMas(false);

    await cargarPagina(texto, 0, true);
    setTextoActivo(texto);
    setBuscando(false);
  };

  const cargarMas = async () => {
    if (!hayMas || cargandoMas || cargando || buscando) return;
    setCargandoMas(true);
    await cargarPagina(textoActivo, resultados.length, false);
    setCargandoMas(false);
  };

  const nombreTienda = (p: ProductoResultado) => {
    const t = p.tiendas;
    return t?.nombre_comercial || t?.nombre || 'Vendedor';
  };

  const tieneUbicacion = (p: ProductoResultado) => {
    const t = p.tiendas;
    return t && t.latitud != null && t.longitud != null;
  };

  const cerrarModalContactar = () => {
    setContactarProducto(null);
  };

  const tituloResultados = textoActivo
    ? `Repuestos en ${categoria} — «${textoActivo}»`
    : `Repuestos en ${categoria}`;

  return (
    <div className="lista-repuestos-categoria">
      <div className="lista-repuestos-categoria-header">
        <h3 className="busqueda-repuestos-resultados-titulo">
          {tituloResultados} ({resultados.length}
          {hayMas && !cargando && !buscando ? ', hay más en el catálogo' : ''})
        </h3>
        <button
          type="button"
          className="busqueda-repuestos-modal-cerrar"
          onClick={onCerrar}
        >
          Cerrar
        </button>
      </div>

      <div className="lista-repuestos-categoria-busqueda">
        <label htmlFor="lista-categoria-texto" className="busqueda-repuestos-texto-label">
          Refina tu búsqueda en esta categoría
        </label>
        <div className="busqueda-repuestos-texto-fila busqueda-repuestos-texto-fila--compact">
          <div className="busqueda-repuestos-texto-inner busqueda-repuestos-texto-inner--compact">
            <input
              id="lista-categoria-texto"
              type="text"
              value={textoBusqueda}
              onChange={(e) => setTextoBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void buscar();
                }
              }}
              placeholder={
                esMoto
                  ? 'Ej: cadena yamaha, pastilla freno…'
                  : 'Ej: amortiguador delantero corolla…'
              }
              disabled={cargando || buscando}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            className="busqueda-repuestos-btn busqueda-repuestos-btn--compact"
            onClick={() => void buscar()}
            disabled={cargando || buscando}
          >
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        {textoActivo && (
          <button
            type="button"
            className="lista-repuestos-categoria-limpiar"
            onClick={() => void buscar('')}
            disabled={cargando || buscando}
          >
            Ver todos en {categoria}
          </button>
        )}
      </div>

      {mensaje && (
        <p className="busqueda-repuestos-mensaje aviso">{mensaje}</p>
      )}

      {cargando || buscando ? (
        <p className="busqueda-repuestos-mensaje aviso">
          {buscando ? 'Buscando repuestos…' : 'Cargando repuestos...'}
        </p>
      ) : resultados.length === 0 ? (
        <p className="busqueda-repuestos-mensaje aviso">
          {textoActivo
            ? `No hay repuestos en «${categoria}» que coincidan con «${textoActivo}». Prueba otras palabras clave.`
            : 'No hay repuestos registrados en esta categoría por el momento.'}
        </p>
      ) : (
        <>
          <div className="busqueda-repuestos-grid">
            {resultados.map((p) => (
              <TarjetaProductoBusqueda
                key={p.id}
                producto={p}
                vertical={vertical}
                expandida={productoExpandidoId === p.id}
                onExpand={() => setProductoExpandidoId(p.id)}
                onContraer={() => setProductoExpandidoId(null)}
                onContactar={(prod) => {
                  if (!user) return;
                  setContactarProducto(prod);
                  void (async () => {
                    const debe = await usuarioDebeRegistrarHistorialContactos(supabase, user);
                    if (!debe) return;
                    await registrarContactoProducto(
                      supabase,
                      user.id,
                      {
                        id: prod.id,
                        nombre: prod.nombre,
                        precio_usd: prod.precio_usd,
                        moneda: prod.moneda,
                      },
                      nombreTienda(prod)
                    );
                  })();
                }}
              />
            ))}
          </div>
          {hayMas && (
            <div className="busqueda-repuestos-cargar-mas">
              <button
                type="button"
                className="busqueda-repuestos-btn busqueda-repuestos-btn--cargar-mas"
                onClick={() => void cargarMas()}
                disabled={cargandoMas || cargando || buscando}
              >
                {cargandoMas ? 'Cargando…' : 'Cargar más repuestos'}
              </button>
            </div>
          )}
        </>
      )}

      {contactarProducto && (
        <div
          className="busqueda-repuestos-modal-overlay busqueda-repuestos-modal-overlay--detalle"
          onClick={cerrarModalContactar}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-contactar-cat-titulo"
        >
          <div
            className={`busqueda-repuestos-modal busqueda-repuestos-modal--panel ${tieneUbicacion(contactarProducto) ? 'busqueda-repuestos-modal-con-mapa' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="busqueda-repuestos-modal-header-bar">
              <h3 id="modal-contactar-cat-titulo" className="busqueda-repuestos-modal-header-titulo">
                Datos del vendedor
              </h3>
              <button
                type="button"
                className="busqueda-repuestos-modal-cerrar-x"
                onClick={cerrarModalContactar}
                aria-label="Cerrar ventana"
              >
                ×
              </button>
            </div>
            <div className="busqueda-repuestos-modal-body-scroll">
            {contactarProducto.tiendas && (
              <div className="busqueda-repuestos-modal-datos">
                <p className="busqueda-repuestos-modal-linea">
                  <span className="busqueda-repuestos-modal-etiqueta">Nombre comercial</span>{' '}
                  <span className="busqueda-repuestos-modal-valor-negrita">
                    {contactarProducto.tiendas.nombre_comercial || contactarProducto.tiendas.nombre || '—'}
                  </span>
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
              {((contactarProducto.comentarios ?? contactarProducto.descripcion) || '') && (
                <p className="busqueda-repuestos-modal-comentarios">
                  {contactarProducto.comentarios ?? contactarProducto.descripcion}
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
                  />
                </>
              )}
            <div className="busqueda-repuestos-modal-botones">
              {contactarProducto.tiendas?.telefono ? (
                <a
                  href={
                    urlWhatsAppGeomotor(
                      contactarProducto.tiendas.telefono,
                      mensajeWhatsappVendedorProducto(contactarProducto.nombre),
                    )!
                  }
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
                  <p className="maps-nav-aviso-confirmacion" role="note">
                    {MENSAJE_AVISO_NAVEGACION_MAPS_TIENDA}
                  </p>
                  <a
                    href={urlGoogleMapsDirSoloDestino(
                      contactarProducto.tiendas.latitud,
                      contactarProducto.tiendas.longitud
                    )}
                    className="vendedores-cerca-modal-ruta-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      abrirNavegacionGoogleMapsDesdeAqui(
                        contactarProducto.tiendas!.latitud!,
                        contactarProducto.tiendas!.longitud!
                      );
                    }}
                  >
                    {TEXTO_ENLACE_NAVEGACION_GOOGLE_MAPS}
                  </a>
                </div>
              )}
            <button type="button" className="busqueda-repuestos-modal-cerrar" onClick={cerrarModalContactar}>
              Cerrar
            </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
