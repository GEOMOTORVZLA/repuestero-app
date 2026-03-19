import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import './MisProductos.css';
import { EditarProducto, type ProductoEditable } from './EditarProducto';

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
  imagenes_extra?: string[] | null;
  activo?: boolean | null;
}

interface MisProductosProps {
  refreshTrigger?: number;
}

export function MisProductos({ refreshTrigger = 0 }: MisProductosProps) {
  const { user } = useAuth();
  const [productos, setProductos] = useState<ProductoPanel[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productoEditando, setProductoEditando] = useState<ProductoPanel | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [productoAEliminar, setProductoAEliminar] = useState<ProductoPanel | null>(null);
  const [productoDetalle, setProductoDetalle] = useState<ProductoPanel | null>(null);
  const [fotoDetalleActiva, setFotoDetalleActiva] = useState<string | null>(null);
  const [contactosDetalle, setContactosDetalle] = useState<number | null>(null);
  const [cargandoContactos, setCargandoContactos] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      if (!user) return;
      setCargando(true);
      setError(null);

      // Primero buscamos las tiendas asociadas a este usuario
      const { data: tiendas, error: errTiendas } = await supabase
        .from('tiendas')
        .select('id')
        .eq('user_id', user.id);

      if (errTiendas) {
        setError(errTiendas.message || 'Error al cargar tus tiendas.');
        setCargando(false);
        return;
      }

      if (!tiendas || tiendas.length === 0) {
        setProductos([]);
        setCargando(false);
        return;
      }

      const tiendaIds = tiendas.map((t) => t.id);

      const { data: productosData, error: errProd } = await supabase
        .from('productos')
        .select(
          'id, nombre, descripcion, comentarios, categoria, marca, modelo, anio, precio_usd, moneda, imagen_url, imagenes_extra, activo'
        )
        .in('tienda_id', tiendaIds)
        .order('nombre');

      if (errProd) {
        setError(errProd.message || 'Error al cargar tus productos.');
        setProductos([]);
        setCargando(false);
        return;
      }

      setProductos((productosData ?? []) as ProductoPanel[]);
      setCargando(false);
    };

    cargar();
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
      setFotoDetalleActiva(
        productoDetalle.imagen_url ??
          (productoDetalle.imagenes_extra && productoDetalle.imagenes_extra[0]) ??
          null
      );
      cargarContactos();
    } else {
      setFotoDetalleActiva(null);
    }
  }, [productoDetalle, user]);

  if (!user) {
    return null;
  }

  if (cargando) {
    return <p className="mis-productos-mensaje">Cargando tus productos…</p>;
  }

  if (error) {
    return <p className="mis-productos-mensaje mis-productos-error">{error}</p>;
  }

  if (productos.length === 0) {
    return (
      <p className="mis-productos-mensaje">
        Aún no tienes productos registrados. Usa el botón &quot;Vender nuevo producto&quot; para crear tu
        primera publicación.
      </p>
    );
  }

  return (
    <div className="mis-productos">
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
                  <img src={fotoDetalleActiva} alt={productoDetalle.nombre} />
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
                        <img src={url} alt="Foto del producto" />
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
                {productoDetalle.moneda === 'BS' ? 'Bs' : 'USD'}{' '}
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
          return (
            <article
              key={p.id}
              className="mis-productos-card"
              onClick={() => setProductoDetalle(p)}
            >
              <div className="mis-productos-card-foto">
                {p.imagen_url ? (
                  <img src={p.imagen_url} alt={p.nombre} />
                ) : (
                  <div className="mis-productos-card-foto-placeholder">Sin foto</div>
                )}
              </div>
              <div className="mis-productos-card-cuerpo">
                <div className="mis-productos-card-info">
                  <h3 className="mis-productos-card-nombre">{p.nombre}</h3>
                  <p
                    className={`mis-productos-card-status ${
                      estaActivo ? 'activo' : 'pausado'
                    }`}
                  >
                    {estaActivo ? 'PRODUCTO ACTIVO' : 'PRODUCTO PAUSADO'}
                  </p>
                  <p className="mis-productos-card-vehiculo">{vehiculo || 'Vehículo no especificado'}</p>
                  <p className="mis-productos-card-precio">
                    {p.moneda === 'BS' ? 'Bs' : 'USD'}{' '}
                    {Number(p.precio_usd).toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="mis-productos-card-desc">
                    {p.descripcion && p.descripcion.length > 0 ? p.descripcion : 'Sin descripción'}
                  </p>
                </div>
                <div className="mis-productos-card-acciones">
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
                  >
                    Pausar venta
                  </button>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const { error: err } = await supabase
                        .from('productos')
                        .update({ activo: true })
                        .eq('id', p.id);
                      if (err) {
                        setError(err.message || 'Error al activar el producto.');
                        return;
                      }
                      setProductos((prev) =>
                        prev.map((x) => (x.id === p.id ? { ...x, activo: true } : x))
                      );
                    }}
                    className="mis-productos-btn-activar"
                    disabled={estaActivo}
                  >
                    Activar producto
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProductoEditando(p);
                    }}
                    className="mis-productos-btn-primario"
                  >
                    Editar producto
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProductoAEliminar(p);
                    }}
                    className="mis-productos-btn-eliminar"
                    disabled={eliminandoId === p.id}
                  >
                    {eliminandoId === p.id ? 'Eliminando…' : 'Eliminar producto'}
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

