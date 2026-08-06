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

/** Conectores que el usuario escribe pero no deben exigir AND (rompe "cables de bujia"). */
const STOPWORDS_BUSQUEDA = new Set([
  'a',
  'al',
  'con',
  'da',
  'de',
  'del',
  'el',
  'en',
  'es',
  'la',
  'las',
  'le',
  'les',
  'lo',
  'los',
  'mi',
  'o',
  'para',
  'por',
  'que',
  'se',
  'sin',
  'su',
  'sus',
  'the',
  'tu',
  'un',
  'una',
  'unas',
  'unos',
  'y',
]);

function esStopwordBusqueda(termino: string): boolean {
  return STOPWORDS_BUSQUEDA.has(normalizarTextoBusqueda(termino));
}

/** Palabras clave (min. 2 caracteres, sin duplicados ni conectores) para busqueda multi-termino AND. */
export function terminosBusquedaProducto(texto: string): string[] {
  const vistos = new Set<string>();
  return texto
    .trim()
    .split(/\s+/)
    .map((t) => limpiarTokenTermino(t.trim()))
    .filter((t) => t.length >= 2)
    .filter((t) => !esStopwordBusqueda(t))
    .filter((t) => {
      const k = normalizarTextoBusqueda(t);
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

const CAMPOS_TEXTO_PRODUCTO = [
  'nombre',
  'descripcion',
  'comentarios',
  'marca',
  'modelo',
  'categoria',
] as const;

const CAMPOS_TEXTO_TIENDA = ['nombre', 'nombre_comercial'] as const;

function aplicarTerminosImatchEnCampos<T extends QueryConOr>(
  query: T,
  texto: string,
  campos: readonly string[]
): T {
  let q = query;
  for (const termino of terminosBusquedaProducto(texto)) {
    const variantes = variantesFormaPalabra(termino);
    const partes: string[] = [];
    for (const v of variantes.length > 0 ? variantes : [termino]) {
      const pat = patronImatchTerminoProductoSinAcento(v);
      for (const campo of campos) {
        partes.push(`${campo}.imatch.${pat}`);
      }
    }
    if (partes.length === 0) continue;
    q = q.or(partes.join(',')) as T;
  }
  return q;
}

/** Cada termino (o su singular/plural) debe coincidir en al menos un campo; sin exigir acentos. */
export function aplicarTerminosTextoABusquedaProductos<T extends QueryConOr>(
  query: T,
  texto: string
): T {
  return aplicarTerminosImatchEnCampos(query, texto, CAMPOS_TEXTO_PRODUCTO);
}

/** Búsqueda flexible de vendedores/tiendas por nombre (servidor, misma lógica de términos). */
export function aplicarTerminosTextoABusquedaTiendas<T extends QueryConOr>(
  query: T,
  texto: string
): T {
  return aplicarTerminosImatchEnCampos(query, texto, CAMPOS_TEXTO_TIENDA);
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
  const terminoCompacto = normalizarTextoBusqueda(termino).replace(/[^a-z0-9]+/g, '');
  if (terminoCompacto.length >= 2 && fuenteCompacta.includes(terminoCompacto)) return true;

  // Códigos con dígitos: no hace falta pluralizar (evita ruido tipo rpr544stds).
  const esCodigo = /\d/.test(terminoCompacto) || /[-./_]/.test(termino);
  const variantes = esCodigo
    ? terminoCompacto.length >= 2
      ? [terminoCompacto]
      : []
    : variantesFormaPalabra(termino);
  if (variantes.length === 0) return terminoCompacto.length >= 2 && fuente.includes(terminoCompacto);

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
      if (esCodigo) continue;
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
  const textoTrim = texto.trim();
  if (!textoTrim) return true;
  const fuente = campos
    .filter((c) => c != null && String(c).trim() !== '')
    .map((c) => String(c))
    .join(' ');
  if (!fuente.trim()) return false;

  // Códigos enteros (RPR544-STD / RPR544 STD): comparar compacto del query completo,
  // aunque haya guiones, espacios o puntos.
  const queryCompacto = normalizarTextoBusqueda(textoTrim).replace(/[^a-z0-9]+/g, '');
  const fuenteCompacta = normalizarTextoBusqueda(fuente).replace(/[^a-z0-9]+/g, '');
  if (queryCompacto.length >= 4 && /\d/.test(queryCompacto) && fuenteCompacta.includes(queryCompacto)) {
    return true;
  }

  const terminos = terminosBusquedaProducto(textoTrim);
  if (terminos.length === 0) {
    // Solo conectores / tokens cortos, pero el compacto de código pudo bastar arriba.
    return queryCompacto.length >= 2 && fuenteCompacta.includes(queryCompacto);
  }
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
