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
import { etiquetaStockActual } from '../utils/stockActualInventario';
import { productoCoincideTextoFlexible } from '../utils/busquedaProductosTexto';

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

const PRODUCTOS_VENDEDOR_PAGE = 1000;

function errorPorColumnaCodigo(msg: string | undefined): boolean {
  const m = (msg ?? '').toLowerCase();
  return m.includes('codigo') && (m.includes('does not exist') || m.includes('column'));
}

/** Carga todos los productos de las tiendas del usuario (paginado; PostgREST limita ~1000 por solicitud). */
async function fetchProductosDelVendedor(
  userId: string
): Promise<{ productos: ProductoPanel[]; error: string | null }> {
  const { data: tiendas, error: errTiendas } = await withRetry(() =>
    supabase.from('tiendas').select('id').eq('user_id', userId)
  );

  if (errTiendas) {
    return { productos: [], error: errTiendas.message || 'Error al cargar tus tiendas.' };
  }

  if (!tiendas || tiendas.length === 0) {
    return { productos: [], error: null };
  }

  const tiendaIds = tiendas.map((t) => t.id);
  const acumulado: ProductoPanel[] = [];
  let from = 0;
  let selectCols = PRODUCTOS_VENDEDOR_SELECT;

  while (true) {
    const { data: productosData, error: errProd } = await withRetry(() =>
      supabase
        .from('productos')
        .select(selectCols)
        .in('tienda_id', tiendaIds)
        .order('nombre')
        .range(from, from + PRODUCTOS_VENDEDOR_PAGE - 1)
    );

    if (errProd) {
      if (selectCols === PRODUCTOS_VENDEDOR_SELECT && errorPorColumnaCodigo(errProd.message)) {
        selectCols = PRODUCTOS_VENDEDOR_SELECT_SIN_CODIGO;
        from = 0;
        acumulado.length = 0;
        continue;
      }
      return { productos: [], error: errProd.message || 'Error al cargar tus productos.' };
    }

    const batch = (productosData ?? []) as unknown as ProductoPanel[];
    acumulado.push(...batch);
    if (batch.length < PRODUCTOS_VENDEDOR_PAGE) break;
    from += PRODUCTOS_VENDEDOR_PAGE;
  }

  return { productos: acumulado, error: null };
}

function diasDesdeFechaISO(fechaIso: string | null | undefined): number | null {
  if (!fechaIso) return null;
  const ts = Date.parse(fechaIso);
  if (Number.isNaN(ts)) return null;
  const dias = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  return Math.max(0, dias);
}

function semaforoStockProducto(p: ProductoPanel): {
  clase: 'verde' | 'amarillo' | 'rojo' | 'vencido' | 'sin-fecha';
  texto: string;
} {
  const base = p.stock_confirmado_at ?? p.created_at ?? null;
  const dias = diasDesdeFechaISO(base);
  if (dias == null) {
    return { clase: 'sin-fecha', texto: 'Sin fecha de stock' };
  }
  if (dias <= 9) {
    return { clase: 'verde', texto: `Stock confirmado hace ${dias} día(s)` };
  }
  if (dias <= 15) {
    return { clase: 'amarillo', texto: `Stock por confirmar (${dias} día(s))` };
  }
  if (dias <= 20) {
    return { clase: 'rojo', texto: `Stock crítico (${dias} día(s))` };
  }
  return { clase: 'vencido', texto: `Vencido (${dias} día(s) sin confirmar)` };
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
  /** Texto de búsqueda: filtra la lista en vivo al escribir. */
  const [busquedaProductosInput, setBusquedaProductosInput] = useState('');
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
  const [accionMasivaAlcance, setAccionMasivaAlcance] = useState<AlcanceAccionMasiva>('filtrados');
  const [accionMasivaTipo, setAccionMasivaTipo] = useState<AccionMasivaProducto>('pausar');
  const [ejecutandoAccionMasiva, setEjecutandoAccionMasiva] = useState(false);
  const [mensajeAccionMasiva, setMensajeAccionMasiva] = useState<string | null>(null);
  const [confirmarEliminarMasivo, setConfirmarEliminarMasivo] = useState(false);

  useEffect(() => {
    if (!verticalFijo) return;
    setFiltroVerticalProductos(verticalFijo);
    setFiltroVerticalProductosDraft(verticalFijo);
  }, [verticalFijo]);

  useEffect(() => {
    let cancelado = false;

    const cargar = async () => {
      if (!user) return;
      if (!cancelado) {
        setCargando(true);
        setError(null);
      }

      try {
        const { productos: lista, error: errMsg } = await fetchProductosDelVendedor(user.id);
        if (cancelado) return;
        if (errMsg) {
          setProductos([]);
          setError(errMsg);
          return;
        }
        setProductos(lista);
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
  }, [user, refreshTrigger]);

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

  /**
   * Primera sección «Buscar y filtrar»: nombre + código con match flexible
   * (plural/singular y typo leve). No usa descripción/comentarios aquí para evitar
   * que un texto repetido en todos los productos (plantilla) devuelva el catálogo entero.
   */
  const productoCoincideBusqueda = (p: ProductoPanel, texto: string) =>
    productoCoincideTextoFlexible([p.nombre, p.codigo], texto);

  const productoCoincideEstado = (p: ProductoPanel, filtro: FiltroEstadoProductoGestion) => {
    const semaforo = semaforoStockProducto(p);
    if (filtro === 'activos') return p.activo !== false;
    if (filtro === 'pausados') return p.activo === false;
    if (filtro === 'proximos_stock') {
      return p.activo !== false && (semaforo.clase === 'amarillo' || semaforo.clase === 'rojo');
    }
    if (filtro === 'stock_vencido') return semaforo.clase === 'vencido';
    if (filtro === 'sin_fecha_stock') return semaforo.clase === 'sin-fecha';
    return true;
  };

  // Filtra en vivo con el texto del cuadro (no hace falta “aplicar” para ver resultados).
  const productosVisibles = useMemo(
    () =>
      productos.filter((p) => {
        const vertOk =
          filtroVerticalProductos === 'todos' || (p.vertical ?? 'auto') === filtroVerticalProductos;
        return (
          vertOk &&
          productoCoincideBusqueda(p, busquedaProductosInput) &&
          productoCoincideEstado(p, filtroEstadoProductos)
        );
      }),
    [productos, busquedaProductosInput, filtroEstadoProductos, filtroVerticalProductos]
  );

  if (!user) {
    return null;
  }

  const aplicarFiltrosMisProductos = async () => {
    if (!user) return;
    setFiltroEstadoProductos(filtroEstadoProductosDraft);
    setFiltroVerticalProductos(verticalFijo ?? filtroVerticalProductosDraft);
    setCargandoFiltrosProductos(true);
    setError(null);
    try {
      const { productos: lista, error: errMsg } = await fetchProductosDelVendedor(user.id);
      if (errMsg) {
        setProductos([]);
        setError(errMsg);
        return;
      }
      setProductos(lista);
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
    setFiltroEstadoProductosDraft('todos');
    setFiltroVerticalProductosDraft(verticalReset);
    setFiltroEstadoProductos('todos');
    setFiltroVerticalProductos(verticalReset);
    setCargandoFiltrosProductos(true);
    setError(null);
    try {
      const { productos: lista, error: errMsg } = await fetchProductosDelVendedor(user.id);
      if (errMsg) {
        setProductos([]);
        setError(errMsg);
        return;
      }
      setProductos(lista);
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

  if (error) {
    return (
      <div className="mis-productos">
        <p className="mis-productos-mensaje mis-productos-error">{error}</p>
      </div>
    );
  }

  if (productos.length === 0) {
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
              Escribe el nombre o código: la lista se filtra al instante. Acepta plural/singular y errores
              leves (ej. camaras → camara). Pulsa <strong>Aplicar filtros</strong> (o Intro) para recargar
              el catálogo desde el servidor. Para fotos masivas usa el menú <strong>Gestión de fotos</strong>.
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
            disabled={cargandoFiltrosProductos || cargando}
            onClick={() => void aplicarFiltrosMisProductos()}
          >
            {cargandoFiltrosProductos ? 'Cargando catálogo…' : 'Aplicar filtros'}
          </button>
          <button
            type="button"
            className="mis-productos-btn-secundario"
            disabled={cargandoFiltrosProductos || cargando}
            onClick={() => void restablecerFiltrosMisProductos()}
          >
            Restablecer filtros
          </button>
        </div>
        <p className="mis-productos-filtros-resumen" role="status">
          {busquedaProductosInput.trim()
            ? `Búsqueda «${busquedaProductosInput.trim()}»: ${productosVisibles.length} de ${productos.length} producto(s).`
            : `Mostrando ${productosVisibles.length} de ${productos.length} producto(s) cargados.`}
        </p>
      </section>
      <section className="mis-productos-acciones-masivas" aria-label="Acciones masivas sobre productos">
        <p className="mis-productos-ajuste-masivo-titulo">Acciones sobre productos filtrados</p>
        <p className="mis-productos-ajuste-masivo-descripcion">
          Elige el alcance y la acción, luego pulsa <strong>Ejecutar</strong>. Puedes aplicar a todos los
          filtrados o marcar productos uno a uno (alcance &quot;Solo seleccionados&quot;).
        </p>
        <div className="mis-productos-acciones-masivas-grid">
          <label>
            Alcance
            <select
              value={accionMasivaAlcance}
              onChange={(e) => setAccionMasivaAlcance(e.target.value as AlcanceAccionMasiva)}
              disabled={ejecutandoAccionMasiva}
            >
              <option value="filtrados">Todos los filtrados ({productosVisibles.length})</option>
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
              {busquedaProductosInput.trim()
                ? `No hay productos que coincidan con «${busquedaProductosInput.trim()}». Prueba otra palabra o revisa el nombre en el catálogo.`
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
    </div>
  );
}

