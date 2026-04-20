/**
 * Imágenes de producto: límites de subida y variantes (thumbnails vía Supabase Storage).
 *
 * La transformación `/render/image/` requiere que el proyecto tenga habilitadas
 * las transformaciones de imagen en Storage. Si no, define en `.env`:
 * VITE_SUPABASE_SIN_TRANSFORMACION_IMAGEN=1
 */

export const MAX_MB_FOTO_PRODUCTO = 2;
export const MAX_BYTES_FOTO_PRODUCTO = MAX_MB_FOTO_PRODUCTO * 1024 * 1024;
export const TARGET_BYTES_FOTO_PRODUCTO = 700 * 1024;

const MARKER_OBJECT_PUBLIC = '/storage/v1/object/public/';
const MARKER_RENDER = '/storage/v1/render/image/public/';

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
} {
  if (variante === 'tarjeta') return { width: 400, height: 400, resize: 'cover' };
  if (variante === 'miniatura') return { width: 160, height: 160, resize: 'cover' };
  return { width: 1080, height: 1080, resize: 'contain' };
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

  const { width, height, resize } = variantDimensiones(variante);
  const renderBase = `${baseOrigin}${MARKER_RENDER}${pathOnly}`;
  const qs = new URLSearchParams({
    width: String(width),
    height: String(height),
    resize,
    quality: '78',
  });
  return `${renderBase}?${qs.toString()}`;
}

/** Mensaje de validación reutilizable en formularios de subida. */
export function mensajeMaxTamanoFoto(): string {
  return `Cada imagen no debe superar ${MAX_MB_FOTO_PRODUCTO} MB. Comprímela o elige otra.`;
}

function blobDesdeCanvas(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

/**
 * Comprime y redimensiona imágenes antes de subirlas a Storage.
 * Devuelve WebP/JPEG optimizado y mantiene tamaño <= límite cuando es posible.
 */
export async function optimizarImagenProductoParaStorage(
  file: File,
  opts?: {
    targetBytes?: number;
    maxBytes?: number;
    maxLado?: number;
  }
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const targetBytes = opts?.targetBytes ?? TARGET_BYTES_FOTO_PRODUCTO;
  const maxBytes = opts?.maxBytes ?? MAX_BYTES_FOTO_PRODUCTO;
  const maxLado = opts?.maxLado ?? 1600;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      el.src = objectUrl;
    });

    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (!width || !height) return file;

    const escala = Math.min(1, maxLado / Math.max(width, height));
    width = Math.max(1, Math.round(width * escala));
    height = Math.max(1, Math.round(height * escala));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const mimePreferido = 'image/webp';
    const mimeFallback = 'image/jpeg';
    let quality = 0.86;
    let blob = await blobDesdeCanvas(canvas, mimePreferido, quality);
    let mime = blob ? mimePreferido : mimeFallback;
    if (!blob) {
      blob = await blobDesdeCanvas(canvas, mimeFallback, quality);
      if (!blob) return file;
    }

    let intentos = 0;
    while ((blob.size > targetBytes || blob.size > maxBytes) && intentos < 7) {
      quality -= 0.08;
      if (quality < 0.52) break;
      const next = await blobDesdeCanvas(canvas, mime, quality);
      if (!next) break;
      blob = next;
      intentos += 1;
    }

    // Si aún pesa demasiado, segundo paso: bajar resolución adicional.
    if (blob.size > maxBytes) {
      const shrink = Math.sqrt(maxBytes / blob.size);
      const w2 = Math.max(1, Math.round(width * Math.max(0.55, shrink)));
      const h2 = Math.max(1, Math.round(height * Math.max(0.55, shrink)));
      const canvas2 = document.createElement('canvas');
      canvas2.width = w2;
      canvas2.height = h2;
      const ctx2 = canvas2.getContext('2d');
      if (ctx2) {
        ctx2.drawImage(canvas, 0, 0, w2, h2);
        const next2 = await blobDesdeCanvas(canvas2, mime, Math.max(0.56, quality - 0.06));
        if (next2) blob = next2;
      }
    }

    if (blob.size >= file.size && file.size <= maxBytes) return file;
    const ext = mime === 'image/webp' ? 'webp' : 'jpg';
    const nombreBase = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${nombreBase}.${ext}`, {
      type: mime,
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
