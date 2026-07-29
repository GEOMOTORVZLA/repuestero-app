/**
 * Imágenes de producto: límites de subida y variantes (thumbnails via Supabase Storage).
 *
 * La transformación `/render/image/` requiere que el proyecto tenga habilitadas
 * las transformaciones de imagen en Storage. Si no, define en `.env`:
 * VITE_SUPABASE_SIN_TRANSFORMACION_IMAGEN=1
 */

export const MAX_MB_FOTO_PRODUCTO = 2;
export const MAX_BYTES_FOTO_PRODUCTO = MAX_MB_FOTO_PRODUCTO * 1024 * 1024;
export const TARGET_BYTES_FOTO_PRODUCTO = 1200 * 1024;

const MARKER_OBJECT_PUBLIC = '/storage/v1/object/public/';
const MARKER_RENDER = '/storage/v1/render/image/public/';

const TIMEOUT_CARGAR_IMAGEN_MS = 20000;
const TIMEOUT_TO_BLOB_MS = 12000;

function transformacionDesactivada(): boolean {
  return import.meta.env.VITE_SUPABASE_SIN_TRANSFORMACION_IMAGEN === '1';
}

/** True si la URL apunta a un objeto público de Storage (admite thumbnail por render). */
export function esUrlObjectPublicSupabase(url: string | null | undefined): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  return url.includes(MARKER_OBJECT_PUBLIC);
}

function variantDimensiones(variante: 'tarjeta' | 'miniatura' | 'vista'): {
  width: number;
  height: number;
  resize: 'cover' | 'contain';
  quality: string;
} {
  if (variante === 'tarjeta') return { width: 400, height: 400, resize: 'cover', quality: '82' };
  if (variante === 'miniatura') return { width: 160, height: 160, resize: 'cover', quality: '78' };
  return { width: 1600, height: 1600, resize: 'contain', quality: '88' };
}

/**
 * URL para mostrar: thumbnails para Storage público; URL original si es externa o está desactivada la API.
 */
export function urlImagenProductoVariante(
  url: string | null | undefined,
  variante: 'tarjeta' | 'miniatura' | 'vista' | 'completa'
): string | null {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;
  if (variante === 'completa' || transformacionDesactivada()) return u;
  if (u.includes(MARKER_RENDER)) return u;
  const i = u.indexOf(MARKER_OBJECT_PUBLIC);
  if (i === -1) return u;

  const baseOrigin = u.slice(0, i);
  const pathAndQuery = u.slice(i + MARKER_OBJECT_PUBLIC.length);
  const qIdx = pathAndQuery.indexOf('?');
  const pathOnly = qIdx === -1 ? pathAndQuery : pathAndQuery.slice(0, qIdx);
  if (!pathOnly) return u;

  const { width, height, resize, quality } = variantDimensiones(variante);
  const renderBase = `${baseOrigin}${MARKER_RENDER}${pathOnly}`;
  const qs = new URLSearchParams({
    width: String(width),
    height: String(height),
    resize,
    quality,
  });
  return `${renderBase}?${qs.toString()}`;
}

/** Mensaje de validación reutilizable en formularios de subida. */
export function mensajeMaxTamanoFoto(): string {
  return `Cada imagen no debe superar ${MAX_MB_FOTO_PRODUCTO} MB. Comprímela o elige otra.`;
}

function conTimeout<T>(promesa: Promise<T>, ms: number, mensaje: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(mensaje)), ms);
    promesa.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      }
    );
  });
}

function blobDesdeCanvas(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch {
      resolve(null);
    }
  });
}

async function blobDesdeCanvasConTimeout(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  try {
    return await conTimeout(
      blobDesdeCanvas(canvas, type, quality),
      TIMEOUT_TO_BLOB_MS,
      `toBlob timeout ${type}`
    );
  } catch {
    return null;
  }
}

function cargarImagenDesdeObjectUrl(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    el.src = objectUrl;
  });
}

/**
 * Comprime y redimensiona imágenes antes de subirlas a Storage.
 * En Android/WebView prioriza JPEG si WebP se cuelga o falla.
 * Si no puede optimizar, devuelve el archivo original (si cabe en el limite).
 */
export async function optimizarImagenProductoParaStorage(
  file: File,
  opts?: {
    targetBytes?: number;
    maxBytes?: number;
    maxLado?: number;
  }
): Promise<File> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) {
    return file;
  }

  const targetBytes = opts?.targetBytes ?? TARGET_BYTES_FOTO_PRODUCTO;
  const maxBytes = opts?.maxBytes ?? MAX_BYTES_FOTO_PRODUCTO;
  const maxLado = opts?.maxLado ?? 1600;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await conTimeout(
      cargarImagenDesdeObjectUrl(objectUrl),
      TIMEOUT_CARGAR_IMAGEN_MS,
      'La imagen tardó demasiado en cargarse. Prueba otra foto o una más liviana.'
    );

    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (!width || !height) {
      if (file.size <= maxBytes) return file;
      throw new Error('No se pudo leer el tamaño de la imagen.');
    }

    const escala = Math.min(1, maxLado / Math.max(width, height));
    width = Math.max(1, Math.round(width * escala));
    height = Math.max(1, Math.round(height * escala));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (file.size <= maxBytes) return file;
      throw new Error('Este dispositivo no pudo procesar la imagen.');
    }
    ctx.drawImage(img, 0, 0, width, height);

    // WebP a veces no responde en WebView Android; JPEG es mas fiable.
    const preferWebp = !/Android/i.test(navigator.userAgent || '');
    const mimePreferido = preferWebp ? 'image/webp' : 'image/jpeg';
    const mimeFallback = preferWebp ? 'image/jpeg' : 'image/webp';
    let quality = 0.85;

    let blob = await blobDesdeCanvasConTimeout(canvas, mimePreferido, quality);
    let mime = mimePreferido;
    if (!blob) {
      blob = await blobDesdeCanvasConTimeout(canvas, mimeFallback, quality);
      mime = mimeFallback;
      if (!blob) {
        if (file.size <= maxBytes) return file;
        throw new Error('No se pudo comprimir la imagen en este dispositivo. Prueba otra foto.');
      }
    }

    let intentos = 0;
    while ((blob.size > targetBytes || blob.size > maxBytes) && intentos < 7) {
      quality -= 0.06;
      if (quality < 0.55) break;
      const next = await blobDesdeCanvasConTimeout(canvas, mime, quality);
      if (!next) break;
      blob = next;
      intentos += 1;
    }

    if (blob.size > maxBytes) {
      const shrink = Math.sqrt(maxBytes / blob.size);
      const w2 = Math.max(1, Math.round(width * Math.max(0.5, shrink)));
      const h2 = Math.max(1, Math.round(height * Math.max(0.5, shrink)));
      const canvas2 = document.createElement('canvas');
      canvas2.width = w2;
      canvas2.height = h2;
      const ctx2 = canvas2.getContext('2d');
      if (ctx2) {
        ctx2.drawImage(canvas, 0, 0, w2, h2);
        const next2 = await blobDesdeCanvasConTimeout(canvas2, mime, Math.max(0.5, quality - 0.06));
        if (next2) blob = next2;
      }
    }

    if (blob.size > maxBytes) {
      if (file.size <= maxBytes) return file;
      throw new Error(
        `La imagen sigue pesando más de ${MAX_MB_FOTO_PRODUCTO} MB tras comprimir. Elige otra más liviana.`
      );
    }

    if (blob.size >= file.size && file.size <= maxBytes) return file;
    const ext = mime === 'image/webp' ? 'webp' : 'jpg';
    const nombreBase = file.name.replace(/\.[^.]+$/, '') || 'foto';
    return new File([blob], `${nombreBase}.${ext}`, {
      type: mime,
      lastModified: Date.now(),
    });
  } catch (e) {
    if (file.size <= maxBytes) return file;
    throw e instanceof Error
      ? e
      : new Error('No se pudo optimizar la imagen. Prueba otra foto.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
