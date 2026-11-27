import { supabase } from '../supabaseClient';
import { piezaGuiaPorId, type PiezaGuiaAuto } from '../data/piezasGuiaAuto';
import { VERTICAL_AUTO, type VerticalVehiculo } from '../utils/verticalVehiculo';
import {
  aplicarTerminosTextoABusquedaProductos,
  normalizarTextoBusqueda,
  patronIlikeTerminoProducto,
  terminosBusquedaProducto,
  variantesAcentoParaIlike,
  variantesFormaPalabra,
} from '../utils/busquedaProductosTexto';
import { TABLA_CATALOGO_PUBLICO } from '../utils/catalogoPublico';
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
        tiendas
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

function variantesIlikeNombre(termino: string): string[] {
  const formas = variantesFormaPalabra(termino);
  const base = formas.length > 0 ? formas : [termino];
  const partes: string[] = [];
  const vistos = new Set<string>();
  for (const forma of base) {
    for (const variante of variantesAcentoParaIlike(forma)) {
      const pieza = `nombre.ilike.${patronIlikeTerminoProducto(variante)}`;
      if (vistos.has(pieza)) continue;
      vistos.add(pieza);
      partes.push(pieza);
    }
  }
  return partes;
}

function grupoTerminoNombre(termino: string): string | null {
  const partes = variantesIlikeNombre(termino);
  if (partes.length === 0) return null;
  if (partes.length === 1) return partes[0];
  return `or(${partes.join(',')})`;
}

function grupoFraseNombre(frase: string): string | null {
  const grupos = terminosBusquedaProducto(frase)
    .map(grupoTerminoNombre)
    .filter((grupo): grupo is string => Boolean(grupo));
  if (grupos.length === 0) return null;
  if (grupos.length === 1) return grupos[0];
  return `and(${grupos.join(',')})`;
}

function raizTermino(termino: string): string {
  const formas = variantesFormaPalabra(termino);
  if (formas.length === 0) return normalizarTextoBusqueda(termino);
  return formas.reduce((corta, forma) => (forma.length < corta.length ? forma : corta));
}

function raicesDeFrase(frase: string): string[] {
  return terminosBusquedaProducto(frase).map(raizTermino);
}

function esSubconjunto(menor: string[], mayor: string[]): boolean {
  const destino = new Set(mayor);
  return menor.every((raiz) => destino.has(raiz));
}

/**
 * El título de la casilla, partido en « / » o « y ».
 * Un alias de varias palabras se suma solo si nombra el repuesto sin ampliar una parte
 * (así «kit de tiempo» entra y «spark» o «alternador» no).
 */
function frasesTituloPieza(pieza: PiezaGuiaAuto): string[] {
  const partes = pieza.etiqueta
    .split(/\s*(?:\/|\by\b)\s*/i)
    .map((parte) => parte.trim())
    .filter((parte) => raicesDeFrase(parte).length > 0);
  const frases = partes.length > 0 ? partes : [pieza.etiqueta];
  const raicesPartes = frases.map(raicesDeFrase);
  const raicesEtiqueta = raicesDeFrase(pieza.etiqueta);
  const vistos = new Set(frases.map((frase) => raicesDeFrase(frase).join(' ')));
  for (const alias of pieza.alias) {
    const raices = raicesDeFrase(alias);
    if (raices.length < 2) continue;
    if (!esSubconjunto(raices, raicesEtiqueta)) continue;
    if (raicesPartes.some((parte) => esSubconjunto(raices, parte))) continue;
    const clave = raices.join(' ');
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    frases.push(alias.trim());
  }
  // «Bujía», «bobina» y «rodamiento» se publican con una sola palabra.
  // Pedir también «encendido» o «rueda» dejaba la casilla vacía.
  const nombreSoloBasta = new Set(['bujia', 'bobina', 'rodamiento']);
  for (const alias of pieza.alias) {
    const raices = raicesDeFrase(alias);
    if (raices.length !== 1 || !nombreSoloBasta.has(raices[0])) continue;
    if (!raicesEtiqueta.includes(raices[0]) || vistos.has(raices[0])) continue;
    vistos.add(raices[0]);
    frases.push(alias.trim());
  }
  return frases;
}

function filtroTituloPieza(pieza: PiezaGuiaAuto): string | null {
  const grupos = frasesTituloPieza(pieza)
    .map(grupoFraseNombre)
    .filter((grupo): grupo is string => Boolean(grupo));
  if (grupos.length === 0) return null;
  if (grupos.length === 1) return grupos[0];
  return `or(${grupos.join(',')})`;
}

function queryBasePublica(vertical: VerticalVehiculo = VERTICAL_AUTO) {
  return supabase
    .from(TABLA_CATALOGO_PUBLICO)
    .select(SELECT_PRODUCTOS_GUIA)
    .eq('activo', true)
    .eq('aprobacion_publica', 'aprobado')
    .eq('vertical', vertical);
}

function queryPorTituloPieza(pieza: PiezaGuiaAuto, vehiculo: FiltroVehiculoGuia, vertical?: VerticalVehiculo) {
  const filtro = filtroTituloPieza(pieza);
  if (!filtro) return null;
  let query = queryBasePublica(vertical).or(filtro);
  const vehiculoTexto = [vehiculo.marca.trim(), vehiculo.modelo.trim()].filter((parte) => parte.length > 0).join(' ');
  if (vehiculoTexto) query = aplicarTerminosTextoABusquedaProductos(query, vehiculoTexto);
  return query;
}

export async function buscarProductosPorPiezaGuia(opts: {
  pieza: PiezaGuiaAuto;
  vehiculo: FiltroVehiculoGuia;
  offset?: number;
  vertical?: VerticalVehiculo;
}): Promise<{ filas: ProductoGuia[]; hayMas: boolean; error: string | null }> {
  const offset = opts.offset ?? 0;
  const query = queryPorTituloPieza(opts.pieza, opts.vehiculo, opts.vertical);
  if (!query) {
    return { filas: [], hayMas: false, error: null };
  }

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
  const query = queryPorTituloPieza(opts.pieza, opts.vehiculo, opts.vertical);
  if (!query) {
    return { producto: null, error: null };
  }

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

/** Misma búsqueda por nombre que la barra principal; marca y modelo entran como palabras. */
function textoBusquedaConVehiculo(texto: string, vehiculo: FiltroVehiculoGuia): string {
  return [texto.trim(), vehiculo.marca.trim(), vehiculo.modelo.trim()].filter((parte) => parte.length > 0).join(' ');
}

export async function buscarProductosGuiaLibre(opts: {
  texto: string;
  vehiculo: FiltroVehiculoGuia;
  offset?: number;
  vertical?: VerticalVehiculo;
}): Promise<{ filas: ProductoGuia[]; hayMas: boolean; error: string | null }> {
  const offset = opts.offset ?? 0;
  let query = queryBasePublica(opts.vertical);
  query = aplicarTerminosTextoABusquedaProductos(query, textoBusquedaConVehiculo(opts.texto, opts.vehiculo));

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
