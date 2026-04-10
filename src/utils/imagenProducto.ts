/**
 * Imágenes de producto: límites de subida y variantes (thumbnails vía Supabase Storage).
 *
 * La transformación `/render/image/` requiere que el proyecto tenga habilitadas
 * las transformaciones de imagen en Storage. Si no, define en `.env`:
 * VITE_SUPABASE_SIN_TRANSFORMACION_IMAGEN=1
 */

export const MAX_MB_FOTO_PRODUCTO = 2;
export const MAX_BYTES_FOTO_PRODUCTO = MAX_MB_FOTO_PRODUCTO * 1024 * 1024;

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
