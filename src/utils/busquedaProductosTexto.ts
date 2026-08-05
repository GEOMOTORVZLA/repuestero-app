/** Valor en filtros PostgREST: comas u otros caracteres sin citar rompen `.or()` y devuelven resultados erróneos. */
export function comillasFiltroPostgrest(valor: string): string {
  // Incluye `.` `[` etc. para patrones regex (imatch); `%` citado también es válido en ilike.
  if (/[",().*[\]\\^$+?{}|%]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

function limpiarTokenTermino(raw: string): string {
  return raw
    .replace(/^[\s"'«»\u2018\u2019\u201C\u201D\u201E\u201A\u00B4`„‚]+/u, '')
    .replace(/[\s"'«»\u2018\u2019\u201C\u201D\u201E\u201A\u00B4`„‚]+$/u, '')
    .trim();
}

/** Palabras clave (min. 2 caracteres, sin duplicados) para busqueda multi-termino AND. */
export function terminosBusquedaProducto(texto: string): string[] {
  const vistos = new Set<string>();
  return texto
    .trim()
    .split(/\s+/)
    .map((t) => limpiarTokenTermino(t.trim()))
    .filter((t) => t.length >= 2)
    .filter((t) => {
      const k = t.toLocaleLowerCase();
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
}

export function patronIlikeTerminoProducto(termino: string): string {
  const limpio = termino.replace(/[%_]/g, '');
  return comillasFiltroPostgrest(`%${limpio}%`);
}

/** Vocales/ñ: el usuario escribe sin tilde y debe hallar "bujía", "muñon", etc. */
const CLASE_LETRA_SIN_ACENTO: Record<string, string> = {
  a: '[aAáÁàÀäÄâÂãÃ]',
  e: '[eEéÉèÈëËêÊ]',
  i: '[iIíÍìÌïÏîÎ]',
  o: '[oOóÓòÒöÖôÔõÕ]',
  u: '[uUúÚùÙüÜûÛ]',
  n: '[nNñÑ]',
};

function escaparMetacaracterRegexLiteral(ch: string): string {
  if (/[.*+?^${}()|[\]\\]/.test(ch)) return `\\${ch}`;
  return ch;
}

/**
 * Patrón PostgREST `imatch` (regex sin distinguir mayúsculas) que ignora acentos.
 * Ej.: "bujia" → ".*buj[iíìïî]a.*" coincide con "BUJÍA".
 */
export function patronImatchTerminoProductoSinAcento(termino: string): string {
  const limpio = normalizarTextoBusqueda(termino).replace(/[%_]/g, '');
  let cuerpo = '';
  for (const ch of limpio) {
    cuerpo += CLASE_LETRA_SIN_ACENTO[ch] ?? escaparMetacaracterRegexLiteral(ch);
  }
  return comillasFiltroPostgrest(`.*${cuerpo}.*`);
}

type QueryConOr = {
  or: (filtro: string) => QueryConOr;
};

/** Cada termino debe coincidir en al menos uno de los campos de texto del producto. */
export function aplicarTerminosTextoABusquedaProductos<T extends QueryConOr>(
  query: T,
  texto: string
): T {
  let q = query;
  for (const termino of terminosBusquedaProducto(texto)) {
    const pat = patronImatchTerminoProductoSinAcento(termino);
    q = q.or(
      `nombre.imatch.${pat},descripcion.imatch.${pat},comentarios.imatch.${pat},marca.imatch.${pat},modelo.imatch.${pat},categoria.imatch.${pat}`
    ) as T;
  }
  return q;
}

/** Quita acentos para comparar (es/ES). */
export function normalizarTextoBusqueda(s: string): string {
  return s
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Variantes simples singular/plural en espa\u00f1ol (espirales <-> espiral). */
export function variantesFormaPalabra(termino: string): string[] {
  const t = normalizarTextoBusqueda(termino).replace(/[^a-z0-9]/g, '');
  if (t.length < 2) return t ? [t] : [];
  const out = new Set([t]);
  if (t.endsWith('es') && t.length >= 5) {
    out.add(t.slice(0, -2));
    out.add(t.slice(0, -1));
  } else if (t.endsWith('s') && t.length >= 4) {
    out.add(t.slice(0, -1));
  } else {
    out.add(t + 's');
    out.add(t + 'es');
  }
  return [...out].filter((v) => v.length >= 2);
}

function distanciaLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = Array.from({ length: n + 1 }, () => 0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

function maxDistanciaTypo(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
}

/** Una palabra del usuario coincide con el texto del producto (substring, plural o typo leve). */
export function terminoCoincideEnTextoFlexible(termino: string, textoFuente: string): boolean {
  const fuente = normalizarTextoBusqueda(textoFuente);
  if (!fuente) return false;
  // Códigos tipo RPR544-STD: el término se compacta a rpr544std; hay que comparar igual en la fuente.
  const fuenteCompacta = fuente.replace(/[^a-z0-9]+/g, '');
  const variantes = variantesFormaPalabra(termino);
  if (variantes.length === 0) return false;

  for (const v of variantes) {
    if (fuente.includes(v) || fuenteCompacta.includes(v)) return true;
  }

  const tokens = fuente.split(/[^a-z0-9]+/).filter((tok) => tok.length >= 2);

  for (const tok of tokens) {
    for (const v of variantes) {
      if (tok === v) return true;
      // El usuario escribe un prefijo del nombre del producto (amort → amortiguador).
      // NO al revés (cama ↛ camara): eso generaba falsos positivos masivos.
      if (v.length >= 4 && tok.length > v.length && tok.startsWith(v)) return true;
      const maxD = Math.min(maxDistanciaTypo(v.length), maxDistanciaTypo(tok.length));
      if (maxD > 0 && Math.abs(tok.length - v.length) <= maxD && distanciaLevenshtein(tok, v) <= maxD) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Coincidencia flexible multi-palabra (AND), pensada para listas en memoria
 * (p. ej. Visor de mostrador). No altera la b\u00fasqueda p\u00fablica por Supabase.
 */
export function productoCoincideTextoFlexible(
  campos: Array<string | number | null | undefined>,
  texto: string
): boolean {
  const terminos = terminosBusquedaProducto(texto);
  if (terminos.length === 0) return true;
  const fuente = campos
    .filter((c) => c != null && String(c).trim() !== '')
    .map((c) => String(c))
    .join(' ');
  if (!fuente.trim()) return false;
  return terminos.every((t) => terminoCoincideEnTextoFlexible(t, fuente));
}

/**
 * Coincidencia para paneles de gestión (Mis productos): multi-palabra AND,
 * sin acentos, con plural simple. Sin typos ni prefijos (evita falsos positivos).
 */
export function productoCoincideTextoGestion(
  campos: Array<string | number | null | undefined>,
  texto: string
): boolean {
  const terminos = terminosBusquedaProducto(texto);
  if (terminos.length === 0) return true;
  const fuente = campos
    .filter((c) => c != null && String(c).trim() !== '')
    .map((c) => normalizarTextoBusqueda(String(c)))
    .join(' ');
  if (!fuente.trim()) return false;
  const fuenteCompacta = fuente.replace(/[^a-z0-9]+/g, '');
  return terminos.every((t) => {
    const variantes = variantesFormaPalabra(t);
    if (variantes.length === 0) return true;
    return variantes.some((v) => fuente.includes(v) || fuenteCompacta.includes(v));
  });
}
