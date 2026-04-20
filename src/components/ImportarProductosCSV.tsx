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
import { permitirAccionCliente } from '../utils/rateLimitCliente';
import './ImportarProductosCSV.css';

type Moneda = 'BS' | 'USD';

type ParsedRow = {
  rowNumber: number; // 1-based including header
  nombre: string;
  categoria: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  comentarios: string | null;
  precio: number;
  moneda: Moneda;
};

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Excel en español/LATAM suele usar `;` al exportar CSV; nuestro template usa `,`. */
function detectCsvDelimiter(firstLine: string): ',' | ';' {
  const line = firstLine.replace(/\r$/, '');
  const commas = line.split(',').length - 1;
  const semis = line.split(';').length - 1;
  return semis > commas ? ';' : ',';
}

// CSV/sep parser con soporte de comillas dobles (campos con separador dentro).
function parseDelimited(text: string, delimiter: ',' | ';'): string[][] {
  const input = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;
  const sep = delimiter;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (ch === '"') {
      const next = input[i + 1];
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === sep) {
      current.push(field.trim());
      field = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      current.push(field.trim());
      field = '';
      if (current.length > 1 || current.some((c) => c !== '')) rows.push(current);
      current = [];
      continue;
    }

    field += ch;
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field.trim());
    if (current.length > 1 || current.some((c) => c !== '')) rows.push(current);
  }

  return rows;
}

function parseCSV(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '');
  const firstNl = input.search(/\r?\n/);
  const firstLine = firstNl === -1 ? input : input.slice(0, firstNl);
  const delimiter = detectCsvDelimiter(firstLine);
  return parseDelimited(input, delimiter);
}

function parseXLSXToRows(arrayBuffer: ArrayBuffer): string[][] {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][];
  const rows = (rawRows ?? [])
    .map((r) =>
      (r ?? []).map((cell) => {
        if (cell == null) return '';
        return String(cell).trim();
      })
    )
    .filter((r) => r.some((c) => c !== ''));

  return rows;
}

function normalizeOptionalText(value: string): string | null {
  const v = value.trim();
  return v ? v : null;
}

export function ImportarProductosCSV({
  onImportado,
  vertical = VERTICAL_AUTO,
}: {
  onImportado?: () => void;
  vertical?: VerticalVehiculo;
}) {
  const { user } = useAuth();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<'idle' | 'importando' | 'ok' | 'error'>('idle');
  const [mensaje, setMensaje] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [insertados, setInsertados] = useState(0);

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

  const templateHeaders = useMemo(
    () =>
      [
        'nombre',
        'categoria',
        'marca',
        'modelo',
        'anio',
        'comentarios',
        'precio',
        'moneda',
      ] as const,
    []
  );

  /** Plantilla Excel: evita que Excel (español) meta todo en una sola celda al abrir CSV. */
  const descargarTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([Array.from(templateHeaders)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    XLSX.writeFile(wb, 'template_productos.xlsx', { compression: true });
  };

  /** CSV con UTF-8 BOM para Excel; comas como en la spec internacional. */
  const descargarTemplateCsv = () => {
    const line = templateHeaders.join(',');
    const blob = new Blob(['\uFEFF' + line + '\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_productos.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const leerArchivo = async (file: File): Promise<string> => {
    return await file.text();
  };

  const importar = async () => {
    setEstado('idle');
    setMensaje('');
    setErrores([]);
    setInsertados(0);

    if (!user) {
      setEstado('error');
      setMensaje('Debes iniciar sesión como vendedor.');
      return;
    }
    if (!archivo) {
      setEstado('error');
      setMensaje('Selecciona un archivo CSV, XLS o XLSX.');
      return;
    }

    const rl = permitirAccionCliente('importar-productos', {
      maxIntentos: 4,
      ventanaMs: 10 * 60 * 1000,
      bloqueoMs: 3 * 60 * 1000,
    });
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
    const esExcelBinario = ext === 'xlsx' || ext === 'xls';

    setEstado('importando');
    setMensaje(esExcelBinario ? 'Leyendo Excel...' : 'Leyendo CSV...');

    let parsed: string[][];
    try {
      if (esExcelBinario) {
        const buffer = await archivo.arrayBuffer();
        parsed = parseXLSXToRows(buffer);
      } else {
        const text = await leerArchivo(archivo);
        parsed = parseCSV(text);
      }
    } catch (e: any) {
      setEstado('error');
      setMensaje(
        esExcelBinario
          ? 'No se pudo leer el archivo Excel (.xls / .xlsx).'
          : 'No se pudo leer el archivo CSV.'
      );
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

    const REQUIRED = ['nombre', 'categoria', 'marca', 'precio', 'moneda'] as const;
    const missingHeaders = REQUIRED.filter((k) => {
      const idx = headerMap.get(normalizeHeader(k));
      return idx === undefined;
    });
    if (missingHeaders.length) {
      setEstado('error');
      setMensaje(
        `Faltan columnas en el archivo: ${missingHeaders.join(', ')}. Descarga el template desde el botón.`
      );
      return;
    }

    setMensaje('Validando filas...');

    const filas: ParsedRow[] = [];
    const erroresFila: string[] = [];

    // hasta 200 para no saturar en un intento
    if (dataRows.length > 200) {
      setEstado('error');
      setMensaje('Para esta prueba, el archivo no debe tener más de 200 filas.');
      return;
    }

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2; // +1 por header +1 por index

      const nombre = get(row, 'nombre').trim().toUpperCase();
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
      const marca =
        marcaRawUpper === 'OTRA' ? null : marcasLookup.get(marcaRawUpper) ?? null;
      if (marcaRawUpper !== 'OTRA' && !marca) {
        erroresFila.push(`Fila ${rowNumber}: "marca" no es válida (${marcaRaw}).`);
        continue;
      }

      const precio = parseFloat(String(precioRaw).replace(',', '.'));
      if (Number.isNaN(precio) || precio < 0) {
        erroresFila.push(`Fila ${rowNumber}: "precio" inválido (${precioRaw || 'vacío'}).`);
        continue;
      }
      if (!moneda) {
        erroresFila.push(
          `Fila ${rowNumber}: "moneda" no reconocida (${monedaRaw || 'vacío'}). Usa BS o USD (Excel: "Dólares estadounidenses" también se acepta).`
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

      filas.push({
        rowNumber,
        nombre,
        categoria: categoriaFinal,
        marca,
        modelo,
        anio,
        comentarios: comentarios.length ? comentarios : null,
        precio,
        moneda,
      });
    }

    if (erroresFila.length) {
      setErrores(erroresFila.slice(0, 20));
      setEstado('error');
      setMensaje(
        `Encontramos ${erroresFila.length} error(es) en el archivo. Corregirlos y reintentar. (Mostrando hasta 20)`
      );
      return;
    }

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

    setMensaje('Insertando productos...');

    let ok = 0;
    const erroresInsert: string[] = [];

    // Secuencial: más estable con RLS y evita spamear requests
    for (let i = 0; i < filas.length; i++) {
      const r = filas[i];
      const payload = {
        tienda_id: tienda.id,
        nombre: r.nombre,
        categoria: r.categoria,
        marca: r.marca,
        modelo: r.modelo,
        anio: r.anio,
        descripcion: r.comentarios,
        comentarios: r.comentarios,
        precio_usd: r.precio,
        moneda: r.moneda,
        stock_actual: 0,
        activo: true,
        aprobacion_publica: 'pendiente',
        stock_confirmado_at: new Date().toISOString(),
        pausado_por_stock_vencido: false,
        vertical,
      };

      // Nota: omitimos imagen_url e imagenes_extra por opción A (sin fotos)
      const { error: insertError } = await supabase.from('productos').insert(payload);

      if (insertError) {
        erroresInsert.push(`Fila ${r.rowNumber}: ${insertError.message || 'Error insertando.'}`);
        continue;
      }

      ok += 1;
    }

    setInsertados(ok);
    if (erroresInsert.length) {
      setErrores(erroresInsert.slice(0, 20));
      setEstado('error');
      setMensaje(
        `Se insertaron ${ok} producto(s), pero hubo ${erroresInsert.length} error(es). (Mostrando hasta 20)`
      );
      return;
    }

    setEstado('ok');
    setMensaje(
      `Importación completada: ${ok} producto(s) insertados (sin fotos). Quedan pendientes de autorización por un administrador antes de verse en la web.`
    );
    onImportado?.();
  };

  return (
    <div className="importar-productos">
      <div className="importar-productos-header">
        <h3 className="importar-productos-titulo">Importar productos desde Excel o CSV (sin fotos)</h3>
      </div>

      <input
        type="file"
        accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
          Descargar plantilla Excel (.xlsx)
        </button>
        <button
          type="button"
          onClick={descargarTemplateCsv}
          className="importar-productos-link"
          disabled={estado === 'importando'}
        >
          Descargar CSV (opcional)
        </button>

        <button
          type="button"
          className="importar-productos-boton"
          onClick={importar}
          disabled={estado === 'importando' || !archivo}
        >
          {estado === 'importando' ? 'Importando...' : 'Importar'}
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

      {insertados > 0 && estado !== 'importando' && (
        <p className="importar-productos-mensaje ok">Insertados: {insertados}</p>
      )}
    </div>
  );
}

