import { esMonedaBolivar } from './monedaProducto';

/** Columnas de la plantilla de sincronizar. Sin fotos, para poder volver a subir el archivo. */
export const COLUMNAS_PUBLICACION_ACTIVA = [
  'codigo',
  'nombre',
  'categoria',
  'comentarios',
  'precio',
  'moneda',
  'cantidad',
] as const;

export type ProductoPublicacionExcel = {
  codigo?: string | null;
  nombre?: string | null;
  categoria?: string | null;
  comentarios?: string | null;
  descripcion?: string | null;
  precio_usd?: number | null;
  moneda?: string | null;
  stock_actual?: number | null;
};

function precioParaExcel(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(Number(valor))) return '';
  const n = Math.round(Number(valor) * 100) / 100;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function monedaParaExcel(valor: string | null | undefined): 'BS' | 'USD' {
  return esMonedaBolivar(valor) ? 'BS' : 'USD';
}

function cantidadParaExcel(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(Number(valor))) return '';
  return String(Math.max(0, Math.trunc(Number(valor))));
}

/** Una fila lista para la hoja Productos. El precio no lleva separador de miles, para que la carga lo acepte. */
export function filaPublicacionActivaExcel(producto: ProductoPublicacionExcel): string[] {
  const comentarios = (producto.comentarios ?? '').trim() || (producto.descripcion ?? '').trim();
  return [
    (producto.codigo ?? '').trim(),
    (producto.nombre ?? '').trim(),
    (producto.categoria ?? '').trim(),
    comentarios,
    precioParaExcel(producto.precio_usd),
    monedaParaExcel(producto.moneda),
    cantidadParaExcel(producto.stock_actual),
  ];
}
