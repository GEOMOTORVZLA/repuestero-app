import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
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
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import './MisProductos.css';

type AlcanceFotos = 'sin_foto' | 'todos' | 'seleccionados';

type ProductoFoto = {
  id: string;
  nombre: string;
  codigo?: string | null;
  imagen_url?: string | null;
  imagenes_extra?: (string | null)[] | string[] | null;
  vertical?: VerticalVehiculo | null;
  activo?: boolean | null;
};

type GestionFotosVendedorProps = {
  vertical?: VerticalVehiculo;
  refreshTrigger?: number;
};

const SELECT_CON_CODIGO =
  'id, nombre, codigo, imagen_url, imagenes_extra, vertical, activo';
const SELECT_SIN_CODIGO = 'id, nombre, imagen_url, imagenes_extra, vertical, activo';
const PAGE = 1000;

function errorPorColumnaCodigo(msg: string | undefined): boolean {
  const m = (msg ?? '').toLowerCase();
  return m.includes('codigo') && (m.includes('does not exist') || m.includes('column'));
}

async function fetchProductosTiendasUsuario(
  userId: string,
  vertical?: VerticalVehiculo
): Promise<{ productos: ProductoFoto[]; error: string | null }> {
  const { data: tiendas, error: errTiendas } = await supabase
    .from('tiendas')
    .select('id')
    .eq('user_id', userId);

  if (errTiendas) {
    return { productos: [], error: errTiendas.message || 'Error al cargar tus tiendas.' };
  }
  if (!tiendas?.length) {
    return { productos: [], error: null };
  }

  const tiendaIds = tiendas.map((t) => t.id);
  const acumulado: ProductoFoto[] = [];
  let from = 0;
  let selectCols = SELECT_CON_CODIGO;

  while (true) {
    let q = supabase
      .from('productos')
      .select(selectCols)
      .in('tienda_id', tiendaIds)
      .order('nombre')
      .range(from, from + PAGE - 1);
    if (vertical === 'auto' || vertical === 'moto') {
      q = q.eq('vertical', vertical);
    }
    const { data, error } = await q;
    if (error) {
      if (selectCols === SELECT_CON_CODIGO && errorPorColumnaCodigo(error.message)) {
        selectCols = SELECT_SIN_CODIGO;
        from = 0;
        acumulado.length = 0;
        continue;
      }
      return { productos: [], error: error.message || 'Error al cargar productos.' };
    }
    const batch = (data ?? []) as unknown as ProductoFoto[];
    acumulado.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return { productos: acumulado, error: null };
}

/**
 * Sección independiente: solo asignación masiva de fotos.
 * Buscador y alcance propios; no depende de «Editar productos».
 */
export function GestionFotosVendedor({ vertical, refreshTrigger = 0 }: GestionFotosVendedorProps) {
  const { user } = useAuth();
  const [productos, setProductos] = useState<ProductoFoto[]>([]);
  const [cargando, setCargando] = useState(true);
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
      if (!user) return;
      setCargando(true);
      setError(null);
      try {
        const { productos: lista, error: errMsg } = await fetchProductosTiendasUsuario(
          user.id,
          vertical === 'auto' || vertical === 'moto' ? vertical : undefined
        );
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
  }, [user, refreshTrigger, vertical]);

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

  const toggleSeleccionado = (id: string, checked: boolean) => {
    setSeleccionados((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };

  const aplicarFotos = async () => {
    if (!user) return;
    setMensaje(null);
    setError(null);
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
        `¿Aplicar estas fotos a ${objetivos.length} producto(s)?\n\n` +
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
        const path = `fotos-masivas-vendedor/${user.id}/${lote}/foto-${i + 1}.${ext}`;
        const subida = await subirImagenProductoConMiniatura(bucket, path, lista);
        urls[i] = subida.urlOriginal;
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
      setMensaje(`Fotos aplicadas a ${ids.length} producto(s).`);
      setArchivos([null, null, null, null]);
      setInputKey((k) => k + 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudieron aplicar las fotos.';
      setMensaje(msg);
      setError(msg);
    } finally {
      setAplicando(false);
    }
  };

  if (!user) return null;

  if (cargando) {
    return (
      <div className="mis-productos">
        <p className="mis-productos-mensaje">Cargando productos para fotos…</p>
      </div>
    );
  }

  if (error && !productos.length) {
    return (
      <div className="mis-productos">
        <p className="mis-productos-mensaje mis-productos-error">{error}</p>
      </div>
    );
  }

  if (!productos.length) {
    return (
      <div className="mis-productos">
        <p className="mis-productos-mensaje">
          Aún no tienes productos. Publícalos en <strong>Editar productos</strong> y vuelve aquí para
          asignar fotos.
        </p>
      </div>
    );
  }

  return (
    <div className="mis-productos">
      <section className="mis-productos-fotos-masivas" aria-label="Gestión de fotos">
        <div className="mis-productos-fotos-masivas-header">
          <div>
            <p className="mis-productos-ajuste-masivo-titulo">Gestión de fotos</p>
            <p className="mis-productos-ajuste-masivo-descripcion">
              Sección solo para fotos. Busca por nombre o código (plural/typos OK), elige el alcance y
              aplica hasta 4 fotos. No afecta filtros de Editar productos.
            </p>
          </div>
          <span className="mis-productos-fotos-masivas-contador">
            Productos objetivo: {objetivos.length}
          </span>
        </div>

        <div className="mis-productos-fotos-masivas-config">
          <div className="mis-productos-fotos-masivas-config-fila">
            <label htmlFor="gestion-fotos-busqueda">
              Buscar producto (nombre o código)
              <input
                id="gestion-fotos-busqueda"
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Ej: camara, amortiguadores…"
                disabled={aplicando}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label htmlFor="gestion-fotos-alcance">
              Alcance
              <select
                id="gestion-fotos-alcance"
                value={alcance}
                onChange={(e) => {
                  setAlcance(e.target.value as AlcanceFotos);
                  setMensaje(null);
                }}
                disabled={aplicando}
              >
                <option value="sin_foto">Solo sin foto principal</option>
                <option value="todos">Todos los de la búsqueda</option>
                <option value="seleccionados">Solo seleccionados manualmente</option>
              </select>
            </label>
          </div>
        </div>

        {alcance === 'seleccionados' && (
          <div className="mis-productos-fotos-masivas-seleccion">
            <p>Seleccionados: {seleccionados.length}. Márcalos en la lista.</p>
            <div className="mis-productos-fotos-masivas-acciones">
              <button
                type="button"
                className="mis-productos-btn-secundario"
                disabled={aplicando || !porBusqueda.length}
                onClick={() => setSeleccionados(porBusqueda.map((p) => p.id))}
              >
                Seleccionar visibles ({porBusqueda.length})
              </button>
              <button
                type="button"
                className="mis-productos-btn-secundario"
                disabled={aplicando || seleccionados.length === 0}
                onClick={() => setSeleccionados([])}
              >
                Limpiar selección
              </button>
            </div>
          </div>
        )}

        <div className="mis-productos-fotos-masivas-files">
          {archivos.map((archivo, idx) => (
            <label key={`${inputKey}-${idx}`}>
              Foto {idx + 1}
              {idx === 0 ? ' (principal)' : ''}
              <input
                type="file"
                accept="image/*"
                disabled={aplicando}
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

        <div className="mis-productos-fotos-masivas-acciones">
          <button
            type="button"
            className="mis-productos-btn-secundario"
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
            className="mis-productos-btn-primario"
            disabled={aplicando || !archivos[0] || objetivos.length === 0}
            onClick={() => void aplicarFotos()}
          >
            {aplicando ? 'Aplicando…' : `Aplicar fotos a ${objetivos.length} producto(s)`}
          </button>
        </div>
        {mensaje && <p className="mis-productos-ajuste-masivo-mensaje">{mensaje}</p>}
      </section>

      <div className="mis-productos-grid gestion-fotos-lista" aria-label="Productos para fotos">
        {listaVisible.length === 0 ? (
          <div className="mis-productos-mensaje mis-productos-mensaje--bloque">
            <p>
              {!busqueda.trim()
                ? 'Escribe en el buscador para filtrar el catálogo.'
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

      {productoEditando && (
        <EditorFotosProductoModal
          producto={productoEditando}
          modoGuardado="vendedor"
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
          }}
        />
      )}
    </div>
  );
}