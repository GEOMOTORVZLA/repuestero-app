import { useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORIAS_PRODUCTO } from '../data/categoriasProducto';
import { CATEGORIAS_PRODUCTO_MOTO } from '../data/categoriasProductoMoto';
import { MARCAS_VEHICULOS } from '../data/marcasVehiculos';
import { MARCAS_MOTOS } from '../data/marcasMotos';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO } from '../utils/verticalVehiculo';
import * as XLSX from 'xlsx';
import { normalizarMonedaImport } from '../utils/monedaProducto';
import { parsePrecioProducto } from '../utils/precioProducto';
import { permitirAccionCliente } from '../utils/rateLimitCliente';
import { parseStockActualInput, patchDesdeStockActual } from '../utils/stockActualInventario';
import './ImportarProductosCSV.css';

type ModoImportacion = 'alta' | 'sincronizar';

const PLANTILLA_ALTA_HEADERS = [
  'nombre',
  'categoria',
  'marca',
  'modelo',
  'anio',
  'comentarios',
  'precio',
  'moneda',
  'cantidad',
] as const;

const PLANTILLA_SYNC_HEADERS = [
  'codigo',
  'nombre',
  'categoria',
  'marca',
  'modelo',
  'anio',
  'comentarios',
  'precio',
  'moneda',
  'cantidad',
] as const;

const PLANTILLA_SHEET_PRODUCTOS = 'Productos';
const EJEMPLO_NOMBRE_PLANTILLA = '(EJEMPLO - borrar esta fila)';
const EJEMPLO_CODIGO_PLANTILLA = 'EJEMPLO-001';

function listasPlantillaImport(vertical: VerticalVehiculo) {
  return {
    categorias: vertical === 'moto' ? [...CATEGORIAS_PRODUCTO_MOTO] : [...CATEGORIAS_PRODUCTO],
    marcas: vertical === 'moto' ? [...MARCAS_MOTOS] : [...MARCAS_VEHICULOS],
  };
}

function filaEjemploAlta(vertical: VerticalVehiculo): string[] {
  if (vertical === 'moto') {
    return [
      EJEMPLO_NOMBRE_PLANTILLA,
      'Frenos',
      'Yamaha',
      'YBR 125',
      '2022',
      'Pastillas delanteras originales',
      '18.50',
      'USD',
      '5',
    ];
  }
  return [
    EJEMPLO_NOMBRE_PLANTILLA,
    'Filtros',
    'Toyota',
    'Corolla',
    '2020',
    'Filtro de aceite compatible',
    '25.50',
    'USD',
    '10',
  ];
}

function filaEjemploSync(vertical: VerticalVehiculo): string[] {
  const alta = filaEjemploAlta(vertical);
  return [EJEMPLO_CODIGO_PLANTILLA, ...alta];
}

function sheetListaReferenciaPlantilla(titulo: string, valores: readonly string[]): XLSX.WorkSheet {
  const rows = [[titulo], ...valores.map((v) => [v])];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: Math.max(titulo.length, ...valores.map((v) => v.length), 12) + 2 }];
  return ws;
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
  if (modo === 'sincronizar') {
    return vertical === 'moto'
      ? 'template_sincronizar_inventario_moto.xlsx'
      : 'template_sincronizar_inventario_auto.xlsx';
  }
  return vertical === 'moto' ? 'template_productos_moto.xlsx' : 'template_productos_auto.xlsx';
}

function descargarPlantillaImportacion(vertical: VerticalVehiculo, modo: ModoImportacion): void {
  const { categorias, marcas } = listasPlantillaImport(vertical);
  const headers = modo === 'sincronizar' ? [...PLANTILLA_SYNC_HEADERS] : [...PLANTILLA_ALTA_HEADERS];
  const ejemplo = modo === 'sincronizar' ? filaEjemploSync(vertical) : filaEjemploAlta(vertical);
  const wsProductos = XLSX.utils.aoa_to_sheet([headers, ejemplo]);
  wsProductos['!cols'] =
    modo === 'sincronizar'
      ? [
          { wch: 18 },
          { wch: 34 },
          { wch: 30 },
          { wch: 22 },
          { wch: 18 },
          { wch: 8 },
          { wch: 36 },
          { wch: 10 },
          { wch: 8 },
          { wch: 10 },
        ]
      : [
          { wch: 34 },
          { wch: 30 },
          { wch: 22 },
          { wch: 18 },
          { wch: 8 },
          { wch: 36 },
          { wch: 10 },
          { wch: 8 },
          { wch: 10 },
        ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsProductos, PLANTILLA_SHEET_PRODUCTOS);
  XLSX.utils.book_append_sheet(wb, sheetListaReferenciaPlantilla('categoria', categorias), 'Categorias');
  XLSX.utils.book_append_sheet(wb, sheetListaReferenciaPlantilla('marca', marcas), 'Marcas');
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
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  comentarios: string | null;
  precio: number;
  moneda: Moneda;
  cantidad: number | null;
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

function normalizeOptionalText(value: string): string | null {
  const v = value.trim();
  return v ? v : null;
}

async function mapaCodigosExistentesTienda(
  tiendaId: string
): Promise<{ ok: true; map: Map<string, string> } | { ok: false; error: string }> {
  const map = new Map<string, string>();
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('productos')
      .select('id, codigo')
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
    const batch = (data ?? []) as { id: string; codigo: string | null }[];
    for (const row of batch) {
      const c = normalizarCodigoProducto(String(row.codigo ?? ''));
      if (c) map.set(c, row.id);
    }
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return { ok: true, map };
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
  const [estado, setEstado] = useState<'idle' | 'importando' | 'ok' | 'error'>('idle');
  const [mensaje, setMensaje] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [insertados, setInsertados] = useState(0);
  const [actualizados, setActualizados] = useState(0);

  const categoriasLookup = useMemo(() => {
    const m = new Map<string, string>();
    const lista = vertical === 'moto' ? CATEGORIAS_PRODUCTO_MOTO : CATEGORIAS_PRODUCTO;
    for (const c of lista) m.set(c.toUpperCase(), c);
    return m;
  }, [vertical]);
  const marcasLookup = useMemo(() => {
    const m = new Map<string, string>();
    const lista = vertical === 'moto' ? MARCAS_MOTOS : MARCAS_VEHICULOS;
    for (const b of lista) m.set(b.toUpperCase(), b);
    if (vertical === 'moto') {
      m.set('KEEWAY', 'Empire Keeway');
    }
    return m;
  }, [vertical]);

  const esSync = modoImportacion === 'sincronizar';

  const descargarTemplate = () => {
    descargarPlantillaImportacion(vertical, modoImportacion);
  };

  const importar = async () => {
    setEstado('idle');
    setMensaje('');
    setErrores([]);
    setInsertados(0);
    setActualizados(0);

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

    const rl = permitirAccionCliente(
      modoAdmin
        ? esSync
          ? 'sync-inventario-admin'
          : 'importar-productos-admin'
        : esSync
          ? 'sync-inventario'
          : 'importar-productos',
      {
        maxIntentos: modoAdmin ? 12 : esSync ? 8 : 4,
        ventanaMs: 10 * 60 * 1000,
        bloqueoMs: 3 * 60 * 1000,
      }
    );
    if (!rl.ok) {
      setEstado('error');
      setMensaje(rl.mensaje);
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

    setEstado('importando');
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

    const REQUIRED = esSync
      ? (['codigo', 'nombre', 'categoria', 'marca', 'precio', 'moneda'] as const)
      : (['nombre', 'categoria', 'marca', 'precio', 'moneda'] as const);
    const missingHeaders = REQUIRED.filter((k) => headerMap.get(normalizeHeader(k)) === undefined);
    if (missingHeaders.length) {
      setEstado('error');
      setMensaje(
        `Faltan columnas en el archivo: ${missingHeaders.join(', ')}. Descarga la plantilla del modo actual.`
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
    const codigosEnArchivo = new Set<string>();

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2;

      const codigoRaw = get(row, 'codigo') || get(row, 'sku') || get(row, 'codigo_vendedor');
      const codigoNorm = codigoRaw ? normalizarCodigoProducto(codigoRaw) : '';
      const nombreRaw = get(row, 'nombre').trim();

      if (esFilaEjemploPlantilla(nombreRaw, codigoNorm)) continue;

      if (esSync) {
        if (!codigoNorm) {
          erroresFila.push(`Fila ${rowNumber}: falta "codigo" (obligatorio en sincronizar).`);
          continue;
        }
        if (codigosEnArchivo.has(codigoNorm)) {
          erroresFila.push(`Fila ${rowNumber}: codigo duplicado en el archivo (${codigoNorm}).`);
          continue;
        }
        codigosEnArchivo.add(codigoNorm);
      } else if (codigoNorm) {
        if (codigosEnArchivo.has(codigoNorm)) {
          erroresFila.push(`Fila ${rowNumber}: codigo duplicado en el archivo (${codigoNorm}).`);
          continue;
        }
        codigosEnArchivo.add(codigoNorm);
      }

      const nombre = nombreRaw.toUpperCase();
      const categoria = get(row, 'categoria').trim();
      const marcaRaw = get(row, 'marca').trim();
      const modelo = normalizeOptionalText(get(row, 'modelo'));
      const anioRaw = get(row, 'anio');
      const comentariosRaw = get(row, 'comentarios') || get(row, 'descripcion') || '';
      const precioRaw = get(row, 'precio');
      const monedaRaw = get(row, 'moneda');
      const moneda = normalizarMonedaImport(monedaRaw);

      if (!nombre) {
        erroresFila.push(`Fila ${rowNumber}: falta "nombre".`);
        continue;
      }
      const categoriaFinal =
        categoria && categoriasLookup.has(categoria.toUpperCase())
          ? categoriasLookup.get(categoria.toUpperCase()) ?? null
          : null;
      if (!categoriaFinal) {
        erroresFila.push(`Fila ${rowNumber}: "categoria" no es válida (${categoria || 'vacío'}).`);
        continue;
      }
      if (!marcaRaw) {
        erroresFila.push(`Fila ${rowNumber}: falta "marca".`);
        continue;
      }
      const marcaRawUpper = marcaRaw.toUpperCase();
      const marca = marcaRawUpper === 'OTRA' ? null : marcasLookup.get(marcaRawUpper) ?? null;
      if (marcaRawUpper !== 'OTRA' && !marca) {
        erroresFila.push(`Fila ${rowNumber}: "marca" no es válida (${marcaRaw}).`);
        continue;
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

      let anio: number | null = null;
      if (anioRaw.trim()) {
        const n = parseInt(anioRaw.trim(), 10);
        if (Number.isNaN(n)) {
          erroresFila.push(`Fila ${rowNumber}: "anio" inválido (${anioRaw}).`);
          continue;
        }
        anio = n;
      }

      const comentarios = comentariosRaw.trim();
      if (comentarios.length > 500) {
        erroresFila.push(`Fila ${rowNumber}: "comentarios" supera 500 caracteres.`);
        continue;
      }

      const cantidadRaw =
        get(row, 'cantidad') || get(row, 'existencia') || get(row, 'stock') || get(row, 'stock_actual');
      const cantidadParsed = parseStockActualInput(cantidadRaw);
      if (!cantidadParsed.ok) {
        erroresFila.push(`Fila ${rowNumber}: ${cantidadParsed.error}`);
        continue;
      }

      filas.push({
        rowNumber,
        codigo: codigoNorm || null,
        nombre,
        categoria: categoriaFinal,
        marca,
        modelo,
        anio,
        comentarios: comentarios.length ? comentarios : null,
        precio,
        moneda,
        cantidad: cantidadParsed.value,
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
    if (esSync || filas.some((f) => f.codigo)) {
      setMensaje('Cargando códigos existentes de la tienda...');
      const mapa = await mapaCodigosExistentesTienda(tiendaId!);
      if (!mapa.ok) {
        setEstado('error');
        setMensaje(mapa.error);
        return;
      }
      codigosExistentes = mapa.map;
    }

    setMensaje(
      esSync
        ? modoAdmin
          ? `Sincronizando inventario en ${etiquetaDestino?.trim() || 'la tienda'}...`
          : 'Sincronizando inventario (actualiza cantidades/precios; conserva fotos)...'
        : modoAdmin
          ? `Insertando productos en ${etiquetaDestino?.trim() || 'la tienda seleccionada'}...`
          : 'Insertando productos...'
    );

    let okInsert = 0;
    let okUpdate = 0;
    const erroresOp: string[] = [];

    for (const r of filas) {
      const inv = patchDesdeStockActual(r.cantidad);
      const existenteId = r.codigo ? codigosExistentes.get(r.codigo) : undefined;

      if (esSync && existenteId) {
        const patch: Record<string, unknown> = {
          precio_usd: r.precio,
          moneda: r.moneda,
          stock_actual: inv.stock_actual,
          disponibilidad_aviso: inv.disponibilidad_aviso ?? null,
          pausado_por_stock_vencido: inv.pausado_por_stock_vencido ?? false,
        };
        if (inv.activo !== undefined) patch.activo = inv.activo;
        if (inv.stock_confirmado_at) patch.stock_confirmado_at = inv.stock_confirmado_at;

        const { error: updError } = await supabase.from('productos').update(patch).eq('id', existenteId);
        if (updError) {
          erroresOp.push(`Fila ${r.rowNumber}: ${updError.message || 'Error actualizando.'}`);
          continue;
        }
        okUpdate += 1;
        continue;
      }

      const payload: Record<string, unknown> = {
        tienda_id: tiendaId,
        nombre: r.nombre,
        categoria: r.categoria,
        marca: r.marca,
        modelo: r.modelo,
        anio: r.anio,
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
      okInsert += 1;
    }

    setInsertados(okInsert);
    setActualizados(okUpdate);

    if (erroresOp.length) {
      setErrores(erroresOp.slice(0, 20));
      setEstado('error');
      setMensaje(
        esSync
          ? `Parcial: ${okUpdate} actualizado(s), ${okInsert} nuevo(s); ${erroresOp.length} error(es). (Mostrando hasta 20)`
          : `Se insertaron ${okInsert} producto(s), pero hubo ${erroresOp.length} error(es). (Mostrando hasta 20)`
      );
      if (okInsert + okUpdate > 0) onImportado?.();
      return;
    }

    setEstado('ok');
    setMensaje(
      esSync
        ? `Sincronización completada: ${okUpdate} actualizado(s) (fotos intactas), ${okInsert} nuevo(s) sin foto.`
        : modoAdmin
          ? `Importación completada: ${okInsert} producto(s) insertados en ${etiquetaDestino?.trim() || 'la tienda'} (sin fotos).`
          : `Importación completada: ${okInsert} producto(s) insertados (sin fotos). Ya están publicados.`
    );
    onImportado?.();
  };

  return (
    <div className="importar-productos">
      <div className="importar-productos-header">
        <h3 className="importar-productos-titulo">
          {modoAdmin
            ? 'Carga masiva de productos para un vendedor'
            : 'Importar productos desde Excel (.xlsx, sin fotos)'}
        </h3>
        <p className="importar-productos-ayuda">
          Elige el modo según tu flujo. <strong>Alta nueva</strong> crea productos.{' '}
          <strong>Sincronizar inventario</strong> actualiza cantidad/precio por{' '}
          <code>codigo</code> y <strong>conserva las fotos</strong> ya cargadas.
        </p>
      </div>

      <div className="importar-productos-modo" role="group" aria-label="Modo de importación">
        <button
          type="button"
          className={`importar-productos-modo-btn${modoImportacion === 'alta' ? ' activo' : ''}`}
          disabled={estado === 'importando'}
          onClick={() => {
            setModoImportacion('alta');
            setArchivo(null);
            setMensaje('');
            setErrores([]);
            setEstado('idle');
          }}
        >
          Alta nueva
        </button>
        <button
          type="button"
          className={`importar-productos-modo-btn${modoImportacion === 'sincronizar' ? ' activo' : ''}`}
          disabled={estado === 'importando'}
          onClick={() => {
            setModoImportacion('sincronizar');
            setArchivo(null);
            setMensaje('');
            setErrores([]);
            setEstado('idle');
          }}
        >
          Sincronizar inventario
        </button>
      </div>

      <p className="importar-productos-ayuda">
        {esSync ? (
          <>
            Descarga la <strong>plantilla de sincronizar</strong> (incluye columna{' '}
            <strong>codigo</strong> obligatoria). Máx. 1000 filas por archivo. Los productos con
            cantidad 0 se pausan sin borrar fotos. Los que no vienen en el archivo no se tocan.
          </>
        ) : (
          <>
            Descarga la plantilla de alta: hojas <strong>Productos</strong>, <strong>Categorias</strong> y{' '}
            <strong>Marcas</strong>. Si quieres sincronizar después, puedes incluir{' '}
            <code>codigo</code> también en el alta (opcional).
          </>
        )}
      </p>

      <input
        type="file"
        accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => setArchivo(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
        disabled={estado === 'importando'}
      />

      <div className="importar-productos-botones-row">
        <button
          type="button"
          onClick={descargarTemplate}
          className="importar-productos-link"
          disabled={estado === 'importando'}
        >
          {esSync
            ? 'Descargar plantilla sincronizar (.xlsx)'
            : 'Descargar plantilla alta nueva (.xlsx)'}
        </button>

        <button
          type="button"
          className="importar-productos-boton"
          onClick={() => void importar()}
          disabled={estado === 'importando' || !archivo || (modoAdmin && !tiendaIdDestino)}
          title={
            modoAdmin && !tiendaIdDestino ? 'Selecciona primero el vendedor destino' : undefined
          }
        >
          {estado === 'importando'
            ? esSync
              ? 'Sincronizando...'
              : 'Importando...'
            : esSync
              ? 'Sincronizar inventario'
              : 'Importar'}
        </button>
      </div>

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

      {(insertados > 0 || actualizados > 0) && estado !== 'importando' && (
        <p className="importar-productos-mensaje ok">
          {actualizados > 0 ? `Actualizados: ${actualizados}. ` : null}
          {insertados > 0 ? `Nuevos: ${insertados}.` : null}
        </p>
      )}
    </div>
  );
}
