/** Valor en filtros PostgREST: comas u otros caracteres sin citar rompen `.or()` y devuelven resultados erróneos. */
export function comillasFiltroPostgrest(valor: string): string {
  if (/[",()]/.test(valor)) {
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
    const like = patronIlikeTerminoProducto(termino);
    q = q.or(
      `nombre.ilike.${like},descripcion.ilike.${like},comentarios.ilike.${like},marca.ilike.${like},modelo.ilike.${like},categoria.ilike.${like}`
    ) as T;
  }
  return q;
}
