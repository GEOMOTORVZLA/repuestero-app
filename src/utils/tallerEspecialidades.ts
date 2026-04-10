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
