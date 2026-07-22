import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import './MisProductos.css';
import { EditarProducto, type ProductoEditable } from './EditarProducto';
import {
  MAX_BYTES_FOTO_PRODUCTO,
  MAX_MB_FOTO_PRODUCTO,
  optimizarImagenProductoParaStorage,
  urlImagenProductoVariante,
} from '../utils/imagenProducto';
import { etiquetaMoneda } from '../utils/monedaProducto';
import { formatearPrecioProducto } from '../utils/precioProducto';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import {
  DISPONIBILIDAD_AVISO_OPCIONES,
  etiquetaDisponibilidadAviso,
  type DisponibilidadAviso,
} from '../utils/avisoProductoPublicacion';

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

const PRODUCTOS_VENDEDOR_SELECT =
  'id, nombre, descripcion, comentarios, categoria, marca, modelo, anio, precio_usd, moneda, imagen_url, imagenes_extra, activo, aprobacion_publica, created_at, stock_confirmado_at, pausado_por_stock_vencido, vertical, disponibilidad_aviso, es_oferta';

const PRODUCTOS_VENDEDOR_PAGE = 1000;

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

  while (true) {
    const { data: productosData, error: errProd } = await withRetry(() =>
      supabase
        .from('productos')
        .select(PRODUCTOS_VENDEDOR_SELECT)
        .in('tienda_id', tiendaIds)
        .order('nombre')
        .range(from, from + PRODUCTOS_VENDEDOR_PAGE - 1)
    );

    if (errProd) {
      return { productos: [], error: errProd.message || 'Error al cargar tus productos.' };
    }

    const batch = (productosData ?? []) as ProductoPanel[];
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
  const [ajustandoPrecios, setAjustandoPrecios] = useState(false);
  const [mensajeAjuste, setMensajeAjuste] = useState<string | null>(null);
  const [productoEditando, setProductoEditando] = useState<ProductoPanel | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [productoAEliminar, setProductoAEliminar] = useState<ProductoPanel | null>(null);
  const [productoDetalle, setProductoDetalle] = useState<ProductoPanel | null>(null);
  const [fotoDetalleActiva, setFotoDetalleActiva] = useState<string | null>(null);
  const [contactosDetalle, setContactosDetalle] = useState<number | null>(null);
  const [cargandoContactos, setCargandoContactos] = useState(false);
  const [fotosMasivasAlcance, setFotosMasivasAlcance] = useState<'sin_foto' | 'todos' | 'seleccionados'>('sin_foto');
  /** Alcance aplicado a la lista de tarjetas (tras pulsar «Buscar»). null = sin filtrar por alcance. */
  const [filtroAlcanceListaAplicado, setFiltroAlcanceListaAplicado] = useState<
    'sin_foto' | 'todos' | 'seleccionados' | null
  >(null);
  const [fotosMasivasArchivos, setFotosMasivasArchivos] = useState<(File | null)[]>([null, null, null, null]);
  const [fotosMasivasInputKey, setFotosMasivasInputKey] = useState(0);
  const [fotosMasivasSeleccionados, setFotosMasivasSeleccionados] = useState<string[]>([]);
  const [aplicandoFotosMasivas, setAplicandoFotosMasivas] = useState(false);
  const [mensajeFotosMasivas, setMensajeFotosMasivas] = useState<string | null>(null);
  const [etiquetandoId, setEtiquetandoId] = useState<string | null>(null);
  /** Texto de búsqueda en el control (borrador). */
  const [busquedaProductosInput, setBusquedaProductosInput] = useState('');
  /** Filtros aplicados al listado (tras «Aplicar filtros»). */
  const [busquedaProductos, setBusquedaProductos] = useState('');
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

  const productoCoincideBusqueda = (p: ProductoPanel, texto: string) => {
    const q = texto.trim().toLocaleLowerCase('es');
    if (!q) return true;
    const terminos = q.split(/\s+/).filter(Boolean);
    const fuente = [
      p.nombre,
      p.descripcion,
      p.comentarios,
      p.categoria,
      p.marca,
      p.modelo,
      p.anio != null ? String(p.anio) : '',
      p.precio_usd != null ? String(p.precio_usd) : '',
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('es');
    return terminos.every((t) => fuente.includes(t));
  };

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

  const productosVisibles = useMemo(
    () =>
      productos.filter((p) => {
        const vertOk =
          filtroVerticalProductos === 'todos' || (p.vertical ?? 'auto') === filtroVerticalProductos;
        return (
          vertOk &&
          productoCoincideBusqueda(p, busquedaProductos) &&
          productoCoincideEstado(p, filtroEstadoProductos)
        );
      }),
    [productos, busquedaProductos, filtroEstadoProductos, filtroVerticalProductos]
  );

  if (!user) {
    return null;
  }

  const aplicarFiltrosMisProductos = async () => {
    if (!user) return;
    setBusquedaProductos(busquedaProductosInput.trim());
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
    setBusquedaProductos('');
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

  const productosObjetivoFotosMasivas =
    fotosMasivasAlcance === 'seleccionados'
      ? productosVisibles.filter((p) => fotosMasivasSeleccionados.includes(p.id))
      : productosVisibles.filter((p) => {
          if (fotosMasivasAlcance === 'sin_foto') {
            return !p.imagen_url || !String(p.imagen_url).trim();
          }
          return true;
        });

  /** Lista de tarjetas: mismos filtros generales + alcance solo tras «Buscar» (no altera la carga masiva). */
  const productosParaLista = useMemo(() => {
    if (!filtroAlcanceListaAplicado) return productosVisibles;
    if (filtroAlcanceListaAplicado === 'seleccionados') {
      return productosVisibles.filter((p) => fotosMasivasSeleccionados.includes(p.id));
    }
    if (filtroAlcanceListaAplicado === 'sin_foto') {
      return productosVisibles.filter((p) => !p.imagen_url || !String(p.imagen_url).trim());
    }
    return productosVisibles;
  }, [productosVisibles, filtroAlcanceListaAplicado, fotosMasivasSeleccionados]);

  const buscarProductosPorAlcance = () => {
    setFiltroAlcanceListaAplicado(fotosMasivasAlcance);
    setMensajeFotosMasivas(null);
    if (fotosMasivasAlcance === 'seleccionados' && fotosMasivasSeleccionados.length === 0) {
      setMensajeFotosMasivas(
        'No hay productos seleccionados. Márcalos en la lista o elige otro alcance y pulsa Buscar.'
      );
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

  const cambiarFotoMasiva = (idx: number, file: File | null) => {
    setMensajeFotosMasivas(null);
    setFotosMasivasArchivos((prev) => prev.map((f, i) => (i === idx ? file : f)));
  };

  const resetearFotosMasivas = () => {
    setFotosMasivasArchivos([null, null, null, null]);
    setFotosMasivasInputKey((prev) => prev + 1);
    setMensajeFotosMasivas('Fotos reseteadas. Ya puedes cargar nuevas imágenes.');
  };

  const toggleProductoFotoMasiva = (productoId: string, checked: boolean) => {
    setMensajeFotosMasivas(null);
    setFotosMasivasSeleccionados((prev) => {
      if (checked) return prev.includes(productoId) ? prev : [...prev, productoId];
      return prev.filter((id) => id !== productoId);
    });
  };

  const seleccionarTodosProductosFotosMasivas = () => {
    setMensajeFotosMasivas(null);
    setFotosMasivasSeleccionados(productosVisibles.map((p) => p.id));
  };

  const limpiarSeleccionFotosMasivas = () => {
    setMensajeFotosMasivas(null);
    setFotosMasivasSeleccionados([]);
  };

  const aplicarFotosMasivas = async () => {
    setMensajeFotosMasivas(null);
    setError(null);
    const fotoPrincipal = fotosMasivasArchivos[0];
    const objetivos = productosObjetivoFotosMasivas;

    if (!fotoPrincipal) {
      setMensajeFotosMasivas('Sube al menos la foto 1 (principal).');
      return;
    }
    if (!objetivos.length) {
      setMensajeFotosMasivas('No hay productos para actualizar con el alcance elegido.');
      return;
    }
    if (
      !window.confirm(
        `¿Aplicar estas fotos a ${objetivos.length} producto(s)?\n\n` +
          'La foto 1 será principal y las demás quedarán como fotos adicionales. Esta acción reemplaza las fotos actuales de esos productos.'
      )
    ) {
      return;
    }

    setAplicandoFotosMasivas(true);
    try {
      const bucket = supabase.storage.from('productos');
      const urls: string[] = [];
      const lote = `${Date.now()}`;

      for (let i = 0; i < fotosMasivasArchivos.length; i += 1) {
        const raw = fotosMasivasArchivos[i];
        if (!raw) continue;
        const lista = await optimizarImagenProductoParaStorage(raw, {
          maxBytes: MAX_BYTES_FOTO_PRODUCTO,
        });
        if (lista.size > MAX_BYTES_FOTO_PRODUCTO) {
          throw new Error(`La foto ${i + 1} no debe superar ${MAX_MB_FOTO_PRODUCTO} MB.`);
        }
        const ext = lista.name.split('.').pop() || 'jpg';
        const path = `fotos-masivas-vendedor/${user.id}/${lote}/foto-${i + 1}.${ext}`;
        const { error: upErr } = await bucket.upload(path, lista, { upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = bucket.getPublicUrl(path);
        urls[i] = pub.publicUrl;
      }

      const imagenUrl = urls[0];
      const extras = urls.slice(1).filter((u): u is string => typeof u === 'string' && Boolean(u));
      const ids = objetivos.map((p) => p.id);

      for (const id of ids) {
        const { error: updErr } = await supabase
          .from('productos')
          .update({
            imagen_url: imagenUrl,
            imagenes_extra: extras.length ? extras : null,
          })
          .eq('id', id);
        if (updErr) throw updErr;
      }

      setProductos((prev) =>
        prev.map((p) =>
          ids.includes(p.id)
            ? { ...p, imagen_url: imagenUrl, imagenes_extra: extras.length ? extras : null }
            : p
        )
      );
      setProductoDetalle((prev) =>
        prev && ids.includes(prev.id)
          ? { ...prev, imagen_url: imagenUrl, imagenes_extra: extras.length ? extras : null }
          : prev
      );
      setMensajeFotosMasivas(`Fotos aplicadas a ${ids.length} producto(s).`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudieron aplicar las fotos masivas.';
      setMensajeFotosMasivas(msg);
      setError(msg);
    } finally {
      setAplicandoFotosMasivas(false);
    }
  };

  const aplicarAjusteMasivoPrecios = async () => {
    const porcentaje = Number.parseFloat(ajustePorcentaje.replace(',', '.'));
    if (!Number.isFinite(porcentaje)) {
      setMensajeAjuste('Escribe un porcentaje válido. Ejemplo: 10 o -5.');
      return;
    }
    if (porcentaje === 0) {
      setMensajeAjuste('El porcentaje no puede ser 0.');
      return;
    }
    if (!productos.length) {
      setMensajeAjuste('No hay productos para ajustar.');
      return;
    }

    const confirmar = window.confirm(
      `Se ajustarán ${productos.length} producto(s) con ${porcentaje > 0 ? '+' : ''}${porcentaje}%.\n` +
        'Los precios se redondearán a 2 decimales.'
    );
    if (!confirmar) return;

    setAjustandoPrecios(true);
    setMensajeAjuste(null);
    setError(null);
    try {
      const actualizados: { id: string; precio_usd: number }[] = productos.map((p) => {
        const base = Number(p.precio_usd) || 0;
        const siguiente = Math.max(0.01, Math.round(base * (1 + porcentaje / 100) * 100) / 100);
        return { id: p.id, precio_usd: siguiente };
      });

      for (const upd of actualizados) {
        const { error: errUpd } = await supabase
          .from('productos')
          .update({ precio_usd: upd.precio_usd })
          .eq('id', upd.id);
        if (errUpd) throw errUpd;
      }

      setProductos((prev) =>
        prev.map((p) => {
          const next = actualizados.find((u) => u.id === p.id);
          return next ? { ...p, precio_usd: next.precio_usd } : p;
        })
      );
      setProductoDetalle((prev) => {
        if (!prev) return prev;
        const next = actualizados.find((u) => u.id === prev.id);
        return next ? { ...prev, precio_usd: next.precio_usd } : prev;
      });
      setMensajeAjuste(
        `Ajuste aplicado a ${actualizados.length} producto(s) con ${porcentaje > 0 ? '+' : ''}${porcentaje}%.`
      );
      setAjustePorcentaje('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo aplicar el ajuste masivo.';
      setError(msg);
      setMensajeAjuste('No se pudo completar el ajuste de precios.');
    } finally {
      setAjustandoPrecios(false);
    }
  };

  const alertaStock = (
    <div className="mis-productos-alerta-stock" role="status">
      <strong>Control de inventario:</strong> todo producto con más de 20 días sin actualización de stock
      será pausado automáticamente y dejará de verse en búsquedas públicas hasta que lo reactives.
    </div>
  );

  if (cargando) {
    return (
      <div className="mis-productos">
        {alertaStock}
        <p className="mis-productos-mensaje">Cargando tus productos…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mis-productos">
        {alertaStock}
        <p className="mis-productos-mensaje mis-productos-error">{error}</p>
      </div>
    );
  }

  if (productos.length === 0) {
    return (
      <div className="mis-productos">
        {alertaStock}
        <p className="mis-productos-mensaje">
          Aún no tienes productos registrados. Usa el botón &quot;Vender nuevo producto&quot; para crear tu
          primera publicación.
        </p>
      </div>
    );
  }

  return (
    <div className="mis-productos">
      {alertaStock}
      <section className="mis-productos-filtros" aria-label="Buscar y filtrar productos">
        <div>
          <p className="mis-productos-ajuste-masivo-titulo">Buscar y filtrar mis productos</p>
          <p className="mis-productos-ajuste-masivo-descripcion">
            Elige criterios y pulsa <strong>Aplicar filtros</strong> para actualizar el listado (también puedes pulsar
            Intro en la búsqueda). Así se vuelven a cargar todos tus artículos desde el servidor y se evita el límite
            por defecto de mil filas.
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
              onChange={(e) => setBusquedaProductosInput(e.target.value)}
              placeholder="Ej: amortiguador x1, batería, Cherokee..."
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
        <p className="mis-productos-filtros-resumen">
          Mostrando {productosVisibles.length} de {productos.length} producto(s) cargados que coinciden con los
          filtros aplicados.
        </p>
      </section>
      <section className="mis-productos-ajuste-masivo" aria-label="Ajuste masivo de precios">
        <p className="mis-productos-ajuste-masivo-titulo">Ajuste masivo de precios</p>
        <p className="mis-productos-ajuste-masivo-descripcion">
          Puedes ajustar tus precios de manera masiva con esta opción colocando los porcentajes que
          deseas ajustar, positivos para aumentos y negativos para disminuciones.
        </p>
        <div className="mis-productos-ajuste-masivo-fila">
          <input
            type="text"
            inputMode="decimal"
            value={ajustePorcentaje}
            onChange={(e) => setAjustePorcentaje(e.target.value)}
            placeholder="Ej: 10 o -5"
            className="mis-productos-ajuste-masivo-input"
            disabled={ajustandoPrecios}
            aria-label="Porcentaje de ajuste"
          />
          <button
            type="button"
            className="mis-productos-btn-primario mis-productos-ajuste-masivo-btn"
            onClick={() => void aplicarAjusteMasivoPrecios()}
            disabled={ajustandoPrecios}
          >
            {ajustandoPrecios ? 'Ajustando…' : 'Aplicar ajuste'}
          </button>
        </div>
        <p className="mis-productos-ajuste-masivo-ayuda">
          Se redondea a 2 decimales y nunca baja de 0.01.
        </p>
        {mensajeAjuste && <p className="mis-productos-ajuste-masivo-mensaje">{mensajeAjuste}</p>}
      </section>
      <section className="mis-productos-fotos-masivas" aria-label="Carga masiva de fotos">
        <div className="mis-productos-fotos-masivas-header">
          <div>
            <p className="mis-productos-ajuste-masivo-titulo">Carga masiva de fotos</p>
            <p className="mis-productos-ajuste-masivo-descripcion">
              Sube hasta 4 fotos comunes para aplicarlas a varios productos. La foto 1 será la principal.
            </p>
          </div>
          <span className="mis-productos-fotos-masivas-contador">
            Productos objetivo: {productosObjetivoFotosMasivas.length}
          </span>
        </div>
        <div className="mis-productos-fotos-masivas-config">
          <label>
            Alcance
            <span className="mis-productos-fotos-masivas-alcance-fila">
              <select
                value={fotosMasivasAlcance}
                onChange={(e) => {
                  setFotosMasivasAlcance(e.target.value as 'sin_foto' | 'todos' | 'seleccionados');
                  setMensajeFotosMasivas(null);
                }}
                disabled={aplicandoFotosMasivas}
              >
                <option value="sin_foto">Solo productos sin foto principal</option>
                <option value="todos">Todos mis productos</option>
                <option value="seleccionados">Solo productos seleccionados manualmente</option>
              </select>
              <button
                type="button"
                className="mis-productos-btn-secundario mis-productos-fotos-masivas-buscar"
                onClick={buscarProductosPorAlcance}
                disabled={aplicandoFotosMasivas}
              >
                Buscar
              </button>
            </span>
          </label>
          {filtroAlcanceListaAplicado && (
            <p className="mis-productos-fotos-masivas-lista-filtro" role="status">
              Lista filtrada por alcance: mostrando {productosParaLista.length} producto(s).
              {filtroAlcanceListaAplicado === 'sin_foto' && ' (sin foto principal)'}
              {filtroAlcanceListaAplicado === 'seleccionados' && ' (seleccionados)'}
              {filtroAlcanceListaAplicado === 'todos' && ' (todos los visibles)'}
            </p>
          )}
        </div>
        {fotosMasivasAlcance === 'seleccionados' && (
          <div className="mis-productos-fotos-masivas-seleccion">
            <p>
              Seleccionados: {productosObjetivoFotosMasivas.length}. Marca los productos en la lista inferior.
            </p>
            <div className="mis-productos-fotos-masivas-acciones">
              <button type="button" className="mis-productos-btn-secundario" onClick={seleccionarTodosProductosFotosMasivas}>
                Seleccionar visibles ({productosVisibles.length})
              </button>
              <button
                type="button"
                className="mis-productos-btn-secundario"
                onClick={limpiarSeleccionFotosMasivas}
                disabled={fotosMasivasSeleccionados.length === 0}
              >
                Limpiar selección
              </button>
            </div>
          </div>
        )}
        <div className="mis-productos-fotos-masivas-files">
          {fotosMasivasArchivos.map((archivo, idx) => (
            <label key={`${fotosMasivasInputKey}-${idx}`}>
              Foto {idx + 1}{idx === 0 ? ' (principal)' : ''}
              <input
                type="file"
                accept="image/*"
                disabled={aplicandoFotosMasivas}
                onChange={(e) => cambiarFotoMasiva(idx, e.target.files?.[0] ?? null)}
              />
              {archivo && <span>{archivo.name}</span>}
            </label>
          ))}
        </div>
        <div className="mis-productos-fotos-masivas-acciones">
          <button
            type="button"
            className="mis-productos-btn-secundario"
            disabled={aplicandoFotosMasivas || fotosMasivasArchivos.every((archivo) => !archivo)}
            onClick={resetearFotosMasivas}
          >
            Resetear fotos
          </button>
          <button
            type="button"
            className="mis-productos-btn-primario"
            disabled={
              aplicandoFotosMasivas ||
              !fotosMasivasArchivos[0] ||
              productosObjetivoFotosMasivas.length === 0
            }
            onClick={() => void aplicarFotosMasivas()}
          >
            {aplicandoFotosMasivas
              ? 'Aplicando fotos...'
              : `Aplicar fotos a ${productosObjetivoFotosMasivas.length} producto(s)`}
          </button>
        </div>
        {mensajeFotosMasivas && (
          <p className="mis-productos-ajuste-masivo-mensaje">{mensajeFotosMasivas}</p>
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
                          <img
                            src={urlImagenProductoVariante(url, 'miniatura') ?? url}
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
        {productosParaLista.length === 0 ? (
          <p className="mis-productos-mensaje">
            {productosVisibles.length === 0
              ? 'No hay productos que coincidan con la búsqueda o el filtro seleccionado.'
              : 'No hay productos que coincidan con el alcance elegido. Prueba otro alcance y pulsa Buscar.'}
          </p>
        ) : productosParaLista.map((p) => {
          const vehiculo = [p.marca, p.modelo, p.anio].filter(Boolean).join(' · ');
          const estaActivo = p.activo !== false;
          const semaforoStock = semaforoStockProducto(p);
          const mod = (p.aprobacion_publica ?? 'aprobado').toLowerCase();
          const seleccionadoFotosMasivas = fotosMasivasSeleccionados.includes(p.id);
          const claseMod =
            mod === 'aprobado' ? 'aprobado' : mod === 'rechazado' ? 'rechazado' : 'pendiente';
          return (
            <article
              key={p.id}
              className={`mis-productos-card${
                fotosMasivasAlcance === 'seleccionados' && seleccionadoFotosMasivas
                  ? ' mis-productos-card--seleccionada'
                  : ''
              }`}
              onClick={() => setProductoDetalle(p)}
            >
              {fotosMasivasAlcance === 'seleccionados' && (
                <label
                  className="mis-productos-card-selector"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={seleccionadoFotosMasivas}
                    onChange={(e) => toggleProductoFotoMasiva(p.id, e.target.checked)}
                    disabled={aplicandoFotosMasivas}
                  />
                  Seleccionar
                </label>
              )}
              <div className="mis-productos-card-foto">
                {p.imagen_url ? (
                  <img
                    src={urlImagenProductoVariante(p.imagen_url, 'tarjeta') ?? p.imagen_url}
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
        })}
      </div>
    </div>
  );
}

