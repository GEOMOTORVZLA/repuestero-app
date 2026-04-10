/** Cantidad fija de fotos adicionales (cada una con su propio control de subida). */
export const MAX_FOTOS_EXTRA = 4;

/** Lista ordenada de URLs: principal + extras (sin duplicados). */
export function urlsFotosProducto(p: {
  imagen_url: string | null | undefined;
  imagenes_extra?: (string | null)[] | string[] | null | undefined;
}): string[] {
  const out: string[] = [];
  const principal = typeof p.imagen_url === 'string' ? p.imagen_url.trim() : '';
  if (principal) out.push(principal);
  const extras = Array.isArray(p.imagenes_extra) ? p.imagenes_extra : [];
  for (const u of extras) {
    if (typeof u !== 'string') continue;
    const t = u.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function slotsArchivosExtraVacios(): (File | null)[] {
  return Array.from({ length: MAX_FOTOS_EXTRA }, () => null);
}

/** Alinea URLs existentes a 4 posiciones (índice = ranura extra-1 … extra-4 en storage). */
export function normalizarUrlsACuatroSlots(urls: string[] | null | undefined): (string | null)[] {
  const arr = Array.isArray(urls) ? urls : [];
  return Array.from({ length: MAX_FOTOS_EXTRA }, (_, i) => {
    const u = arr[i];
    return typeof u === 'string' && u.trim() ? u.trim() : null;
  });
}
