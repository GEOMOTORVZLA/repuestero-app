import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { productoCoincideTextoFlexible } from '../utils/busquedaProductosTexto';
import { urlsFotosProducto } from '../utils/productoImagenesExtra';
import { etiquetaMoneda } from '../utils/monedaProducto';
import { formatearPrecioProducto } from '../utils/precioProducto';
import { etiquetaDisponibilidadAviso } from '../utils/avisoProductoPublicacion';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { etiquetaStockActual } from '../utils/stockActualInventario';
import { ImagenProducto } from './ImagenProducto';
import { VisorFotoProducto } from './VisorFotoProducto';
import './VisorMostrador.css';

type ProductoMostrador = {
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
  vertical?: VerticalVehiculo | null;
  disponibilidad_aviso?: string | null;
  es_oferta?: boolean | null;
  stock_actual?: number | null;
};

const SELECT =
  'id, nombre, descripcion, comentarios, categoria, marca, modelo, anio, precio_usd, moneda, imagen_url, imagenes_extra, activo, vertical, disponibilidad_aviso, es_oferta, stock_actual';
const PAGE = 1000;

async function cargarProductosVendedor(
  userId: string
): Promise<{ productos: ProductoMostrador[]; error: string | null }> {
  const { data: tiendas, error: errTiendas } = await supabase
    .from('tiendas')
    .select('id')
    .eq('user_id', userId);

  if (errTiendas) return { productos: [], error: errTiendas.message || 'Error al cargar tus tiendas.' };
  if (!tiendas?.length) return { productos: [], error: null };

  const tiendaIds = tiendas.map((t) => t.id);
  const acumulado: ProductoMostrador[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('productos')
      .select(SELECT)
      .in('tienda_id', tiendaIds)
      .order('nombre')
      .range(from, from + PAGE - 1);
    if (error) return { productos: [], error: error.message || 'Error al cargar productos.' };
    const batch = (data ?? []) as ProductoMostrador[];
    acumulado.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return { productos: acumulado, error: null };
}

/** Busqueda flexible solo del Visor: multi-palabra AND, plural/singular y typo leve. */
function coincideBusquedaVisor(p: ProductoMostrador, texto: string): boolean {
  return productoCoincideTextoFlexible(
    [p.nombre, p.descripcion, p.comentarios, p.marca, p.modelo, p.categoria],
    texto
  );
}

type VisorMostradorProps = {
  vertical: VerticalVehiculo;
  refreshTrigger?: number;
};

export function VisorMostrador({ vertical, refreshTrigger = 0 }: VisorMostradorProps) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [productos, setProductos] = useState<ProductoMostrador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [soloActivos, setSoloActivos] = useState(true);
  const [visorFotos, setVisorFotos] = useState<{ fotos: string[]; indice: number; nombre: string } | null>(
    null
  );

  const cargar = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    setError(null);
    try {
      const { productos: lista, error: errMsg } = await cargarProductosVendedor(user.id);
      if (errMsg) {
        setProductos([]);
        setError(errMsg);
        return;
      }
      const deVertical = lista.filter((p) => (p.vertical ?? 'auto') === vertical);
      setProductos(deVertical);
    } catch (e) {
      setProductos([]);
      setError(e instanceof Error ? e.message : 'No se pudo cargar el catálogo.');
    } finally {
      setCargando(false);
    }
  }, [user, vertical]);

  useEffect(() => {
    void cargar();
  }, [cargar, refreshTrigger]);

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 150);
    return () => window.clearTimeout(t);
  }, []);

  const visibles = useMemo(() => {
    return productos
      .filter((p) => (soloActivos ? p.activo !== false : true))
      .filter((p) => coincideBusquedaVisor(p, busqueda))
      .sort((a, b) => {
        const aAct = a.activo !== false ? 0 : 1;
        const bAct = b.activo !== false ? 0 : 1;
        if (aAct !== bAct) return aAct - bAct;
        return (a.nombre || '').localeCompare(b.nombre || '', 'es');
      });
  }, [productos, soloActivos, busqueda]);

  const abrirFoto = (p: ProductoMostrador) => {
    const fotos = urlsFotosProducto({
      imagen_url: p.imagen_url ?? null,
      imagenes_extra: p.imagenes_extra ?? null,
    });
    if (fotos.length === 0) return;
    setVisorFotos({ fotos, indice: 0, nombre: p.nombre });
  };

  if (!user) return null;

  return (
    <div className="visor-mostrador">
      <header className="visor-mostrador-barra">
        <label className="visor-mostrador-buscar-label" htmlFor="visor-mostrador-buscar">
          Buscar en tu catálogo
        </label>
        <input
          ref={inputRef}
          id="visor-mostrador-buscar"
          type="search"
          className="visor-mostrador-buscar"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Ej: amortiguador Cherokee, batería, filtro..."
          autoComplete="off"
          spellCheck={false}
        />
        <div className="visor-mostrador-meta">
          <label className="visor-mostrador-toggle">
            <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
            Solo activos
          </label>
          <span className="visor-mostrador-contador" role="status">
            {cargando
              ? 'Cargando…'
              : `${visibles.length} resultado${visibles.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </header>

      {error && <p className="visor-mostrador-error">{error}</p>}

      {!cargando && !error && visibles.length === 0 && (
        <p className="visor-mostrador-vacio">
          {busqueda.trim()
            ? 'No hay productos publicados que coincidan (o están pausados). Prueba otras palabras.'
            : 'No hay productos para mostrar en este catálogo.'}
        </p>
      )}

      <ul className="visor-mostrador-lista">
        {visibles.map((p) => {
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
