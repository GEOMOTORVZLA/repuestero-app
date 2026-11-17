import * as XLSX from 'xlsx';
import {
  categoriaRespaldoImportacion,
  clasificarCategoriaPorNombre,
} from './clasificarCategoriaProducto';
import { LIMITE_DESCRIPCION_PRODUCTO } from './limiteDescripcionProducto';
import { normalizarMonedaImport } from './monedaProducto';
import { parsePrecioProducto } from './precioProducto';
import { parseStockActualInput } from './stockActualInventario';
import type { VerticalVehiculo } from './verticalVehiculo';

/** Tope igual al de la carga masiva. */
export const MAX_FILAS_APIFY = 1000;

const CODIGO_RE = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const COLUMNAS_LISTAS = [
  'codigo',
  'nombre',
  'categoria',
  'comentarios',
  'precio',
  'moneda',
  'cantidad',
  'imagen_url',
] as const;

export type FilaApifyLista = {
  rowNumber: number;
  codigo: string;
  nombre: string;
  categoria: string;
  origenCategoria: 'nombre' | 'respaldo';
  comentarios: string | null;
  precio: number;
  moneda: 'BS' | 'USD';
  cantidad: number | null;
  imagenesUrl: string[];
};

export type ResultadoApify = {
  filas: FilaApifyLista[];
  errores: string[];
  omitidasSinFoto: number;
  descripcionesRecortadas: number;
  clasificadosPorNombre: number;
  quedaronEnRespaldo: number;
};

function normalizarCodigo(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '-');
}

function textoCelda(valor: unknown): string {
  if (valor == null) return '';
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    if (Number.isInteger(valor)) return String(valor);
    return String(Math.round(valor * 100) / 100);
  }
  if (typeof valor === 'string') return valor.trim();
  return '';
}

function leerCampo(row: Record<string, unknown>, nombre: string): string {
  const buscado = nombre.toLowerCase();
  for (const clave of Object.keys(row)) {
    if (clave.toLowerCase() === buscado) return textoCelda(row[clave]);
  }
  return '';
}

function fotosDeFila(row: Record<string, unknown>): string[] {
  const urls: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const url = leerCampo(row, `images/${i}`);
    if (!url.startsWith('http')) continue;
    if (!urls.includes(url)) urls.push(url);
  }
  if (urls.length === 0) {
    const mini = leerCampo(row, 'thumbnail');
    if (mini.startsWith('http')) urls.push(mini);
  }
  return urls;
}

export function leerFilasExcelApify(buffer: ArrayBuffer): Record<string, unknown>[] {
  const libro = XLSX.read(buffer, { type: 'array' });
  const hoja = libro.SheetNames[0];
  if (!hoja) return [];
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets[hoja], {
    defval: null,
    raw: true,
  });
  return filas;
}

export function adaptarFilasApify(
  rows: Record<string, unknown>[],
  vertical: VerticalVehiculo
): ResultadoApify {
  const vacio: ResultadoApify = {
    filas: [],
    errores: [],
    omitidasSinFoto: 0,
    descripcionesRecortadas: 0,
    clasificadosPorNombre: 0,
    quedaronEnRespaldo: 0,
  };
  if (rows.length === 0) {
    vacio.errores.push('El archivo no tiene publicaciones.');
    return vacio;
  }
  const tieneItem = Object.keys(rows[0]).some((clave) => clave.toLowerCase() === 'itemid');
  if (!tieneItem) {
    vacio.errores.push('Este archivo no parece de Apify: falta la columna itemId.');
    return vacio;
  }

  const filas: FilaApifyLista[] = [];
  const errores: string[] = [];
  let omitidasSinFoto = 0;
  let descripcionesRecortadas = 0;
  let clasificadosPorNombre = 0;
  let quedaronEnRespaldo = 0;

  rows.forEach((row, indice) => {
    const rowNumber = indice + 2;
    const codigo = normalizarCodigo(leerCampo(row, 'itemId'));
    const nombreRaw = leerCampo(row, 'title');
    if (!codigo && !nombreRaw) return;

    if (!codigo || !CODIGO_RE.test(codigo)) {
      errores.push(`Fila ${rowNumber}: el código de Mercado Libre no es válido (${codigo || 'vacío'}).`);
      return;
    }
    if (!nombreRaw) {
      errores.push(`Fila ${rowNumber}: falta el título.`);
      return;
    }

    const fotos = fotosDeFila(row);
    if (fotos.length === 0) {
      omitidasSinFoto += 1;
      return;
    }

    const precio = parsePrecioProducto(leerCampo(row, 'price'));
    if (precio == null) {
      errores.push(`Fila ${rowNumber}: el precio no es válido.`);
      return;
    }
    const moneda = normalizarMonedaImport(leerCampo(row, 'currency')) ?? 'USD';
    const cantidadParsed = parseStockActualInput(leerCampo(row, 'availableQuantity'));
    if (!cantidadParsed.ok) {
      errores.push(`Fila ${rowNumber}: ${cantidadParsed.error}`);
      return;
    }

    let comentarios = leerCampo(row, 'description');
    if (comentarios.length > LIMITE_DESCRIPCION_PRODUCTO) {
      comentarios = comentarios.slice(0, LIMITE_DESCRIPCION_PRODUCTO);
      descripcionesRecortadas += 1;
    }

    const porNombre = clasificarCategoriaPorNombre(nombreRaw, vertical);
    const origenCategoria = porNombre ? 'nombre' : 'respaldo';
    if (porNombre) clasificadosPorNombre += 1;
    else quedaronEnRespaldo += 1;

    filas.push({
      rowNumber,
      codigo,
      nombre: nombreRaw.toUpperCase(),
      categoria: porNombre ?? categoriaRespaldoImportacion(vertical),
      origenCategoria,
      comentarios: comentarios || null,
      precio,
      moneda,
      cantidad: cantidadParsed.value,
      imagenesUrl: fotos,
    });
  });

  if (filas.length > MAX_FILAS_APIFY) {
    return {
      ...vacio,
      errores: [
        `Hay ${filas.length} publicaciones con foto. Esta pantalla prepara hasta ${MAX_FILAS_APIFY}. En Apify usa Max results ${MAX_FILAS_APIFY} o menos.`,
      ],
    };
  }

  return {
    filas,
    errores,
    omitidasSinFoto,
    descripcionesRecortadas,
    clasificadosPorNombre,
    quedaronEnRespaldo,
  };
}

export function filasApifyParaExcel(filas: FilaApifyLista[]): string[][] {
  return filas.map((fila) => [
    fila.codigo,
    fila.nombre,
    fila.categoria,
    fila.comentarios ?? '',
    Number.isInteger(fila.precio) ? String(fila.precio) : fila.precio.toFixed(2),
    fila.moneda,
    fila.cantidad == null ? '' : String(fila.cantidad),
    fila.imagenesUrl.join(';'),
  ]);
}

export function columnasExcelApify(): readonly string[] {
  return COLUMNAS_LISTAS;
}
