import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "los",
  "las",
  "una",
  "uno",
  "del",
  "por",
  "que",
]);

/**
 * Etiquetas Vision / Web Detection suelen meter ruido (máquina, ciencia, fibra de carbono…)
 * que no ayudan a buscar repuestos en un catálogo.
 */
const PALABRAS_RUIDO_BUSQUEDA = new Set([
  "machine",
  "machinery",
  "science",
  "lamp",
  "lamps",
  "light",
  "lights",
  "lighting",
  "fan",
  "fans",
  "centrifugal",
  "carbon",
  "fiber",
  "fibers",
  "fibre",
  "fibres",
  "exhaust",
  "automotive",
  "component",
  "components",
  "technology",
  "equipment",
  "material",
  "materials",
  "corporation",
  "company",
  "object",
  "objects",
  "vacuum",
  "vacuums",
  "used",
  "unused",
  "sale",
]);

const FRASES_RUIDO_BUSQUEDA = [
  /\bcentrifugal\s+fan\b/i,
  /\bcarbon\s+fib(er|re)s?\b/i,
  /\bautomotive\s+exhaust\b/i,
  /\b\d+\s+valvulas?\b/i,
];

/** Etiquetas tipo "marca nominal" (sin pieza concreta) que suelen venir de Vision y no sirven solas en catálogo. */
const FRASES_MARCA_OEM_VISION = [
  /\balfa\s+romeo\b/i,
  /\baston\s+martin\b/i,
  /\brolls[\s-]?royce\b/i,
  /\bland\s+rover\b/i,
  /\bmercedes[\s-]?benz\b/i,
  /\brange\s+rover\b/i,
  /\bmini\s+cooper\b/i,
  /\bharley[\s-]?davidson\b/i,
];

/**
 * Marca o "marca + modelo" que Vision suele inventar/alucinar en LABEL_DETECTION.
 * Se permiten si el usuario ya eligió esa marca/modelo como referencia; si no, ensucian Geomotor.
 */
const MARCAS_OEM_VISION_RUIDO = new Set([
  "acura",
  "alfa",
  "romeo",
  "audi",
  "bmw",
  "buick",
  "cadillac",
  "chevrolet",
  "chevy",
  "chrysler",
  "citroen",
  "citroën",
  "dodge",
  "fiat",
  "ford",
  "gmc",
  "honda",
  "hyundai",
  "infiniti",
  "isuzu",
  "jaguar",
  "jeep",
  "kia",
  "lada",
  "lancia",
  "lexus",
  "lincoln",
  "maserati",
  "mazda",
  "mercedes",
  "mercury",
  "mini",
  "mitsubishi",
  "nissan",
  "oldsmobile",
  "opel",
  "peugeot",
  "plymouth",
  "pontiac",
  "porsche",
  "ram",
  "renault",
  "rover",
  "saab",
  "saturn",
  "scion",
  "seat",
  "skoda",
  "smart",
  "subaru",
  "suzuki",
  "tesla",
  "toyota",
  "vauxhall",
  "volkswagen",
  "volvo",
  "vw",
  "yamaha",
  "kawasaki",
  "ducati",
  "harley",
  "davidson",
  "bajaj",
  "hero",
  "ktm",
  "aprilia",
  "benelli",
  "cfmoto",
  "bentley",
  "rolls",
  "royce",
  "ferrari",
  "lamborghini",
  "mclaren",
  "aston",
  "martin",
]);

/** Web Detection a veces asocia la foto con desastres (armas, tanques): no sirven para búsqueda de repuestos. */
const PATRONES_RUIDO_VISION = [
  /\b(rifle|gun|firearm|weapon|carbine|tank|artillery|military combat|soldier)\b/i,
  /\bm\d+\s*rifle\b/i,
];

/** Salida del modelo: informe detallado estilo asesor de repuestos (similar calidad a análisis con visión propia). */
type InterpretacionUsuario = {
  identificacionConcreta: string;
  codigosYReferencias: string;
  funcion: string;
  compatibilidadComun: string;
  sintomasFallaTipicos: string;
  contextoAdicional: string;
  nivelConfianza: string;
  notaUsuario: string;
};

type InterpretacionDiag = {
  codigo: string;
  mensaje?: string;
};

function textoEsRuidoVision(s: string): boolean {
  const t = s.trim();
  if (t.length < 2) return true;
  return PATRONES_RUIDO_VISION.some((p) => p.test(t));
}

function filtrarEntidadesWeb(entidades: string[]): string[] {
  return entidades.filter((e) => !textoEsRuidoVision(e));
}

function normalizarTermino(valor: string): string {
  return valor.replace(/[%_]/g, "").trim();
}

/** "Ford Motor Company" -> "Ford" (misma marca, menos ruido en búsqueda). */
function comprimirMarcaMotorCorp(raw: string): string {
  const t = normalizarTermino(raw);
  const m = t.match(/^([A-Za-zÀ-ÿ.]+)\s+Motor\s+(Corporation|Company)\s*$/i);
  if (m) return m[1];
  return t;
}

function normalizarParaCompararBusqueda(s: string): string {
  return normalizarTermino(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Si el usuario eligió marca/modelo en la app, permite conservar esa OEM en etiquetas Vision; si no, suele ser ruido. */
function referenciaUsuarioCoincideMarcaModeloVision(marcaRef: string, modeloRef: string, termino: string): boolean {
  const m = normalizarParaCompararBusqueda(marcaRef);
  const mo = normalizarParaCompararBusqueda(modeloRef);
  const t = normalizarParaCompararBusqueda(termino);
  if (!t) return false;
  const palabrasT = t.split(/\s+/).filter(Boolean);
  if (m.length >= 2) {
    if (t === m || palabrasT[0] === m || t.startsWith(m + " ")) return true;
  }
  if (mo.length >= 2 && t.includes(mo)) return true;
  return false;
}

/**
 * Etiqueta de Vision que solo nombre fabricante o "marca + código modelo" sin describir el repuesto.
 * No aplica a OCR (en grabado puede ser P/N real).
 */
function esEtiquetaSoloMarcaOemVision(u: string, origen: "label" | "web" | "ocr"): boolean {
  if (origen === "ocr") return false;
  const x = comprimirMarcaMotorCorp(u);
  if (FRASES_MARCA_OEM_VISION.some((r) => r.test(x))) return true;
  const lower = x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const partes = lower.split(/\s+/).filter(Boolean);
  if (partes.length === 1) return MARCAS_OEM_VISION_RUIDO.has(partes[0]);
  if (partes.length === 2) {
    const [a, b] = partes;
    if (!MARCAS_OEM_VISION_RUIDO.has(a)) return false;
    if (/^\d{3,4}$/.test(b)) return true;
    if (/^[a-z]{2,}\d{2,}$/i.test(b)) return true;
  }
  return false;
}

/** OCR con dígitos, guion o patrón tipo P/N suele ser útil; no filtrar como etiqueta genérica. */
function pareceTokenTecnicoBusqueda(t: string): boolean {
  if (/[0-9]/.test(t)) return true;
  if (/-/.test(t)) return true;
  if (/^[a-z]{1,5}\d{2,}[a-z0-9-]*$/i.test(t.replace(/\s/g, ""))) return true;
  return false;
}

function pasaFiltroRuidoBusqueda(t: string, origen: "label" | "web" | "ocr"): boolean {
  const u = comprimirMarcaMotorCorp(t);
  if (u.length < 2) return false;
  if (origen === "ocr" && pareceTokenTecnicoBusqueda(u)) return true;

  if (FRASES_RUIDO_BUSQUEDA.some((r) => r.test(u))) return false;

  const lower = u.toLowerCase();
  const partes = lower.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return false;

  if (partes.some((p) => PALABRAS_RUIDO_BUSQUEDA.has(p))) return false;

  const todasRuido = partes.every((p) => PALABRAS_RUIDO_BUSQUEDA.has(p));
  if (partes.length > 1 && todasRuido) return false;

  return true;
}

function terminosDesdeTexto(texto: string): string[] {
  const partes = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/g)
    .filter((p) => p.length >= 3 && !STOP_WORDS.has(p));
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const p of partes) {
    if (vistos.has(p)) continue;
    vistos.add(p);
    out.push(p);
    if (out.length >= 20) break;
  }
  return out;
}

/** Algunos modelos devuelven el JSON envuelto en ```json … ``` o usan snake_case / claves legacy. */
function limpiarTextoJsonModelo(s: string): string {
  let t = s.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im;
  const m = t.match(fence);
  if (m) t = m[1].trim();
  return t;
}

function extraerPrimerObjetoJson(texto: string): string | null {
  const t = limpiarTextoJsonModelo(texto);
  const inicio = t.indexOf("{");
  if (inicio < 0) return null;
  let prof = 0;
  let enString = false;
  let escape = false;
  for (let i = inicio; i < t.length; i++) {
    const c = t[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (enString) {
      if (c === "\\") escape = true;
      else if (c === '"') enString = false;
      continue;
    }
    if (c === '"') {
      enString = true;
      continue;
    }
    if (c === "{") prof++;
    else if (c === "}") {
      prof--;
      if (prof === 0) return t.slice(inicio, i + 1);
    }
  }
  return null;
}

/** Lee valor de string JSON desde justo después de la comilla inicial; si el JSON está truncado, cierra al final del texto. */
function leerValorStringJsonIncompleto(texto: string, desde: number): { valor: string; fin: number } {
  let i = desde;
  let out = "";
  while (i < texto.length) {
    const c = texto[i];
    if (c === "\\") {
      const sig = texto[i + 1];
      if (sig === undefined) break;
      if (sig === "n") {
        out += "\n";
        i += 2;
        continue;
      }
      if (sig === "r") {
        out += "\r";
        i += 2;
        continue;
      }
      if (sig === "t") {
        out += "\t";
        i += 2;
        continue;
      }
      if (sig === "u" && texto.length >= i + 6) {
        const hex = texto.slice(i + 2, i + 6);
        const n = parseInt(hex, 16);
        out += Number.isFinite(n) ? String.fromCharCode(n) : "u";
        i += 6;
        continue;
      }
      if ('"\\/'.includes(sig)) {
        out += sig;
        i += 2;
        continue;
      }
      out += sig;
      i += 2;
      continue;
    }
    if (c === '"') return { valor: out.trim(), fin: i };
    out += c;
    i++;
  }
  return { valor: out.trim(), fin: texto.length };
}

function extraerValorStringParaCampos(texto: string, claves: string[]): string {
  const t = limpiarTextoJsonModelo(texto);
  for (const clave of claves) {
    const esc = clave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`"${esc}"\\s*:\\s*"`, "i");
    const m = t.match(re);
    if (m?.index !== undefined) {
      const inicioValor = m.index + m[0].length;
      const { valor } = leerValorStringJsonIncompleto(t, inicioValor);
      if (valor) return valor;
    }
  }
  return "";
}

/**
 * Si Gemini/modelo corta la salida, JSON.parse falla pero suele quedar legible el inicio de "identificacionConcreta" y otros campos.
 */
function recuperarInterpretacionDesdeJsonRoto(raw: string): InterpretacionUsuario | null {
  const identificacionConcreta = extraerValorStringParaCampos(raw, [
    "identificacionConcreta",
    "identificacion_concreta",
    "piezaProbable",
    "pieza_probable",
    "identificacion",
  ]);
  if (!identificacionConcreta) return null;
  const codigosYReferencias = extraerValorStringParaCampos(raw, [
    "codigosYReferencias",
    "codigos_y_referencias",
    "referenciasDetectadas",
    "referencias_detectadas",
  ]);
  const funcion = extraerValorStringParaCampos(raw, [
    "funcion",
    "paraQueSirve",
    "para_que_sirve",
  ]);
  const compatibilidadComun = extraerValorStringParaCampos(raw, [
    "compatibilidadComun",
    "compatibilidad_comun",
    "aplicacionVehiculos",
    "aplicacion_vehiculos",
  ]);
  const sintomasFallaTipicos = extraerValorStringParaCampos(raw, [
    "sintomasFallaTipicos",
    "sintomas_falla_tipicos",
  ]);
  const contextoAdicional = extraerValorStringParaCampos(raw, [
    "contextoAdicional",
    "contexto_adicional",
  ]);
  const nivelRaw = extraerValorStringParaCampos(raw, ["nivelConfianza", "nivel_confianza"]);
  const notaUsuario = extraerValorStringParaCampos(raw, ["notaUsuario", "nota_usuario"]);

  return {
    identificacionConcreta,
    codigosYReferencias,
    funcion,
    compatibilidadComun,
    sintomasFallaTipicos,
    contextoAdicional,
    nivelConfianza: nivelRaw || "medio",
    notaUsuario,
  };
}

function strCampo(o: Record<string, unknown>, ...claves: string[]): string {
  for (const k of claves) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function fusionarTerminos(
  labels: { description: string; score: number }[],
  textoOcr: string,
  marcaRef: string,
  modeloRef: string
): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];

  const push = (raw: string, origen: "label" | "web" | "ocr") => {
    if (textoEsRuidoVision(raw)) return;
    const candidato = comprimirMarcaMotorCorp(raw);
    if (!pasaFiltroRuidoBusqueda(candidato, origen)) return;
    if (
      esEtiquetaSoloMarcaOemVision(candidato, origen) &&
      !referenciaUsuarioCoincideMarcaModeloVision(marcaRef, modeloRef, candidato)
    ) {
      return;
    }
    const t = normalizarTermino(candidato);
    if (t.length < 2) return;
    const clave = t.toLowerCase();
    if (vistos.has(clave)) return;
    vistos.add(clave);
    out.push(t);
  };

  for (const tok of terminosDesdeTexto(textoOcr)) {
    push(tok, "ocr");
  }

  for (const l of labels.slice(0, 14)) {
    if (l.score < 0.48) continue;
    push(l.description, "label");
    for (const parte of l.description.split(/[,/]/)) push(parte.trim(), "label");
  }

  /** Web Detection NO entra en búsqueda Geomotor: aporta demasiado ruido (Science, Mazda Corp, etc.). */

  return out.slice(0, 16);
}

/** Términos extraídos del informe OpenAI (TPS, P/N) para priorizar la búsqueda en catálogo. */
function terminosDesdeInforme(interp: InterpretacionUsuario): string[] {
  const blob = `${interp.identificacionConcreta}\n${interp.codigosYReferencias}\n${interp.funcion}\n${interp.sintomasFallaTipicos}`;
  const vistos = new Set<string>();
  const out: string[] = [];

  const add = (raw: string) => {
    const s = normalizarTermino(raw);
    if (s.length < 2) return;
    const k = s.toLowerCase();
    if (vistos.has(k)) return;
    vistos.add(k);
    out.push(s);
  };

  for (const m of blob.matchAll(/\b[A-Za-z]{1,5}[-.]?[0-9]{2,}[A-Z0-9-]*\b/g)) {
    add(m[0]);
  }
  for (const m of blob.matchAll(/\b[0-9]{1,4}[-.]?[A-Za-z][A-Z0-9-]*\b/g)) {
    add(m[0]);
  }
  for (const m of blob.matchAll(/\b(TPS|MAP|MAF|IAC|EGR|CKP|CMP|CTS)\b/gi)) {
    add(m[0].toUpperCase());
  }
  for (const m of blob.matchAll(/\bP0[0-9]{3}\b/gi)) {
    add(m[0].toUpperCase());
  }
  if (/\bacelerador\b/i.test(blob)) add("acelerador");
  if (/\bmariposa\b/i.test(blob)) add("mariposa");
  if (/\bthrottle\b/i.test(blob)) add("throttle");

  return out.slice(0, 10);
}

function mezclarTerminosBusqueda(
  visionBase: string[],
  interp: InterpretacionUsuario | null
): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  const pushArr = (arr: string[]) => {
    for (const t of arr) {
      const k = t.toLowerCase();
      if (vistos.has(k)) continue;
      vistos.add(k);
      out.push(t);
    }
  };
  if (interp) {
    pushArr(terminosDesdeInforme(interp));
  }
  pushArr(visionBase);
  return out.slice(0, 14);
}

/** Marca y modelo elegidos por el usuario al inicio: van primero y se deduplican con Vision. */
function inyectarMarcaModeloBusqueda(marca: string, modelo: string, terminos: string[]): string[] {
  const marcaT = normalizarTermino(marca);
  const modeloT = normalizarTermino(modelo);
  const vistos = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const t = normalizarTermino(raw);
    if (t.length < 2) return;
    const k = t.toLowerCase();
    if (vistos.has(k)) return;
    vistos.add(k);
    out.push(t);
  };
  if (marcaT) add(marcaT);
  if (modeloT) add(modeloT);
  if (marcaT && modeloT) add(`${marcaT} ${modeloT}`);
  for (const x of terminos) add(x);
  return out.slice(0, 14);
}

const SYSTEM_PROMPT_INTERPRET =
  "Respondes únicamente con un objeto JSON válido en español. No uses markdown ni bloques ```. Actúa como experto de almacén (30 años), mercado Venezuela: terminología local de taller/almacén cuando encaje, sin perder rigor técnico. Prioridad absoluta: P/N visibles, marcas OEM (Toyota, Denso, Bosch, etc.), compatibilidad de motor/vehículo; los códigos alfanuméricos, bajo el estándar de la marca. **Misma profundidad de análisis para toda imagen** (sensor, mecánica, eléctrico, carrocería, etc.). Calidad tipo asesor senior: texto útil, P/N del OCR, síntomas y DTC solo cuando apliquen al tipo de pieza. No inventes números que no se vean. No confundas MAP/MAF con CKP/CMP. CKP/CMP = posición de ejes; MAP = presión de admisión. Respeta vehiculoReferenciaUsuario para compatibilidad.";

function construirTextoInstruccionesInterpretacion(
  verticalHumana: string,
  labels: { description: string; score: number }[],
  textoOcr: string | null,
  webEntities: string[],
  marcaReferencia: string,
  modeloReferencia: string
): string {
  const insumos = {
    tipoVehiculo: verticalHumana,
    vehiculoReferenciaUsuario: {
      marca: marcaReferencia || null,
      modelo: modeloReferencia || null,
    },
    etiquetasVision: labels.slice(0, 16).map((l) => ({
      texto: l.description,
      confianzaPct: Math.round(l.score * 100),
    })),
    textoLeidoEnFotoOCR: (textoOcr ?? "").slice(0, 4000),
    sugerenciasWebFiltradas: webEntities.slice(0, 8),
  };

  return `Actúa como un experto en almacén de repuestos con 30 años de experiencia (automóvil y moto). Tu **prioridad absoluta** es identificar **Números de Parte (P/N)**, marcas **OEM** (Toyota, Denso, Bosch y cualquier otra que veas en la pieza, grabado o OCR) y **compatibilidad de motores o vehículos**. Si ves un **código alfanumérico**, analízalo bajo el **estándar de nomenclatura de esa marca** (no como texto suelto). Estás en el mercado de **Venezuela**: priorizá **terminología de almacén y taller local** (además del término técnico cuando sume claridad). **Aplicá el mismo nivel de análisis detallado a todas las imágenes** que recibas (electrónica, sensor, mecánica, suspensión, frenos, iluminación, carrocería, etc.): no reduzcas el informe por el tipo de pieza.

Vas a ver la FOTO de una pieza. También recibes datos automáticos de OCR y etiquetas como APOYO (pueden tener ruido o ser genéricas como "sensor").

Tipo de vehículo que eligió el usuario: ${verticalHumana}.

Si en el JSON aparece "vehiculoReferenciaUsuario", es la marca/modelo que el usuario indicó en la app como referencia (su vehículo); puede ir vacío. Úsalo para matizar "compatibilidadComun" cuando encaje con la pieza o el P/N; **prioridad** siempre a la foto y al OCR si hay conflicto. **No sustituyas** el vehículo de referencia por otro modelo de la misma marca (ej. si el usuario puso Toyota Yaris, no digas que la pieza es “típica de Corolla/Camry/RAV4” salvo que el P/N grabado o el OCR lo demuestren claramente; en caso de duda, menciona el **Yaris primero** o dilo como “posible intercambio según catálogo a verificar”).

Datos automáticos en JSON:
${JSON.stringify(insumos)}

REGLAS DE PRECISIÓN (no confundir categorías):
- El **MAP** (Manifold Absolute Pressure / sensor de presión absoluta del múltiple) mide **presión o vacío del admisión** respecto a una referencia. Suele ir **acoplado al colector de admisión** o integrado en otro módulo de admisión, y **a menudo** tiene **toma para manguera de vacío** o va en ducto donde hay depresión; **NO** mide la posición física del cigüeñal ni del árbol de levas.
- El **CKP** (Crankshaft Position Sensor / sensor de posición o revoluciones del cigüeñal) y el **CMP** (Camshaft Position Sensor / sensor de posición del árbol de levas) son sensores de **proximidad/Hall o magnetorresistivo**, con **carcasa típicamente cilíndrica o en “L”**, **brida con agujero para tornillo**, punta/cara hacia **rueda fónica o diente de engrane**; **conector eléctrico**, y **no** miden presión de admisión. En **Toyota** (Yaris, Corolla, etc.) muchos CKP/CMP son de estilo **Denso**: si la foto encaja con sensor de **posición de eje** y **no** hay toma de vacío ni contexto de múltiple, **no lo llames MAP**; valorá **CKP o CMP** (o ambos como diferencial si no distingues la cara exacta).
- Si el usuario describió **árbol de levas** o **cigüeñal** en el contexto y la pieza parece sensor de posición de eje, **priorizá CMP o CKP** y **descartá MAP** salvo evidencia clara de medición de presión en admisión.
- El TPS (Throttle Position Sensor) en español es el **sensor de posición del cuerpo de acelerador / mariposa** (mide el ángulo o apertura del throttle). **NO** es lo mismo que un sensor de **presión de combustible** en el riel (fuel rail pressure), ni MAP, ni MAF, ni oxígeno.
- Pieza pequeña de plástico negro con **conector eléctrico** y a veces marca **CTS**, con números tipo **Ford** (ej. patrón F5RF-xxxxx, F5RZ-…, terminaciones -9B989, etc. en grabado o carcasas PBT-G30): en Ford de los 90–2000s suele ser muy frecuente un **TPS** en el cuerpo de aceleración. Si la forma coincide con sensor rotativo/throttle y el P/N encaja con catálogo Ford, identifícalo como **TPS**, no como presión de combustible.
- **Referencias Toyota / Denso (OCR):** Los números **90919-xxxxx** (Toyota) y **029600-xxxx** / **029600-xxxxx** (Denso en sensor) en el cuerpo o etiqueta son **muy indicativos** de sensores de motor (a menudo **CKP**, **CMP** u otros de bloque/cabeza). Si la forma es de **sensor de posición de eje** y aparecen esos P/N, **identifica CKP o CMP según encaje** y **no** como MAP/MAF. Cruza mentalmente con catálogos típicos: si el P/N encaja con CKP de plataformas 2AZ-FE / 1MZ-FE / 3MZ-FE, puedes mencionar esos **códigos de motor** en compatibilidad **como “habitual según catálogos para…”**, sin inventar otros P/N.
- Si la evidencia NO alcanza para distinguir entre **CKP, CMP o MAP** (u otros parecidos), dilo explícitamente, enumera **posibles** con guiones, y pon **nivelConfianza: bajo**; **no inventes MAP** si los indicios son de sensor de posición de cigüeñal/árbol de levas.

CALIDAD DEL INFORME (mismo estándar para **cualquier** pieza en foto; debe rivalizar con un asesor senior de almacén):
- Sé **concreto y técnico**: marca **OEM** o fabricante si se deduce (Denso, Bosch, Aisin, etc.), **transcribe todos los P/N y referencias secundarias visibles** en "codigosYReferencias"; si un código sigue patrón conocido de marca, dilo (ej. Denso 029600-xxxx, Toyota 90919-xxxxx).
- En "funcion": si es **sensor/actuador electrónico**, explica señal y **para qué la usa la ECU** (chispa, inyección, fases) en 3–6 frases; si es **mecánica/hidráulica/otra**, explica **función en el vehículo**, esfuerzos, fluidos o acople, con el mismo detalle útil para comprar el repuesto correcto.
- En "compatibilidadComun": lista con **guiones y \\n** modelos o **familias de motor** cuando el P/N lo respalde; **respeta** vehiculoReferenciaUsuario al inicio; añade “otros según catálogo” si amplías.
- En "sintomasFallaTipicos": si es **CKP**, incluye síntomas como **no arranca, se apaga en marcha, pérdida de chispa** y códigos **OBD-II típicos** (ej. **P0335**, **P0339**) **solo si son habituales para ese tipo de sensor**; si es **CMP**, códigos como **P0340**/P0011 según aplique. Si la pieza **no es electrónica** (mecánica, suspensión, frenos, etc.), describe **fallas típicas reales** (ruido, juego, fuga, pulsación, desgaste) **sin inventar DTC**. No inventes códigos raros.
- En "contextoAdicional": **ubicación típica de montaje** o ensamble, **criticidad** (arranque, seguridad, confort) según el tipo de pieza; vacío solo si no aplica.
- En la primera frase de "identificacionConcreta": si hay **siglas estándar** (MAP, CKP, etc.), ponlas **en mayúsculas y el nombre completo en español entre paréntesis**; si no aplica (ej. base de amortiguador, goma, pastilla), usa **nombre técnico claro** que usaría un almacén venezolano.
- **Longitud:** mantén **identificacionConcreta** en **2–4 frases breves** al inicio; el detalle largo va en **funcion**, **compatibilidadComun** y **codigosYReferencias**, para que el JSON que devuelves **quepa entero** (no cortes a medias por límite de salida).

Informe (rellena cada campo con **texto útil**, no genérico; usa \\n para listas):
1) Mira la FOTO y el JSON de OCR: forma, conector, grabados, sellos, **todos** los números legibles. Prioriza imagen + OCR sobre etiquetas genéricas.
2) "codigosYReferencias": todos los P/N y referencias secundarias visibles (ej. Toyota + Denso); si algo está dudoso, indica “parcial: …”.
3) "funcion": según tipo REAL: sensores → señal y ECU; mecánica/otras → función en el vehículo (frenos, suspensión, motor, etc.).
4) "compatibilidadComun": párrafo + lista con guiones; motores (ej. 2AZ-FE) cuando el P/N lo soporte; vehiculoReferenciaUsuario primero.
5) "sintomasFallaTipicos": fallas típicas coherentes con la pieza; DTC solo cuando corresponda (ver reglas CKP/CMP).
6) "contextoAdicional": ubicación típica, criticidad, OEM; vacío solo si no aplica.
7) Ignora sugerencias web absurdas (armas, tanques).

Responde SOLO con un JSON (strings en español). Los strings pueden ser **largos** si aportan valor. Usa \\n dentro de los strings para listas.
{
  "identificacionConcreta": "Primera frase: SIGLAS (nombre ES) si aplica; si no hay siglas, nombre técnico de almacén. Luego 1–3 frases: OEM/P/N y matiz.",
  "codigosYReferencias": "Todos los códigos visibles; formato claro",
  "funcion": "Explicación técnica útil para el taller (varias frases si hace falta)",
  "compatibilidadComun": "Párrafo + lista con \\n- ítem",
  "sintomasFallaTipicos": "Lista numerada o con \\n- ; incluir DTC típicos si corresponde",
  "contextoAdicional": "Ubicación típica, criticidad, demanda; o cadena vacía",
  "nivelConfianza": "bajo|medio|alto",
  "notaUsuario": "Contraste P/N con catálogo/taller antes de comprar; matiz si hubo ambigüedad"
}`;
}

function interpretarJsonInformeDesdeTextoModelo(
  raw: string,
  prefijo: "openai" | "gemini",
  opts?: { finishReason?: string }
): { interpretacion: InterpretacionUsuario | null; diag?: InterpretacionDiag } {
  const candidatoJson = extraerPrimerObjetoJson(String(raw)) ?? limpiarTextoJsonModelo(String(raw));

  try {
    const parsed = JSON.parse(candidatoJson) as Record<string, unknown>;
    const identificacionConcreta = strCampo(
      parsed,
      "identificacionConcreta",
      "identificacion_concreta",
      "piezaProbable",
      "pieza_probable",
      "identificacion"
    );
    if (!identificacionConcreta) {
      const claves = Object.keys(parsed).join(", ").slice(0, 200);
      return {
        interpretacion: null,
        diag: {
          codigo: `${prefijo}_json_sin_pieza`,
          mensaje: claves ? `Claves recibidas: ${claves}` : undefined,
        },
      };
    }
    const codigosYReferencias = strCampo(
      parsed,
      "codigosYReferencias",
      "codigos_y_referencias",
      "referenciasDetectadas",
      "referencias_detectadas"
    );
    const funcion = strCampo(parsed, "funcion", "paraQueSirve", "para_que_sirve");
    const compatibilidadComun = strCampo(
      parsed,
      "compatibilidadComun",
      "compatibilidad_comun",
      "aplicacionVehiculos",
      "aplicacion_vehiculos"
    );
    const sintomasFallaTipicos = strCampo(
      parsed,
      "sintomasFallaTipicos",
      "sintomas_falla_tipicos"
    );
    const contextoAdicional = strCampo(parsed, "contextoAdicional", "contexto_adicional");
    const nivelRaw = strCampo(parsed, "nivelConfianza", "nivel_confianza");
    const notaUsuario = strCampo(parsed, "notaUsuario", "nota_usuario");

    return {
      interpretacion: {
        identificacionConcreta,
        codigosYReferencias,
        funcion,
        compatibilidadComun,
        sintomasFallaTipicos,
        contextoAdicional,
        nivelConfianza: nivelRaw || "medio",
        notaUsuario,
      },
    };
  } catch {
    const recuperado = recuperarInterpretacionDesdeJsonRoto(raw);
    if (recuperado) {
      const porLimite = opts?.finishReason === "MAX_TOKENS";
      const aviso = porLimite
        ? "La respuesta del modelo se cortó por límite de salida; revisá la foto y completá detalles en el taller."
        : "JSON incompleto del modelo; se recuperó el texto legible disponible. Verificá P/N y datos en la foto.";
      const nota = [aviso, recuperado.notaUsuario].filter(Boolean).join(" ");
      return {
        interpretacion: {
          ...recuperado,
          notaUsuario: nota,
        },
        diag: {
          codigo: `${prefijo}_json_recuperado_parcial`,
          mensaje: "Se usó recuperación parcial del informe.",
        },
      };
    }
    return {
      interpretacion: null,
      diag: {
        codigo: `${prefijo}_json_invalido`,
        mensaje: String(raw).slice(0, 280),
      },
    };
  }
}

/**
 * Google AI Gemini multimodal (AI Studio). Clave: GEMINI_API_KEY.
 * El alias `gemini-1.5-flash` a veces responde 404; el default es 2.0 Flash y hay fallbacks.
 */
const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash";
const GEMINI_MODEL_FALLBACKS = ["gemini-2.5-flash", "gemini-1.5-flash-002"];

function geminiModelosAProbar(): string[] {
  const env = Deno.env.get("GEMINI_VISION_MODEL")?.trim() ?? "";
  const primero = env || GEMINI_DEFAULT_MODEL;
  const cola = [GEMINI_DEFAULT_MODEL, ...GEMINI_MODEL_FALLBACKS].filter((m) => m !== primero);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of [primero, ...cola]) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

async function interpretacionGeminiFlash(
  geminiKey: string,
  verticalHumana: string,
  imageBase64Jpeg: string,
  labels: { description: string; score: number }[],
  textoOcr: string | null,
  webEntities: string[],
  marcaReferencia: string,
  modeloReferencia: string
): Promise<{ interpretacion: InterpretacionUsuario | null; diag?: InterpretacionDiag }> {
  try {
    const textoInstrucciones = construirTextoInstruccionesInterpretacion(
      verticalHumana,
      labels,
      textoOcr,
      webEntities,
      marcaReferencia,
      modeloReferencia
    );
    const textoUsuario = `${SYSTEM_PROMPT_INTERPRET}\n\n${textoInstrucciones}`;

    const body = JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: textoUsuario },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64Jpeg,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    const modelos = geminiModelosAProbar();
    let ultimoDiag: InterpretacionDiag | undefined;

    for (let i = 0; i < modelos.length; i++) {
      const modelId = modelos[i];
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(geminiKey)}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      const bodyText = await res.text();

      if (!res.ok) {
        let apiMsg = "";
        try {
          const j = JSON.parse(bodyText) as { error?: { message?: string } };
          apiMsg = String(j.error?.message ?? "").slice(0, 280);
        } catch {
          apiMsg = bodyText.slice(0, 200);
        }
        console.error("[gemini interpret]", modelId, res.status, bodyText.slice(0, 500));
        ultimoDiag = { codigo: `gemini_http_${res.status}`, mensaje: apiMsg || undefined };
        if (res.status === 404 && i < modelos.length - 1) {
          console.warn(`[gemini interpret] modelo ${modelId} no disponible; probando siguiente…`);
          continue;
        }
        return { interpretacion: null, diag: ultimoDiag };
      }

      let data: {
        candidates?: Array<{
          finishReason?: string;
          content?: { parts?: Array<{ text?: string }> };
        }>;
        error?: { message?: string };
      };
      try {
        data = JSON.parse(bodyText) as typeof data;
      } catch {
        console.error("[gemini interpret] cuerpo no JSON", bodyText.slice(0, 300));
        return {
          interpretacion: null,
          diag: { codigo: "gemini_respuesta_no_json", mensaje: bodyText.slice(0, 200) },
        };
      }

      if (data.error?.message) {
        return {
          interpretacion: null,
          diag: { codigo: "gemini_api_error", mensaje: data.error.message.slice(0, 400) },
        };
      }

      const partes = data.candidates?.[0]?.content?.parts ?? [];
      const raw = partes.map((p) => p.text ?? "").join("").trim();
      const finish = data.candidates?.[0]?.finishReason ?? "";

      if (!raw && (finish === "SAFETY" || finish === "BLOCKLIST")) {
        return {
          interpretacion: null,
          diag: { codigo: "gemini_rechazo_politica", mensaje: `finishReason: ${finish}` },
        };
      }
      if (!raw) {
        return { interpretacion: null, diag: { codigo: "gemini_sin_contenido", mensaje: finish || undefined } };
      }

      return interpretarJsonInformeDesdeTextoModelo(raw, "gemini", { finishReason: finish });
    }

    return { interpretacion: null, diag: ultimoDiag };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[gemini interpret] excepción:", msg);
    return {
      interpretacion: null,
      diag: { codigo: "gemini_excepcion", mensaje: msg.slice(0, 400) },
    };
  }
}

/**
 * Usa OpenAI con la IMAGEN (además de OCR/etiquetas) para informes concretos tipo catálogo/taller.
 */
async function interpretacionEnEspanol(
  openaiKey: string,
  verticalHumana: string,
  imageBase64Jpeg: string,
  labels: { description: string; score: number }[],
  textoOcr: string | null,
  webEntities: string[],
  marcaReferencia: string,
  modeloReferencia: string
): Promise<{ interpretacion: InterpretacionUsuario | null; diag?: InterpretacionDiag }> {
  try {
    return interpretacionEnEspanolCore(
      openaiKey,
      verticalHumana,
      imageBase64Jpeg,
      labels,
      textoOcr,
      webEntities,
      marcaReferencia,
      modeloReferencia
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[openai interpret] excepción:", msg);
    return {
      interpretacion: null,
      diag: {
        codigo: "openai_excepcion",
        mensaje: msg.slice(0, 400),
      },
    };
  }
}

async function interpretacionEnEspanolCore(
  openaiKey: string,
  verticalHumana: string,
  imageBase64Jpeg: string,
  labels: { description: string; score: number }[],
  textoOcr: string | null,
  webEntities: string[],
  marcaReferencia: string,
  modeloReferencia: string
): Promise<{ interpretacion: InterpretacionUsuario | null; diag?: InterpretacionDiag }> {
  const modelo = Deno.env.get("OPENAI_VISION_INTERPRET_MODEL")?.trim() ?? "gpt-4o-mini";
  const textoInstrucciones = construirTextoInstruccionesInterpretacion(
    verticalHumana,
    labels,
    textoOcr,
    webEntities,
    marcaReferencia,
    modeloReferencia
  );

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: modelo,
      response_format: { type: "json_object" },
      temperature: 0.25,
      max_tokens: 3200,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT_INTERPRET,
        },
        {
          role: "user",
          content: [
            { type: "text", text: textoInstrucciones },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64Jpeg}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  });

  const bodyText = await res.text();

  if (!res.ok) {
    let apiMsg = "";
    try {
      const j = JSON.parse(bodyText) as { error?: { message?: string } };
      apiMsg = String(j.error?.message ?? "").slice(0, 280);
    } catch {
      apiMsg = bodyText.slice(0, 200);
    }
    console.error("[openai interpret]", res.status, bodyText.slice(0, 400));
    return {
      interpretacion: null,
      diag: { codigo: `openai_http_${res.status}`, mensaje: apiMsg || undefined },
    };
  }

  let data: { choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }> };
  try {
    data = JSON.parse(bodyText) as typeof data;
  } catch {
    console.error("[openai interpret] cuerpo no JSON", bodyText.slice(0, 300));
    return {
      interpretacion: null,
      diag: { codigo: "openai_respuesta_no_json", mensaje: bodyText.slice(0, 200) },
    };
  }

  const choice0 = data.choices?.[0]?.message;
  const raw = choice0?.content ?? "";
  const refusal = choice0?.refusal?.trim();
  if (!String(raw).trim() && refusal) {
    return {
      interpretacion: null,
      diag: { codigo: "openai_rechazo_modelo", mensaje: refusal.slice(0, 400) },
    };
  }
  if (!String(raw).trim()) {
    return { interpretacion: null, diag: { codigo: "openai_sin_contenido" } };
  }

  return interpretarJsonInformeDesdeTextoModelo(raw, "openai");
}

function visionMensajeRecuperable(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    (m.includes("process") && m.includes("feature")) ||
    m.includes("failed to process") ||
    m.includes("internal server") ||
    m.includes("internal error") ||
    m.includes("unavailable") ||
    m.includes("deadline") ||
    m.includes("try again")
  );
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type VisionRespuestaJson = {
  responses?: Array<{
    labelAnnotations?: Array<{ description?: string; score?: number }>;
    textAnnotations?: Array<{ description?: string }>;
    webDetection?: {
      webEntities?: Array<{ description?: string; score?: number }>;
    };
    error?: { message?: string };
  }>;
};

async function visionAnnotar(
  visionUrl: string,
  imageBase64: string,
  incluirWebDetection: boolean
): Promise<{ ok: true; json: VisionRespuestaJson } | { ok: false; status: number; cuerpo: string }> {
  const features: Array<{ type: string; maxResults?: number }> = [
    { type: "LABEL_DETECTION", maxResults: 18 },
    { type: "TEXT_DETECTION" },
  ];
  if (incluirWebDetection) {
    features.push({ type: "WEB_DETECTION", maxResults: 10 });
  }
  const res = await fetch(visionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ image: { content: imageBase64 }, features }],
    }),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, cuerpo: await res.text() };
  }
  return { ok: true, json: (await res.json()) as VisionRespuestaJson };
}

/** Reintentos y sin WEB_DETECTION si Vision devuelve fallo interno intermitente. */
async function obtenerResultadoVision(
  apiKeyTrim: string,
  imageBase64: string
): Promise<
  | { ok: true; visionJson: VisionRespuestaJson; webOmitidoPorFallo: boolean }
  | { ok: false; errorUsuario: string }
> {
  const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKeyTrim)}`;

  let webOmitidoPorFallo = false;
  for (let intento = 0; intento < 2; intento++) {
    const r = await visionAnnotar(visionUrl, imageBase64, true);
    if (!r.ok) {
      console.error("[vision] http", r.status, r.cuerpo.slice(0, 400));
      if (intento === 0) {
        await delay(400);
        continue;
      }
      return {
        ok: false,
        errorUsuario:
          "No se pudo contactar a Google Vision. Revisa facturación y que GOOGLE_CLOUD_VISION_API_KEY sea válida.",
      };
    }
    const msg = r.json.responses?.[0]?.error?.message?.trim() ?? "";
    if (!msg) {
      return { ok: true, visionJson: r.json, webOmitidoPorFallo };
    }
    console.warn("[vision] error en respuesta:", msg.slice(0, 280));
    if (visionMensajeRecuperable(msg) && intento === 0) {
      await delay(450);
      continue;
    }
    if (visionMensajeRecuperable(msg)) {
      webOmitidoPorFallo = true;
      const r2 = await visionAnnotar(visionUrl, imageBase64, false);
      if (!r2.ok) {
        console.error("[vision] http sin web", r2.status, r2.cuerpo.slice(0, 400));
        return {
          ok: false,
          errorUsuario:
            "Google Vision no pudo procesar la imagen (fallo temporal). Vuelve a intentar en unos segundos o usa otra foto.",
        };
      }
      const msg2 = r2.json.responses?.[0]?.error?.message?.trim() ?? "";
      if (msg2) {
        return {
          ok: false,
          errorUsuario:
            "Google Vision rechazó el análisis de esta imagen. Prueba otra foto o reintenta más tarde." +
            (msg2.length < 120 ? ` (${msg2})` : ""),
        };
      }
      return { ok: true, visionJson: r2.json, webOmitidoPorFallo };
    }
    return { ok: false, errorUsuario: msg };
  }

  return {
    ok: false,
    errorUsuario:
      "Google Vision no respondió bien tras reintentos. Prueba de nuevo en un momento o cambia la foto.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY") ?? Deno.env.get("VISION_API_KEY");
    const apiKeyTrim = typeof apiKey === "string" ? apiKey.trim() : "";
    const body = await req.json();
    const imageBase64 = String(body?.imageBase64 ?? "").trim();
    const vertical = String(body?.vertical ?? "auto").trim().toLowerCase();
    const marcaRef = String(body?.marcaReferencia ?? body?.marca ?? "").trim();
    const modeloRef = String(body?.modeloReferencia ?? body?.modelo ?? "").trim();

    if (!imageBase64 || imageBase64.length < 80) {
      return new Response(JSON.stringify({ error: "Imagen vacía o demasiado pequeña." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (imageBase64.length > 7_000_000) {
      return new Response(JSON.stringify({ error: "Imagen demasiado grande. Comprime o elige otra foto." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!apiKeyTrim) {
      return new Response(
        JSON.stringify({
          error: null,
          configurado: false,
          mensaje:
            "Google Cloud Vision no está configurado. Añade GOOGLE_CLOUD_VISION_API_KEY en los secretos de la función.",
          labels: [],
          textoCompleto: null,
          terminosBusqueda: ["repuesto", "filtro", "freno"],
          interpretacion: null,
          interpretacionDiag: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const visionOutcome = await obtenerResultadoVision(apiKeyTrim, imageBase64);
    if (!visionOutcome.ok) {
      return new Response(JSON.stringify({ error: visionOutcome.errorUsuario }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const visionJson = visionOutcome.visionJson;
    if (visionOutcome.webOmitidoPorFallo) {
      console.warn("[vision] WEB_DETECTION omitido tras error recuperable de Vision");
    }

    const resp = visionJson.responses?.[0];
    const labels = (resp?.labelAnnotations ?? [])
      .filter((l) => l.description && typeof l.score === "number")
      .map((l) => ({ description: String(l.description), score: Number(l.score) }))
      .sort((a, b) => b.score - a.score);

    let textoCompleto: string | null = null;
    const ta = resp?.textAnnotations;
    if (ta?.length && ta[0]?.description) {
      textoCompleto = String(ta[0].description).slice(0, 4000);
    }

    const webCrudo = (resp?.webDetection?.webEntities ?? [])
      .filter((e) => e.description && (e.score ?? 0) > 0.42)
      .map((e) => String(e.description))
      .filter(Boolean);

    const webFiltrado = filtrarEntidadesWeb(webCrudo);

    const verticalHumana = vertical === "moto" ? "motocicleta" : "automóvil";
    let interpretacion: InterpretacionUsuario | null = null;
    let interpretacionDiag: InterpretacionDiag | null = null;

    /** Por defecto Gemini (análisis de la foto / informe). OpenAI solo si VISION_INTERPRET_PROVIDER=openai o como respaldo sin GEMINI_API_KEY. El mecánico virtual OBD usa otra función y no se modifica. */
    const proveedorInforme = (Deno.env.get("VISION_INTERPRET_PROVIDER") ?? "gemini").trim().toLowerCase();
    const haySenalesVision =
      labels.length > 0 || Boolean(textoCompleto?.trim()) || webFiltrado.length > 0;

    const openaiKeyFallback =
      Deno.env.get("OPENAI_API_KEY")?.trim() ??
      Deno.env.get("OPENAI_KEY")?.trim() ??
      "";

    if (proveedorInforme === "openai") {
      if (!openaiKeyFallback) {
        if (haySenalesVision) {
          interpretacionDiag = {
            codigo: "falta_OPENAI_API_KEY",
            mensaje:
              "VISION_INTERPRET_PROVIDER=openai pero no hay OPENAI_API_KEY (ni OPENAI_KEY) en Secrets.",
          };
        }
      } else {
        const r = await interpretacionEnEspanol(
          openaiKeyFallback,
          verticalHumana,
          imageBase64,
          labels,
          textoCompleto,
          webFiltrado,
          marcaRef,
          modeloRef
        );
        interpretacion = r.interpretacion;
        if (!interpretacion) {
          interpretacionDiag = r.diag ?? {
            codigo: "openai_sin_diagnostico",
            mensaje:
              "La llamada a OpenAI no devolvió informe ni código de error detallado. Revisa logs de identificar-repuesto-vision en Supabase.",
          };
        }
      }
    } else {
      const geminiKey = Deno.env.get("GEMINI_API_KEY")?.trim() ?? "";
      if (geminiKey) {
        const r = await interpretacionGeminiFlash(
          geminiKey,
          verticalHumana,
          imageBase64,
          labels,
          textoCompleto,
          webFiltrado,
          marcaRef,
          modeloRef
        );
        interpretacion = r.interpretacion;
        if (!interpretacion) {
          interpretacionDiag = r.diag ?? {
            codigo: "gemini_sin_diagnostico",
            mensaje:
              "Gemini no devolvió informe. Revisa logs de identificar-repuesto-vision, GEMINI_VISION_MODEL y cuota en Google AI.",
          };
        }
      } else if (openaiKeyFallback) {
        console.warn(
          "[identificar-repuesto-vision] GEMINI_API_KEY ausente; usando OpenAI como respaldo. Añadí GEMINI_API_KEY para el análisis con Gemini."
        );
        const r = await interpretacionEnEspanol(
          openaiKeyFallback,
          verticalHumana,
          imageBase64,
          labels,
          textoCompleto,
          webFiltrado,
          marcaRef,
          modeloRef
        );
        interpretacion = r.interpretacion;
        if (!interpretacion) {
          interpretacionDiag = r.diag ?? {
            codigo: "openai_sin_diagnostico",
            mensaje:
              "Respaldo OpenAI: no se obtuvo informe. Configura GEMINI_API_KEY para usar Gemini por defecto.",
          };
        }
      } else if (haySenalesVision) {
        interpretacionDiag = {
          codigo: "falta_GEMINI_API_KEY",
          mensaje:
            "El informe de la foto usa Gemini por defecto. Añadí GEMINI_API_KEY en Secrets (Google AI Studio). Opcional: OPENAI_API_KEY para respaldo automático, o VISION_INTERPRET_PROVIDER=openai para forzar solo OpenAI.",
        };
      }
    }

    const baseVision = fusionarTerminos(labels, textoCompleto ?? "", marcaRef, modeloRef);
    let terminosBusqueda = mezclarTerminosBusqueda(baseVision, interpretacion);
    terminosBusqueda = inyectarMarcaModeloBusqueda(marcaRef, modeloRef, terminosBusqueda);

    if (terminosBusqueda.length === 0 && labels.length > 0) {
      for (const l of labels) {
        if ((l.score ?? 0) < 0.35) continue;
        const c = comprimirMarcaMotorCorp(l.description);
        if (
          pasaFiltroRuidoBusqueda(c, "label") &&
          (!esEtiquetaSoloMarcaOemVision(c, "label") ||
            referenciaUsuarioCoincideMarcaModeloVision(marcaRef, modeloRef, c))
        ) {
          const t = normalizarTermino(c);
          if (t.length >= 2) {
            terminosBusqueda = [t];
            break;
          }
        }
      }
    }

    if (interpretacion === null && interpretacionDiag === null) {
      interpretacionDiag = {
        codigo: "informe_sin_explicacion",
        mensaje:
          "No se pudo generar el informe y el servidor no devolvió causa. Vuelve a ejecutar npm run supabase:deploy-vision y confirma que Secrets y VITE_SUPABASE_URL son del mismo proyecto.",
      };
    }

    return new Response(
      JSON.stringify({
        error: null,
        configurado: true,
        vertical: vertical === "moto" ? "moto" : "auto",
        labels,
        textoCompleto,
        webEntities: webFiltrado.slice(0, 8),
        terminosBusqueda,
        interpretacion,
        interpretacionDisponible: interpretacion !== null,
        interpretacionDiag,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Error interno al procesar la imagen." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
