import { useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORIAS_PRODUCTO } from '../data/categoriasProducto';
import { CATEGORIAS_PRODUCTO_MOTO } from '../data/categoriasProductoMoto';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO } from '../utils/verticalVehiculo';
import * as XLSX from 'xlsx';
import { normalizarMonedaImport } from '../utils/monedaProducto';
import { parsePrecioProducto } from '../utils/precioProducto';
import { permitirAccionCliente } from '../utils/rateLimitCliente';
import { parseStockActualInput, patchDesdeStockActual } from '../utils/stockActualInventario';
import { LIMITE_DESCRIPCION_PRODUCTO } from '../utils/limiteDescripcionProducto';
import { copiarFotosExternasDeProductos } from '../utils/copiarFotosImportacion';
import { resolverCodigosRepetidos } from '../utils/codigosImportacionDuplicados';
import {
  categoriaRespaldoImportacion,
  clasificarCategoriaPorNombre,
  resumenClasificacionImportacion,
} from '../utils/clasificarCategoriaProducto';
import './ImportarProductosCSV.css';

type ModoImportacion = 'alta' | 'sincronizar' | 'freemarket_fotos';

/** Plantilla simple: marca/modelo/año van en comentarios. La categoría la asigna la app. */
const PLANTILLA_ALTA_HEADERS = ['nombre', 'comentarios', 'precio', 'moneda', 'cantidad'] as const;

const PLANTILLA_SYNC_HEADERS = [
  'codigo',
  'nombre',
  'comentarios',
  'precio',
  'moneda',
  'cantidad',
] as const;

/** Misma estructura que sincronizar + una columna de URLs separadas por ; (foto 1..4). */
const PLANTILLA_FREEMARKET_HEADERS = [...PLANTILLA_SYNC_HEADERS, 'imagen_url'] as const;

const PLANTILLA_SHEET_PRODUCTOS = 'Productos';
const EJEMPLO_NOMBRE_PLANTILLA = '(EJEMPLO - borrar esta fila)';
const EJEMPLO_CODIGO_PLANTILLA = 'EJEMPLO-001';
const EJEMPLO_IMAGEN_URL_PLANTILLA =
  'https://ejemplo.com/foto1.jpg;https://ejemplo.com/foto2.jpg;https://ejemplo.com/foto3.jpg';

function filaEjemploAlta(vertical: VerticalVehiculo): string[] {
  if (vertical === 'moto') {
    return [
      EJEMPLO_NOMBRE_PLANTILLA,
      'Pastillas delanteras Yamaha YBR 125 2022',
      '18.50',
      'USD',
      '5',
    ];
  }
  return [
    EJEMPLO_NOMBRE_PLANTILLA,
    'Filtro de aceite Toyota Corolla 2020',
    '25.50',
    'USD',
    '10',
  ];
}

function filaEjemploSync(vertical: VerticalVehiculo): string[] {
  return [EJEMPLO_CODIGO_PLANTILLA, ...filaEjemploAlta(vertical)];
}

function filaEjemploFreemarket(vertical: VerticalVehiculo): string[] {
  return [...filaEjemploSync(vertical), EJEMPLO_IMAGEN_URL_PLANTILLA];
}

function esUrlHttpImagenValida(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Parte URLs de una celda (estilo Mercado Libre): separadas por ; en orden foto 1..4. */
function parseUrlsImagenCelda(raw: string): { urls: string[]; error?: string } {
  const partes = raw
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length === 0) return { urls: [] };
  const urls: string[] = [];
  for (let i = 0; i < partes.length; i += 1) {
    if (i >= 4) {
      return {
        urls: [],
        error: `máximo 4 URLs en "imagen_url" (hay ${partes.length}; usa ; entre ellas).`,
      };
    }
    if (!esUrlHttpImagenValida(partes[i])) {
      return { urls: [], error: `URL inválida en posición ${i + 1} (${partes[i]}).` };
    }
    urls.push(partes[i]);
  }
  return { urls };
}

function esFilaEjemploPlantilla(nombre: string, codigo?: string): boolean {
  const n = nombre.trim();
  const c = (codigo ?? '').trim().toUpperCase();
  if (c === EJEMPLO_CODIGO_PLANTILLA || c.startsWith('EJEMPLO-')) return true;
  if (!n) return false;
  return (
    n === EJEMPLO_NOMBRE_PLANTILLA ||
    /^\(EJEMPLO/i.test(n) ||
    /^EJEMPLO\s*[-—]/i.test(n) ||
    /borrar\s+esta\s+fila/i.test(n)
  );
}

function normalizarCodigoProducto(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '-');
}

function nombreArchivoPlantilla(vertical: VerticalVehiculo, modo: ModoImportacion): string {
  // -v3: sin columna categoria. La app la asigna por el nombre.
  if (modo === 'freemarket_fotos') {
    return vertical === 'moto'
      ? 'template_freemarket_fotos_url_moto-v3.xlsx'
      : 'template_freemarket_fotos_url_auto-v3.xlsx';
  }
  if (modo === 'sincronizar') {
    return vertical === 'moto'
      ? 'template_sincronizar_inventario_moto-v3.xlsx'
      : 'template_sincronizar_inventario_auto-v3.xlsx';
  }
  return vertical === 'moto' ? 'template_productos_moto-v3.xlsx' : 'template_productos_auto-v3.xlsx';
}

function headersPlantilla(modo: ModoImportacion): string[] {
  if (modo === 'freemarket_fotos') return [...PLANTILLA_FREEMARKET_HEADERS];
  if (modo === 'sincronizar') return [...PLANTILLA_SYNC_HEADERS];
  return [...PLANTILLA_ALTA_HEADERS];
}

function filaEjemploPlantilla(vertical: VerticalVehiculo, modo: ModoImportacion): string[] {
  if (modo === 'freemarket_fotos') return filaEjemploFreemarket(vertical);
  if (modo === 'sincronizar') return filaEjemploSync(vertical);
  return filaEjemploAlta(vertical);
}

function descargarPlantillaImportacion(vertical: VerticalVehiculo, modo: ModoImportacion): void {
  const headers = headersPlantilla(modo);
  const ejemplo = filaEjemploPlantilla(vertical, modo);
  const wsProductos = XLSX.utils.aoa_to_sheet([headers, ejemplo]);
  const colsBase =
    modo === 'alta'
      ? [{ wch: 42 }, { wch: 42 }, { wch: 10 }, { wch: 8 }, { wch: 10 }]
      : [{ wch: 18 }, { wch: 42 }, { wch: 42 }, { wch: 10 }, { wch: 8 }, { wch: 10 }];
  wsProductos['!cols'] = modo === 'freemarket_fotos' ? [...colsBase, { wch: 72 }] : colsBase;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsProductos, PLANTILLA_SHEET_PRODUCTOS);
  XLSX.writeFile(wb, nombreArchivoPlantilla(vertical, modo), { compression: true });
}

function sheetNameProductosImport(workbook: XLSX.WorkBook): string {
  if (workbook.SheetNames.includes(PLANTILLA_SHEET_PRODUCTOS)) {
    return PLANTILLA_SHEET_PRODUCTOS;
  }
  return workbook.SheetNames[0] ?? PLANTILLA_SHEET_PRODUCTOS;
}

type Moneda = 'BS' | 'USD';

type ParsedRow = {
  rowNumber: number;
  codigo: string | null;
  nombre: string;
  categoria: string;
  origenCategoria: 'archivo' | 'nombre' | 'respaldo';
  comentarios: string | null;
  precio: number;
  moneda: Moneda;
  cantidad: number | null;
  imagenesUrl: string[];
};

type LotePendienteImport = {
  filas: ParsedRow[];
  tiendaId: string;
  codigosExistentes: Map<string, string>;
  modo: ModoImportacion;
  aActualizar: number;
  aCrear: number;
};

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_');
}

function parseXLSXToRows(arrayBuffer: ArrayBuffer): string[][] {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = sheetNameProductosImport(workbook);
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [];

  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][];
  return (rawRows ?? [])
    .map((r) =>
      (r ?? []).map((cell) => {
        if (cell == null) return '';
        return String(cell).trim();
      })
    )
    .filter((r) => r.some((c) => c !== ''));
}

async function mapaCodigosExistentesTienda(tiendaId: string): Promise<
  | {
      ok: true;
      map: Map<string, string>;
      existentes: { codigo: string; nombre: string }[];
    }
  | { ok: false; error: string }
> {
  const map = new Map<string, string>();
  const existentes: { codigo: string; nombre: string }[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('productos')
      .select('id, codigo, nombre')
      .eq('tienda_id', tiendaId)
      .not('codigo', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) {
      return {
        ok: false,
        error:
          error.message?.includes('codigo') || error.code === '42703'
            ? 'Falta la columna productos.codigo en Supabase. Ejecuta supabase-productos-codigo-sync.sql.'
            : error.message || 'No se pudieron cargar los códigos existentes.',
      };
    }
    const batch = (data ?? []) as { id: string; codigo: string | null; nombre: string | null }[];
    for (const row of batch) {
      const c = normalizarCodigoProducto(String(row.codigo ?? ''));
      if (!c || map.has(c)) continue;
      map.set(c, row.id);
      existentes.push({ codigo: c, nombre: String(row.nombre ?? '') });
    }
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return { ok: true, map, existentes };
}

export function ImportarProductosCSV({
  onImportado,
  vertical = VERTICAL_AUTO,
  modoAdmin = false,
  tiendaIdDestino = null,
  etiquetaDestino = null,
}: {
  onImportado?: () => void;
  vertical?: VerticalVehiculo;
  modoAdmin?: boolean;
  tiendaIdDestino?: string | null;
  etiquetaDestino?: string | null;
}) {
  const { user } = useAuth();
  const [modoImportacion, setModoImportacion] = useState<ModoImportacion>('alta');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<'idle' | 'analizando' | 'confirmar' | 'importando' | 'ok' | 'error'>(
    'idle'
  );
  const [mensaje, setMensaje] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [insertados, setInsertados] = useState(0);
  const [actualizados, setActualizados] = useState(0);
  const [lotePendiente, setLotePendiente] = useState<LotePendienteImport | null>(null);

  const categoriasLookup = useMemo(() => {
    const m = new Map<string, string>();
    const lista = vertical === 'moto' ? CATEGORIAS_PRODUCTO_MOTO : CATEGORIAS_PRODUCTO;
    for (const c of lista) m.set(c.toUpperCase(), c);
    // Plantillas / productos viejos con el nombre anterior.
    if (vertical !== 'moto') m.set('CAUCHOS', 'Cauchos y rines');
    return m;
  }, [vertical]);

  const esSync = modoImportacion === 'sincronizar';
  const esFreemarket = modoImportacion === 'freemarket_fotos';
  const usaCodigoObligatorio = esSync || esFreemarket;
  const ocupado = estado === 'analizando' || estado === 'importando';

  const reiniciarFormularioParcial = () => {
    setMensaje('');
    setErrores([]);
    setInsertados(0);
    setActualizados(0);
    setLotePendiente(null);
    setEstado('idle');
  };

  const descargarTemplate = () => {
    descargarPlantillaImportacion(vertical, modoImportacion);
  };

  const etiquetaModo = esFreemarket
    ? 'Artículos con código y foto con URL'
    : esSync
      ? 'Artículos con código SKU'
      : 'Artículos sin código';

  /** Analiza el Excel y pide confirmación; aún no escribe en la base. */
  const analizarArchivo = async () => {
    setEstado('idle');
    setMensaje('');
    setErrores([]);
    setInsertados(0);
    setActualizados(0);
    setLotePendiente(null);

    if (!user) {
      setEstado('error');
      setMensaje(modoAdmin ? 'Debes iniciar sesión como administrador.' : 'Debes iniciar sesión como vendedor.');
      return;
    }
    if (modoAdmin && !tiendaIdDestino) {
      setEstado('error');
      setMensaje('Selecciona el vendedor (tienda) al que se asignarán los productos.');
      return;
    }
    if (!archivo) {
      setEstado('error');
      setMensaje('Selecciona un archivo Excel (.xlsx o .xls).');
      return;
    }

    const MAX_MB = 2;
    if (archivo.size > MAX_MB * 1024 * 1024) {
      setEstado('error');
      setMensaje(`El archivo no debe superar ${MAX_MB} MB.`);
      return;
    }

    const ext = (archivo.name.split('.').pop() ?? '').toLowerCase();
    if (ext === 'csv') {
      setEstado('error');
      setMensaje('La importación CSV está suspendida por ahora. Usa la plantilla Excel (.xlsx).');
      return;
    }
    if (ext !== 'xlsx' && ext !== 'xls') {
      setEstado('error');
      setMensaje('Solo se admite Excel (.xlsx o .xls). Descarga la plantilla e inténtalo de nuevo.');
      return;
    }

    setEstado('analizando');
    setMensaje('Leyendo Excel...');

    let parsed: string[][];
    try {
      const buffer = await archivo.arrayBuffer();
      parsed = parseXLSXToRows(buffer);
    } catch {
      setEstado('error');
      setMensaje('No se pudo leer el archivo Excel (.xls / .xlsx).');
      return;
    }

    if (parsed.length < 2) {
      setEstado('error');
      setMensaje('El archivo no tiene datos (solo encabezado o vacío).');
      return;
    }

    const [header, ...dataRows] = parsed;
    const headerMap = new Map<string, number>();
    header.forEach((h, idx) => headerMap.set(normalizeHeader(h), idx));

    const get = (row: string[], key: string): string => {
      const idx = headerMap.get(normalizeHeader(key));
      if (idx === undefined) return '';
      return row[idx] ?? '';
    };

    const REQUIRED = usaCodigoObligatorio
      ? (['codigo', 'nombre', 'precio', 'moneda'] as const)
      : (['nombre', 'precio', 'moneda'] as const);
    const missingHeaders = REQUIRED.filter((k) => headerMap.get(normalizeHeader(k)) === undefined);
    if (missingHeaders.length) {
      setEstado('error');
      setMensaje(
        `Faltan columnas en el archivo: ${missingHeaders.join(', ')}. Descarga la plantilla del modo actual.`
      );
      return;
    }
    if (esFreemarket && headerMap.get(normalizeHeader('imagen_url')) === undefined) {
      setEstado('error');
      setMensaje(
        'Falta la columna "imagen_url". Descarga la plantilla de artículos con código y foto con URL.'
      );
      return;
    }

    setMensaje('Validando filas...');

    if (dataRows.length > 1000) {
      setEstado('error');
      setMensaje('El archivo no debe tener más de 1000 filas de productos.');
      return;
    }

    const filas: ParsedRow[] = [];
    const erroresFila: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2;

      const codigoRaw = get(row, 'codigo') || get(row, 'sku') || get(row, 'codigo_vendedor');
      const codigoNorm = codigoRaw ? normalizarCodigoProducto(codigoRaw) : '';
      const nombreRaw = get(row, 'nombre').trim();

      if (esFilaEjemploPlantilla(nombreRaw, codigoNorm)) continue;

      if (usaCodigoObligatorio) {
        if (!codigoNorm) {
          erroresFila.push(
            `Fila ${rowNumber}: falta "codigo". Esta carga lo pide.`
          );
          continue;
        }
      }

      const nombre = nombreRaw.toUpperCase();
      const categoriaEscrita = get(row, 'categoria').trim();
      const comentariosRaw = get(row, 'comentarios') || get(row, 'descripcion') || '';
      const precioRaw = get(row, 'precio');
      const monedaRaw = get(row, 'moneda');
      const moneda = normalizarMonedaImport(monedaRaw);

      if (!nombre) {
        erroresFila.push(`Fila ${rowNumber}: falta "nombre".`);
        continue;
      }
      let categoriaFinal =
        categoriaEscrita && categoriasLookup.has(categoriaEscrita.toUpperCase())
          ? categoriasLookup.get(categoriaEscrita.toUpperCase()) ?? null
          : null;
      let origenCategoria: ParsedRow['origenCategoria'] = 'archivo';
      if (!categoriaFinal) {
        const porNombre = clasificarCategoriaPorNombre(nombreRaw, vertical);
        if (porNombre) {
          categoriaFinal = porNombre;
          origenCategoria = 'nombre';
        } else {
          categoriaFinal = categoriaRespaldoImportacion(vertical);
          origenCategoria = 'respaldo';
        }
      }

      const precio = parsePrecioProducto(precioRaw);
      if (precio == null) {
        erroresFila.push(
          `Fila ${rowNumber}: "precio" inválido (${precioRaw || 'vacío'}). Usa máximo 2 decimales.`
        );
        continue;
      }
      if (!moneda) {
        erroresFila.push(
          `Fila ${rowNumber}: "moneda" no reconocida (${monedaRaw || 'vacío'}). Usa BS o USD.`
        );
        continue;
      }

      const comentarios = comentariosRaw.trim();
      if (comentarios.length > LIMITE_DESCRIPCION_PRODUCTO) {
        erroresFila.push(
          `Fila ${rowNumber}: "comentarios" supera ${LIMITE_DESCRIPCION_PRODUCTO} caracteres.`
        );
        continue;
      }

      const cantidadRaw =
        get(row, 'cantidad') || get(row, 'existencia') || get(row, 'stock') || get(row, 'stock_actual');
      const cantidadParsed = parseStockActualInput(cantidadRaw);
      if (!cantidadParsed.ok) {
        erroresFila.push(`Fila ${rowNumber}: ${cantidadParsed.error}`);
        continue;
      }

      const imagenesUrl: string[] = [];
      if (esFreemarket) {
        const celda =
          get(row, 'imagen_url') || get(row, 'url_imagen') || get(row, 'foto_url') || get(row, 'fotos');
        const parsedUrls = parseUrlsImagenCelda(celda);
        if (parsedUrls.error) {
          erroresFila.push(`Fila ${rowNumber}: ${parsedUrls.error}`);
          continue;
        }
        if (parsedUrls.urls.length === 0) {
          erroresFila.push(
            `Fila ${rowNumber}: falta al menos una URL en "imagen_url" (separa varias con ; ).`
          );
          continue;
        }
        imagenesUrl.push(...parsedUrls.urls);
      }

      filas.push({
        rowNumber,
        codigo: codigoNorm || null,
        nombre,
        categoria: categoriaFinal,
        origenCategoria,
        comentarios: comentarios.length ? comentarios : null,
        precio,
        moneda,
        cantidad: cantidadParsed.value,
        imagenesUrl,
      });
    }

    if (erroresFila.length) {
      setErrores(erroresFila.slice(0, 20));
      setEstado('error');
      setMensaje(
        `Encontramos ${erroresFila.length} error(es) en el archivo. Corrígelos y reintenta. (Mostrando hasta 20)`
      );
      return;
    }

    if (filas.length === 0) {
      setEstado('error');
      setMensaje(
        'No hay productos para importar. Llena la hoja Productos del Excel (borra la fila de ejemplo si sigue ahí).'
      );
      return;
    }

    let tiendaId: string | null = null;
    if (modoAdmin && tiendaIdDestino) {
      tiendaId = tiendaIdDestino;
    } else {
      const { data: tiendasData, error: errTiendas } = await supabase
        .from('tiendas')
        .select('id')
        .eq('user_id', user.id)
        .order('nombre')
        .limit(1);
      if (errTiendas) {
        setEstado('error');
        setMensaje(errTiendas.message || 'Error al cargar tu tienda.');
        return;
      }
      const tienda = (tiendasData && tiendasData[0]) || null;
      if (!tienda) {
        setEstado('error');
        setMensaje('No se encontró una tienda asociada a tu usuario. Debes completar "Mi perfil".');
        return;
      }
      tiendaId = tienda.id;
    }

    let codigosExistentes = new Map<string, string>();
    let existentesNombre: { codigo: string; nombre: string }[] = [];
    if (usaCodigoObligatorio || filas.some((f) => f.codigo)) {
      setMensaje('Cargando códigos existentes de la tienda...');
      const mapa = await mapaCodigosExistentesTienda(tiendaId!);
      if (!mapa.ok) {
        setEstado('error');
        setMensaje(mapa.error);
        return;
      }
      codigosExistentes = mapa.map;
      existentesNombre = mapa.existentes;
    }

    const resuelto = resolverCodigosRepetidos(filas, existentesNombre);
    const filasListas = resuelto.filas;

    let aActualizar = 0;
    let aCrear = 0;
    let clasificadosPorNombre = 0;
    let quedaronEnRespaldo = 0;
    for (const r of filasListas) {
      const actualizaExistente = (esSync || esFreemarket) && r.codigo && codigosExistentes.has(r.codigo);
      if (actualizaExistente) {
        aActualizar += 1;
        continue;
      }
      aCrear += 1;
      if (r.origenCategoria === 'nombre') clasificadosPorNombre += 1;
      if (r.origenCategoria === 'respaldo') quedaronEnRespaldo += 1;
    }
    const textoClasificacion = resumenClasificacionImportacion(
      vertical,
      clasificadosPorNombre,
      quedaronEnRespaldo
    );

    setLotePendiente({
      filas: filasListas,
      tiendaId: tiendaId!,
      codigosExistentes,
      modo: modoImportacion,
      aActualizar,
      aCrear,
    });
    setEstado('confirmar');
    setMensaje(
      `Lote listo para revisar: ${filasListas.length} fila(s) válida(s).${
        textoClasificacion ? ` ${textoClasificacion}` : ''
      } Confirma si deseas subirlo.`
    );
  };

  const cancelarLotePendiente = () => {
    setLotePendiente(null);
    setEstado('idle');
    setMensaje('Carga cancelada. No se modificó el inventario.');
    setErrores([]);
  };

  /** Escribe en la base solo tras confirmar el lote analizado. */
  const confirmarYSubirLote = async () => {
    if (!lotePendiente || !user) return;

    const rl = permitirAccionCliente(
      modoAdmin
        ? lotePendiente.modo === 'freemarket_fotos'
          ? 'freemarket-fotos-admin'
          : lotePendiente.modo === 'sincronizar'
            ? 'sync-inventario-admin'
            : 'importar-productos-admin'
        : lotePendiente.modo === 'freemarket_fotos'
          ? 'freemarket-fotos'
          : lotePendiente.modo === 'sincronizar'
            ? 'sync-inventario'
            : 'importar-productos',
      {
        maxIntentos: modoAdmin ? 12 : lotePendiente.modo !== 'alta' ? 8 : 4,
        ventanaMs: 10 * 60 * 1000,
        bloqueoMs: 3 * 60 * 1000,
      }
    );
    if (!rl.ok) {
      setEstado('error');
      setMensaje(rl.mensaje);
      return;
    }

    const { filas, tiendaId } = lotePendiente;
    const codigosExistentes = new Map(lotePendiente.codigosExistentes);
    const modoLote = lotePendiente.modo;
    const esSyncLote = modoLote === 'sincronizar';
    const esFreemarketLote = modoLote === 'freemarket_fotos';
    const usaCodigoLote = esSyncLote || esFreemarketLote;

    setEstado('importando');
    setMensaje(
      esFreemarketLote
        ? modoAdmin
          ? `Subiendo inventario y fotos en ${etiquetaDestino?.trim() || 'la tienda'}...`
          : 'Subiendo inventario y fotos...'
        : esSyncLote
          ? modoAdmin
            ? `Subiendo inventario en ${etiquetaDestino?.trim() || 'la tienda'}...`
            : 'Subiendo inventario...'
          : modoAdmin
            ? `Publicando artículos en ${etiquetaDestino?.trim() || 'la tienda seleccionada'}...`
            : 'Publicando artículos...'
    );

    let okInsert = 0;
    let okUpdate = 0;
    const erroresOp: string[] = [];
    const fotosPendientes: { rowNumber: number; productoId: string; urls: string[] }[] = [];

    for (const r of filas) {
      const inv = patchDesdeStockActual(r.cantidad);
      const existenteId = r.codigo ? codigosExistentes.get(r.codigo) : undefined;
      const patchFotos =
        esFreemarketLote && r.imagenesUrl.length > 0
          ? {
              imagen_url: r.imagenesUrl[0],
              imagenes_extra: r.imagenesUrl.length > 1 ? r.imagenesUrl.slice(1) : null,
            }
          : null;

      if ((esSyncLote || esFreemarketLote) && existenteId) {
        const patch: Record<string, unknown> = {
          nombre: r.nombre,
          descripcion: r.comentarios,
          comentarios: r.comentarios,
          precio_usd: r.precio,
          moneda: r.moneda,
          stock_actual: inv.stock_actual,
          disponibilidad_aviso: inv.disponibilidad_aviso ?? null,
          pausado_por_stock_vencido: inv.pausado_por_stock_vencido ?? false,
        };
        if (inv.activo !== undefined) patch.activo = inv.activo;
        if (inv.stock_confirmado_at) patch.stock_confirmado_at = inv.stock_confirmado_at;
        if (patchFotos) {
          patch.imagen_url = patchFotos.imagen_url;
          patch.imagenes_extra = patchFotos.imagenes_extra;
        }

        const { error: updError } = await supabase.from('productos').update(patch).eq('id', existenteId);
        if (updError) {
          erroresOp.push(`Fila ${r.rowNumber}: ${updError.message || 'Error actualizando.'}`);
          continue;
        }
        if (patchFotos) {
          fotosPendientes.push({ rowNumber: r.rowNumber, productoId: existenteId, urls: r.imagenesUrl });
        }
        okUpdate += 1;
        continue;
      }

      const payload: Record<string, unknown> = {
        tienda_id: tiendaId,
        nombre: r.nombre,
        categoria: r.categoria,
        marca: null,
        modelo: null,
        anio: null,
        descripcion: r.comentarios,
        comentarios: r.comentarios,
        precio_usd: r.precio,
        moneda: r.moneda,
        stock_actual: inv.stock_actual,
        disponibilidad_aviso: inv.disponibilidad_aviso ?? null,
        activo: inv.activo !== undefined ? inv.activo : true,
        aprobacion_publica: 'aprobado',
        stock_confirmado_at: inv.stock_confirmado_at ?? new Date().toISOString(),
        pausado_por_stock_vencido: inv.pausado_por_stock_vencido ?? false,
        vertical,
      };
      if (r.codigo) payload.codigo = r.codigo;
      if (patchFotos) {
        payload.imagen_url = patchFotos.imagen_url;
        payload.imagenes_extra = patchFotos.imagenes_extra;
      }

      const { data: inserted, error: insertError } = await supabase
        .from('productos')
        .insert(payload)
        .select('id, codigo')
        .maybeSingle();

      if (insertError) {
        const msg = insertError.message || 'Error insertando.';
        erroresOp.push(
          `Fila ${r.rowNumber}: ${
            msg.includes('codigo') && msg.toLowerCase().includes('does not exist')
              ? 'Falta la columna productos.codigo. Ejecuta supabase-productos-codigo-sync.sql en Supabase.'
              : msg
          }`
        );
        continue;
      }

      if (inserted?.id && r.codigo) {
        codigosExistentes.set(r.codigo, inserted.id);
      }
      if (patchFotos && inserted?.id) {
        fotosPendientes.push({ rowNumber: r.rowNumber, productoId: inserted.id, urls: r.imagenesUrl });
      }
      okInsert += 1;
    }

    let fotosCopiadas = 0;
    const fallosFoto: string[] = [];
    if (fotosPendientes.length) {
      setMensaje(`Copiando fotos al almacenamiento (${fotosPendientes.length})...`);
      const copia = await copiarFotosExternasDeProductos(fotosPendientes, (hechos, total) => {
        setMensaje(`Copiando fotos al almacenamiento (${hechos} de ${total})...`);
      });
      fotosCopiadas = copia.copiadas;
      fallosFoto.push(...copia.fallos);
    }

    setLotePendiente(null);
    setInsertados(okInsert);
    setActualizados(okUpdate);

    const textoFotos =
      fotosPendientes.length > 0
        ? ` Fotos guardadas en Supabase: ${fotosCopiadas}.${
            fallosFoto.length ? ` No se pudieron copiar ${fallosFoto.length}; esas siguen con el enlace original.` : ''
          }`
        : '';

    if (erroresOp.length || fallosFoto.length) {
      setErrores([...erroresOp, ...fallosFoto].slice(0, 20));
      setEstado(erroresOp.length ? 'error' : 'ok');
      setMensaje(
        erroresOp.length
          ? usaCodigoLote
            ? `Parcial: ${okUpdate} actualizado(s), ${okInsert} nuevo(s); ${erroresOp.length} error(es).${textoFotos} (Mostrando hasta 20)`
            : `Se insertaron ${okInsert} producto(s), pero hubo ${erroresOp.length} error(es).${textoFotos} (Mostrando hasta 20)`
          : `Productos listos: ${okUpdate} actualizado(s), ${okInsert} nuevo(s).${textoFotos}`
      );
      if (okInsert + okUpdate > 0) onImportado?.();
      return;
    }

    setEstado('ok');
    setMensaje(
      esFreemarketLote
        ? `Listo: ${okUpdate} actualizado(s), ${okInsert} nuevo(s).${textoFotos}`
        : esSyncLote
          ? `Listo: ${okUpdate} actualizado(s). La categoría y las fotos no cambiaron. ${okInsert} nuevo(s) sin foto.`
          : modoAdmin
            ? `Listo: ${okInsert} artículo(s) publicados en ${etiquetaDestino?.trim() || 'la tienda'}.`
            : `Listo: ${okInsert} artículo(s) publicados.`
    );
    onImportado?.();
  };

  return (
    <div className="importar-productos">
      <div className="importar-productos-header">
        <h3 className="importar-productos-titulo">
          {modoAdmin ? 'Carga de inventario del vendedor' : 'Carga de inventario'}
        </h3>
      </div>

      <div className="importar-productos-modo" role="group" aria-label="Tipo de carga">
        <div className="importar-productos-modo-fila">
          <button
            type="button"
            className={`importar-productos-modo-btn${modoImportacion === 'alta' ? ' activo' : ''}`}
            disabled={ocupado}
            onClick={() => {
              setModoImportacion('alta');
              setArchivo(null);
              reiniciarFormularioParcial();
            }}
          >
            Artículos sin código
          </button>
          <p className="importar-productos-modo-nota">
            Crea artículos nuevos, sin código. La categoría la asigna la app.
          </p>
        </div>
        <div className="importar-productos-modo-fila">
          <button
            type="button"
            className={`importar-productos-modo-btn${modoImportacion === 'sincronizar' ? ' activo' : ''}`}
            disabled={ocupado}
            onClick={() => {
              setModoImportacion('sincronizar');
              setArchivo(null);
              reiniciarFormularioParcial();
            }}
          >
            Artículos con código SKU
          </button>
          <p className="importar-productos-modo-nota">
            Actualiza precio, nombre y cantidad con el código. Las fotos no cambian.
          </p>
        </div>
        <div className="importar-productos-modo-fila">
          <button
            type="button"
            className={`importar-productos-modo-btn${modoImportacion === 'freemarket_fotos' ? ' activo' : ''}`}
            disabled={ocupado}
            onClick={() => {
              setModoImportacion('freemarket_fotos');
              setArchivo(null);
              reiniciarFormularioParcial();
            }}
          >
            Artículos con código y foto con URL
          </button>
          <p className="importar-productos-modo-nota">
            Actualiza por código y guarda las fotos desde los enlaces del Excel.
          </p>
        </div>
      </div>

      <input
        type="file"
        accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => {
          setArchivo(e.target.files && e.target.files[0] ? e.target.files[0] : null);
          setLotePendiente(null);
          if (estado === 'confirmar' || estado === 'ok' || estado === 'error') {
            setEstado('idle');
            setMensaje('');
            setErrores([]);
            setInsertados(0);
            setActualizados(0);
          }
        }}
        disabled={ocupado}
      />

      <div className="importar-productos-botones-row">
        <button
          type="button"
          onClick={descargarTemplate}
          className="importar-productos-link"
          disabled={ocupado}
        >
          Descargar plantilla (.xlsx)
        </button>

        <button
          type="button"
          className="importar-productos-boton"
          onClick={() => void analizarArchivo()}
          disabled={ocupado || estado === 'confirmar' || !archivo || (modoAdmin && !tiendaIdDestino)}
          title={
            modoAdmin && !tiendaIdDestino ? 'Selecciona primero el vendedor destino' : undefined
          }
        >
          {estado === 'analizando' ? 'Revisando archivo...' : 'Subir inventario a la app'}
        </button>
      </div>

      {(estado === 'confirmar' || (estado === 'importando' && lotePendiente)) && lotePendiente && (
        <div className="importar-productos-confirmacion" role="alertdialog" aria-labelledby="importar-confirm-titulo">
          <p id="importar-confirm-titulo" className="importar-productos-confirmacion-titulo">
            {estado === 'importando'
              ? 'Subiendo lote de inventario…'
              : '¿Seguro de subir este lote de inventario?'}
          </p>
          <ul className="importar-productos-confirmacion-lista">
            <li>
              Modo: <strong>{etiquetaModo}</strong>
            </li>
            {modoAdmin && (
              <li>
                Destino: <strong>{etiquetaDestino?.trim() || 'tienda seleccionada'}</strong>
              </li>
            )}
            <li>
              Filas válidas: <strong>{lotePendiente.filas.length}</strong>
            </li>
            <li>
              Se actualizarán: <strong>{lotePendiente.aActualizar}</strong>
            </li>
            <li>
              Se crearán: <strong>{lotePendiente.aCrear}</strong>
            </li>
          </ul>
          {estado === 'confirmar' && (
            <p className="importar-productos-confirmacion-aviso">
              Si eliges No, no se modifica nada en la base. Revisa que el archivo y el modo sean los correctos.
            </p>
          )}
          <div className="importar-productos-botones-row">
            <button
              type="button"
              className="importar-productos-boton-cancelar"
              disabled={ocupado}
              onClick={cancelarLotePendiente}
            >
              No, cancelar
            </button>
            <button
              type="button"
              className="importar-productos-boton"
              disabled={ocupado}
              onClick={() => void confirmarYSubirLote()}
            >
              {estado === 'importando' ? 'Subiendo lote...' : 'Sí, subir lote'}
            </button>
          </div>
        </div>
      )}

      {mensaje && (
        <p
          className={`importar-productos-mensaje ${
            estado === 'error' ? 'error' : estado === 'ok' ? 'ok' : ''
          }`}
        >
          {mensaje}
        </p>
      )}

      {errores.length > 0 && (
        <div className="importar-productos-errores">
          <p className="importar-productos-mensaje error">Errores (máximo 20):</p>
          <ul>
            {errores.map((e, idx) => (
              <li key={`${idx}-${e}`}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {(insertados > 0 || actualizados > 0) && estado !== 'importando' && estado !== 'analizando' && (
        <p className="importar-productos-mensaje ok">
          {actualizados > 0 ? `Actualizados: ${actualizados}. ` : null}
          {insertados > 0 ? `Nuevos: ${insertados}.` : null}
        </p>
      )}
    </div>
  );
}
