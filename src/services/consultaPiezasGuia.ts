import { supabase } from '../supabaseClient';
import {
  categoriasConsultaPieza,
  piezaGuiaPorId,
  type PiezaGuiaAuto,
} from '../data/piezasGuiaAuto';
import { VERTICAL_AUTO, type VerticalVehiculo } from '../utils/verticalVehiculo';
import {
  aplicarTerminosTextoABusquedaProductos,
  comillasFiltroPostgrest,
  normalizarTextoBusqueda,
} from '../utils/busquedaProductosTexto';
import { aplicarFiltroStockPublico } from '../utils/stockActualInventario';
import type { ProductoTarjetaBusqueda } from '../components/TarjetaProductoBusqueda';

export const SELECT_PRODUCTOS_GUIA = `
        id,
        activo,
        nombre,
        descripcion,
        comentarios,
        precio_usd,
        moneda,
        marca,
        modelo,
        anio,
        imagen_url,
        imagenes_extra,
        disponibilidad_aviso,
        es_oferta,
        tiendas ( nombre_comercial, nombre, rif, telefono, direccion, latitud, longitud, metodos_pago )
`;

export type TiendaGuiaContacto = {
  nombre_comercial: string | null;
  nombre: string | null;
  rif: string | null;
  telefono: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  metodos_pago: string[] | null;
};

export type ProductoGuia = ProductoTarjetaBusqueda & {
  comentarios: string | null;
  tiendas: TiendaGuiaContacto | null;
};

export const PAGE_SIZE_GUIA = 24;
export const RESULTADOS_GUIA_MIN = 5;
export const MUESTRA_CERCANIA_UNO = 80;

export function distanciaKmGuia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function ordenarProductosPorCercania(
  lista: ProductoGuia[],
  u: { lat: number; lng: number } | null
): ProductoGuia[] {
  if (!u) return lista;
  return [...lista].sort((a, b) => {
    const hasA = a.tiendas?.latitud != null && a.tiendas?.longitud != null;
    const hasB = b.tiendas?.latitud != null && b.tiendas?.longitud != null;
    if (!hasA && !hasB) return 0;
    if (!hasA) return 1;
    if (!hasB) return -1;
    return (
      distanciaKmGuia(u.lat, u.lng, a.tiendas!.latitud!, a.tiendas!.longitud!) -
      distanciaKmGuia(u.lat, u.lng, b.tiendas!.latitud!, b.tiendas!.longitud!)
    );
  });
}


export type FiltroVehiculoGuia = {
  marca: string;
  modelo: string;
  anio: number | null;
};

function aplicarFiltrosVehiculo<T extends {
  ilike: (col: string, pat: string) => T;
}>(query: T, vehiculo: FiltroVehiculoGuia): T {
  let q = query.ilike('marca', `%${vehiculo.marca.replace(/%/g, '')}%`);
  const modelo = vehiculo.modelo.trim();
  if (modelo) q = q.ilike('modelo', `%${modelo.replace(/%/g, '')}%`);
  return q;
}

function filtrarAnioSiAplica(filas: ProductoGuia[], anio: number | null): ProductoGuia[] {
  if (anio == null) return filas;
  return filas.filter((p) => p.anio == null || p.anio === anio);
}

function normalizarTienda(raw: unknown): TiendaGuiaContacto | null {
  if (!raw) return null;
  const t = Array.isArray(raw) ? raw[0] : raw;
  if (!t || typeof t !== 'object') return null;
  return t as TiendaGuiaContacto;
}

function mapFilas(raw: unknown[]): ProductoGuia[] {
  return raw.map((row) => {
    const p = row as ProductoGuia & { tiendas?: unknown };
    return { ...p, tiendas: normalizarTienda(p.tiendas) };
  });
}

function orAliasNombre(alias: string[]): string {
  const partes: string[] = [];
  const vistos = new Set<string>();
  for (const a of alias) {
    const limpio = a.replace(/[%_]/g, '').trim();
    if (limpio.length < 2) continue;
    const pat = comillasFiltroPostgrest(`%${limpio}%`);
    if (vistos.has(pat)) continue;
    vistos.add(pat);
    partes.push(`nombre.ilike.${pat}`);
  }
  return partes.join(',');
}

function queryBasePublica(vertical: VerticalVehiculo = VERTICAL_AUTO) {
  let q = supabase
    .from('productos')
    .select(SELECT_PRODUCTOS_GUIA)
    .eq('activo', true)
    .eq('aprobacion_publica', 'aprobado')
    .eq('vertical', vertical);
  q = aplicarFiltroStockPublico(q);
  return q;
}

export async function buscarProductosPorPiezaGuia(opts: {
  pieza: PiezaGuiaAuto;
  vehiculo: FiltroVehiculoGuia;
  offset?: number;
  vertical?: VerticalVehiculo;
}): Promise<{ filas: ProductoGuia[]; hayMas: boolean; error: string | null }> {
  const offset = opts.offset ?? 0;
  const cats = categoriasConsultaPieza(opts.pieza);
  const aliasOr = orAliasNombre(opts.pieza.alias);
  if (!aliasOr) {
    return { filas: [], hayMas: false, error: null };
  }

  let query = queryBasePublica(opts.vertical).in('categoria', cats);
  query = aplicarFiltrosVehiculo(query, opts.vehiculo);
  query = query.or(aliasOr);

  const { data, error } = await query
    .order('nombre', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + PAGE_SIZE_GUIA);

  if (error) {
    return { filas: [], hayMas: false, error: error.message };
  }
  const raw = mapFilas((data ?? []) as unknown[]);
  const acotadas = filtrarAnioSiAplica(raw, opts.vehiculo.anio);
  return {
    filas: acotadas.slice(0, PAGE_SIZE_GUIA),
    hayMas: raw.length > PAGE_SIZE_GUIA,
    error: null,
  };
}


export async function buscarProductoMasCercanoPorPieza(opts: {
  pieza: PiezaGuiaAuto;
  vehiculo: FiltroVehiculoGuia;
  userLoc: { lat: number; lng: number } | null;
  vertical?: VerticalVehiculo;
}): Promise<{ producto: ProductoGuia | null; error: string | null }> {
  const cats = categoriasConsultaPieza(opts.pieza);
  const aliasOr = orAliasNombre(opts.pieza.alias);
  if (!aliasOr) {
    return { producto: null, error: null };
  }

  let query = queryBasePublica(opts.vertical).in('categoria', cats);
  query = aplicarFiltrosVehiculo(query, opts.vehiculo);
  query = query.or(aliasOr);

  const { data, error } = await query
    .order('nombre', { ascending: true })
    .order('id', { ascending: true })
    .range(0, MUESTRA_CERCANIA_UNO - 1);

  if (error) {
    return { producto: null, error: error.message };
  }
  const acotadas = filtrarAnioSiAplica(mapFilas((data ?? []) as unknown[]), opts.vehiculo.anio);
  const ordenadas = ordenarProductosPorCercania(acotadas, opts.userLoc);
  return { producto: ordenadas[0] ?? null, error: null };
}

export async function buscarProductosGuiaLibre(opts: {
  texto: string;
  vehiculo: FiltroVehiculoGuia;
  offset?: number;
  vertical?: VerticalVehiculo;
}): Promise<{ filas: ProductoGuia[]; hayMas: boolean; error: string | null }> {
  const offset = opts.offset ?? 0;
  let query = queryBasePublica(opts.vertical);
  query = aplicarFiltrosVehiculo(query, opts.vehiculo);
  query = aplicarTerminosTextoABusquedaProductos(query, opts.texto);

  const { data, error } = await query
    .order('nombre', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + PAGE_SIZE_GUIA);

  if (error) {
    return { filas: [], hayMas: false, error: error.message };
  }
  const raw = mapFilas((data ?? []) as unknown[]);
  const acotadas = filtrarAnioSiAplica(raw, opts.vehiculo.anio);
  return {
    filas: acotadas.slice(0, PAGE_SIZE_GUIA),
    hayMas: raw.length > PAGE_SIZE_GUIA,
    error: null,
  };
}

/** Elige la pieza cuyos alias/etiqueta cubren más el texto del comprador. */
export function resolverPiezaDesdeTexto(texto: string, catalogo: PiezaGuiaAuto[]): PiezaGuiaAuto | null {
  const n = normalizarTextoBusqueda(texto.trim());
  if (n.length < 3) return null;
  let mejor: PiezaGuiaAuto | null = null;
  let mejorLen = 0;
  for (const pieza of catalogo) {
    const candidatos = [pieza.etiqueta, ...pieza.alias];
    for (const c of candidatos) {
      const cn = normalizarTextoBusqueda(c);
      if (cn.length < 3) continue;
      if (n.includes(cn) || cn.includes(n)) {
        if (cn.length > mejorLen) {
          mejor = pieza;
          mejorLen = cn.length;
        }
      }
    }
  }
  return mejor;
}

export function piezaRelacionada(
  id: string,
  lookup: (id: string) => PiezaGuiaAuto | undefined = piezaGuiaPorId
): PiezaGuiaAuto | undefined {
  return lookup(id);
}
