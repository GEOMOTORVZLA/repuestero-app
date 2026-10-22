/**
 * Copia fotos externas (Drive, Mercado Libre, etc.) al bucket público `productos`.
 * Se corre en esta computadora. La service role solo se lee de .env y no sale de aquí.
 *
 * Prueba:
 *   npm run fotos:copiar -- --codigos W1010A-G,W5050B-G,W5050C-G,W1010B-G,W1300-290
 * Todo lo que no sea Supabase:
 *   npm run fotos:copiar -- --todos
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const BUCKET = 'productos';
const MAX_DESCARGA = 10 * 1024 * 1024;
const MAX_SUBIDA = 2 * 1024 * 1024;
const LADO_MAX = 1000;
const LADO_THUMB = 400;
const PARALELO = 5;
const INTENTOS = 3;
const TIMEOUT_MS = 20000;
const REFERENCIA = 'https://geomotorvzla.com/';

const root = process.cwd();

function leerEnv(nombre) {
  if (process.env[nombre]?.trim()) return process.env[nombre].trim();
  const archivo = path.join(root, '.env');
  if (!fs.existsSync(archivo)) return '';
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    if (!linea || linea.trim().startsWith('#')) continue;
    const i = linea.indexOf('=');
    if (i < 1) continue;
    const clave = linea.slice(0, i).trim();
    if (clave !== nombre) continue;
    return linea
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return '';
}

function args() {
  const argv = process.argv.slice(2);
  let codigos = [];
  let todos = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--todos') todos = true;
    if (argv[i] === '--codigos' && argv[i + 1]) {
      codigos = argv[i + 1]
        .split(',')
        .map((c) => normalizarCodigo(c))
        .filter(Boolean);
      i += 1;
    }
  }
  return { codigos, todos };
}

function normalizarCodigo(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function esUrlSupabase(url) {
  return typeof url === 'string' && url.includes('/storage/v1/object/public/');
}

function idDrive(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'lh3.googleusercontent.com' || host.endsWith('.googleusercontent.com')) {
    const m = u.pathname.match(/\/d\/([^/]+)/);
    return m ? m[1] : null;
  }
  if (host === 'drive.google.com') {
    const q = u.searchParams.get('id');
    if (q) return q;
    const m = u.pathname.match(/\/(?:file\/)?d\/([^/]+)/);
    return m ? m[1] : null;
  }
  return null;
}

function urlParaDescargar(original) {
  const id = idDrive(original);
  if (id) return `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}`;
  return original;
}

function esMagicImagen(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf.subarray(0, 4).toString('ascii') === 'GIF8') return true;
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return true;
  }
  return false;
}

function esHtml(buf, tipo) {
  if (tipo.startsWith('text/html') || tipo.startsWith('application/xhtml')) return true;
  const inicio = buf.subarray(0, 32).toString('utf8').trim().toLowerCase();
  return inicio.startsWith('<!doctype') || inicio.startsWith('<html') || inicio.startsWith('<!DOCTYPE'.toLowerCase());
}

async function descargarImagen(url) {
  let ultimo = 'no se pudo descargar';
  for (let intento = 1; intento <= INTENTOS; intento += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          Referer: REFERENCIA,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
      });
      const tipo = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const anunciado = Number(res.headers.get('content-length') || 0);
      if (anunciado > MAX_DESCARGA) throw new Error('pesa más de 10 MB');
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_DESCARGA) throw new Error('pesa más de 10 MB');
      const tipoImagen = tipo.startsWith('image/');
      if (esHtml(buf, tipo) || (!tipoImagen && !esMagicImagen(buf))) {
        throw new Error(tipo ? `llegó ${tipo}, no una imagen` : 'la respuesta no es una imagen');
      }
      return buf;
    } catch (e) {
      ultimo = e?.name === 'AbortError' ? 'pasó el límite de 20 segundos' : e?.message || String(e);
      if (intento < INTENTOS) await esperar(intento * 1200);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(ultimo);
}

async function aJpeg(buffer, ladoMax, calidadInicial) {
  let lado = ladoMax;
  let calidad = calidadInicial;
  let salida = null;
  for (let i = 0; i < 8; i += 1) {
    salida = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: calidad, mozjpeg: true })
      .toBuffer();
    if (salida.length <= MAX_SUBIDA) return salida;
    if (calidad > 52) calidad -= 8;
    else lado = Math.max(320, Math.round(lado * 0.8));
  }
  if (!salida || salida.length > MAX_SUBIDA) {
    throw new Error('después de comprimir sigue pesando más de 2 MB');
  }
  return salida;
}

async function pool(items, limite, fn) {
  const salida = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      salida[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.max(1, Math.min(limite, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return salida;
}

function csvCampo(valor) {
  const s = valor == null ? '' : String(valor);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function cargarProductos(supabase, { codigos, todos }) {
  if (!codigos.length && !todos) {
    throw new Error('Indica --codigos A,B o --todos.');
  }
  const filas = [];
  const pagina = 1000;
  let desde = 0;
  for (;;) {
    let q = supabase
      .from('productos')
      .select('id,codigo,nombre,imagen_url')
      .order('id', { ascending: true })
      .range(desde, desde + pagina - 1);
    if (codigos.length) {
      q = q.in(
        'codigo',
        codigos
      );
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message || 'No se pudieron leer los productos.');
    const lote = data || [];
    filas.push(...lote);
    if (lote.length < pagina) break;
    desde += pagina;
    if (codigos.length) break;
  }

  if (codigos.length) {
    const quieren = new Set(codigos);
    return filas.filter((p) => quieren.has(normalizarCodigo(p.codigo)));
  }

  return filas.filter((p) => {
    const url = typeof p.imagen_url === 'string' ? p.imagen_url.trim() : '';
    return url && !esUrlSupabase(url);
  });
}

async function main() {
  const opciones = args();
  const url = leerEnv('VITE_SUPABASE_URL').replace(/\/$/, '');
  const service = leerEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !service) {
    console.error(
      'Falta SUPABASE_SERVICE_ROLE_KEY en .env. Está en Supabase → Project Settings → API → service_role. No la pegues en el chat.'
    );
    process.exit(1);
  }

  const supabase = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const productos = await cargarProductos(supabase, opciones);
  const grupos = new Map();
  for (const prod of productos) {
    const codigo = normalizarCodigo(prod.codigo);
    if (!grupos.has(codigo)) grupos.set(codigo, []);
    grupos.get(codigo).push(prod);
  }

  const trabajos = [];
  for (const [codigo, items] of grupos) {
    if (!codigo) {
      for (const item of items) trabajos.push({ codigo: item.id, items: [item] });
      continue;
    }
    const externas = [
      ...new Set(
        items
          .map((item) => (typeof item.imagen_url === "string" ? item.imagen_url.trim() : ""))
          .filter((u) => u && !esUrlSupabase(u))
      ),
    ];
    if (externas.length <= 1) {
      trabajos.push({ codigo, items });
      continue;
    }
    for (const item of items) {
      trabajos.push({ codigo: codigo + "-" + String(item.id).slice(0, 8), items: [item] });
    }
  }

  console.log(`Productos: ${productos.length}. Códigos distintos: ${trabajos.length}.`);

  let hechos = 0;
  const reporte = await pool(trabajos, PARALELO, async (trabajo) => {
    const fila = await procesarCodigo(supabase, url, trabajo);
    hechos += 1;
    console.log(`[${hechos}/${trabajos.length}] ${trabajo.codigo || '(sin código)'} → ${fila.estado}`);
    return fila;
  });

  const resumen = {
    filas: productos.length,
    subidas: reporte.filter((r) => r.estado === 'subida').reduce((n, r) => n + r.productos, 0),
    ya_existian: reporte.filter((r) => r.estado === 'ya_existia').reduce((n, r) => n + r.productos, 0),
    sin_imagen: reporte.filter((r) => r.estado === 'sin_imagen').reduce((n, r) => n + r.productos, 0),
    fallidas: reporte.filter((r) => r.estado === 'fallida').reduce((n, r) => n + r.productos, 0),
  };

  const dir = path.join(root, 'scripts', 'out');
  fs.mkdirSync(dir, { recursive: true });
  const csvPath = path.join(dir, 'reporte-fotos-externas.csv');
  const lineas = [
    ['codigo', 'url_original', 'url_supabase', 'estado', 'mensaje_de_error'].join(','),
    ...reporte.map((r) =>
      [r.codigo, r.url_original, r.url_supabase, r.estado, r.mensaje].map(csvCampo).join(',')
    ),
  ];
  fs.writeFileSync(csvPath, `\uFEFF${lineas.join('\n')}\n`, 'utf8');

  console.log('---');
  console.log(`Filas: ${resumen.filas}`);
  console.log(`Fotos subidas: ${resumen.subidas}`);
  console.log(`Ya estaban en Supabase: ${resumen.ya_existian}`);
  console.log(`Sin imagen_url: ${resumen.sin_imagen}`);
  console.log(`Fallidas: ${resumen.fallidas}`);
  console.log(`Reporte: ${csvPath}`);
  if (resumen.fallidas > 0) process.exitCode = 1;
}

async function procesarCodigo(supabase, supabaseUrl, trabajo) {
  const { codigo, items } = trabajo;
  const urls = items.map((p) => (typeof p.imagen_url === 'string' ? p.imagen_url.trim() : ''));
  const externas = [...new Set(urls.filter((u) => u && !esUrlSupabase(u)))];
  const original = externas[0] || urls.find(Boolean) || '';
  const base = {
    codigo,
    url_original: original,
    url_supabase: '',
    estado: 'fallida',
    mensaje: '',
    productos: items.length,
  };

  if (!codigo) {
    return { ...base, mensaje: 'el producto no tiene código' };
  }
  if (!original) {
    return { ...base, estado: 'sin_imagen', mensaje: '' };
  }
  if (items.every((p) => esUrlSupabase(p.imagen_url))) {
    return {
      ...base,
      estado: 'ya_existia',
      url_supabase: original,
      mensaje: '',
    };
  }

  const distintas = [
    ...new Set(
      items
        .map((p) => (typeof p.imagen_url === 'string' ? p.imagen_url.trim() : ''))
        .filter((u) => u && !esUrlSupabase(u))
    ),
  ];

  try {
    const descarga = urlParaDescargar(distintas[0]);
    const binario = await descargarImagen(descarga);
    const jpeg = await aJpeg(binario, LADO_MAX, 82);
    const thumb = await aJpeg(jpeg, LADO_THUMB, 78);
    const marca = Date.now();
    const pathOriginal = `fotos/${codigo}.jpg`;
    const pathThumb = `fotos/${codigo}-thumb.jpg`;

    const subida1 = await supabase.storage.from(BUCKET).upload(pathOriginal, jpeg, {
      upsert: true,
      contentType: 'image/jpeg',
      cacheControl: '31536000',
    });
    if (subida1.error) throw new Error(subida1.error.message || 'no se pudo subir la foto');

    const subida2 = await supabase.storage.from(BUCKET).upload(pathThumb, thumb, {
      upsert: true,
      contentType: 'image/jpeg',
      cacheControl: '31536000',
    });
    if (subida2.error) throw new Error(subida2.error.message || 'no se pudo subir la miniatura');

    const publica = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${pathOriginal}?v=${marca}`;
    const ids = items.map((p) => p.id);
    const { error: updError } = await supabase.from('productos').update({ imagen_url: publica }).in('id', ids);
    if (updError) throw new Error(updError.message || 'la foto se subió, pero no se guardó en el producto');

    let mensaje = '';
    if (distintas.length > 1) {
      mensaje = 'había más de un enlace para el mismo código; se usó el primero';
    }
    return { ...base, estado: 'subida', url_supabase: publica, mensaje };
  } catch (e) {
    return { ...base, estado: 'fallida', mensaje: e?.message || String(e) };
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
