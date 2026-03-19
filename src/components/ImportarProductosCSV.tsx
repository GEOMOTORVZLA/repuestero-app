import { useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORIAS_PRODUCTO } from '../data/categoriasProducto';
import { MARCAS_VEHICULOS } from '../data/marcasVehiculos';
import * as XLSX from 'xlsx';
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

// CSV parser simple pero con soporte de comillas dobles.
// Soporta campos con comas dentro de comillas: "texto, con coma"
function parseCSV(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, ''); // quita BOM si existe
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (ch === '"') {
      const next = input[i + 1];
      if (inQuotes && next === '"') {
        // Doble comilla escapada dentro de un campo
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ',') {
      current.push(field.trim());
      field = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      // Manejo de CRLF
      if (ch === '\r' && input[i + 1] === '\n') i++;
      current.push(field.trim());
      field = '';
      if (current.length > 1 || current.some((c) => c !== '')) rows.push(current);
      current = [];
      continue;
    }

    field += ch;
  }

  // último campo
  if (field.length > 0 || current.length > 0) {
    current.push(field.trim());
    if (current.length > 1 || current.some((c) => c !== '')) rows.push(current);
  }

  return rows;
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

function asMoneda(value: string): Moneda | null {
  const v = value.trim().toUpperCase();
  if (v === 'BS') return 'BS';
  if (v === 'USD') return 'USD';
  return null;
}

function normalizeOptionalText(value: string): string | null {
  const v = value.trim();
  return v ? v : null;
}

export function ImportarProductosCSV({
  onImportado,
}: {
  onImportado?: () => void;
}) {
  const { user } = useAuth();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<'idle' | 'importando' | 'ok' | 'error'>('idle');
  const [mensaje, setMensaje] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [insertados, setInsertados] = useState(0);

  const categoriasLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of CATEGORIAS_PRODUCTO) m.set(c.toUpperCase(), c);
    return m;
  }, []);
  const marcasLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of MARCAS_VEHICULOS) m.set(b.toUpperCase(), b);
    return m;
  }, []);

  const templateCSV = useMemo(() => {
    return [
      [
        'nombre',
        'categoria',
        'marca',
        'modelo',
        'anio',
        'comentarios',
        'precio',
        'moneda',
      ].join(','),
    ].join('\n');
  }, []);

  const descargarTemplate = () => {
    const blob = new Blob([templateCSV], { type: 'text/csv;charset=utf-8' });
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
      setMensaje('Selecciona un archivo CSV o XLSX.');
      return;
    }

    const MAX_MB = 2;
    if (archivo.size > MAX_MB * 1024 * 1024) {
      setEstado('error');
      setMensaje(`El archivo no debe superar ${MAX_MB} MB.`);
      return;
    }

    const ext = (archivo.name.split('.').pop() ?? '').toLowerCase();
    const esXlsx = ext === 'xlsx';

    setEstado('importando');
    setMensaje(esXlsx ? 'Leyendo XLSX...' : 'Leyendo CSV...');

    let parsed: string[][];
    try {
      if (esXlsx) {
        const buffer = await archivo.arrayBuffer();
        parsed = parseXLSXToRows(buffer);
      } else {
        const text = await leerArchivo(archivo);
        parsed = parseCSV(text);
      }
    } catch (e: any) {
      setEstado('error');
      setMensaje(esXlsx ? 'No se pudo leer el archivo XLSX.' : 'No se pudo leer el archivo CSV.');
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
      setMensaje('Para esta prueba, el CSV no debe tener más de 200 filas.');
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

      const moneda = asMoneda(monedaRaw);
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
        erroresFila.push(`Fila ${rowNumber}: "moneda" debe ser BS o USD (${monedaRaw || 'vacío'}).`);
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
    setMensaje(`Importación completada: ${ok} producto(s) insertados (sin fotos).`);
    onImportado?.();
  };

  return (
    <div className="importar-productos">
      <div className="importar-productos-header">
        <h3 className="importar-productos-titulo">Importar productos desde CSV/XLSX (sin fotos)</h3>
      </div>

      <input
        type="file"
        accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
          Descargar template
        </button>

      <button
        type="button"
        className="importar-productos-boton"
        onClick={importar}
        disabled={estado === 'importando' || !archivo}
      >
        {estado === 'importando' ? 'Importando...' : 'Importar CSV'}
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

