import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
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
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import {
  PRODUCTOS_VENDEDOR_LISTA_PAGE,
  fetchPaginaProductosVendedorLista,
  fetchTiendaIdsUsuario,
} from '../utils/productosVendedorConsulta';
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

const SELECT = 'id, nombre, codigo, imagen_url, imagenes_extra, vertical, activo';

/**
 * Sección independiente: solo asignación masiva de fotos.
 * Buscador y alcance propios; no depende de «Editar productos».
 */
export function GestionFotosVendedor({ vertical, refreshTrigger = 0 }: GestionFotosVendedorProps) {
  const { user } = useAuth();
  const [productos, setProductos] = useState<ProductoFoto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [offset, setOffset] = useState(0);
  const [tiendaIds, setTiendaIds] = useState<string[]>([]);
  const [conCodigo, setConCodigo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [alcance, setAlcance] = useState<AlcanceFotos>('sin_foto');
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [archivos, setArchivos] = useState<(File | null)[]>([null, null, null, null]);
  const [inputKey, setInputKey] = useState(0);
  const [aplicando, setAplicando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [productoEditando, setProductoEditando] = useState<ProductoFotosEditable | null>(null);
  const [catalogoVacio, setCatalogoVacio] = useState(false);

  const verticalFiltro = vertical === 'auto' || vertical === 'moto' ? vertical : null;

  const cargarPrimeraPagina = async (opts: {
    texto: string;
    alcanceActual: AlcanceFotos;
    ids?: string[];
  }) => {
    if (!user) return;
    const ids =
      opts.ids ??
      (tiendaIds.length ? tiendaIds : (await fetchTiendaIdsUsuario(user.id)).tiendaIds);
    if (!tiendaIds.length && ids.length) setTiendaIds(ids);

    const pagina = await fetchPaginaProductosVendedorLista({
      tiendaIds: ids,
      select: SELECT,
      offset: 0,
      vertical: verticalFiltro,
      texto: opts.texto,
      soloSinFoto: opts.alcanceActual === 'sin_foto',
      conCodigo,
    });

    if (pagina.error) {
      setError(pagina.error);
      setProductos([]);
      setHayMas(false);
      setOffset(0);
      return;
    }

    setConCodigo(pagina.conCodigo);
    setError(null);
    const filas = pagina.filas as ProductoFoto[];
    setProductos(filas);
    setOffset(filas.length);
    setHayMas(pagina.hayMas);
    setSeleccionados([]);
    setBusquedaAplicada(opts.texto);
  };

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      if (!user) return;
      setCargando(true);
      setError(null);
      setBusqueda('');
      setBusquedaAplicada('');
      try {
        const { tiendaIds: ids, error: errIds } = await fetchTiendaIdsUsuario(user.id);
        if (cancelado) return;
        if (errIds) {
          setError(errIds);
          setProductos([]);
          return;
        }
        setTiendaIds(ids);
        setConCodigo(true);
        const check = await fetchPaginaProductosVendedorLista({
          tiendaIds: ids,
          select: SELECT,
          offset: 0,
          vertical: verticalFiltro,
          texto: '',
          soloSinFoto: false,
          conCodigo: true,
        });
        if (cancelado) return;
        if (check.error) {
          setError(check.error);
          setProductos([]);
          return;
        }
        if (check.filas.length === 0 && !check.hayMas) {
          setCatalogoVacio(true);
          setProductos([]);
          return;
        }
        setCatalogoVacio(false);
        setAlcance('sin_foto');
        await cargarPrimeraPagina({
          texto: '',
          alcanceActual: 'sin_foto',
          ids,
        });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, refreshTrigger, vertical]);

  const aplicarBusqueda = async () => {
    setCargando(true);
    setMensaje(null);
    try {
      await cargarPrimeraPagina({ texto: busqueda, alcanceActual: alcance });
    } finally {
      setCargando(false);
    }
  };

  const onCambiarAlcance = async (nuevo: AlcanceFotos) => {
    setAlcance(nuevo);
    setMensaje(null);
    setCargando(true);
    try {
      await cargarPrimeraPagina({ texto: busquedaAplicada, alcanceActual: nuevo });
    } finally {
      setCargando(false);
    }
  };

  const cargarMas = async () => {
    if (!user || cargandoMas || !hayMas || tiendaIds.length === 0) return;
    setCargandoMas(true);
    try {
      const pagina = await fetchPaginaProductosVendedorLista({
        tiendaIds,
        select: SELECT,
        offset,
        vertical: verticalFiltro,
        texto: busquedaAplicada,
        soloSinFoto: alcance === 'sin_foto',
        conCodigo,
      });
      if (pagina.error) {
        setError(pagina.error);
        return;
      }
      setConCodigo(pagina.conCodigo);
      const filas = pagina.filas as ProductoFoto[];
      setProductos((prev) => {
        const vistos = new Set(prev.map((p) => p.id));
        return [...prev, ...filas.filter((p) => !vistos.has(p.id))];
      });
      setOffset((prev) => prev + filas.length);
      setHayMas(pagina.hayMas);
    } finally {
      setCargandoMas(false);
    }
  };

  const objetivos = useMemo(() => {
    if (alcance === 'seleccionados') {
      return productos.filter((p) => seleccionados.includes(p.id));
    }
    // sin_foto y todos: ya filtrados en servidor sobre lo cargado
    return productos;
  }, [productos, alcance, seleccionados]);

  const listaVisible = productos;

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
    if (objetivos.length === 0) {
      setMensaje('No hay productos en el alcance. Busca, carga más o selecciona.');
      return;
    }

    setAplicando(true);
    try {
      const bucket = supabase.storage.from('productos');
      const lote = `${Date.now()}`;
      const urls: (string | null)[] = [null, null, null, null];

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
      setMensaje(`Fotos aplicadas a ${ids.length} producto(s) de esta lista.`);
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

  if (cargando && productos.length === 0) {
    return (
      <div className="mis-productos">
        <p className="mis-productos-mensaje">Cargando productos para fotos…</p>
      </div>
    );
  }

  if (error && !productos.length && catalogoVacio === false && tiendaIds.length === 0) {
    return (
      <div className="mis-productos">
        <p className="mis-productos-mensaje mis-productos-error">{error}</p>
      </div>
    );
  }

  if (catalogoVacio) {
    return (
      <div className="mis-productos">
        <p className="mis-productos-mensaje">
          Aún no tienes productos. Publícalos en <strong>Publicar</strong> y vuelve aquí para asignar fotos.
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
              Busca por nombre o código y pulsa <strong>Buscar</strong>. Se muestran{' '}
              {PRODUCTOS_VENDEDOR_LISTA_PAGE} por vez; usa <strong>Cargar más</strong> si hace falta. El
              alcance masivo aplica solo a lo cargado en esta lista.
            </p>
          </div>
          <span className="mis-productos-fotos-masivas-contador">
            Objetivo masivo: {objetivos.length}
            {hayMas ? '+' : ''}
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void aplicarBusqueda();
                  }
                }}
                placeholder="Ej: camara, amortiguadores…"
                disabled={aplicando || cargando}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label htmlFor="gestion-fotos-alcance">
              Alcance
              <select
                id="gestion-fotos-alcance"
                value={alcance}
                onChange={(e) => void onCambiarAlcance(e.target.value as AlcanceFotos)}
                disabled={aplicando || cargando}
              >
                <option value="sin_foto">Solo sin foto principal</option>
                <option value="todos">Todos los de la búsqueda (esta lista)</option>
                <option value="seleccionados">Solo seleccionados manualmente</option>
              </select>
            </label>
          </div>
          <div className="mis-productos-fotos-masivas-acciones" style={{ marginTop: '0.5rem' }}>
            <button
              type="button"
              className="mis-productos-btn-primario"
              disabled={aplicando || cargando}
              onClick={() => void aplicarBusqueda()}
            >
              {cargando ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
        </div>

        {alcance === 'seleccionados' && (
          <div className="mis-productos-fotos-masivas-seleccion">
            <p>Seleccionados: {seleccionados.length}. Márcalos en la lista.</p>
            <div className="mis-productos-fotos-masivas-acciones">
              <button
                type="button"
                className="mis-productos-btn-secundario"
                disabled={aplicando || !listaVisible.length}
                onClick={() => setSeleccionados(listaVisible.map((p) => p.id))}
              >
                Seleccionar visibles ({listaVisible.length})
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
        {error && <p className="mis-productos-mensaje mis-productos-error">{error}</p>}
        {mensaje && <p className="mis-productos-ajuste-masivo-mensaje">{mensaje}</p>}
        <p className="mis-productos-filtros-resumen" role="status">
          {busquedaAplicada.trim()
            ? `Búsqueda «${busquedaAplicada.trim()}»: ${listaVisible.length} en esta vista${
                hayMas ? ' (hay más)' : ''
              }.`
            : `Mostrando ${listaVisible.length}${hayMas ? '+' : ''} producto(s).`}
        </p>
      </section>

      <div className="mis-productos-grid gestion-fotos-lista" aria-label="Productos para fotos">
        {listaVisible.length === 0 ? (
          <div className="mis-productos-mensaje mis-productos-mensaje--bloque">
            <p>
              {busquedaAplicada.trim()
                ? `Ningún producto coincide con «${busquedaAplicada.trim()}».`
                : alcance === 'sin_foto'
                  ? 'No hay productos sin foto principal en esta página. Prueba Buscar o Cargar más.'
                  : 'No hay productos para mostrar. Pulsa Buscar o Cargar más.'}
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

      {hayMas && (
        <div className="mis-productos-cargar-mas">
          <button
            type="button"
            className="mis-productos-btn-primario"
            disabled={cargandoMas || cargando || aplicando}
            onClick={() => void cargarMas()}
          >
            {cargandoMas ? 'Cargando…' : `Cargar más (${PRODUCTOS_VENDEDOR_LISTA_PAGE})`}
          </button>
        </div>
      )}

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
