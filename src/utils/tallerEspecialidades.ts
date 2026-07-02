/**
 * Normaliza `talleres.especialidad` desde BD: puede ser text[] o, en datos antiguos, un solo texto.
 */
export function normalizeEspecialidadesTallerDb(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return [];
    if (s.startsWith('[')) {
      try {
        const p = JSON.parse(s) as unknown;
        if (Array.isArray(p)) {
          return p.map((x) => String(x).trim()).filter(Boolean);
        }
      } catch {
        // seguir como texto único
      }
    }
    return [s];
  }
  return [];
}

/** Texto compacto para listados (tarjetas, mapa). */
export function etiquetaEspecialidadesTaller(value: unknown): string {
  const arr = normalizeEspecialidadesTallerDb(value);
  return arr.length ? arr.join(' · ') : '—';
}

const MAX_CARACTERES_RESUMEN_ADMIN = 32;

/** Una línea para tablas admin; clic abre el detalle si hay más de una o texto largo. */
export function resumenEspecialidadTallerAdmin(value: unknown): {
  items: string[];
  linea: string;
  tieneDetalle: boolean;
} {
  const items = normalizeEspecialidadesTallerDb(value);
  if (items.length === 0) {
    return { items: [], linea: '—', tieneDetalle: false };
  }
  if (items.length === 1) {
    const unica = items[0];
    const corta =
      unica.length > MAX_CARACTERES_RESUMEN_ADMIN
        ? `${unica.slice(0, MAX_CARACTERES_RESUMEN_ADMIN)}…`
        : unica;
    return { items, linea: corta, tieneDetalle: true };
  }
  const primera = items[0];
  const prefijo =
    primera.length > MAX_CARACTERES_RESUMEN_ADMIN
      ? `${primera.slice(0, MAX_CARACTERES_RESUMEN_ADMIN)}…`
      : primera;
  return {
    items,
    linea: `${prefijo} (+${items.length - 1})`,
    tieneDetalle: true,
  };
}
