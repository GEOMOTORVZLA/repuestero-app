import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { ImagenProducto } from './ImagenProducto';
import {
  EditorFotosProductoModal,
  type ProductoFotosEditable,
} from './EditorFotosProductoModal';
import {
  MAX_BYTES_FOTO_PRODUCTO,
  MAX_MB_FOTO_PRODUCTO,
  optimizarImagenProductoParaStorage,
  subirImagenProductoConMiniatura,
} from '../utils/imagenProducto';
import { productoCoincideTextoFlexible } from '../utils/busquedaProductosTexto';
import './Dashboard.css';
import './MisProductos.css';

type AlcanceFotos = 'sin_foto' | 'todos' | 'seleccionados';

type VendedorOpcion = {
  id: string;
  nombre: string | null;
  nombre_comercial: string | null;
};

type ProductoFotoAdmin = {
  id: string;
  nombre: string;
  codigo?: string | null;
  imagen_url?: string | null;
  imagenes_extra?: (string | null)[] | string[] | null;
  tienda_id?: string | null;
};

type GestionFotosAdminProps = {
  vendedores: VendedorOpcion[];
  /** Tras aplicar fotos, el panel puede refrescar el catálogo de Productos. */
  onFotosAplicadas?: () => void;
};

const SELECT_CON_CODIGO = 'id, nombre, codigo, imagen_url, imagenes_extra, tienda_id';
const SELECT_SIN_CODIGO = 'id, nombre, imagen_url, imagenes_extra, tienda_id';
const PAGE = 1000;

function errorPorColumnaCodigo(msg: string | undefined): boolean {
  const m = (msg ?? '').toLowerCase();
  return m.includes('codigo') && (m.includes('does not exist') || m.includes('column'));
}

async function fetchProductosDeTienda(
  tiendaId: string
): Promise<{ productos: ProductoFotoAdmin[]; error: string | null }> {
  const acumulado: ProductoFotoAdmin[] = [];
  let from = 0;
  let selectCols = SELECT_CON_CODIGO;

  while (true) {
    const { data, error } = await supabase
      .from('productos')
      .select(selectCols)
      .eq('tienda_id', tiendaId)
      .order('nombre')
      .range(from, from + PAGE - 1);
    if (error) {
      if (selectCols === SELECT_CON_CODIGO && errorPorColumnaCodigo(error.message)) {
        selectCols = SELECT_SIN_CODIGO;
        from = 0;
        acumulado.length = 0;
        continue;
      }
      return { productos: [], error: error.message || 'Error al cargar productos.' };
    }
    const batch = (data ?? []) as unknown as ProductoFotoAdmin[];
    acumulado.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return { productos: acumulado, error: null };
}

/**
 * Sección admin independiente: fotos masivas por vendedor.
 * No comparte buscador ni filtros con la pestaña Productos.
 */
export function GestionFotosAdmin({ vendedores, onFotosAplicadas }: GestionFotosAdminProps) {
  const vendedoresOrdenados = useMemo(
    () =>
      [...vendedores].sort((a, b) => {
        const la = (a.nombre_comercial || a.nombre || '').toLocaleLowerCase('es');
        const lb = (b.nombre_comercial || b.nombre || '').toLocaleLowerCase('es');
        return la.localeCompare(lb, 'es');
      }),
    [vendedores]
  );

  const [tiendaId, setTiendaId] = useState('');
  const [productos, setProductos] = useState<ProductoFotoAdmin[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [alcance, setAlcance] = useState<AlcanceFotos>('sin_foto');
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [archivos, setArchivos] = useState<(File | null)[]>([null, null, null, null]);
  const [inputKey, setInputKey] = useState(0);
  const [aplicando, setAplicando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [productoEditando, setProductoEditando] = useState<ProductoFotosEditable | null>(null);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      if (!tiendaId) {
        setProductos([]);
        setCargando(false);
        setError(null);
        return;
      }
      setCargando(true);
      setError(null);
      setSeleccionados([]);
      setMensaje(null);
      try {
        const { productos: lista, error: errMsg } = await fetchProductosDeTienda(tiendaId);
        if (cancelado) return;
        if (errMsg) {
          setProductos([]);
          setError(errMsg);
          return;
        }
        setProductos(lista);
      } catch (e) {
        if (!cancelado) {
          setProductos([]);
          setError(e instanceof Error ? e.message : 'No se pudieron cargar los productos.');
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [tiendaId]);

  const porBusqueda = useMemo(
    () =>
      productos.filter((p) => productoCoincideTextoFlexible([p.nombre, p.codigo], busqueda)),
    [productos, busqueda]
  );

  const objetivos = useMemo(() => {
    if (alcance === 'seleccionados') {
      return porBusqueda.filter((p) => seleccionados.includes(p.id));
    }
    if (alcance === 'sin_foto') {
      return porBusqueda.filter((p) => !p.imagen_url || !String(p.imagen_url).trim());
    }
    return porBusqueda;
  }, [porBusqueda, alcance, seleccionados]);

  const listaVisible = porBusqueda;

  const etiquetaVendedor =
    vendedoresOrdenados.find((v) => v.id === tiendaId)?.nombre_comercial ||
    vendedoresOrdenados.find((v) => v.id === tiendaId)?.nombre ||
    'este vendedor';

  const toggleSeleccionado = (id: string, checked: boolean) => {
    setSeleccionados((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };

  const aplicarFotos = async () => {
    setMensaje(null);
    setError(null);
    if (!tiendaId) {
      setMensaje('Selecciona un vendedor.');
      return;
    }
    const fotoPrincipal = archivos[0];
    if (!fotoPrincipal) {
      setMensaje('Sube al menos la foto 1 (principal).');
      return;
    }
    if (!objetivos.length) {
      setMensaje('No hay productos objetivo con el alcance y búsqueda actuales.');
      return;
    }
    if (
      !window.confirm(
        `¿Aplicar estas fotos a ${objetivos.length} producto(s) de "${etiquetaVendedor}"?\n\n` +
          'La foto 1 será principal. Se reemplazan las fotos actuales de esos productos.'
      )
    ) {
      return;
    }

    setAplicando(true);
    try {
      const bucket = supabase.storage.from('productos');
      const urls: string[] = [];
      const lote = `${Date.now()}`;

      for (let i = 0; i < archivos.length; i += 1) {
        const raw = archivos[i];
        if (!raw) continue;
        const lista = await optimizarImagenProductoParaStorage(raw, {
          maxBytes: MAX_BYTES_FOTO_PRODUCTO,
        });
        if (lista.size > MAX_BYTES_FOTO_PRODUCTO) {
          throw new Error(`La foto ${i + 1} no debe superar ${MAX_MB_FOTO_PRODUCTO} MB.`);
        }
        const ext = lista.name.split('.').pop() || 'jpg';
        const path = `admin-fotos-masivas/${tiendaId}/${lote}/foto-${i + 1}.${ext}`;
        const subida = await subirImagenProductoConMiniatura(bucket, path, lista);
        urls[i] = subida.urlOriginal;
      }

      const imagenUrl = urls[0];
      const extras = urls.slice(1).filter((u): u is string => typeof u === 'string' && Boolean(u));
      const ids = objetivos.map((p) => p.id);
      const { data, error: rpcError } = await supabase.rpc('admin_set_productos_fotos_masivas', {
        p_producto_ids: ids,
        p_imagen_url: imagenUrl,
        p_imagenes_extra: extras.length ? extras : null,
      });
      if (rpcError) throw rpcError;

      const actualizados = typeof data === 'number' ? data : ids.length;
      setProductos((prev) =>
        prev.map((p) =>
          ids.includes(p.id)
            ? { ...p, imagen_url: imagenUrl, imagenes_extra: extras.length ? extras : null }
            : p
        )
      );
      setMensaje(`Fotos aplicadas a ${actualizados} producto(s).`);
      setArchivos([null, null, null, null]);
      setInputKey((k) => k + 1);
      onFotosAplicadas?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudieron aplicar las fotos.';
      setMensaje(msg);
      setError(msg);
    } finally {
      setAplicando(false);
    }
  };

  if (!vendedoresOrdenados.length) {
    return (
      <div className="dashboard-admin-fotos-masivas">
        <p className="dashboard-admin-fotos-masivas-mensaje">
          No hay vendedores cargados. Actualiza el panel e inténtalo de nuevo.
        </p>
      </div>
    );
  }

  return (
    <div className="mis-productos">
      <section className="dashboard-admin-fotos-masivas" aria-label="Gestión de fotos admin">
        <div className="dashboard-admin-fotos-masivas-header">
          <div>
            <h3>Gestión de fotos</h3>
            <p>
              Sección solo para fotos. Elige vendedor, busca por nombre o código, define el alcance y
              aplica hasta 4 fotos. No afecta filtros de la pestaña Productos.
            </p>
          </div>
          <span className="dashboard-admin-busqueda-hint">
            Productos objetivo: {tiendaId ? objetivos.length : 0}
          </span>
        </div>

        <div className="dashboard-admin-fotos-masivas-grid">
          <label>
            Vendedor
            <select
              value={tiendaId}
              onChange={(e) => {
                setTiendaId(e.target.value);
                setBusqueda('');
                setAlcance('sin_foto');
                setSeleccionados([]);
                setMensaje(null);
              }}
              disabled={aplicando}
            >
              <option value="">Selecciona vendedor</option>
              {vendedoresOrdenados.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre_comercial || v.nombre || v.id}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="admin-gestion-fotos-busqueda">
            Buscar producto (nombre o código)
            <input
              id="admin-gestion-fotos-busqueda"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Ej: camara, amortiguadores…"
              disabled={aplicando || !tiendaId || cargando}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Alcance
            <select
              value={alcance}
              onChange={(e) => {
                setAlcance(e.target.value as AlcanceFotos);
                setMensaje(null);
              }}
              disabled={aplicando || !tiendaId}
            >
              <option value="sin_foto">Solo sin foto principal</option>
              <option value="todos">Todos los de la búsqueda</option>
              <option value="seleccionados">Solo seleccionados manualmente</option>
            </select>
          </label>
        </div>

        <p className="dashboard-admin-fotos-masivas-mensaje" role="status">
          {!tiendaId
            ? 'Selecciona un vendedor para cargar sus productos.'
            : cargando
              ? 'Cargando productos del vendedor…'
              : busqueda.trim()
                ? `Búsqueda «${busqueda.trim()}»: ${porBusqueda.length} de ${productos.length}. Alcance → ${objetivos.length} objetivo(s)${
                    alcance === 'sin_foto' && porBusqueda.length > 0 && objetivos.length === 0
                      ? '. Todos ya tienen foto; cambia a «Todos» para reemplazarlas.'
                      : '.'
                  }`
                : `Catálogo del vendedor: ${productos.length} producto(s). Alcance → ${objetivos.length} objetivo(s).`}
        </p>

        {error && <p className="dashboard-admin-error">{error}</p>}

        {alcance === 'seleccionados' && tiendaId && (
          <div className="dashboard-admin-fotos-masivas-seleccion">
            <p>Seleccionados: {seleccionados.length}. Márcalos en la lista.</p>
            <div className="dashboard-admin-acciones-masivas">
              <button
                type="button"
                className="dashboard-admin-btn"
                disabled={aplicando || !porBusqueda.length}
                onClick={() => setSeleccionados(porBusqueda.map((p) => p.id))}
              >
                Seleccionar visibles ({porBusqueda.length})
              </button>
              <button
                type="button"
                className="dashboard-admin-btn warn"
                disabled={aplicando || seleccionados.length === 0}
                onClick={() => setSeleccionados([])}
              >
                Limpiar selección
              </button>
            </div>
          </div>
        )}

        <div className="dashboard-admin-fotos-masivas-files">
          {archivos.map((archivo, idx) => (
            <label key={`${inputKey}-${idx}`}>
              Foto {idx + 1}
              {idx === 0 ? ' (principal)' : ''}
              <input
                type="file"
                accept="image/*"
                disabled={aplicando || !tiendaId}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setArchivos((prev) => {
                    const next = [...prev];
                    next[idx] = file;
                    return next;
                  });
                }}
              />
              {archivo && <span>{archivo.name}</span>}
            </label>
          ))}
        </div>

        <div className="dashboard-admin-acciones-masivas">
          <button
            type="button"
            className="dashboard-admin-btn"
            disabled={aplicando || archivos.every((a) => !a)}
            onClick={() => {
              setArchivos([null, null, null, null]);
              setInputKey((k) => k + 1);
              setMensaje(null);
            }}
          >
            Resetear fotos
          </button>
          <button
            type="button"
            className="dashboard-admin-btn ok"
            disabled={aplicando || !tiendaId || !archivos[0] || objetivos.length === 0}
            onClick={() => void aplicarFotos()}
          >
            {aplicando ? 'Aplicando…' : `Aplicar fotos a ${objetivos.length} producto(s)`}
          </button>
        </div>
        {mensaje && <p className="dashboard-admin-fotos-masivas-mensaje">{mensaje}</p>}
      </section>

      {tiendaId && !cargando && (
        <div className="mis-productos-grid gestion-fotos-lista" aria-label="Productos del vendedor para fotos">
          {listaVisible.length === 0 ? (
            <div className="mis-productos-mensaje mis-productos-mensaje--bloque">
              <p>
                {!busqueda.trim()
                  ? 'Escribe en el buscador para filtrar el catálogo del vendedor.'
                  : porBusqueda.length === 0
                    ? `Ningún producto coincide con «${busqueda.trim()}» (nombre o código).`
                    : 'No hay productos para mostrar.'}
              </p>
            </div>
          ) : (
            listaVisible.map((p) => {
              const sel = seleccionados.includes(p.id);
              const esObjetivo = objetivos.some((o) => o.id === p.id);
              const nFotos = [p.imagen_url, ...(Array.isArray(p.imagenes_extra) ? p.imagenes_extra : [])]
                .filter((u) => typeof u === 'string' && u.trim()).length;
              return (
                <article
                  key={p.id}
                  className={`mis-productos-card gestion-fotos-card${
                    alcance === 'seleccionados' && sel ? ' mis-productos-card--seleccionada' : ''
                  }`}
                  onClick={() => setProductoEditando(p)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setProductoEditando(p);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  title="Ver y editar fotos de este producto"
                >
                  {alcance === 'seleccionados' && (
                    <label
                      className="mis-productos-card-selector"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={sel}
                        disabled={aplicando}
                        onChange={(e) => toggleSeleccionado(p.id, e.target.checked)}
                      />
                      Masivo
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
                        sizes="(max-width: 640px) 42vw, 200px"
                      />
                    ) : (
                      <div className="mis-productos-card-foto-placeholder">Sin foto</div>
                    )}
                  </div>
                  <div className="mis-productos-card-cuerpo gestion-fotos-card-cuerpo">
                    <h3 className="mis-productos-card-nombre">{p.nombre}</h3>
                    {p.codigo ? (
                      <p className="mis-productos-card-desc">Código: {p.codigo}</p>
                    ) : null}
                    <p className="mis-productos-card-desc">
                      {nFotos > 0 ? `${nFotos} foto(s)` : 'Sin fotos'}
                      {p.imagen_url && String(p.imagen_url).trim() ? ' · Con principal' : ' · Sin principal'}
                      {esObjetivo ? ' · Objetivo masivo' : ''}
                    </p>
                    <p className="gestion-fotos-card-hint">Toca para ver / editar fotos</p>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {productoEditando && (
        <EditorFotosProductoModal
          producto={productoEditando}
          modoGuardado="admin"
          onClose={() => setProductoEditando(null)}
          onSaved={(actualizado) => {
            setProductos((prev) =>
              prev.map((p) =>
                p.id === actualizado.id
                  ? {
                      ...p,
                      imagen_url: actualizado.imagen_url,
                      imagenes_extra: actualizado.imagenes_extra,
                    }
                  : p
              )
            );
            setProductoEditando(null);
            setMensaje('Fotos del producto actualizadas.');
            onFotosAplicadas?.();
          }}
        />
      )}

    </div>
  );
}
