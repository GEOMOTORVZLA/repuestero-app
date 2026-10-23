/**
 * Códigos repetidos en la carga masiva (típico de un Excel de Mercado Libre).
 * Mismo código y mismo nombre: un solo producto, fotos unidas.
 * Mismo código y otro nombre: el primero conserva el código; los demás reciben un sufijo estable (-2, -3).
 * En la carga siguiente se reconoce cada pieza por código + nombre, sin inventar otro sufijo.
 */

const MAX_FOTOS = 4;

export type FilaImportCodigo = {
  rowNumber: number;
  codigo: string | null;
  nombre: string;
  imagenesUrl: string[];
};

export type ExistenteCodigoImport = {
  codigo: string;
  nombre: string;
};

export function normalizarNombreClaveImport(nombre: string): string {
  return nombre.trim().toUpperCase().replace(/\s+/g, ' ');
}

function numeroSufijo(base: string, codigo: string): number | null {
  const prefijo = `${base}-`;
  if (!codigo.startsWith(prefijo)) return null;
  const resto = codigo.slice(prefijo.length);
  if (!/^[1-9]\d*$/.test(resto)) return null;
  const n = Number(resto);
  return n >= 2 ? n : null;
}

function unirFotos(filas: { imagenesUrl: string[] }[]): { urls: string[]; sobraron: number } {
  const urls: string[] = [];
  const vistas = new Set<string>();
  for (const fila of filas) {
    for (const url of fila.imagenesUrl) {
      const limpia = url.trim();
      if (!limpia || vistas.has(limpia)) continue;
      vistas.add(limpia);
      urls.push(limpia);
    }
  }
  if (urls.length <= MAX_FOTOS) return { urls, sobraron: 0 };
  return { urls: urls.slice(0, MAX_FOTOS), sobraron: urls.length - MAX_FOTOS };
}

function siguienteCodigoLibre(
  base: string,
  ocupados: Set<string>,
  porCodigo: Map<string, string>
): string {
  if (!ocupados.has(base) && !porCodigo.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidato = `${base}-${n}`;
    if (!ocupados.has(candidato) && !porCodigo.has(candidato)) return candidato;
  }
  return `${base}-${Date.now()}`;
}

export function resolverCodigosRepetidos<T extends FilaImportCodigo>(
  filas: T[],
  existentes: ExistenteCodigoImport[]
): { filas: T[]; avisos: string[]; resumen: string } {
  const avisos: string[] = [];
  let unidos = 0;
  let separados = 0;

  const porCodigo = new Map<string, string>();
  for (const existente of existentes) {
    const codigo = existente.codigo.trim();
    if (!codigo || porCodigo.has(codigo)) continue;
    porCodigo.set(codigo, normalizarNombreClaveImport(existente.nombre));
  }

  type Entrada = { indice: number; fila: T };
  const sueltas: Entrada[] = [];
  const grupos = new Map<string, { indice: number; filas: Entrada[] }>();

  filas.forEach((fila, indice) => {
    const codigo = fila.codigo?.trim() ?? '';
    if (!codigo) {
      sueltas.push({ indice, fila });
      return;
    }
    let grupo = grupos.get(codigo);
    if (!grupo) {
      grupo = { indice, filas: [] };
      grupos.set(codigo, grupo);
    }
    grupo.filas.push({ indice, fila });
  });

  type Pieza = { indice: number; fila: T; nombreClave: string };

  const simples: Pieza[] = [];
  const multiples: { codigo: string; piezas: Pieza[] }[] = [];

  for (const [codigo, grupo] of grupos) {
    const baldes = new Map<string, Entrada[]>();
    const ordenNombres: string[] = [];
    for (const entrada of grupo.filas) {
      const nombreClave = normalizarNombreClaveImport(entrada.fila.nombre);
      const lista = baldes.get(nombreClave);
      if (!lista) {
        baldes.set(nombreClave, [entrada]);
        ordenNombres.push(nombreClave);
      } else {
        lista.push(entrada);
      }
    }

    const piezas: Pieza[] = ordenNombres.map((nombreClave) => {
      const entradas = baldes.get(nombreClave)!;
      const ultima = entradas[entradas.length - 1].fila;
      const fotos = unirFotos(entradas.map((e) => e.fila));
      if (fotos.sobraron > 0) {
        avisos.push(
          `Código ${codigo} («${ultima.nombre}»): había más de 4 fotos; se guardan las primeras 4.`
        );
      }
      if (entradas.length > 1) {
        unidos += entradas.length - 1;
        const nums = entradas.map((e) => e.fila.rowNumber).join(', ');
        avisos.push(
          `Código ${codigo} («${ultima.nombre}»): las filas ${nums} son el mismo repuesto y se unieron en uno.`
        );
      }
      return {
        indice: entradas[0].indice,
        nombreClave,
        fila: {
          ...ultima,
          rowNumber: entradas[0].fila.rowNumber,
          codigo,
          imagenesUrl: fotos.urls,
        },
      };
    });

    if (piezas.length === 1) simples.push(piezas[0]);
    else multiples.push({ codigo, piezas });
  }

  const ocupados = new Set<string>();
  const salida: Entrada[] = [...sueltas];

  for (const pieza of simples) {
    const codigo = pieza.fila.codigo?.trim() ?? '';
    if (codigo) ocupados.add(codigo);
    salida.push({ indice: pieza.indice, fila: pieza.fila });
  }

  for (const grupo of multiples) {
    const { codigo, piezas } = grupo;
    const pendientes: Pieza[] = [];
    const asignadas: Entrada[] = [];

    for (const pieza of piezas) {
      if (porCodigo.get(codigo) === pieza.nombreClave && !ocupados.has(codigo)) {
        ocupados.add(codigo);
        porCodigo.set(codigo, pieza.nombreClave);
        asignadas.push({ indice: pieza.indice, fila: { ...pieza.fila, codigo } });
        continue;
      }
      let sufijoHallado: string | null = null;
      for (const [cod, nombre] of porCodigo) {
        if (nombre !== pieza.nombreClave || ocupados.has(cod)) continue;
        if (numeroSufijo(codigo, cod) == null) continue;
        sufijoHallado = cod;
        break;
      }
      if (sufijoHallado) {
        ocupados.add(sufijoHallado);
        porCodigo.set(sufijoHallado, pieza.nombreClave);
        asignadas.push({ indice: pieza.indice, fila: { ...pieza.fila, codigo: sufijoHallado } });
        continue;
      }
      pendientes.push(pieza);
    }

    for (const pieza of pendientes) {
      const asignado = siguienteCodigoLibre(codigo, ocupados, porCodigo);
      ocupados.add(asignado);
      porCodigo.set(asignado, pieza.nombreClave);
      asignadas.push({ indice: pieza.indice, fila: { ...pieza.fila, codigo: asignado } });
      if (asignado !== codigo) {
        separados += 1;
        avisos.push(
          `Código ${codigo} repetido con otro nombre («${pieza.fila.nombre}») se guardará como ${asignado}.`
        );
      }
    }

    if (porCodigo.has(codigo) && !ocupados.has(codigo)) {
      avisos.push(
        `El código ${codigo} ya existe con otro nombre y se dejó como está. Los repetidos del archivo se guardaron aparte.`
      );
    }

    salida.push(...asignadas);
  }

  salida.sort((a, b) => a.indice - b.indice);

  const partes: string[] = [];
  if (unidos > 0) {
    partes.push(
      `${unidos} fila(s) con el mismo código y nombre se unieron en un solo producto.`
    );
  }
  if (separados > 0) {
    partes.push(
      `${separados} código(s) repetido(s) con otro nombre se guardarán con un sufijo.`
    );
  }

  return { filas: salida.map((s) => s.fila), avisos, resumen: partes.join(' ') };
}
