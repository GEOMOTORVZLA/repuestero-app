import type { DisponibilidadAviso } from './avisoProductoPublicacion';

/**
 * Días sin confirmar stock antes de pausa automática (cron Supabase).
 * Debe coincidir con `pausar_productos_stock_vencido()` en SQL.
 */
export const DIAS_PAUSA_STOCK_VENCIDO = 60;

/** Semáforo UI (proporcional al plazo de pausa). */
export const DIAS_STOCK_SEMAFORO_VERDE = 30;
export const DIAS_STOCK_SEMAFORO_AMARILLO = 45;
export const DIAS_STOCK_SEMAFORO_ROJO = DIAS_PAUSA_STOCK_VENCIDO;

export type ClaseSemaforoStock = 'verde' | 'amarillo' | 'rojo' | 'vencido' | 'sin-fecha';

export function diasDesdeFechaISO(fechaIso: string | null | undefined): number | null {
  if (!fechaIso) return null;
  const ts = Date.parse(fechaIso);
  if (Number.isNaN(ts)) return null;
  const dias = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  return Math.max(0, dias);
}

export function claseSemaforoStockPorDias(dias: number | null): ClaseSemaforoStock {
  if (dias == null) return 'sin-fecha';
  if (dias <= DIAS_STOCK_SEMAFORO_VERDE) return 'verde';
  if (dias <= DIAS_STOCK_SEMAFORO_AMARILLO) return 'amarillo';
  if (dias <= DIAS_STOCK_SEMAFORO_ROJO) return 'rojo';
  return 'vencido';
}

/**
 * Inventario opcional (columna productos.stock_actual).
 * null = no controla existencia; 0 = agotado; >0 = unidades.
 */
export type StockActual = number | null;

export function parseStockActualInput(raw: string): { ok: true; value: StockActual } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  if (!/^\d+$/.test(t)) {
    return { ok: false, error: 'La cantidad debe ser un numero entero (0 o mas), o dejala vacia.' };
  }
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n < 0 || n > 999999) {
    return { ok: false, error: 'La cantidad no es valida.' };
  }
  return { ok: true, value: n };
}

/** Etiqueta automatica segun tus reglas: 1 unica, 2-3 pocas, >=6 muchas; 4-5 sin etiqueta. */
export function avisoDesdeStockActual(stock: number): DisponibilidadAviso | null {
  if (stock <= 0) return null;
  if (stock === 1) return 'unica';
  if (stock <= 3) return 'pocas';
  if (stock >= 6) return 'muchas';
  return null;
}

export type PatchInventarioProducto = {
  stock_actual: StockActual;
  disponibilidad_aviso?: DisponibilidadAviso | null;
  activo?: boolean;
  stock_confirmado_at?: string;
  pausado_por_stock_vencido?: boolean;
};

/**
 * Campos a persistir cuando el vendedor define (o deja vacia) la cantidad.
 * - null: no toca activo ni aviso (el formulario puede enviar aviso manual).
 * - 0: pausa y oculta (activo=false), limpia aviso de escasez.
 * - >0: reactiva, sincroniza aviso automatico.
 */
export function patchDesdeStockActual(
  stock: StockActual,
  opts?: { avisoManualSiSinStock?: DisponibilidadAviso | null }
): PatchInventarioProducto {
  if (stock == null) {
    const patch: PatchInventarioProducto = { stock_actual: null };
    if (opts && 'avisoManualSiSinStock' in (opts ?? {})) {
      patch.disponibilidad_aviso = opts?.avisoManualSiSinStock ?? null;
    }
    return patch;
  }
  if (stock <= 0) {
    return {
      stock_actual: 0,
      disponibilidad_aviso: null,
      activo: false,
      pausado_por_stock_vencido: false,
    };
  }
  return {
    stock_actual: stock,
    disponibilidad_aviso: avisoDesdeStockActual(stock),
    activo: true,
    stock_confirmado_at: new Date().toISOString(),
    pausado_por_stock_vencido: false,
  };
}

export function etiquetaStockActual(stock: StockActual): string {
  if (stock == null) return 'Sin control de cantidad';
  if (stock <= 0) return 'Agotado (0)';
  return `${stock} disponible${stock === 1 ? '' : 's'}`;
}

/** Filtro PostgREST: visible al publico si no controla inventario o tiene unidades. */
export function aplicarFiltroStockPublico<T extends { or: (f: string) => T }>(query: T): T {
  return query.or('stock_actual.is.null,stock_actual.gt.0');
}
