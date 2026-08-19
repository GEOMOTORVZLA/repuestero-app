import { supabase } from '../supabaseClient';
import { aplicarTerminosTextoAMisProductos } from './busquedaProductosTexto';
import {
  DIAS_PAUSA_STOCK_VENCIDO,
  DIAS_STOCK_SEMAFORO_VERDE,
} from './stockActualInventario';
import type { VerticalVehiculo } from './verticalVehiculo';

/** Tamano de pagina para listados del panel vendedor (visor, fotos, detalle KPI). */
export const PRODUCTOS_VENDEDOR_LISTA_PAGE = 20;

export function errorPorColumnaCodigoProducto(msg: string | undefined): boolean {
  const m = (msg ?? '').toLowerCase();
  return m.includes('codigo') && (m.includes('does not exist') || m.includes('column'));
}

export type TiendaVendedorResumen = {
  id: string;
  nombre: string | null;
  nombre_comercial: string | null;
  vertical?: string | null;
};

export async function fetchTiendaIdsUsuario(
  userId: string
): Promise<{ tiendaIds: string[]; tiendas: TiendaVendedorResumen[]; error: string | null }> {
  const { data: tiendas, error } = await supabase
    .from('tiendas')
    .select('id, nombre, nombre_comercial, vertical')
    .eq('user_id', userId);
  if (error) {
    return { tiendaIds: [], tiendas: [], error: error.message || 'Error al cargar tus tiendas.' };
  }
  const lista = (tiendas ?? []) as TiendaVendedorResumen[];
  return { tiendaIds: lista.map((t) => t.id), tiendas: lista, error: null };
}

function isoHaceDias(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

function comillasIso(iso: string): string {
  return `"${iso.replace(/"/g, '')}"`;
}

export type FiltroEstadoListaVendedor =
  | 'todos'
  | 'activos'
  | 'pausados'
  | 'proximos_stock';

/** Aplica filtros de estado (activo / fechas stock) a una query de productos. */
export function aplicarFiltroEstadoListaVendedor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filtro: FiltroEstadoListaVendedor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (filtro === 'activos') return query.eq('activo', true);
  if (filtro === 'pausados') return query.eq('activo', false);
  if (filtro === 'proximos_stock') {
    const hace30 = comillasIso(isoHaceDias(DIAS_STOCK_SEMAFORO_VERDE));
    const hace60 = comillasIso(isoHaceDias(DIAS_PAUSA_STOCK_VENCIDO));
    return query
      .eq('activo', true)
      .or(
        [
          `and(stock_confirmado_at.not.is.null,stock_confirmado_at.lt.${hace30},stock_confirmado_at.gte.${hace60})`,
          `and(stock_confirmado_at.is.null,created_at.lt.${hace30},created_at.gte.${hace60})`,
        ].join(',')
      );
  }
  return query;
}

export type OptsPaginaProductosVendedor = {
  tiendaIds: string[];
  select: string;
  offset: number;
  vertical?: VerticalVehiculo | null;
  texto?: string;
  estado?: FiltroEstadoListaVendedor;
  soloSinFoto?: boolean;
  conCodigo?: boolean;
  orderBy?: { col: string; ascending?: boolean };
};

/**
 * Una pagina de productos del vendedor (+1 fila para detectar hayMas).
 * Si falla por columna codigo, reintenta sin ella en el select/texto.
 */
export async function fetchPaginaProductosVendedorLista(
  opts: OptsPaginaProductosVendedor
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filas: any[];
  hayMas: boolean;
  error: string | null;
  conCodigo: boolean;
}> {
  const {
    tiendaIds,
    offset,
    vertical,
    texto,
    estado = 'todos',
    soloSinFoto = false,
    orderBy = { col: 'nombre', ascending: true },
  } = opts;
  let conCodigo = opts.conCodigo !== false;
  let selectCols = opts.select;

  if (tiendaIds.length === 0) {
    return { filas: [], hayMas: false, error: null, conCodigo };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('productos')
    .select(selectCols)
    .in('tienda_id', tiendaIds)
    .order(orderBy.col, { ascending: orderBy.ascending !== false });

  if (orderBy.col !== 'id') {
    query = query.order('id', { ascending: true });
  }

  if (vertical === 'auto' || vertical === 'moto') {
    query = query.eq('vertical', vertical);
  }

  query = aplicarFiltroEstadoListaVendedor(query, estado);

  if (soloSinFoto) {
    query = query.or('imagen_url.is.null,imagen_url.eq.');
  }

  const t = (texto ?? '').trim();
  if (t) {
    query = aplicarTerminosTextoAMisProductos(query, t, conCodigo);
  }

  const { data, error } = await query.range(offset, offset + PRODUCTOS_VENDEDOR_LISTA_PAGE);
  if (error) {
    if (conCodigo && errorPorColumnaCodigoProducto(error.message)) {
      const selectSinCodigo = selectCols
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== 'codigo')
        .join(', ');
      return fetchPaginaProductosVendedorLista({
        ...opts,
        select: selectSinCodigo,
        conCodigo: false,
      });
    }
    return { filas: [], hayMas: false, error: error.message || 'Error al cargar productos.', conCodigo };
  }

  const filas = data ?? [];
  const hayMas = filas.length > PRODUCTOS_VENDEDOR_LISTA_PAGE;
  return {
    filas: hayMas ? filas.slice(0, PRODUCTOS_VENDEDOR_LISTA_PAGE) : filas,
    hayMas,
    error: null,
    conCodigo,
  };
}

/** Conteos head:exact para KPIs del resumen (sin bajar filas). */
export async function contarProductosVendedor(opts: {
  tiendaIds: string[];
  vertical: VerticalVehiculo;
  estado?: FiltroEstadoListaVendedor;
}): Promise<{ count: number; error: string | null }> {
  const { tiendaIds, vertical, estado = 'todos' } = opts;
  if (tiendaIds.length === 0) return { count: 0, error: null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .in('tienda_id', tiendaIds)
    .eq('vertical', vertical);

  query = aplicarFiltroEstadoListaVendedor(query, estado);

  const { count, error } = await query;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}