/**
 * Imágenes de producto: límites de subida y miniaturas propias (sin /render/image/).
 *
 * Al subir se guarda el original optimizado + un *-thumb.* liviano para listados.
 * Por defecto NO usamos Image Transformations de Supabase (cupo Pro bajo).
 *
 * Opt-in transforms (coste extra): VITE_SUPABASE_USAR_TRANSFORMACION_IMAGEN=1
 */

export const MAX_MB_FOTO_PRODUCTO = 2;
export const MAX_BYTES_FOTO_PRODUCTO = MAX_MB_FOTO_PRODUCTO * 1024 * 1024;
export const TARGET_BYTES_FOTO_PRODUCTO = 1200 * 1024;

/** Miniatura guardada en Storage (listados): lado máx. y peso objetivo. */
export const THUMB_MAX_LADO_PRODUCTO = 400;
export const THUMB_TARGET_BYTES_PRODUCTO = 90 * 1024;

const MARKER_OBJECT_PUBLIC = '/storage/v1/object/public/';
const MARKER_RENDER = '/storage/v1/render/image/public/';

const TIMEOUT_CARGAR_IMAGEN_MS = 20000;
const TIMEOUT_TO_BLOB_MS = 12000;

function transformacionDesactivada(): boolean {
  if (import.meta.env.VITE_SUPABASE_USAR_TRANSFORMACION_IMAGEN === '1') return false;
  if (import.meta.env.VITE_SUPABASE_SIN_TRANSFORMACION_IMAGEN === '1') return true;
  return true;
}

/** True si la URL apunta a un objeto público de Storage. */
export function esUrlObjectPublicSupabase(url: string | null | undefined): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  return url.includes(MARKER_OBJECT_PUBLIC);
}

/**
 * Path Storage: `.../principal.jpg` → `.../principal-thumb.jpg`
 * (también foto-1.jpg → foto-1-thumb.jpg).
 */
export function pathStorageMiniaturaDesdePath(path: string): string | null {
  const p = path.trim();
  if (!p || /-thumb\./i.test(p)) return null;
  const next = p.replace(/(\.[a-z0-9]+)$/i, '-thumb$1');
  return next === p ? null : next;
}

/** URL pública hermana *-thumb.* a partir de la URL del original en Storage. */
export function urlMiniaturaGuardadaDesdeOriginal(url: string): string | null {
  const u = url.trim();
  const i = u.indexOf(MARKER_OBJECT_PUBLIC);
  if (i === -1) return null;
  const baseOrigin = u.slice(0, i);
  const pathAndQuery = u.slice(i + MARKER_OBJECT_PUBLIC.length);
  const qIdx = pathAndQuery.indexOf('?');
  const pathOnly = qIdx === -1 ? pathAndQuery : pathAndQuery.slice(0, qIdx);
  const query = qIdx === -1 ? '' : pathAndQuery.slice(qIdx);
  const thumbPath = pathStorageMiniaturaDesdePath(pathOnly);
  if (!thumbPath) return null;
  return `${baseOrigin}${MARKER_OBJECT_PUBLIC}${thumbPath}${query}`;
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
 * URL para mostrar.
 * - Listados (tarjeta/miniatura): miniatura guardada *-thumb.* si transforms están off;
 *   si no hay thumb (fotos viejas), el UI debe hacer fallback al original con onError.
 * - Vista / completa: siempre original (o render si transforms opt-in).
 */
export function urlImagenProductoVariante(
  url: string | null | undefined,
  variante: 'tarjeta' | 'miniatura' | 'vista' | 'completa'
): string | null {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;
  if (variante === 'completa') return u;

  if (transformacionDesactivada()) {
    if (variante === 'tarjeta' || variante === 'miniatura') {
      return urlMiniaturaGuardadaDesdeOriginal(u) ?? u;
    }
    return u;
  }

  if (u.includes(MARKER_RENDER)) return u;
  const i = u.indexOf(MARKER_OBJECT_PUBLIC);
  if (i === -1) return u;

  const baseOrigin = u.slice(0, i);
  const pathAndQuery = u.slice(i + MARKER_OBJECT_PUBLIC.length);
  const qIdx = pathAndQuery.indexOf('?');
  const pathOnly = qIdx === -1 ? pathAndQuery : pathAndQuery.slice(0, qIdx);
  if (!pathOnly) return u;

  const { width, height, resize, quality } = variantDimensiones(
    variante === 'vista' ? 'vista' : variante
  );
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

type BucketProductoUpload = {
  upload: (
    path: string,
    file: File,
    opts?: { upsert?: boolean }
  ) => PromiseLike<{ error: { message?: string } | null }>;
  getPublicUrl: (path: string) => { data: { publicUrl: string } };
};

/**
 * Misma ruta de Storage tras un upsert = misma URL pública.
 * Sin ?v= el navegador/CDN suele seguir mostrando la foto vieja.
 */
export function urlPublicaConCacheBust(url: string, version = Date.now()): string {
  const u = url.trim();
  if (!u) return u;
  try {
    const parsed = new URL(u);
    parsed.searchParams.set('v', String(version));
    return parsed.toString();
  } catch {
    const sinV = u.replace(/([?&])v=\d+/g, '').replace(/[?&]$/, '');
    const sep = sinV.includes('?') ? '&' : '?';
    return `${sinV}${sep}v=${version}`;
  }
}

/**
 * Sube el original optimizado y, en paralelo, una miniatura *-thumb.* para listados rápidos.
 * Si el thumb falla, igual deja el original (listados harán fallback).
 * Las URLs incluyen ?v=timestamp para forzar recarga tras reemplazar la misma ruta.
 */
export async function subirImagenProductoConMiniatura(
  bucket: BucketProductoUpload,
  pathOriginal: string,
  fileOptimizado: File
): Promise<{ urlOriginal: string; urlThumb: string | null }> {
  const { error: upErr } = await bucket.upload(pathOriginal, fileOptimizado, { upsert: true });
  if (upErr) {
    throw new Error(upErr.message || 'Error al subir la imagen.');
  }
  const cacheVersion = Date.now();
  const { data: pub } = bucket.getPublicUrl(pathOriginal);
  const urlOriginal = urlPublicaConCacheBust(pub.publicUrl, cacheVersion);

  const thumbPath = pathStorageMiniaturaDesdePath(pathOriginal);
  if (!thumbPath) return { urlOriginal, urlThumb: null };

  try {
    const thumbFile = await optimizarImagenProductoParaStorage(fileOptimizado, {
      maxBytes: MAX_BYTES_FOTO_PRODUCTO,
      targetBytes: THUMB_TARGET_BYTES_PRODUCTO,
      maxLado: THUMB_MAX_LADO_PRODUCTO,
    });
    const { error: thumbErr } = await bucket.upload(thumbPath, thumbFile, { upsert: true });
    if (thumbErr) return { urlOriginal, urlThumb: null };
    const { data: thumbPub } = bucket.getPublicUrl(thumbPath);
    return {
      urlOriginal,
      urlThumb: urlPublicaConCacheBust(thumbPub.publicUrl, cacheVersion),
    };
  } catch {
    return { urlOriginal, urlThumb: null };
  }
}

