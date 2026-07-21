import { useState, useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO } from '../utils/verticalVehiculo';
import { ESTADOS_VENEZUELA, getCiudadesPorEstado, valoresCiudadFiltroBd } from '../data/ciudadesVenezuela';
import { MapVendedorUbicacion } from './MapaVendedorUbicacion';
import { TarjetaProductoBusqueda, type ProductoTarjetaBusqueda } from './TarjetaProductoBusqueda';
import {
  MENSAJE_AVISO_NAVEGACION_MAPS_TIENDA,
  TEXTO_ENLACE_NAVEGACION_GOOGLE_MAPS,
} from '../constants/googleMapsNavUi';
import { abrirNavegacionGoogleMapsDesdeAqui, urlGoogleMapsDirSoloDestino } from '../utils/googleMapsNavegar';
import { mensajeWhatsappVendedorZona, urlWhatsAppGeomotor } from '../utils/linkWhatsAppGeomotor';
import './VendedoresCercaDeMi.css';
import './avisoSeleccionarEstado.css';
import './BusquedaRepuestos.css';

const PAGE_SIZE_VENDEDORES = 30;
/** PostgREST devuelve como máximo ~1000 filas por solicitud. */
const PRODUCTOS_VENDEDOR_CERCA_PAGE = 1000;

export interface VendedoresCercaDeMiProps {
  vertical?: VerticalVehiculo;
}

export interface TiendaCerca {
  id: string;
  user_id: string | null;
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

type ProductoVendedorCerca = ProductoTarjetaBusqueda;

type EstadoProductosVendedor = {
  productos: ProductoVendedorCerca[];
  cargando: boolean;
  error: string | null;
};

const SELECT_PRODUCTOS_VENDEDOR_CERCA = `
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
  es_oferta
`;

type ProductoVendedorCercaBusqueda = ProductoTarjetaBusqueda & {
  comentarios?: string | null;
  categoria?: string | null;
};

function limpiarTokenBusquedaVendedor(raw: string): string {
  return raw
    .replace(/^[\s"'«»\u2018\u2019\u201C\u201D\u201E\u201A\u00B4`„‚]+/u, '')
    .replace(/[\s"'«»\u2018\u2019\u201C\u201D\u201E\u201A\u00B4`„‚]+$/u, '')
    .trim();
}

function terminosBusquedaVendedor(texto: string): string[] {
  const vistos = new Set<string>();
  return texto
    .trim()
    .split(/\s+/)
    .map((t) => limpiarTokenBusquedaVendedor(t.trim()))
    .filter((t) => t.length >= 2)
    .filter((t) => {
      const k = t.toLocaleLowerCase('es');
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
}

function productoCoincideBusquedaVendedor(p: ProductoVendedorCercaBusqueda, texto: string): boolean {
  const terminos = terminosBusquedaVendedor(texto);
  if (terminos.length === 0) return true;
  const fuente = [
    p.nombre,
    p.descripcion,
    p.comentarios,
    p.categoria,
    p.marca,
    p.modelo,
    p.anio != null ? String(p.anio) : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('es');
  return terminos.every((t) => fuente.includes(t.toLocaleLowerCase('es')));
}

function resaltarCoincidenciaVendedor(texto: string, consulta: string) {
  const q = consulta.trim();
  if (!q) return texto;
  const lower = texto.toLowerCase();
  const i = lower.indexOf(q.toLowerCase());
  if (i === -1) return texto;
  return (
    <>
      {texto.slice(0, i)}
      <mark className="busqueda-repuestos-sugerencia-match">{texto.slice(i, i + q.length)}</mark>
      {texto.slice(i + q.length)}
    </>
  );
}

function claveCacheProductosTienda(tiendaId: string): string {
  return tiendaId;
}

/** Catálogo público de una tienda concreta, paginado (PostgREST limita ~1000 filas por request). */
async function fetchProductosPublicosTienda(
  tiendaId: string,
  vertical: VerticalVehiculo
): Promise<{ productos: ProductoVendedorCerca[]; error: string | null }> {
  const acumulado: ProductoVendedorCerca[] = [];
  const vistos = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('productos')
      .select(SELECT_PRODUCTOS_VENDEDOR_CERCA)
      .eq('tienda_id', tiendaId)
      .eq('activo', true)
      .eq('aprobacion_publica', 'aprobado')
      .eq('vertical', vertical)
      .order('nombre', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PRODUCTOS_VENDEDOR_CERCA_PAGE - 1);

    if (error) {
      return {
        productos: [],
        error: error.message || 'No se pudieron cargar los productos de este vendedor.',
      };
    }

    const batch = ((data ?? []) as ProductoVendedorCerca[]).filter(
      (p) => p && typeof p.id === 'string'
    );
    for (const p of batch) {
      if (vistos.has(p.id)) continue;
      vistos.add(p.id);
      acumulado.push(p);
    }
    if (batch.length < PRODUCTOS_VENDEDOR_CERCA_PAGE) break;
    from += PRODUCTOS_VENDEDOR_CERCA_PAGE;
  }

  return { productos: acumulado, error: null };
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

export function VendedoresCercaDeMi({ vertical = VERTICAL_AUTO }: VendedoresCercaDeMiProps) {
  const { user } = useAuth();
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
  const [productosPorTienda, setProductosPorTienda] = useState<Record<string, EstadoProductosVendedor>>({});
  const [tiendaProductosAbiertaId, setTiendaProductosAbiertaId] = useState<string | null>(null);
  const [tiendaProductosAbiertaSnap, setTiendaProductosAbiertaSnap] = useState<TiendaCerca | null>(null);
  const [productoExpandidoId, setProductoExpandidoId] = useState<string | null>(null);
  const [busquedaVendedorInput, setBusquedaVendedorInput] = useState('');
  const [busquedaVendedorAplicada, setBusquedaVendedorAplicada] = useState('');
  const [mensajeBusquedaVendedor, setMensajeBusquedaVendedor] = useState('');
  const [sugerenciasVendedorAbiertas, setSugerenciasVendedorAbiertas] = useState(false);
  const [indiceSugerenciaVendedor, setIndiceSugerenciaVendedor] = useState(-1);
  const wrapBusquedaVendedorRef = useRef<HTMLDivElement>(null);

  const reiniciarBusquedaVendedor = () => {
    setBusquedaVendedorInput('');
    setBusquedaVendedorAplicada('');
    setMensajeBusquedaVendedor('');
    setSugerenciasVendedorAbiertas(false);
    setIndiceSugerenciaVendedor(-1);
  };

  const cerrarProductosVendedor = () => {
    setTiendaProductosAbiertaId(null);
    setTiendaProductosAbiertaSnap(null);
    setProductoExpandidoId(null);
    reiniciarBusquedaVendedor();
  };

  const construirQueryTiendas = () => {
    let query = supabase
      .from('tiendas')
      .select('id, user_id, nombre, nombre_comercial, rif, estado, ciudad, latitud, longitud, telefono, direccion, metodos_pago')
      .eq('vertical', vertical)
      .order('estado', { ascending: true, nullsFirst: false })
      .order('ciudad', { ascending: true, nullsFirst: false })
      .order('nombre_comercial', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });

    if (estadoFiltro) query = query.eq('estado', estadoFiltro);
    if (ciudadFiltro) {
      const ciudadesBd = valoresCiudadFiltroBd(estadoFiltro, ciudadFiltro);
      query = ciudadesBd.length === 1 ? query.eq('ciudad', ciudadesBd[0]) : query.in('ciudad', ciudadesBd);
    }

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

  useEffect(() => {
    setTiendas([]);
    setHayMas(false);
    setUbicado(false);
    setError(null);
    setProductosPorTienda({});
    setTiendaProductosAbiertaId(null);
    setTiendaProductosAbiertaSnap(null);
    setProductoExpandidoId(null);
    reiniciarBusquedaVendedor();
  }, [vertical]);

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
    if (!user) return;
    setContactarTienda(t);
  };

  const tiendaProductosAbierta = tiendaProductosAbiertaSnap;

  const claveProductosTiendaAbierta = tiendaProductosAbiertaId
    ? claveCacheProductosTienda(tiendaProductosAbiertaId)
    : null;

  const estadoProductosVendedorAbierto = claveProductosTiendaAbierta
    ? productosPorTienda[claveProductosTiendaAbierta]
    : undefined;

  const productosTiendaAbierta = estadoProductosVendedorAbierto?.productos ?? [];

  const sugerenciasVendedor = useMemo(() => {
    const texto = busquedaVendedorInput.trim();
    if (texto.length < 2) return [];
    const coinciden = productosTiendaAbierta.filter((p) =>
      productoCoincideBusquedaVendedor(p, texto)
    );
    return coinciden.slice(0, 20).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      detalle: [p.marca, p.modelo].filter(Boolean).join(' · ') || null,
    }));
  }, [busquedaVendedorInput, productosTiendaAbierta]);

  const productosVendedorVisibles = useMemo(() => {
    if (!busquedaVendedorAplicada.trim()) return productosTiendaAbierta;
    return productosTiendaAbierta.filter((p) =>
      productoCoincideBusquedaVendedor(p, busquedaVendedorAplicada)
    );
  }, [productosTiendaAbierta, busquedaVendedorAplicada]);

  useEffect(() => {
    if (!tiendaProductosAbiertaId) return;
    const cerrar = (e: MouseEvent) => {
      if (wrapBusquedaVendedorRef.current && !wrapBusquedaVendedorRef.current.contains(e.target as Node)) {
        setSugerenciasVendedorAbiertas(false);
      }
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [tiendaProductosAbiertaId]);

  const aplicarBusquedaVendedor = (textoOverride?: string) => {
    const texto = (textoOverride !== undefined ? textoOverride : busquedaVendedorInput).trim();
    if (!texto) {
      setBusquedaVendedorInput('');
      setBusquedaVendedorAplicada('');
      setMensajeBusquedaVendedor('');
      setSugerenciasVendedorAbiertas(false);
      setIndiceSugerenciaVendedor(-1);
      return;
    }
    if (terminosBusquedaVendedor(texto).length === 0) {
      setMensajeBusquedaVendedor('Escribe al menos una palabra clave de 2 caracteres o más.');
      return;
    }
    if (textoOverride !== undefined) {
      setBusquedaVendedorInput(textoOverride);
    }
    setBusquedaVendedorAplicada(texto);
    setMensajeBusquedaVendedor('');
    setSugerenciasVendedorAbiertas(false);
    setIndiceSugerenciaVendedor(-1);
    setProductoExpandidoId(null);
  };

  const onTecladoBusquedaVendedor = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (indiceSugerenciaVendedor >= 0 && sugerenciasVendedor[indiceSugerenciaVendedor]) {
        aplicarBusquedaVendedor(sugerenciasVendedor[indiceSugerenciaVendedor].nombre);
      } else {
        aplicarBusquedaVendedor();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!sugerenciasVendedor.length) return;
      setSugerenciasVendedorAbiertas(true);
      setIndiceSugerenciaVendedor((i) => (i + 1) % sugerenciasVendedor.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!sugerenciasVendedor.length) return;
      setSugerenciasVendedorAbiertas(true);
      setIndiceSugerenciaVendedor((i) =>
        i <= 0 ? sugerenciasVendedor.length - 1 : i - 1
      );
      return;
    }
    if (e.key === 'Escape') {
      setSugerenciasVendedorAbiertas(false);
      setIndiceSugerenciaVendedor(-1);
    }
  };

  const cargarProductosDeVendedor = async (t: TiendaCerca) => {
    if (tiendaProductosAbiertaId === t.id) {
      cerrarProductosVendedor();
      return;
    }

    reiniciarBusquedaVendedor();
    setTiendaProductosAbiertaId(t.id);
    setTiendaProductosAbiertaSnap(t);
    setProductoExpandidoId(null);

    const cacheKey = claveCacheProductosTienda(t.id);

    setProductosPorTienda((prev) => ({
      ...prev,
      [cacheKey]: { productos: [], cargando: true, error: null },
    }));

    const { productos, error } = await fetchProductosPublicosTienda(t.id, vertical);

    if (error) {
      setProductosPorTienda((prev) => ({
        ...prev,
        [cacheKey]: {
          productos: [],
          cargando: false,
          error,
        },
      }));
      return;
    }

    setProductosPorTienda((prev) => ({
      ...prev,
      [cacheKey]: {
        productos,
        cargando: false,
        error: null,
      },
    }));
  };

  const urlWhatsAppContactarVendedor =
    contactarTienda?.telefono != null
      ? urlWhatsAppGeomotor(contactarTienda.telefono, mensajeWhatsappVendedorZona())
      : null;

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
                {!user && (
                  <p className="busqueda-repuestos-login-aviso">
                    Debes iniciar sesión o registrarte para contactar vendedores.
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
                      {listaMostrar.map((t) => {
                        return (
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
                                  disabled={!user}
                                  title={!user ? 'Inicia sesión para contactar vendedores' : undefined}
                                >
                                  Contactar vendedor
                                </button>
                                <button
                                  type="button"
                                  className="vendedores-cerca-card-btn vendedores-cerca-card-btn-productos"
                                  onClick={() => void cargarProductosDeVendedor(t)}
                                  aria-expanded={tiendaProductosAbiertaId === t.id}
                                >
                                  Ver productos de este vendedor
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
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
            {tiendaProductosAbierta && (
              <div
                className="vendedores-cerca-productos-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="vendedores-cerca-productos-titulo"
                onClick={cerrarProductosVendedor}
              >
                <div
                  className="vendedores-cerca-productos-panel"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="vendedores-cerca-productos-panel-header">
                    <h4 id="vendedores-cerca-productos-titulo">
                      Productos de {nombreTienda(tiendaProductosAbierta)}
                      {!estadoProductosVendedorAbierto?.cargando &&
                        !estadoProductosVendedorAbierto?.error &&
                        productosTiendaAbierta.length > 0 && (
                          <span className="vendedores-cerca-productos-contador">
                            {' '}
                            ({productosVendedorVisibles.length}
                            {busquedaVendedorAplicada.trim()
                              ? ` de ${productosTiendaAbierta.length}`
                              : ''}{' '}
                            producto{productosTiendaAbierta.length === 1 ? '' : 's'})
                          </span>
                        )}
                    </h4>
                    <button
                      type="button"
                      className="resultados-busqueda-pagina-panel-cerrar"
                      onClick={cerrarProductosVendedor}
                    >
                      Volver a vendedores
                    </button>
                  </div>
                  {!estadoProductosVendedorAbierto?.cargando &&
                    !estadoProductosVendedorAbierto?.error &&
                    productosTiendaAbierta.length > 0 && (
                      <div className="vendedores-cerca-productos-panel-busqueda-wrap">
                        <div className="vendedores-cerca-productos-busqueda">
                          <h5 className="vendedores-cerca-productos-busqueda-titulo">
                            BUSCA LOS PRODUCTOS SOLO DE ESTE VENDEDOR
                          </h5>
                          <label
                            htmlFor="vendedores-cerca-busqueda-texto"
                            className="busqueda-repuestos-texto-label vendedores-cerca-productos-busqueda-label"
                          >
                            ¿Qué repuesto necesitas?
                          </label>
                          <div className="busqueda-repuestos-texto-fila busqueda-repuestos-texto-fila--compact vendedores-cerca-productos-busqueda-fila">
                            <div
                              className="busqueda-repuestos-texto-inner busqueda-repuestos-texto-inner--compact"
                              ref={wrapBusquedaVendedorRef}
                            >
                              <input
                                id="vendedores-cerca-busqueda-texto"
                                type="text"
                                value={busquedaVendedorInput}
                                onChange={(e) => {
                                  setBusquedaVendedorInput(e.target.value);
                                  setMensajeBusquedaVendedor('');
                                  if (e.target.value.trim().length >= 2) {
                                    setSugerenciasVendedorAbiertas(true);
                                  } else {
                                    setSugerenciasVendedorAbiertas(false);
                                  }
                                  setIndiceSugerenciaVendedor(-1);
                                }}
                                onFocus={() => {
                                  if (
                                    busquedaVendedorInput.trim().length >= 2 &&
                                    sugerenciasVendedor.length > 0
                                  ) {
                                    setSugerenciasVendedorAbiertas(true);
                                  }
                                }}
                                onKeyDown={onTecladoBusquedaVendedor}
                                placeholder={
                                  vertical === 'moto'
                                    ? 'Ej: kit de frenos, cadena, batería, espejo…'
                                    : 'Ej: bomba de gasolina, sensor de oxígeno, pastillas de freno...'
                                }
                                spellCheck={false}
                                autoComplete="off"
                                role="combobox"
                                aria-expanded={
                                  sugerenciasVendedorAbiertas && sugerenciasVendedor.length > 0
                                }
                                aria-controls="vendedores-cerca-sugerencias-lista"
                                aria-activedescendant={
                                  sugerenciasVendedorAbiertas && indiceSugerenciaVendedor >= 0
                                    ? `vendedor-sugerencia-${indiceSugerenciaVendedor}`
                                    : undefined
                                }
                              />
                              {sugerenciasVendedorAbiertas && sugerenciasVendedor.length > 0 && (
                                <div className="busqueda-repuestos-sugerencias-bloque busqueda-repuestos-sugerencias-bloque--compact vendedores-cerca-productos-sugerencias">
                                  <ul
                                    id="vendedores-cerca-sugerencias-lista"
                                    className="busqueda-repuestos-sugerencias"
                                    role="listbox"
                                  >
                                    {sugerenciasVendedor.map((s, idx) => (
                                      <li key={s.id} role="presentation">
                                        <button
                                          type="button"
                                          id={`vendedor-sugerencia-${idx}`}
                                          role="option"
                                          aria-selected={idx === indiceSugerenciaVendedor}
                                          className={`busqueda-repuestos-sugerencia-item ${
                                            idx === indiceSugerenciaVendedor ? 'activa' : ''
                                          }`}
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() => aplicarBusquedaVendedor(s.nombre)}
                                          onMouseEnter={() => setIndiceSugerenciaVendedor(idx)}
                                        >
                                          <span className="busqueda-repuestos-sugerencia-nombre">
                                            {resaltarCoincidenciaVendedor(s.nombre, busquedaVendedorInput)}
                                          </span>
                                          {s.detalle && (
                                            <span className="busqueda-repuestos-sugerencia-detalle">
                                              {s.detalle}
                                            </span>
                                          )}
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              className="busqueda-repuestos-btn busqueda-repuestos-btn--compact"
                              onClick={() => aplicarBusquedaVendedor()}
                            >
                              Buscar
                            </button>
                          </div>
                          {mensajeBusquedaVendedor && (
                            <p className="vendedores-cerca-productos-busqueda-aviso" role="status">
                              {mensajeBusquedaVendedor}
                            </p>
                          )}
                          {busquedaVendedorAplicada.trim() && (
                            <p className="vendedores-cerca-productos-busqueda-resultados" role="status">
                              {productosVendedorVisibles.length === 0
                                ? 'No hay productos de este vendedor que coincidan con tu búsqueda.'
                                : `${productosVendedorVisibles.length} producto${
                                    productosVendedorVisibles.length === 1 ? '' : 's'
                                  } encontrado${productosVendedorVisibles.length === 1 ? '' : 's'}.`}
                              {' '}
                              <button
                                type="button"
                                className="vendedores-cerca-productos-busqueda-limpiar"
                                onClick={() => aplicarBusquedaVendedor('')}
                              >
                                Ver todos
                              </button>
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  <div className="vendedores-cerca-productos-panel-scroll">
                    {estadoProductosVendedorAbierto?.cargando ? (
                      <p className="vendedores-cerca-productos-mensaje">Cargando productos…</p>
                    ) : estadoProductosVendedorAbierto?.error ? (
                      <p className="vendedores-cerca-productos-mensaje error">
                        {estadoProductosVendedorAbierto.error}
                      </p>
                    ) : productosTiendaAbierta.length === 0 ? (
                      <p className="vendedores-cerca-productos-mensaje">
                        Este vendedor no tiene productos publicados en este momento.
                      </p>
                    ) : productosVendedorVisibles.length === 0 ? (
                      <p className="vendedores-cerca-productos-mensaje">
                        Ningún producto coincide con tu búsqueda.{' '}
                        <button
                          type="button"
                          className="vendedores-cerca-productos-busqueda-limpiar"
                          onClick={() => aplicarBusquedaVendedor('')}
                        >
                          Ver todos los productos
                        </button>
                      </p>
                    ) : (
                      <div className="vendedores-cerca-productos-grid">
                        {productosVendedorVisibles.map((p) => (
                          <TarjetaProductoBusqueda
                            key={p.id}
                            producto={p}
                            vertical={vertical}
                            expandida={productoExpandidoId === p.id}
                            onExpand={() => setProductoExpandidoId(p.id)}
                            onContraer={() => setProductoExpandidoId(null)}
                            onContactar={() => abrirContactar(tiendaProductosAbierta)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
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
              {urlWhatsAppContactarVendedor ? (
                <a
                  href={urlWhatsAppContactarVendedor}
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
