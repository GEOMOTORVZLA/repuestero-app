import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { urlsFotosProducto } from '../utils/productoImagenesExtra';
import { etiquetaMoneda } from '../utils/monedaProducto';
import { formatearPrecioProducto } from '../utils/precioProducto';
import { etiquetaDisponibilidadAviso } from '../utils/avisoProductoPublicacion';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { etiquetaStockActual } from '../utils/stockActualInventario';
import {
  PRODUCTOS_VENDEDOR_LISTA_PAGE,
  fetchPaginaProductosVendedorLista,
  fetchTiendaIdsUsuario,
} from '../utils/productosVendedorConsulta';
import { ImagenProducto } from './ImagenProducto';
import { VisorFotoProducto } from './VisorFotoProducto';
import './VisorMostrador.css';

type ProductoMostrador = {
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
  vertical?: VerticalVehiculo | null;
  disponibilidad_aviso?: string | null;
  es_oferta?: boolean | null;
  stock_actual?: number | null;
};

const SELECT =
  'id, nombre, codigo, descripcion, comentarios, categoria, marca, modelo, anio, precio_usd, moneda, imagen_url, imagenes_extra, activo, vertical, disponibilidad_aviso, es_oferta, stock_actual';

type VisorMostradorProps = {
  vertical: VerticalVehiculo;
  refreshTrigger?: number;
  /** Catálogo de este usuario (admin). Si se omite, usa la sesión del vendedor. */
  userIdCatalogo?: string;
};

export function VisorMostrador({ vertical, refreshTrigger = 0, userIdCatalogo }: VisorMostradorProps) {
  const { user } = useAuth();
  const ownerId = userIdCatalogo ?? user?.id;
  const inputRef = useRef<HTMLInputElement>(null);
  const [productos, setProductos] = useState<ProductoMostrador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [offset, setOffset] = useState(0);
  const [tiendaIds, setTiendaIds] = useState<string[]>([]);
  const [conCodigo, setConCodigo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [soloActivos, setSoloActivos] = useState(true);
  const [visorFotos, setVisorFotos] = useState<{ fotos: string[]; indice: number; nombre: string } | null>(
    null
  );

  useEffect(() => {
    let cancelado = false;
    const init = async () => {
      if (!ownerId) return;
      setCargando(true);
      setError(null);
      setProductos([]);
      setHayMas(false);
      setOffset(0);
      setBusqueda('');
      setBusquedaAplicada('');
      try {
        const { tiendaIds: ids, error: errIds } = await fetchTiendaIdsUsuario(ownerId);
        if (cancelado) return;
        if (errIds) {
          setError(errIds);
          setTiendaIds([]);
          setCargando(false);
          return;
        }
        setTiendaIds(ids);
        setConCodigo(true);
        if (ids.length === 0) {
          setCargando(false);
          setProductos([]);
        }
        // La carga de la 1.ª página la dispara el efecto de búsqueda al tener tiendaIds.
      } catch (e) {
        if (!cancelado) {
          setError(e instanceof Error ? e.message : 'No se pudo cargar el catálogo.');
          setCargando(false);
        }
      }
    };
    void init();
    return () => {
      cancelado = true;
    };
  }, [ownerId, vertical, refreshTrigger]);

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 150);
    return () => window.clearTimeout(t);
  }, []);

  // Consulta al servidor (debounce al escribir; inmediato al cambiar filtro o tiendas).
  useEffect(() => {
    if (!ownerId || tiendaIds.length === 0) {
      if (ownerId && tiendaIds.length === 0 && !cargando) {
        /* sin tiendas */
      }
      return;
    }
    const texto = busqueda;
    const inmediato = texto === busquedaAplicada && texto === '';
    const delay = inmediato ? 0 : 350;
    let cancelado = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        setCargando(true);
        try {
          const ids = tiendaIds;
          const pagina = await fetchPaginaProductosVendedorLista({
            tiendaIds: ids,
            select: SELECT,
            offset: 0,
            vertical,
            texto,
            estado: soloActivos ? 'activos' : 'todos',
            conCodigo,
          });
          if (cancelado) return;
          if (pagina.error) {
            setError(pagina.error);
            setProductos([]);
            setHayMas(false);
            setOffset(0);
            return;
          }
          setConCodigo(pagina.conCodigo);
          setError(null);
          setBusquedaAplicada(texto);
          const filas = pagina.filas as ProductoMostrador[];
          setProductos(filas);
          setOffset(filas.length);
          setHayMas(pagina.hayMas);
        } catch (e) {
          if (!cancelado) {
            setError(e instanceof Error ? e.message : 'No se pudo cargar el catálogo.');
            setProductos([]);
          }
        } finally {
          if (!cancelado) setCargando(false);
        }
      })();
    }, delay);
    return () => {
      cancelado = true;
      window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, soloActivos, tiendaIds, ownerId, vertical]);

  const cargarMas = async () => {
    if (!ownerId || cargandoMas || !hayMas || tiendaIds.length === 0) return;
    setCargandoMas(true);
    try {
      const pagina = await fetchPaginaProductosVendedorLista({
        tiendaIds,
        select: SELECT,
        offset,
        vertical,
        texto: busquedaAplicada,
        estado: soloActivos ? 'activos' : 'todos',
        conCodigo,
      });
      if (pagina.error) {
        setError(pagina.error);
        return;
      }
      setConCodigo(pagina.conCodigo);
      const filas = pagina.filas as ProductoMostrador[];
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

  const abrirFoto = (p: ProductoMostrador) => {
    const fotos = urlsFotosProducto({
      imagen_url: p.imagen_url ?? null,
      imagenes_extra: p.imagenes_extra ?? null,
    });
    if (fotos.length === 0) return;
    setVisorFotos({ fotos, indice: 0, nombre: p.nombre });
  };

  if (!user || !ownerId) return null;

  return (
    <div className="visor-mostrador">
      <header className="visor-mostrador-barra">
        <label className="visor-mostrador-buscar-label" htmlFor="visor-mostrador-buscar">
          {userIdCatalogo ? 'Buscar en el catálogo del vendedor' : 'Buscar en tu catálogo'}
        </label>
        <input
          ref={inputRef}
          id="visor-mostrador-buscar"
          type="search"
          className="visor-mostrador-buscar"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre o código (ej: camara, amortiguadores…)"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="visor-mostrador-meta">
          <label className="visor-mostrador-toggle">
            <input
              type="checkbox"
              checked={soloActivos}
              onChange={(e) => setSoloActivos(e.target.checked)}
            />
            Solo activos
          </label>
          <span className="visor-mostrador-contador" role="status">
            {cargando
              ? 'Buscando…'
              : `${productos.length} resultado${productos.length === 1 ? '' : 's'}${
                  hayMas ? '+' : ''
                }`}
          </span>
        </div>
      </header>

      {error && <p className="visor-mostrador-error">{error}</p>}

      {!cargando && !error && productos.length === 0 && (
        <p className="visor-mostrador-vacio">
          {busquedaAplicada.trim()
            ? 'No hay productos que coincidan (o están pausados). Prueba otras palabras.'
            : 'No hay productos para mostrar en este catálogo.'}
        </p>
      )}

      <ul className="visor-mostrador-lista">
        {productos.map((p) => {
          const fotos = urlsFotosProducto({
            imagen_url: p.imagen_url ?? null,
            imagenes_extra: p.imagenes_extra ?? null,
          });
          const thumb = fotos[0] ?? null;
          const vehiculo = [p.marca, p.modelo, p.anio].filter(Boolean).join(' · ');
          const disp = etiquetaDisponibilidadAviso(p.disponibilidad_aviso);
          const activo = p.activo !== false;
          return (
            <li
              key={p.id}
              className={`visor-mostrador-fila${activo ? '' : ' visor-mostrador-fila--pausado'}`}
            >
              <button
                type="button"
                className="visor-mostrador-foto"
                disabled={!thumb}
                onClick={() => abrirFoto(p)}
                aria-label={thumb ? `Ampliar foto de ${p.nombre}` : 'Sin foto'}
                title={thumb ? 'Toca para ver la foto grande' : 'Sin foto'}
              >
                {thumb ? (
                  <ImagenProducto
                    url={thumb}
                    variante="miniatura"
                    alt=""
                    width={160}
                    height={160}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="visor-mostrador-sin-foto">Sin foto</span>
                )}
              </button>
              <div className="visor-mostrador-info">
                <p className="visor-mostrador-nombre">{p.nombre}</p>
                {p.codigo?.trim() ? (
                  <p className="visor-mostrador-codigo">Código: {p.codigo.trim()}</p>
                ) : null}
                {vehiculo && <p className="visor-mostrador-vehiculo">{vehiculo}</p>}
                {p.categoria && <p className="visor-mostrador-categoria">{p.categoria}</p>}
                {p.descripcion?.trim() && (
                  <p className="visor-mostrador-descripcion">{p.descripcion.trim()}</p>
                )}
                <div className="visor-mostrador-avisos">
                  {!activo && (
                    <span className="visor-mostrador-badge visor-mostrador-badge--pausado">Pausado</span>
                  )}
                  <span className="visor-mostrador-badge visor-mostrador-badge--stock">
                    {etiquetaStockActual(
                      p.stock_actual != null && Number.isFinite(Number(p.stock_actual))
                        ? Number(p.stock_actual)
                        : null
                    )}
                  </span>
                  {disp && <span className="visor-mostrador-badge">{disp}</span>}
                  {p.es_oferta && (
                    <span className="visor-mostrador-badge visor-mostrador-badge--oferta">OFERTA</span>
                  )}
                </div>
              </div>
              <p className="visor-mostrador-precio">
                {etiquetaMoneda(p.moneda)} {formatearPrecioProducto(p.precio_usd)}
              </p>
            </li>
          );
        })}
      </ul>

      {hayMas && (
        <div className="visor-mostrador-cargar-mas">
          <button
            type="button"
            className="visor-mostrador-btn-mas"
            disabled={cargandoMas || cargando}
            onClick={() => void cargarMas()}
          >
            {cargandoMas ? 'Cargando…' : `Cargar más (${PRODUCTOS_VENDEDOR_LISTA_PAGE})`}
          </button>
        </div>
      )}

      {visorFotos && (
        <VisorFotoProducto
          fotos={visorFotos.fotos}
          indiceInicial={visorFotos.indice}
          alt={`Foto de ${visorFotos.nombre}`}
          onCerrar={() => setVisorFotos(null)}
        />
      )}
    </div>
  );
}
