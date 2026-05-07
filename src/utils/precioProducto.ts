const PRECIO_DECIMAL_RE = /^\d+(?:[.,]\d{1,2})?$/;

export function parsePrecioProducto(valor: string): number | null {
  const limpio = valor.trim();
  if (!limpio || !PRECIO_DECIMAL_RE.test(limpio)) return null;
  const n = Number(limpio.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function normalizarInputPrecio(valor: string): string {
  return valor
    .replace(/[^\d.,]/g, '')
    .replace(/([.,].*)[.,]/g, '$1')
    .replace(/^([.,])/, '0$1')
    .replace(/^(\d+)([.,]\d{0,2}).*$/, '$1$2');
}

export function formatearPrecioProducto(precio: number | null | undefined): string {
  if (precio == null) return '';
  return Number(precio).toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(Number(precio)) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
