/** Quita tildes para comparar variantes de Excel/CSV. */
function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Determina si el valor guardado corresponde a bolívares (BS, Bs, VES, etc.).
 * Cualquier otra cosa (incl. "dólares estadounidenses", "USD", texto de Excel) se trata como USD.
 */
export function esMonedaBolivar(m: string | null | undefined): boolean {
  if (m == null) return true;
  const t = sinAcentos(m.trim().toLowerCase());
  if (!t) return true;
  if (t === 'bs' || t === 'ves' || t === 'bsf') return true;
  if (t.startsWith('bs') && t.length <= 8) return true;
  if (t.includes('bolivar')) return true;
  return false;
}

/** Etiqueta corta para mostrar en la UI (siempre Bs o USD). */
export function etiquetaMoneda(m: string | null | undefined): 'Bs' | 'USD' {
  return esMonedaBolivar(m) ? 'Bs' : 'USD';
}

/**
 * Convierte texto de importación (Excel a veces pone "Dólares estadounidenses", "US$", etc.) a BS | USD.
 * Devuelve null si no se puede interpretar.
 */
export function normalizarMonedaImport(valor: string | null | undefined): 'BS' | 'USD' | null {
  if (valor == null) return null;
  const raw = valor.trim();
  if (!raw) return null;
  const t = sinAcentos(raw.toLowerCase());

  if (t === 'bs' || t === 'ves' || t === 'bsf') return 'BS';
  if (t.startsWith('bs') && t.length <= 8 && !t.includes('usd')) return 'BS';
  if (t.includes('bolivar') && !t.includes('dolar')) return 'BS';

  if (
    t === 'usd' ||
    t === 'us$' ||
    t === 'u$s' ||
    t === '$' ||
    t.includes('usd') ||
    t.includes('dolar') ||
    t.includes('dollar') ||
    t.includes('estadounidense')
  ) {
    return 'USD';
  }

  return null;
}
