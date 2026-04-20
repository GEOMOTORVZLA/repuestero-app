import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import './MisProductos.css';
import { EditarProducto, type ProductoEditable } from './EditarProducto';
import { urlImagenProductoVariante } from '../utils/imagenProducto';
import { etiquetaMoneda } from '../utils/monedaProducto';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';

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
}

interface MisProductosProps {
  refreshTrigger?: number;
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

export function MisProductos({ refreshTrigger = 0 }: MisProductosProps) {
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

  useEffect(() => {
    let cancelado = false;

    const cargar = async () => {
      if (!user) return;
      if (!cancelado) {
        setCargando(true);
        setError(null);
      }

      try {
        // Primero buscamos las tiendas asociadas a este usuario.
        const { data: tiendas, error: errTiendas } = await withRetry(() =>
          supabase.from('tiendas').select('id').eq('user_id', user.id)
        );

        if (errTiendas) {
          throw new Error(errTiendas.message || 'Error al cargar tus tiendas.');
        }

        if (!tiendas || tiendas.length === 0) {
          if (!cancelado) setProductos([]);
          return;
        }

        const tiendaIds = tiendas.map((t) => t.id);

        const { data: productosData, error: errProd } = await withRetry(() =>
          supabase
            .from('productos')
            .select(
              'id, nombre, descripcion, comentarios, categoria, marca, modelo, anio, precio_usd, moneda, imagen_url, imagenes_extra, activo, aprobacion_publica, created_at, stock_confirmado_at, pausado_por_stock_vencido, vertical'
            )
            .in('tienda_id', tiendaIds)
            .order('nombre')
        );

        if (errProd) {
          throw new Error(errProd.message || 'Error al cargar tus productos.');
        }

        if (!cancelado) {
          setProductos((productosData ?? []) as ProductoPanel[]);
        }
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

  if (!user) {
    return null;
  }

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
        'Los precios se redondearán a entero.'
    );
    if (!confirmar) return;

    setAjustandoPrecios(true);
    setMensajeAjuste(null);
    setError(null);
    try {
      const actualizados: { id: string; precio_usd: number }[] = productos.map((p) => {
        const base = Number(p.precio_usd) || 0;
        const siguiente = Math.max(1, Math.round(base * (1 + porcentaje / 100)));
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
          Se redondea a entero y nunca baja de 1.
        </p>
        {mensajeAjuste && <p className="mis-productos-ajuste-masivo-mensaje">{mensajeAjuste}</p>}
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
                {Number(productoDetalle.precio_usd).toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
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
        <div className="mis-productos-editor">
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
      )}
      <div className="mis-productos-grid">
        {productos.map((p) => {
          const vehiculo = [p.marca, p.modelo, p.anio].filter(Boolean).join(' · ');
          const estaActivo = p.activo !== false;
          const semaforoStock = semaforoStockProducto(p);
          const mod = (p.aprobacion_publica ?? 'pendiente').toLowerCase();
          const claseMod =
            mod === 'aprobado' ? 'aprobado' : mod === 'rechazado' ? 'rechazado' : 'pendiente';
          return (
            <article
              key={p.id}
              className="mis-productos-card"
              onClick={() => setProductoDetalle(p)}
            >
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
                        {Number(p.precio_usd).toLocaleString(undefined, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <p className="mis-productos-card-desc">
                      {p.descripcion && p.descripcion.length > 0 ? p.descripcion : 'Sin descripción'}
                    </p>
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

