import { PIEZAS_GUIA_AUTO } from '../data/piezasGuiaAuto';
import { PIEZAS_GUIA_MOTO } from '../data/piezasGuiaMoto';
import type { VerticalVehiculo } from './verticalVehiculo';
import { VERTICAL_MOTO } from './verticalVehiculo';

/**
 * Clasifica el nombre de un repuesto en una categoría de Geomotor.
 * Gana la frase más larga. Si dos frases empatan, gana la que está primero.
 * Lo que no coincide devuelve null: quien llama usa Otros (auto) o Accesorios (moto).
 */

const RELLENO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'y', 'e', 'en', 'al']);

/** Alias de la guía que, solos, mandan el repuesto a otra familia. */
const EXCLUIR_AUTO = new Set([
  'axial',
  'axiales',
  'direccion',
  'piston',
  'alternador',
  'accesorios',
  'herraje',
  'herrajes',
]);

const EXCLUIR_MOTO = new Set(['jets']);

type FraseCategoria = {
  tokens: string[];
  categoria: string;
  orden: number;
};

type PiezaConAlias = {
  etiqueta: string;
  categoriaGeomotor: string;
  alias: string[];
};

function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokensDe(valor: string): string[] {
  return normalizarTexto(valor)
    .split(' ')
    .filter((token) => token && !RELLENO.has(token));
}

function mismaPalabra(a: string, b: string): boolean {
  if (a === b) return true;
  const corta = a.length <= b.length ? a : b;
  const larga = a.length <= b.length ? b : a;
  if (corta.length < 3 || !larga.startsWith(corta)) return false;
  const resto = larga.slice(corta.length);
  return resto === 's' || resto === 'es';
}

function contieneFrase(tokens: string[], frase: string[]): boolean {
  const n = frase.length;
  if (n === 0 || n > tokens.length) return false;
  for (let i = 0; i <= tokens.length - n; i += 1) {
    let coincide = true;
    for (let j = 0; j < n; j += 1) {
      if (!mismaPalabra(tokens[i + j], frase[j])) {
        coincide = false;
        break;
      }
    }
    if (coincide) return true;
  }
  return false;
}

function construirFrases(
  extras: ReadonlyArray<readonly [string, string]>,
  piezas: readonly PiezaConAlias[],
  excluir: Set<string>
): FraseCategoria[] {
  const frases: FraseCategoria[] = [];
  const vistas = new Set<string>();
  let orden = 0;

  const agregar = (texto: string, categoria: string, respetarExclusion: boolean) => {
    const tokens = tokensDe(texto);
    if (tokens.length === 0) return;
    if (respetarExclusion && tokens.length === 1 && excluir.has(tokens[0])) return;
    const clave = `${categoria}|${tokens.join(' ')}`;
    if (vistas.has(clave)) return;
    vistas.add(clave);
    frases.push({ tokens, categoria, orden });
    orden += 1;
  };

  for (const [texto, categoria] of extras) agregar(texto, categoria, false);
  for (const pieza of piezas) {
    agregar(pieza.etiqueta, pieza.categoriaGeomotor, true);
    for (const alias of pieza.alias) agregar(alias, pieza.categoriaGeomotor, true);
  }
  return frases;
}

/** Primero las frases que deshacen un empate. La guía de piezas entra después. */
const EXTRAS_AUTO: ReadonlyArray<readonly [string, string]> = [
  ['sensor', 'Sensores automotrices'],
  ['sensores', 'Sensores automotrices'],
  ['diesel', 'Motores a diesel y componentes'],
  ['bomba de inyeccion', 'Motores a diesel y componentes'],
  ['filtro', 'Filtros'],
  ['conector', 'Conectores'],
  ['conectores', 'Conectores'],
  ['conexion electrica', 'Conectores'],
  ['arnes', 'Conectores'],
  ['homocinetica', 'Transmisiones'],
  ['tripoide', 'Transmisiones'],
  ['cardan', 'Transmisiones'],
  ['cruceta', 'Transmisiones'],
  ['semieje', 'Transmisiones'],
  ['punta de eje', 'Transmisiones'],
  ['guardapolvo de homocinetica', 'Transmisiones'],
  ['sincronico', 'Cajas y componentes'],
  ['selectora', 'Cajas y componentes'],
  ['caja de velocidad', 'Cajas y componentes'],
  ['axial de direccion', 'Tren Delantero'],
  ['bomba de direccion', 'Tren Delantero'],
  ['caja de direccion', 'Tren Delantero'],
  ['cremallera', 'Tren Delantero'],
  ['terminal de bateria', 'Baterías'],
  ['borne de bateria', 'Baterías'],
  ['piston de freno', 'Frenos'],
  ['disco de embrague', 'Embrague'],
  ['rodamiento de embrague', 'Embrague'],
  ['prensa de embrague', 'Embrague'],
  ['bombin de freno', 'Frenos'],
  ['bomba de freno', 'Frenos'],
  ['bomba de aceite', 'Motores y componentes'],
  ['resorte de valvula', 'Motores y componentes'],
  ['asiento de valvula', 'Motores y componentes'],
  ['goma de valvula', 'Motores y componentes'],
  ['sello de bujia', 'Bujías y encendido'],
  ['asiento de motor', 'Motores y componentes'],
  ['soporte de motor', 'Motores y componentes'],
  ['base de motor', 'Motores y componentes'],
  ['rotor de distribuidor', 'Bujías y encendido'],
  ['tapa de distribuidor', 'Bujías y encendido'],
  ['piston', 'Motores y componentes'],
  ['anillo', 'Motores y componentes'],
  ['concha', 'Motores y componentes'],
  ['ciguenal', 'Motores y componentes'],
  ['empacadura', 'Motores y componentes'],
  ['kit empacadura', 'Motores y componentes'],
  ['tornillo de camara', 'Motores y componentes'],
  ['taquete', 'Motores y componentes'],
  ['porta taquete', 'Motores y componentes'],
  ['axial', 'Motores y componentes'],
  ['culata', 'Motores y componentes'],
  ['bulon', 'Motores y componentes'],
  ['camisa', 'Motores y componentes'],
  ['valvula', 'Motores y componentes'],
  ['radiador', 'Motores y componentes'],
  ['carburador', 'Motores y componentes'],
  ['inyector', 'Motores y componentes'],
  ['multiple de admision', 'Motores y componentes'],
  ['multiple de escape', 'Motores y componentes'],
  ['tapa de valvula', 'Motores y componentes'],
  ['alternador', 'Motores y componentes'],
  ['motor de arranque', 'Motores y componentes'],
  ['junta', 'Motores y componentes'],
  ['correa', 'Correas y bandas'],
  ['banda', 'Correas y bandas'],
  ['aceite', 'Aceites y lubricantes'],
  ['lubricante', 'Aceites y lubricantes'],
  ['valvulina', 'Aceites y lubricantes'],
  ['grasa', 'Aceites y lubricantes'],
  ['bateria', 'Baterías'],
  ['caucho', 'Cauchos y rines'],
  ['neumatico', 'Cauchos y rines'],
  ['llanta', 'Cauchos y rines'],
  ['rin', 'Cauchos y rines'],
  ['faro', 'Luces y faros'],
  ['farola', 'Luces y faros'],
  ['bombillo', 'Luces y faros'],
  ['cocuyo', 'Luces y faros'],
  ['exploradora', 'Luces y faros'],
  ['neblinero', 'Luces y faros'],
  ['aire acondicionado', 'Aire acondicionado Automotriz'],
  ['evaporador', 'Aire acondicionado Automotriz'],
  ['condensador', 'Aire acondicionado Automotriz'],
  ['compresor de aire', 'Aire acondicionado Automotriz'],
  ['parabrisas', 'Vidrios'],
  ['vidrio', 'Vidrios'],
  ['luneta', 'Vidrios'],
  ['tapiceria', 'Componentes de tapicería'],
  ['tapiz', 'Componentes de tapicería'],
  ['vestidura', 'Componentes de tapicería'],
  ['forro de asiento', 'Componentes de tapicería'],
  ['asiento', 'Componentes de tapicería'],
  ['puerta', 'Componentes de puertas'],
  ['cerradura', 'Componentes de puertas'],
  ['manija', 'Componentes de puertas'],
  ['elevavidrio', 'Componentes de puertas'],
  ['radio', 'Autosonido'],
  ['corneta', 'Autosonido'],
  ['estereo', 'Autosonido'],
  ['autostereo', 'Autosonido'],
  ['amplificador', 'Autosonido'],
  ['parachoque', 'Carrocería'],
  ['paragolpe', 'Carrocería'],
  ['guardafango', 'Carrocería'],
  ['bomper', 'Carrocería'],
  ['estribo', 'Carrocería'],
  ['capot', 'Carrocería'],
  ['accesorio', 'Accesorios'],
];

const EXTRAS_MOTO: ReadonlyArray<readonly [string, string]> = [
  ['casco', 'Cascos y Ropa'],
  ['guante', 'Cascos y Ropa'],
  ['impermeable', 'Cascos y Ropa'],
  ['maleta', 'Maletas'],
  ['maletero', 'Maletas'],
  ['baul', 'Maletas'],
  ['alarma', 'Alarmas'],
  ['manubrio', 'Manubrios y puños'],
  ['puño', 'Manubrios y puños'],
  ['guaya', 'Manubrios y puños'],
  ['asiento', 'Asientos y Carrocería'],
  ['carenaje', 'Asientos y Carrocería'],
  ['carenado', 'Asientos y Carrocería'],
  ['aceite', 'Aceites y lubricantes'],
  ['lubricante', 'Aceites y lubricantes'],
  ['filtro', 'Motor'],
];

const FRASES_AUTO = construirFrases(EXTRAS_AUTO, PIEZAS_GUIA_AUTO, EXCLUIR_AUTO);
const FRASES_MOTO = construirFrases(EXTRAS_MOTO, PIEZAS_GUIA_MOTO, EXCLUIR_MOTO);

function fraseGanadora(frases: FraseCategoria[], tokens: string[]): FraseCategoria | null {
  let ganadora: FraseCategoria | null = null;
  for (const frase of frases) {
    if (!contieneFrase(tokens, frase.tokens)) continue;
    if (
      !ganadora ||
      frase.tokens.length > ganadora.tokens.length ||
      (frase.tokens.length === ganadora.tokens.length && frase.orden < ganadora.orden)
    ) {
      ganadora = frase;
    }
  }
  return ganadora;
}

export function clasificarCategoriaPorNombre(
  nombre: string,
  vertical: VerticalVehiculo
): string | null {
  const tokens = tokensDe(nombre);
  if (tokens.length === 0) return null;
  const frases = vertical === VERTICAL_MOTO ? FRASES_MOTO : FRASES_AUTO;
  const ganadora = fraseGanadora(frases, tokens);
  if (ganadora) return ganadora.categoria;
  if (vertical !== VERTICAL_MOTO && tokens.some((token) => /^\d+pk\d*$/.test(token))) {
    return 'Correas y bandas';
  }
  return null;
}

export function categoriaRespaldoImportacion(vertical: VerticalVehiculo): string {
  return vertical === VERTICAL_MOTO ? 'Accesorios' : 'Otros';
}

export function resumenClasificacionImportacion(
  vertical: VerticalVehiculo,
  porNombre: number,
  enRespaldo: number
): string {
  const partes: string[] = [];
  if (porNombre > 0) {
    partes.push(
      porNombre === 1 ? 'Clasificamos 1 por el nombre.' : `Clasificamos ${porNombre} por el nombre.`
    );
  }
  if (enRespaldo > 0) {
    const destino = categoriaRespaldoImportacion(vertical);
    partes.push(enRespaldo === 1 ? `1 quedó en ${destino}.` : `${enRespaldo} quedaron en ${destino}.`);
  }
  return partes.join(' ');
}
