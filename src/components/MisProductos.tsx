import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import './MisProductos.css';
import { EditarProducto, type ProductoEditable } from './EditarProducto';
import { ImagenProducto } from './ImagenProducto';
import { urlImagenProductoVariante } from '../utils/imagenProducto';
import { etiquetaMoneda } from '../utils/monedaProducto';
import { formatearPrecioProducto } from '../utils/precioProducto';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import {
  DISPONIBILIDAD_AVISO_OPCIONES,
  etiquetaDisponibilidadAviso,
  type DisponibilidadAviso,
} from '../utils/avisoProductoPublicacion';
import {
  etiquetaStockActual,
  claseSemaforoStockPorDias,
  diasDesdeFechaISO,
  DIAS_PAUSA_STOCK_VENCIDO,
  DIAS_STOCK_SEMAFORO_VERDE,
} from '../utils/stockActualInventario';
import { aplicarTerminosTextoAMisProductos } from '../utils/busquedaProductosTexto';

const NETWORK_TIMEOUT_MS = 30000;
const NETWORK_RETRIES = 1;

async function withTimeout<T>(promiseLike: PromiseLike<T>, timeoutMs = NETWORK_TIMEOUT_MS): Promise<T> {
  return await Promise.race([
    Promise.resolve(promiseLike),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error('Tiempo de espera agotado al cargar datos. Intenta de nuevo.'));
      }, timeoutMs);
    }),
  ]);
}

async function withRetry<T>(
  factory: () => PromiseLike<T>,
  retries = NETWORK_RETRIES,
  timeoutMs = NETWORK_TIMEOUT_MS
): Promise<T> {
  let lastError: unknown = null;
  for (let intento = 0; intento <= retries; intento += 1) {
    try {
      return await withTimeout(factory(), timeoutMs);
    } catch (e) {
      lastError = e;
      if (intento < retries) {
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('No se pudo cargar tus productos. Revisa la conexión e intenta de nuevo.');
}

interface ProductoPanel {
  id: string;
  nombre: string;
  codigo?: string | null;
  descripcion: string | null;
  comentarios?: string | null;
  categoria?: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  precio_usd: number;
  moneda: string | null;
  imagen_url?: string | null;
  imagenes_extra?: (string | null)[] | string[] | null;
  activo?: boolean | null;
  created_at?: string | null;
  stock_confirmado_at?: string | null;
  pausado_por_stock_vencido?: boolean | null;
  /** pendiente | aprobado | rechazado — visibilidad en la web */
  aprobacion_publica?: string | null;
  vertical?: VerticalVehiculo | null;
  disponibilidad_aviso?: string | null;
  es_oferta?: boolean | null;
  stock_actual?: number | null;
}

interface MisProductosProps {
  refreshTrigger?: number;
  /** Si viene del panel, el listado queda fijado a ese vertical (sin mezclar auto/moto). */
  vertical?: VerticalVehiculo;
}

type FiltroEstadoProductoGestion =
  | 'todos'
  | 'activos'
  | 'pausados'
  | 'proximos_stock'
  | 'stock_vencido'
  | 'sin_fecha_stock';

type FiltroVerticalMisProductos = 'todos' | VerticalVehiculo;

type AccionMasivaProducto = 'pausar' | 'activar' | 'reactivar' | 'eliminar' | 'precios';
type AlcanceAccionMasiva = 'filtrados' | 'seleccionados';

const ACCION_MASIVA_PAGE = 80;

const PRODUCTOS_VENDEDOR_SELECT =
  'id, nombre, codigo, descripcion, comentarios, categoria, marca, modelo, anio, precio_usd, moneda, imagen_url, imagenes_extra, activo, aprobacion_publica, created_at, stock_confirmado_at, pausado_por_stock_vencido, stock_actual, vertical, disponibilidad_aviso, es_oferta';

/** Fallback si aún no existe productos.codigo en Supabase. */
const PRODUCTOS_VENDEDOR_SELECT_SIN_CODIGO =
  'id, nombre, descripcion, comentarios, categoria, marca, modelo, anio, precio_usd, moneda, imagen_url, imagenes_extra, activo, aprobacion_publica, created_at, stock_confirmado_at, pausado_por_stock_vencido, stock_actual, vertical, disponibilidad_aviso, es_oferta';

/** Lotes pequeños: el vendedor busca algo concreto, no descarga todo el catálogo. */
const PRODUCTOS_VENDEDOR_PAGE = 20;

type FiltrosConsultaMisProductos = {
  texto: string;
  estado: FiltroEstadoProductoGestion;
  vertical: FiltroVerticalMisProductos;
};

function errorPorColumnaCodigo(msg: string | undefined): boolean {
  const m = (msg ?? '').toLowerCase();
  return m.includes('codigo') && (m.includes('does not exist') || m.includes('column'));
}

function isoHaceDias(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

function comillasFiltroFecha(iso: string): string {
  return `"${iso.replace(/"/g, '')}"`;
}

function aplicarFiltroEstadoMisProductosQuery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filtro: FiltroEstadoProductoGestion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (filtro === 'activos') return query.eq('activo', true);
  if (filtro === 'pausados') return query.eq('activo', false);

  const hace30 = comillasFiltroFecha(isoHaceDias(DIAS_STOCK_SEMAFORO_VERDE));
  const hace60 = comillasFiltroFecha(isoHaceDias(DIAS_PAUSA_STOCK_VENCIDO));

  if (filtro === 'proximos_stock') {
    return query
      .eq('activo', true)
      .or(
        [
          `and(stock_confirmado_at.not.is.null,stock_confirmado_at.lt.${hace30},stock_confirmado_at.gte.${hace60})`,
          `and(stock_confirmado_at.is.null,created_at.lt.${hace30},created_at.gte.${hace60})`,
        ].join(',')
      );
  }
  if (filtro === 'stock_vencido') {
    return query.or(
      [
        'pausado_por_stock_vencido.eq.true',
        `and(stock_confirmado_at.not.is.null,stock_confirmado_at.lt.${hace60})`,
        `and(stock_confirmado_at.is.null,created_at.lt.${hace60})`,
      ].join(',')
    );
  }
  if (filtro === 'sin_fecha_stock') {
    return query.is('stock_confirmado_at', null).is('created_at', null);
  }
  return query;
}

async function fetchTiendaIdsVendedor(
  userId: string
): Promise<{ tiendaIds: string[]; error: string | null }> {
  const { data: tiendas, error: errTiendas } = await withRetry(() =>
    supabase.from('tiendas').select('id').eq('user_id', userId)
  );
  if (errTiendas) {
    return { tiendaIds: [], error: errTiendas.message || 'Error al cargar tus tiendas.' };
  }
  return { tiendaIds: (tiendas ?? []).map((t) => t.id), error: null };
}

/** Una página de productos del vendedor con filtros en servidor. */
async function fetchPaginaProductosVendedor(opts: {
  tiendaIds: string[];
  filtros: FiltrosConsultaMisProductos;
  offset: number;
  conCodigo?: boolean;
}): Promise<{ productos: ProductoPanel[]; hayMas: boolean; error: string | null; conCodigo: boolean }> {
  const { tiendaIds, filtros, offset } = opts;
  let conCodigo = opts.conCodigo !== false;

  if (tiendaIds.length === 0) {
    return { productos: [], hayMas: false, error: null, conCodigo };
  }

  const selectCols = conCodigo ? PRODUCTOS_VENDEDOR_SELECT : PRODUCTOS_VENDEDOR_SELECT_SIN_CODIGO;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (supabase.from('productos') as any)
    .select(selectCols)
    .in('tienda_id', tiendaIds)
    .order('nombre')
    .order('id');

  if (filtros.vertical === 'auto' || filtros.vertical === 'moto') {
    query = query.eq('vertical', filtros.vertical);
  }

  query = aplicarFiltroEstadoMisProductosQuery(query, filtros.estado);

  const texto = filtros.texto.trim();
  if (texto) {
    query = aplicarTerminosTextoAMisProductos(query, texto, conCodigo);
  }

  // Pedimos PAGE+1 para saber si hay más sin count exact.
  const { data, error: errProd } = await withRetry(() =>
    query.range(offset, offset + PRODUCTOS_VENDEDOR_PAGE) as PromiseLike<{
      data: ProductoPanel[] | null;
      error: { message?: string } | null;
    }>
  );

  if (errProd) {
    if (conCodigo && errorPorColumnaCodigo(errProd.message)) {
      return fetchPaginaProductosVendedor({ ...opts, conCodigo: false });
    }
    return {
      productos: [],
      hayMas: false,
      error: errProd.message || 'Error al cargar tus productos.',
      conCodigo,
    };
  }

  const filas = (data ?? []) as unknown as ProductoPanel[];
  const hayMas = filas.length > PRODUCTOS_VENDEDOR_PAGE;
  return {
    productos: hayMas ? filas.slice(0, PRODUCTOS_VENDEDOR_PAGE) : filas,
    hayMas,
    error: null,
    conCodigo,
  };
}

function semaforoStockProducto(p: ProductoPanel): {
  clase: 'verde' | 'amarillo' | 'rojo' | 'vencido' | 'sin-fecha';
  texto: string;
} {
  const base = p.stock_confirmado_at ?? p.created_at ?? null;
  const dias = diasDesdeFechaISO(base);
  const clase = claseSemaforoStockPorDias(dias);
  if (clase === 'sin-fecha') {
    return { clase, texto: 'Sin fecha de stock' };
  }
  if (clase === 'verde') {
    return { clase, texto: `Stock confirmado hace ${dias} día(s)` };
  }
  if (clase === 'amarillo') {
    return { clase, texto: `Stock por confirmar (${dias} día(s))` };
  }
  if (clase === 'rojo') {
    return { clase, texto: `Stock crítico (${dias} día(s))` };
  }
  return { clase, texto: `Vencido (${dias} día(s) sin confirmar)` };
}

export function MisProductos({ refreshTrigger = 0, vertical }: MisProductosProps) {
  const verticalFijo = vertical === 'auto' || vertical === 'moto' ? vertical : null;
  const { user } = useAuth();
  const [productos, setProductos] = useState<ProductoPanel[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ajustePorcentaje, setAjustePorcentaje] = useState('');
  const [productoEditando, setProductoEditando] = useState<ProductoPanel | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [productoAEliminar, setProductoAEliminar] = useState<ProductoPanel | null>(null);
  const [productoDetalle, setProductoDetalle] = useState<ProductoPanel | null>(null);
  const [fotoDetalleActiva, setFotoDetalleActiva] = useState<string | null>(null);
  const [contactosDetalle, setContactosDetalle] = useState<number | null>(null);
  const [cargandoContactos, setCargandoContactos] = useState(false);
  /** Selección manual para acciones masivas (pausar/activar/eliminar/precios). */
  const [productosSeleccionados, setProductosSeleccionados] = useState<string[]>([]);
  const [etiquetandoId, setEtiquetandoId] = useState<string | null>(null);
  /** Texto de búsqueda en el input (draft). */
  const [busquedaProductosInput, setBusquedaProductosInput] = useState('');
  /** Texto ya aplicado en la consulta al servidor. */
  const [busquedaProductosAplicada, setBusquedaProductosAplicada] = useState('');
  const [filtroEstadoProductos, setFiltroEstadoProductos] = useState<FiltroEstadoProductoGestion>('todos');
  const [filtroEstadoProductosDraft, setFiltroEstadoProductosDraft] =
    useState<FiltroEstadoProductoGestion>('todos');
  const [filtroVerticalProductos, setFiltroVerticalProductos] = useState<FiltroVerticalMisProductos>(
    () => (vertical === 'auto' || vertical === 'moto' ? vertical : 'todos')
  );
  const [filtroVerticalProductosDraft, setFiltroVerticalProductosDraft] =
    useState<FiltroVerticalMisProductos>(
      () => (vertical === 'auto' || vertical === 'moto' ? vertical : 'todos')
    );
  const [cargandoFiltrosProductos, setCargandoFiltrosProductos] = useState(false);
  const [cargandoMasProductos, setCargandoMasProductos] = useState(false);
  const [hayMasProductos, setHayMasProductos] = useState(false);
  const [offsetProductos, setOffsetProductos] = useState(0);
  const [tiendaIds, setTiendaIds] = useState<string[]>([]);
  const [consultaUsaCodigo, setConsultaUsaCodigo] = useState(true);
  /** true si, sin filtros, el vendedor no tiene ningún producto. */
  const [catalogoVacio, setCatalogoVacio] = useState(false);
  const [accionMasivaAlcance, setAccionMasivaAlcance] = useState<AlcanceAccionMasiva>('filtrados');
  const [accionMasivaTipo, setAccionMasivaTipo] = useState<AccionMasivaProducto>('pausar');
  const [ejecutandoAccionMasiva, setEjecutandoAccionMasiva] = useState(false);
  const [mensajeAccionMasiva, setMensajeAccionMasiva] = useState<string | null>(null);
  const [confirmarEliminarMasivo, setConfirmarEliminarMasivo] = useState(false);

  const filtrosAplicados = useMemo<FiltrosConsultaMisProductos>(
    () => ({
      texto: busquedaProductosAplicada,
      estado: filtroEstadoProductos,
      vertical: verticalFijo ?? filtroVerticalProductos,
    }),
    [busquedaProductosAplicada, filtroEstadoProductos, filtroVerticalProductos, verticalFijo]
  );

  useEffect(() => {
    if (!verticalFijo) return;
    setFiltroVerticalProductos(verticalFijo);
    setFiltroVerticalProductosDraft(verticalFijo);
  }, [verticalFijo]);

  const cargarPrimeraPagina = async (opts: {
    userId: string;
    filtros: FiltrosConsultaMisProductos;
    marcarCatalogoVacio?: boolean;
  }) => {
    const idsRes = await fetchTiendaIdsVendedor(opts.userId);
    if (idsRes.error) {
      setTiendaIds([]);
      setProductos([]);
      setHayMasProductos(false);
      setOffsetProductos(0);
      setError(idsRes.error);
      return;
    }
    setTiendaIds(idsRes.tiendaIds);
    const pagina = await fetchPaginaProductosVendedor({
      tiendaIds: idsRes.tiendaIds,
      filtros: opts.filtros,
      offset: 0,
      conCodigo: consultaUsaCodigo,
    });
    if (pagina.error) {
      setProductos([]);
      setHayMasProductos(false);
      setOffsetProductos(0);
      setError(pagina.error);
      return;
    }
    setConsultaUsaCodigo(pagina.conCodigo);
    setProductos(pagina.productos);
    setHayMasProductos(pagina.hayMas);
    setOffsetProductos(pagina.productos.length);
    setProductosSeleccionados([]);
    setError(null);
    if (opts.marcarCatalogoVacio) {
      const sinFiltros =
        !opts.filtros.texto.trim() &&
        opts.filtros.estado === 'todos' &&
        (opts.filtros.vertical === 'todos' || Boolean(verticalFijo));
      setCatalogoVacio(sinFiltros && pagina.productos.length === 0 && !pagina.hayMas);
    }
  };

  useEffect(() => {
    let cancelado = false;

    const cargar = async () => {
      if (!user) return;
      if (!cancelado) {
        setCargando(true);
        setError(null);
      }

      try {
        const filtrosIniciales: FiltrosConsultaMisProductos = {
          texto: '',
          estado: 'todos',
          vertical: verticalFijo ?? 'todos',
        };
        const idsRes = await fetchTiendaIdsVendedor(user.id);
        if (cancelado) return;
        if (idsRes.error) {
          setTiendaIds([]);
          setProductos([]);
          setError(idsRes.error);
          return;
        }
        setTiendaIds(idsRes.tiendaIds);
        const pagina = await fetchPaginaProductosVendedor({
          tiendaIds: idsRes.tiendaIds,
          filtros: filtrosIniciales,
          offset: 0,
        });
        if (cancelado) return;
        if (pagina.error) {
          setProductos([]);
          setError(pagina.error);
          return;
        }
        setConsultaUsaCodigo(pagina.conCodigo);
        setProductos(pagina.productos);
        setHayMasProductos(pagina.hayMas);
        setOffsetProductos(pagina.productos.length);
        setCatalogoVacio(pagina.productos.length === 0 && !pagina.hayMas);
        setBusquedaProductosInput('');
        setBusquedaProductosAplicada('');
        setFiltroEstadoProductos('todos');
        setFiltroEstadoProductosDraft('todos');
        setFiltroVerticalProductos(verticalFijo ?? 'todos');
        setFiltroVerticalProductosDraft(verticalFijo ?? 'todos');
        setProductosSeleccionados([]);
      } catch (e) {
        if (!cancelado) {
          const msg =
            e instanceof Error
              ? e.message
              : 'No se pudo cargar tus productos. Revisa la conexión e intenta de nuevo.';
          setProductos([]);
          setError(msg);
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    };

    void cargar();

    return () => {
      cancelado = true;
    };
  }, [user, refreshTrigger, verticalFijo]);

  useEffect(() => {
    const cargarContactos = async () => {
      if (!user || !productoDetalle) return;
      setCargandoContactos(true);
      const { count, error: err } = await supabase
        .from('contactos_productos')
        .select('*', { count: 'exact', head: true })
        .eq('producto_id', productoDetalle.id);
      if (!err) {
        setContactosDetalle(count ?? 0);
      }
      setCargandoContactos(false);
    };
    setContactosDetalle(null);
    if (productoDetalle) {
      const primeraExtra =
        Array.isArray(productoDetalle.imagenes_extra) &&
        productoDetalle.imagenes_extra.find((u) => typeof u === 'string' && u.trim());
      setFotoDetalleActiva(
        (typeof productoDetalle.imagen_url === 'string' && productoDetalle.imagen_url.trim()
          ? productoDetalle.imagen_url
          : null) ??
          (typeof primeraExtra === 'string' ? primeraExtra : null)
      );
      cargarContactos();
    } else {
      setFotoDetalleActiva(null);
    }
  }, [productoDetalle, user]);

  /** Lista ya filtrada en servidor; se muestra tal cual. */
  const productosVisibles = productos;

  if (!user) {
    return null;
  }

  const aplicarFiltrosMisProductos = async () => {
    if (!user) return;
    const filtros: FiltrosConsultaMisProductos = {
      texto: busquedaProductosInput,
      estado: filtroEstadoProductosDraft,
      vertical: verticalFijo ?? filtroVerticalProductosDraft,
    };
    setBusquedaProductosAplicada(filtros.texto);
    setFiltroEstadoProductos(filtros.estado);
    setFiltroVerticalProductos(filtros.vertical);
    setCargandoFiltrosProductos(true);
    setError(null);
    try {
      await cargarPrimeraPagina({ userId: user.id, filtros });
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'No se pudo cargar tus productos. Revisa la conexión e intenta de nuevo.';
      setProductos([]);
      setError(msg);
    } finally {
      setCargandoFiltrosProductos(false);
    }
  };

  const restablecerFiltrosMisProductos = async () => {
    if (!user) return;
    const verticalReset: FiltroVerticalMisProductos = verticalFijo ?? 'todos';
    setBusquedaProductosInput('');
    setBusquedaProductosAplicada('');
    setFiltroEstadoProductosDraft('todos');
    setFiltroVerticalProductosDraft(verticalReset);
    setFiltroEstadoProductos('todos');
    setFiltroVerticalProductos(verticalReset);
    setCargandoFiltrosProductos(true);
    setError(null);
    try {
      await cargarPrimeraPagina({
        userId: user.id,
        filtros: { texto: '', estado: 'todos', vertical: verticalReset },
        marcarCatalogoVacio: true,
      });
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'No se pudo cargar tus productos. Revisa la conexión e intenta de nuevo.';
      setProductos([]);
      setError(msg);
    } finally {
      setCargandoFiltrosProductos(false);
    }
  };

  const cargarMasProductos = async () => {
    if (!user || cargandoMasProductos || !hayMasProductos) return;
    setCargandoMasProductos(true);
    setError(null);
    try {
      const ids =
        tiendaIds.length > 0
          ? tiendaIds
          : (await fetchTiendaIdsVendedor(user.id)).tiendaIds;
      if (tiendaIds.length === 0 && ids.length > 0) setTiendaIds(ids);
      const pagina = await fetchPaginaProductosVendedor({
        tiendaIds: ids,
        filtros: filtrosAplicados,
        offset: offsetProductos,
        conCodigo: consultaUsaCodigo,
      });
      if (pagina.error) {
        setError(pagina.error);
        return;
      }
      setConsultaUsaCodigo(pagina.conCodigo);
      setProductos((prev) => {
        const vistos = new Set(prev.map((p) => p.id));
        const nuevos = pagina.productos.filter((p) => !vistos.has(p.id));
        return [...prev, ...nuevos];
      });
      setHayMasProductos(pagina.hayMas);
      setOffsetProductos((prev) => prev + pagina.productos.length);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'No se pudo cargar más productos. Revisa la conexión e intenta de nuevo.';
      setError(msg);
    } finally {
      setCargandoMasProductos(false);
    }
  };

  const actualizarEtiquetasPublicacion = async (
    productoId: string,
    patch: { disponibilidad_aviso?: DisponibilidadAviso | null; es_oferta?: boolean }
  ) => {
    setError(null);
    setEtiquetandoId(productoId);
    try {
      const { error: errUp } = await supabase.from('productos').update(patch).eq('id', productoId);
      if (errUp) throw errUp;
      setProductos((prev) =>
        prev.map((p) => (p.id === productoId ? { ...p, ...patch } : p))
      );
      setProductoDetalle((prev) => (prev && prev.id === productoId ? { ...prev, ...patch } : prev));
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'No se pudo actualizar la etiqueta del producto.';
      setError(msg);
    } finally {
      setEtiquetandoId(null);
    }
  };

  const toggleProductoSeleccionado = (productoId: string, checked: boolean) => {
    setProductosSeleccionados((prev) => {
      if (checked) return prev.includes(productoId) ? prev : [...prev, productoId];
      return prev.filter((id) => id !== productoId);
    });
  };

  const seleccionarTodosProductosVisibles = () => {
    setProductosSeleccionados(productosVisibles.map((p) => p.id));
  };

  const limpiarSeleccionProductos = () => {
    setProductosSeleccionados([]);
  };

  const productosObjetivoAccionMasiva = useMemo(() => {
    if (accionMasivaAlcance === 'seleccionados') {
      return productosVisibles.filter((p) => productosSeleccionados.includes(p.id));
    }
    return productosVisibles;
  }, [accionMasivaAlcance, productosVisibles, productosSeleccionados]);

  const etiquetarAccionMasiva = (accion: AccionMasivaProducto) => {
    if (accion === 'pausar') return 'Pausar';
    if (accion === 'activar') return 'Activar';
    if (accion === 'reactivar') return 'Reactivar (stock vencido)';
    if (accion === 'precios') return 'Ajuste de precios (%)';
    return 'Eliminar';
  };

  const filtrarObjetivosPorAccion = (lista: ProductoPanel[], accion: AccionMasivaProducto) => {
    if (accion === 'pausar') return lista.filter((p) => p.activo !== false);
    if (accion === 'activar') return lista.filter((p) => p.activo === false);
    if (accion === 'reactivar') {
      return lista.filter((p) => {
        if (p.activo !== false) return false;
        if (p.pausado_por_stock_vencido) return true;
        return semaforoStockProducto(p).clase === 'vencido';
      });
    }
    return lista;
  };

  const aplicarChunksIds = async (
    ids: string[],
    run: (chunk: string[]) => Promise<{ error: { message?: string } | null }>
  ) => {
    for (let i = 0; i < ids.length; i += ACCION_MASIVA_PAGE) {
      const chunk = ids.slice(i, i + ACCION_MASIVA_PAGE);
      const { error: errChunk } = await run(chunk);
      if (errChunk) {
        return { error: errChunk.message || 'Error al aplicar la acción masiva.', processed: i };
      }
    }
    return { error: null as string | null, processed: ids.length };
  };

  const ejecutarAccionMasivaConfirmada = async () => {
    const accion = accionMasivaTipo;
    const candidatos = productosObjetivoAccionMasiva;
    const objetivos = filtrarObjetivosPorAccion(candidatos, accion);
    const omitidos = candidatos.length - objetivos.length;

    if (!objetivos.length) {
      setMensajeAccionMasiva('Ningún producto del alcance aplica para esa acción.');
      setConfirmarEliminarMasivo(false);
      return;
    }

    setEjecutandoAccionMasiva(true);
    setMensajeAccionMasiva(null);
    setError(null);

    try {
      const ids = objetivos.map((p) => p.id);
      const ahoraIso = new Date().toISOString();

      if (accion === 'eliminar') {
        const res = await aplicarChunksIds(ids, async (chunk) =>
          supabase.from('productos').delete().in('id', chunk)
        );
        if (res.error) {
          setError(res.error);
          setMensajeAccionMasiva('No se pudo completar la eliminación masiva.');
          return;
        }
        const idSet = new Set(ids);
        setProductos((prev) => prev.filter((p) => !idSet.has(p.id)));
        setProductosSeleccionados((prev) => prev.filter((id) => !idSet.has(id)));
        setConfirmarEliminarMasivo(false);
        setMensajeAccionMasiva(
          'Eliminados ' + ids.length + ' producto(s).' + (omitidos > 0 ? ' Omitidos: ' + omitidos + '.' : '')
        );
        return;
      }

      if (accion === 'pausar') {
        const res = await aplicarChunksIds(ids, async (chunk) =>
          supabase.from('productos').update({ activo: false }).in('id', chunk)
        );
        if (res.error) {
          setError(res.error);
          setMensajeAccionMasiva('No se pudo completar la pausa masiva.');
          return;
        }
        const idSet = new Set(ids);
        setProductos((prev) => prev.map((p) => (idSet.has(p.id) ? { ...p, activo: false } : p)));
        setMensajeAccionMasiva(
          'Pausados ' + ids.length + ' producto(s).' + (omitidos > 0 ? ' Ya pausados omitidos: ' + omitidos + '.' : '')
        );
        return;
      }

      const patch = {
        activo: true,
        stock_confirmado_at: ahoraIso,
        pausado_por_stock_vencido: false,
      };
      const res = await aplicarChunksIds(ids, async (chunk) =>
        supabase.from('productos').update(patch).in('id', chunk)
      );
      if (res.error) {
        setError(res.error);
        setMensajeAccionMasiva('No se pudo completar la activación masiva.');
        return;
      }
      const idSet = new Set(ids);
      setProductos((prev) =>
        prev.map((p) =>
          idSet.has(p.id)
            ? {
                ...p,
                activo: true,
                stock_confirmado_at: ahoraIso,
                pausado_por_stock_vencido: false,
              }
            : p
        )
      );
      const verbo = accion === 'reactivar' ? 'Reactivados' : 'Activados';
      setMensajeAccionMasiva(
        verbo +
          ' ' +
          ids.length +
          ' producto(s).' +
          (omitidos > 0 ? ' Omitidos (no aplicaban): ' + omitidos + '.' : '')
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error en la acción masiva.');
      setMensajeAccionMasiva('No se pudo completar la acción masiva.');
    } finally {
      setEjecutandoAccionMasiva(false);
    }
  };

  const solicitarEjecutarAccionMasiva = () => {
    setMensajeAccionMasiva(null);
    setError(null);
    if (accionMasivaAlcance === 'seleccionados' && productosSeleccionados.length === 0) {
      setMensajeAccionMasiva('Marca al menos un producto en la lista o cambia el alcance a filtrados.');
      return;
    }
    const candidatos = productosObjetivoAccionMasiva;
    const objetivos = filtrarObjetivosPorAccion(candidatos, accionMasivaTipo);
    if (!candidatos.length) {
      setMensajeAccionMasiva('No hay productos en el alcance elegido. Aplica filtros primero.');
      return;
    }
    if (!objetivos.length) {
      setMensajeAccionMasiva('Ningún producto del alcance aplica para esa acción.');
      return;
    }
    if (accionMasivaTipo === 'precios') {
      const porcentaje = Number.parseFloat(ajustePorcentaje.replace(',', '.'));
      if (!Number.isFinite(porcentaje)) {
        setMensajeAccionMasiva('Escribe un porcentaje válido. Ejemplo: 10 o -5.');
        return;
      }
      if (porcentaje === 0) {
        setMensajeAccionMasiva('El porcentaje no puede ser 0.');
        return;
      }
    }
    if (accionMasivaTipo === 'eliminar') {
      setConfirmarEliminarMasivo(true);
      return;
    }
    void ejecutarAccionMasivaConfirmada();
  };

  if (cargando) {
    return (
      <div className="mis-productos">
        <p className="mis-productos-mensaje">Cargando tus productos…</p>
      </div>
    );
  }

  if (error && productos.length === 0 && catalogoVacio === false && tiendaIds.length === 0) {
    return (
      <div className="mis-productos">
        <p className="mis-productos-mensaje mis-productos-error">{error}</p>
      </div>
    );
  }

  if (catalogoVacio && !busquedaProductosAplicada.trim() && filtroEstadoProductos === 'todos') {
    return (
      <div className="mis-productos">
        <p className="mis-productos-mensaje">
          Aún no tienes productos registrados. Usa el botón &quot;Publicar producto&quot; para crear tu
          primera publicación.
        </p>
      </div>
    );
  }

  return (
    <div className="mis-productos">
      <section className="mis-productos-filtros" aria-label="Buscar y filtrar productos">
        <div>
          <p className="mis-productos-ajuste-masivo-titulo">Buscar y filtrar mis productos</p>
            <p className="mis-productos-ajuste-masivo-descripcion">
              Escribe el nombre o código y pulsa <strong>Aplicar filtros</strong> (o Intro). Se consultan{' '}
              {PRODUCTOS_VENDEDOR_PAGE} productos por vez; usa <strong>Cargar más</strong> si hace falta.
              Acepta plural/singular (ej. camaras → camara). Para fotos masivas usa el menú{' '}
              <strong>Gestión de fotos</strong>.
            </p>
        </div>
        <form
          className="mis-productos-filtros-grid"
          onSubmit={(e) => {
            e.preventDefault();
            void aplicarFiltrosMisProductos();
          }}
        >
          <label>
            Buscar producto
            <input
              type="search"
              value={busquedaProductosInput}
              onChange={(e) => {
                setBusquedaProductosInput(e.target.value);
              }}
              placeholder="Ej: camara, amortiguadores, batería (plural/typos OK)..."
            />
          </label>
          {!verticalFijo && (
            <label>
              Vertical
              <select
                value={filtroVerticalProductosDraft}
                onChange={(e) =>
                  setFiltroVerticalProductosDraft(e.target.value as FiltroVerticalMisProductos)
                }
                disabled={cargandoFiltrosProductos}
              >
                <option value="todos">Todos (auto y moto)</option>
                <option value="auto">Solo automóvil</option>
                <option value="moto">Solo moto</option>
              </select>
            </label>
          )}
          <label>
            Estado del artículo
            <select
              value={filtroEstadoProductosDraft}
              onChange={(e) =>
                setFiltroEstadoProductosDraft(e.target.value as FiltroEstadoProductoGestion)
              }
              disabled={cargandoFiltrosProductos}
            >
              <option value="todos">Todos los productos</option>
              <option value="activos">Activos</option>
              <option value="pausados">Pausados</option>
              <option value="proximos_stock">Próximos a pausarse por fecha</option>
              <option value="stock_vencido">Stock vencido</option>
              <option value="sin_fecha_stock">Sin fecha de stock</option>
            </select>
          </label>
        </form>
        <div className="mis-productos-filtros-acciones">
          <button
            type="button"
            className="mis-productos-btn-primario"
            disabled={cargandoFiltrosProductos || cargando || cargandoMasProductos}
            onClick={() => void aplicarFiltrosMisProductos()}
          >
            {cargandoFiltrosProductos ? 'Buscando…' : 'Aplicar filtros'}
          </button>
          <button
            type="button"
            className="mis-productos-btn-secundario"
            disabled={cargandoFiltrosProductos || cargando || cargandoMasProductos}
            onClick={() => void restablecerFiltrosMisProductos()}
          >
            Restablecer filtros
          </button>
        </div>
        {error && (
          <p className="mis-productos-mensaje mis-productos-error" role="alert">
            {error}
          </p>
        )}
        <p className="mis-productos-filtros-resumen" role="status">
          {busquedaProductosAplicada.trim()
            ? `Búsqueda «${busquedaProductosAplicada.trim()}»: ${productosVisibles.length} producto(s) en esta vista${
                hayMasProductos ? ' (hay más)' : ''
              }.`
            : `Mostrando ${productosVisibles.length} producto(s)${
                hayMasProductos ? ' (hay más en el catálogo)' : ''
              }.`}
        </p>
      </section>
      <section className="mis-productos-acciones-masivas" aria-label="Acciones masivas sobre productos">
        <p className="mis-productos-ajuste-masivo-titulo">Acciones sobre productos filtrados</p>
        <p className="mis-productos-ajuste-masivo-descripcion">
          El alcance &quot;Todos los de esta lista&quot; aplica solo a los productos <strong>ya cargados</strong>{' '}
          (no a todo el catálogo). Para afectar más, pulsa <strong>Cargar más</strong> o marca seleccionados.
        </p>
        <div className="mis-productos-acciones-masivas-grid">
          <label>
            Alcance
            <select
              value={accionMasivaAlcance}
              onChange={(e) => setAccionMasivaAlcance(e.target.value as AlcanceAccionMasiva)}
              disabled={ejecutandoAccionMasiva}
            >
              <option value="filtrados">Todos los de esta lista ({productosVisibles.length})</option>
              <option value="seleccionados">
                Solo seleccionados ({productosSeleccionados.length})
              </option>
            </select>
          </label>
          <label>
            Acción
            <select
              value={accionMasivaTipo}
              onChange={(e) => setAccionMasivaTipo(e.target.value as AccionMasivaProducto)}
              disabled={ejecutandoAccionMasiva}
            >
              <option value="pausar">Pausar</option>
              <option value="activar">Activar</option>
              <option value="reactivar">Reactivar (pausados por stock vencido)</option>
              <option value="precios">Ajuste de precios (%)</option>
              <option value="eliminar">Eliminar</option>
            </select>
          </label>
          <div className="mis-productos-acciones-masivas-ejecutar">
            <button
              type="button"
              className={
                accionMasivaTipo === 'eliminar'
                  ? 'mis-productos-btn-eliminar'
                  : 'mis-productos-btn-primario'
              }
              disabled={ejecutandoAccionMasiva || cargando}
              onClick={() => solicitarEjecutarAccionMasiva()}
            >
              {ejecutandoAccionMasiva
                ? 'Ejecutando…'
                : 'Ejecutar: ' + etiquetarAccionMasiva(accionMasivaTipo)}
            </button>
          </div>
        </div>
        {accionMasivaTipo === 'precios' && (
          <div className="mis-productos-acciones-masivas-porcentaje">
            <label>
              Porcentaje (+ o -)
              <input
                type="text"
                inputMode="decimal"
                value={ajustePorcentaje}
                onChange={(e) => setAjustePorcentaje(e.target.value)}
                placeholder="Ej: 10 o -5"
                className="mis-productos-ajuste-masivo-input"
                disabled={ejecutandoAccionMasiva}
                aria-label="Porcentaje de ajuste de precios"
              />
            </label>
            <p className="mis-productos-ajuste-masivo-ayuda">
              Se redondea a 2 decimales y nunca baja de 0.01. Positivo aumenta; negativo disminuye.
            </p>
          </div>
        )}
        {accionMasivaAlcance === 'seleccionados' && (
          <div className="mis-productos-fotos-masivas-seleccion">
            <p>
              Seleccionados: {productosSeleccionados.length}. Marca los productos en la lista inferior.
            </p>
            <div className="mis-productos-fotos-masivas-acciones">
              <button
                type="button"
                className="mis-productos-btn-secundario"
                onClick={seleccionarTodosProductosVisibles}
                disabled={ejecutandoAccionMasiva}
              >
                Seleccionar visibles ({productosVisibles.length})
              </button>
              <button
                type="button"
                className="mis-productos-btn-secundario"
                onClick={limpiarSeleccionProductos}
                disabled={ejecutandoAccionMasiva || productosSeleccionados.length === 0}
              >
                Limpiar selección
              </button>
            </div>
          </div>
        )}
        <p className="mis-productos-ajuste-masivo-ayuda">
          Objetivo actual: {productosObjetivoAccionMasiva.length} producto(s). Reactivar solo afecta
          pausados por stock vencido; Activar sirve para cualquier pausado; el ajuste de precios
          aplica al alcance elegido.
        </p>
        {mensajeAccionMasiva && (
          <p className="mis-productos-ajuste-masivo-mensaje">{mensajeAccionMasiva}</p>
        )}
      </section>
      {productoDetalle && (
        <div
          className="mis-productos-modal-overlay"
          onClick={() => setProductoDetalle(null)}
        >
          <div
            className="mis-productos-detalle"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mis-productos-detalle-header">
              <h3 className="mis-productos-detalle-nombre">{productoDetalle.nombre}</h3>
              {productoDetalle.categoria && (
                <p className="mis-productos-detalle-categoria">{productoDetalle.categoria}</p>
              )}
            </div>
            <div className="mis-productos-detalle-cuerpo">
              <div className="mis-productos-detalle-galeria">
                <div className="mis-productos-detalle-galeria-principal">
                  {fotoDetalleActiva ? (
                    <img
                      src={urlImagenProductoVariante(fotoDetalleActiva, 'vista') ?? fotoDetalleActiva}
                      alt={productoDetalle.nombre}
                      width={1080}
                      height={1080}
                      loading="lazy"
                      decoding="async"
                      sizes="(max-width: 900px) 90vw, 640px"
                    />
                  ) : (
                    <div className="mis-productos-card-foto-placeholder">Sin fotos cargadas</div>
                  )}
                </div>
                {([productoDetalle.imagen_url, ...(productoDetalle.imagenes_extra ?? [])] as (string | null)[])
                  .filter((url): url is string => Boolean(url))
                  .length > 0 && (
                  <div className="mis-productos-detalle-thumbs">
                    {([productoDetalle.imagen_url, ...(productoDetalle.imagenes_extra ?? [])] as (string | null)[])
                      .filter((url): url is string => Boolean(url))
                      .map((url) => (
                        <button
                          key={url}
                          type="button"
                          className={`mis-productos-detalle-thumb${
                            fotoDetalleActiva === url ? ' activa' : ''
                          }`}
                          onMouseEnter={() => setFotoDetalleActiva(url)}
                        >
                          <ImagenProducto
                            url={url}
                            variante="miniatura"
                            alt="Foto del producto"
                            width={160}
                            height={160}
                            loading="lazy"
                            decoding="async"
                            sizes="80px"
                          />
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <div className="mis-productos-detalle-info">
                <p className="mis-productos-detalle-linea">
                  <strong>Vehículo:</strong>{' '}
                  {[productoDetalle.marca, productoDetalle.modelo, productoDetalle.anio]
                    .filter(Boolean)
                    .join(' · ') || 'No especificado'}
                </p>
                <p className="mis-productos-detalle-linea">
                  <strong>Precio:</strong>{' '}
                  {etiquetaMoneda(productoDetalle.moneda)}{' '}
                  {formatearPrecioProducto(productoDetalle.precio_usd)}
                </p>
                {productoDetalle.comentarios && (
                  <p className="mis-productos-detalle-linea">
                    <strong>Descripción:</strong> {productoDetalle.comentarios}
                  </p>
                )}
              </div>
              <div className="mis-productos-detalle-metricas">
                <h4>Estadísticas de contacto</h4>
                {cargandoContactos ? (
                  <p className="mis-productos-detalle-metricas-texto">Cargando métricas…</p>
                ) : (
                  <p className="mis-productos-detalle-metricas-texto">
                    {contactosDetalle ?? 0} contactos registrados para este producto.
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              className="mis-productos-btn-secundario mis-productos-detalle-cerrar"
              onClick={() => setProductoDetalle(null)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
      {confirmarEliminarMasivo && (
        <div className="mis-productos-modal-overlay">
          <div className="mis-productos-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="mis-productos-modal-titulo">Eliminar productos</h3>
            <p className="mis-productos-modal-texto">
              Vas a eliminar{' '}
              <strong>
                {filtrarObjetivosPorAccion(productosObjetivoAccionMasiva, 'eliminar').length}
              </strong>{' '}
              producto(s). Esta acción no se puede deshacer.
            </p>
            <div className="mis-productos-modal-acciones">
              <button
                type="button"
                className="mis-productos-btn-eliminar"
                disabled={ejecutandoAccionMasiva}
                onClick={() => void ejecutarAccionMasivaConfirmada()}
              >
                {ejecutandoAccionMasiva ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
              <button
                type="button"
                className="mis-productos-btn-secundario"
                disabled={ejecutandoAccionMasiva}
                onClick={() => setConfirmarEliminarMasivo(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {productoAEliminar && (
        <div className="mis-productos-modal-overlay">
          <div className="mis-productos-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="mis-productos-modal-titulo">Eliminar producto</h3>
            <p className="mis-productos-modal-texto">
              ¿Estás seguro de eliminar el producto{' '}
              <strong>{productoAEliminar.nombre}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="mis-productos-modal-acciones">
              <button
                type="button"
                className="mis-productos-btn-eliminar"
                disabled={eliminandoId === productoAEliminar.id}
                onClick={async () => {
                  if (eliminandoId && eliminandoId === productoAEliminar.id) return;
                  setEliminandoId(productoAEliminar.id);
                  const { error: err } = await supabase
                    .from('productos')
                    .delete()
                    .eq('id', productoAEliminar.id);
                  if (err) {
                    setError(err.message || 'Error al eliminar el producto.');
                    setEliminandoId(null);
                    return;
                  }
                  setProductos((prev) => prev.filter((p) => p.id !== productoAEliminar.id));
                  setEliminandoId(null);
                  setProductoAEliminar(null);
                }}
              >
                {eliminandoId === productoAEliminar.id ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
              <button
                type="button"
                className="mis-productos-btn-secundario"
                onClick={() => setProductoAEliminar(null)}
                disabled={eliminandoId === productoAEliminar.id}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {productoEditando && (
        <div
          className="mis-productos-modal-overlay"
          onClick={() => setProductoEditando(null)}
          role="presentation"
        >
          <div
            className="mis-productos-editor-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Editar producto"
          >
            <EditarProducto
              producto={productoEditando as ProductoEditable}
              onCancel={() => setProductoEditando(null)}
              onSaved={(actualizado) => {
                setProductos((prev) =>
                  prev.map((p) => (p.id === actualizado.id ? { ...p, ...actualizado } : p))
                );
                setProductoEditando(null);
              }}
            />
          </div>
        </div>
      )}
      <div className="mis-productos-grid">
        {productosVisibles.length === 0 ? (
          <div className="mis-productos-mensaje mis-productos-mensaje--bloque">
            <p>
              {busquedaProductosAplicada.trim()
                ? `No hay productos que coincidan con «${busquedaProductosAplicada.trim()}». Prueba otra palabra o revisa el nombre en el catálogo.`
                : 'No hay productos que coincidan con el filtro seleccionado.'}
            </p>
          </div>
        ) : (
          productosVisibles.map((p) => {
          const vehiculo = [p.marca, p.modelo, p.anio].filter(Boolean).join(' · ');
          const estaActivo = p.activo !== false;
          const semaforoStock = semaforoStockProducto(p);
          const mod = (p.aprobacion_publica ?? 'aprobado').toLowerCase();
          const seleccionado = productosSeleccionados.includes(p.id);
          const claseMod =
            mod === 'aprobado' ? 'aprobado' : mod === 'rechazado' ? 'rechazado' : 'pendiente';
          return (
            <article
              key={p.id}
              className={`mis-productos-card${
                accionMasivaAlcance === 'seleccionados' && seleccionado
                  ? ' mis-productos-card--seleccionada'
                  : ''
              }`}
              onClick={() => setProductoDetalle(p)}
            >
              {accionMasivaAlcance === 'seleccionados' && (
                <label
                  className="mis-productos-card-selector"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={seleccionado}
                    onChange={(e) => toggleProductoSeleccionado(p.id, e.target.checked)}
                    disabled={ejecutandoAccionMasiva}
                  />
                  Seleccionar
                </label>
              )}
              <div className="mis-productos-card-foto">
                {p.imagen_url ? (
                  <ImagenProducto
                    url={p.imagen_url}
                    variante="tarjeta"
                    alt={p.nombre}
                    width={400}
                    height={400}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    sizes="(max-width: 640px) 42vw, 200px"
                  />
                ) : (
                  <div className="mis-productos-card-foto-placeholder">Sin foto</div>
                )}
              </div>
              <div className="mis-productos-card-cuerpo">
                <div className="mis-productos-card-bloque-principal">
                  <div className="mis-productos-card-info">
                    <h3 className="mis-productos-card-nombre">{p.nombre}</h3>
                    <div className="mis-productos-card-meta-fila" role="group" aria-label="Estado del producto">
                      <span className="mis-productos-card-chip mis-productos-card-chip--tipo">
                        {p.vertical === 'moto' ? 'Moto' : 'Auto'}
                      </span>
                      <span
                        className={`mis-productos-card-chip ${
                          estaActivo ? 'mis-productos-card-chip--activo' : 'mis-productos-card-chip--pausado'
                        }`}
                      >
                        {estaActivo ? 'Activo' : 'Pausado'}
                      </span>
                      <span
                        className={`mis-productos-card-chip mis-productos-card-chip--web mis-productos-card-chip--web-${claseMod}`}
                      >
                        {mod === 'aprobado' ? 'En la web' : mod === 'rechazado' ? 'No en la web' : 'Pendiente web'}
                      </span>
                    </div>
                    <p
                      className={`mis-productos-card-stock-semaforo mis-productos-card-stock-semaforo--${semaforoStock.clase}`}
                    >
                      {semaforoStock.texto}
                    </p>
                    <div className="mis-productos-card-fila-datos">
                      <span className="mis-productos-card-vehiculo">
                        {vehiculo || 'Vehículo no especificado'}
                      </span>
                      <span className="mis-productos-card-datos-sep" aria-hidden>
                        ·
                      </span>
                      <span className="mis-productos-card-precio">
                        {etiquetaMoneda(p.moneda)}{' '}
                        {formatearPrecioProducto(p.precio_usd)}
                      </span>
                    </div>
                    <p className="mis-productos-card-desc">
                      {p.descripcion && p.descripcion.length > 0 ? p.descripcion : 'Sin descripción'}
                    </p>
                    <div className="mis-productos-card-etiquetas-activas" aria-live="polite">
                      {etiquetaDisponibilidadAviso(p.disponibilidad_aviso) ? (
                        <span
                          className={`mis-productos-card-aviso mis-productos-card-aviso--${p.disponibilidad_aviso}`}
                        >
                          {etiquetaDisponibilidadAviso(p.disponibilidad_aviso)}
                        </span>
                      ) : null}
                      <span className="mis-productos-card-stock-cant">
                        {etiquetaStockActual(
                          p.stock_actual != null && Number.isFinite(Number(p.stock_actual))
                            ? Number(p.stock_actual)
                            : null
                        )}
                      </span>
                      {p.es_oferta ? (
                        <span className="mis-productos-card-aviso mis-productos-card-aviso--oferta">OFERTA</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div
                  className="mis-productos-card-etiquetas"
                  role="group"
                  aria-label="Etiquetas de publicación"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mis-productos-card-etiquetas-botones">
                    {DISPONIBILIDAD_AVISO_OPCIONES.map((o) => {
                      const activo = p.disponibilidad_aviso === o.value;
                      const corto =
                        o.value === 'unica' ? 'Única' : o.value === 'pocas' ? 'Pocas' : 'Muchas';
                      return (
                        <button
                          key={o.value}
                          type="button"
                          className={`mis-productos-card-etiqueta-btn${
                            activo ? ' mis-productos-card-etiqueta-btn--activa' : ''
                          }`}
                          disabled={etiquetandoId === p.id}
                          title={o.label}
                          onClick={() =>
                            void actualizarEtiquetasPublicacion(p.id, {
                              disponibilidad_aviso: activo ? null : o.value,
                            })
                          }
                        >
                          {corto}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={`mis-productos-card-etiqueta-btn mis-productos-card-etiqueta-btn--oferta${
                        p.es_oferta ? ' mis-productos-card-etiqueta-btn--activa' : ''
                      }`}
                      disabled={etiquetandoId === p.id}
                      title="Marcar o quitar OFERTA"
                      onClick={() =>
                        void actualizarEtiquetasPublicacion(p.id, {
                          es_oferta: !p.es_oferta,
                        })
                      }
                    >
                      Oferta
                    </button>
                  </div>
                </div>
                <div
                  className="mis-productos-card-acciones"
                  role="group"
                  aria-label="Acciones del producto"
                >
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const { error: err } = await supabase
                        .from('productos')
                        .update({ activo: false })
                        .eq('id', p.id);
                      if (err) {
                        setError(err.message || 'Error al pausar el producto.');
                        return;
                      }
                      setProductos((prev) =>
                        prev.map((x) => (x.id === p.id ? { ...x, activo: false } : x))
                      );
                    }}
                    className="mis-productos-btn-pausar"
                    disabled={!estaActivo}
                    title="Pausar venta"
                  >
                    Pausar
                  </button>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const { error: err } = await supabase
                        .from('productos')
                        .update({
                          activo: true,
                          stock_confirmado_at: new Date().toISOString(),
                          pausado_por_stock_vencido: false,
                        })
                        .eq('id', p.id);
                      if (err) {
                        setError(err.message || 'Error al activar el producto.');
                        return;
                      }
                      setProductos((prev) =>
                        prev.map((x) =>
                          x.id === p.id
                            ? {
                                ...x,
                                activo: true,
                                stock_confirmado_at: new Date().toISOString(),
                                pausado_por_stock_vencido: false,
                              }
                            : x
                        )
                      );
                    }}
                    className="mis-productos-btn-activar"
                    disabled={estaActivo}
                    title="Activar producto y confirmar stock"
                  >
                    Activar
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProductoEditando(p);
                    }}
                    className="mis-productos-btn-primario"
                    title="Editar producto"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProductoAEliminar(p);
                    }}
                    className="mis-productos-btn-eliminar"
                    disabled={eliminandoId === p.id}
                    title="Eliminar producto"
                  >
                    {eliminandoId === p.id ? 'Borrando…' : 'Eliminar'}
                  </button>
                </div>
              </div>
            </article>
          );
        })
        )}
      </div>
      {hayMasProductos && (
        <div className="mis-productos-cargar-mas">
          <button
            type="button"
            className="mis-productos-btn-primario"
            disabled={cargandoMasProductos || cargandoFiltrosProductos}
            onClick={() => void cargarMasProductos()}
          >
            {cargandoMasProductos ? 'Cargando…' : `Cargar más (${PRODUCTOS_VENDEDOR_PAGE})`}
          </button>
        </div>
      )}
    </div>
  );
}

