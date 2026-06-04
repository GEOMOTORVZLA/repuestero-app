import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { MARCAS_MODELOS } from '../data/marcasModelos';
import { MARCAS_MOTOS } from '../data/marcasMotos';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO, VERTICAL_MOTO } from '../utils/verticalVehiculo';
import { TarjetaProductoBusqueda, type ProductoTarjetaBusqueda } from './TarjetaProductoBusqueda';
import { mensajeWhatsappVendedorProducto, urlWhatsAppGeomotor } from '../utils/linkWhatsAppGeomotor';
import './MecanicoVirtualObd.css';

/** En móvil / app nativa, `capture` en el input file abre la cámara del dispositivo. */
function debeUsarCapturaCamaraEnInput(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return true;
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (nav.userAgentData?.mobile) return true;
  const ua = navigator.userAgent;
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (navigator.maxTouchPoints > 1 && navigator.platform === 'MacIntel') return true;
  return false;
}

interface IdentificarRepuestoVisionProps {
  vertical: VerticalVehiculo;
  /** Landing: +1 al abrir modal IA, -1 al cerrar */
  onIaModalCapaDelta?: (delta: number) => void;
}

interface ProductoVision extends ProductoTarjetaBusqueda {
  comentarios: string | null;
  categoria: string | null;
  tiendas: {
    nombre_comercial: string | null;
    nombre: string | null;
    rif: string | null;
    telefono: string | null;
    direccion: string | null;
    latitud: number | null;
    longitud: number | null;
    metodos_pago: string[] | null;
  } | null;
}

interface VisionLabel {
  description: string;
  score: number;
}

interface InterpretacionVision {
  identificacionConcreta: string;
  codigosYReferencias: string;
  funcion: string;
  compatibilidadComun: string;
  sintomasFallaTipicos: string;
  contextoAdicional: string;
  nivelConfianza: string;
  notaUsuario: string;
}

interface InterpretacionDiag {
  codigo: string;
  mensaje?: string;
}

interface RespuestaVision {
  error?: string | null;
  configurado?: boolean;
  mensaje?: string;
  labels?: VisionLabel[];
  textoCompleto?: string | null;
  webEntities?: string[];
  terminosBusqueda?: string[];
  interpretacion?: InterpretacionVision | null;
  interpretacionDisponible?: boolean;
  interpretacionDiag?: InterpretacionDiag | null;
}

function mensajeInterpretacionDiag(d: InterpretacionDiag | null | undefined): string {
  if (!d?.codigo) return '';
  const api = d.mensaje?.trim();
  switch (d.codigo) {
    case 'falta_OPENAI_API_KEY':
      return 'No está definido el secreto OPENAI_API_KEY para Edge Functions (nombre exacto). En Supabase → Edge Functions → Secrets, créalo con tu clave de OpenAI, guarda y vuelve a analizar. No hace falta redeploy; si sigue fallando, vuelve a desplegar la función.';
    case 'falta_GEMINI_API_KEY':
      return (
        api ||
        'Falta GEMINI_API_KEY en Secrets para el análisis con Gemini (identificar repuesto). Creá la clave en Google AI Studio y añadila en Supabase, o usa OPENAI_API_KEY como respaldo.'
      );
    case 'openai_http_401':
      return 'OpenAI rechazó la clave (401). Revisa que OPENAI_API_KEY sea la clave correcta de tu cuenta OpenAI y que no tenga espacios al pegarla.';
    case 'openai_http_402':
    case 'openai_http_429':
      return 'OpenAI devolvió límite de uso o saldo (402/429). Revisa facturación o límites en platform.openai.com.';
    case 'openai_rechazo_modelo':
      return (
        'El modelo no generó texto útil (rechazo o política de contenido).' +
        (api ? ` Detalle: ${api}` : '')
      );
    case 'openai_respuesta_no_json':
      return (
        'OpenAI devolvió una respuesta que no se pudo interpretar como JSON estándar.' +
        (api ? ` Detalle: ${api}` : ' Revisa logs de la función en Supabase.')
      );
    case 'openai_excepcion':
      return (
        'Error inesperado al llamar a OpenAI (red o parseo).' +
        (api ? ` Detalle: ${api}` : ' Revisa logs de identificar-repuesto-vision en Supabase.')
      );
    case 'openai_sin_diagnostico':
      return (
        api ||
        'La función no pudo obtener un informe ni un error detallado. Vuelve a desplegar identificar-repuesto-vision y revisa los logs en Supabase.'
      );
    case 'informe_sin_explicacion':
    case 'respuesta_sin_diagnostico':
      return (
        api ||
        'El servidor no envió el motivo del fallo. Redespliega la función identificar-repuesto-vision, confirma OPENAI_API_KEY en Secrets y que el .env apunte al mismo proyecto de Supabase.'
      );
    case 'openai_json_sin_pieza':
      return (
        'OpenAI devolvió JSON sin el texto de identificación principal (o con nombres de campo distintos).' +
        (api ? ` ${api}` : '') +
        ' Prueba modelo gpt-4o con OPENAI_VISION_INTERPRET_MODEL=gpt-4o.'
      );
    case 'openai_sin_contenido':
      return 'OpenAI respondió vacío (sin texto). Prueba otra foto o cambia OPENAI_VISION_INTERPRET_MODEL a gpt-4o.';
    case 'openai_json_invalido':
      return (
        'OpenAI devolvió texto que no es JSON válido.' +
        (api ? ` Fragmento: ${api}` : ' Prueba modelo gpt-4o o comprueba el log de la función.')
      );
    case 'gemini_sin_diagnostico':
      return (
        api ||
        'Gemini no devolvió informe. Revisa logs de la función, GEMINI_VISION_MODEL y cuotas en Google AI Studio.'
      );
    case 'gemini_sin_contenido':
      return api
        ? `Gemini respondió vacío o incompleto. ${api}`
        : 'Gemini respondió sin texto útil. Prueba otra foto o revisa GEMINI_VISION_MODEL.';
    case 'gemini_rechazo_politica':
      return (
        'Gemini bloqueó la respuesta por políticas de contenido.' + (api ? ` Detalle: ${api}` : '')
      );
    case 'gemini_respuesta_no_json':
      return (
        'La respuesta de Gemini no se pudo leer como JSON esperado.' +
        (api ? ` Detalle: ${api}` : ' Revisa logs en Supabase.')
      );
    case 'gemini_excepcion':
      return (
        'Error inesperado al llamar a Gemini.' +
        (api ? ` Detalle: ${api}` : ' Revisa logs de identificar-repuesto-vision.')
      );
    case 'gemini_json_invalido':
    case 'gemini_json_sin_pieza':
      return (
        (d.codigo === 'gemini_json_sin_pieza'
          ? 'Gemini devolvió JSON sin identificación principal.'
          : 'Gemini devolvió JSON inválido.') + (api ? ` ${api}` : '')
      );
    default:
      if (d.codigo.startsWith('openai_http_')) {
        return api
          ? `Error de OpenAI (${d.codigo.replace('openai_http_', '')}): ${api}`
          : `Error al llamar a OpenAI (${d.codigo}). Revisa logs de la función en Supabase.`;
      }
      if (d.codigo.startsWith('gemini_http_')) {
        return api
          ? `Error de Gemini API (${d.codigo.replace('gemini_http_', '')}): ${api}`
          : `Error al llamar a Gemini (${d.codigo}). Revisa clave GEMINI_API_KEY y cuotas.`;
      }
      return api ? `${d.codigo}: ${api}` : `No se generó resumen (${d.codigo}).`;
  }
}

const TERMINOS_GENERICOS_REPUESTO = new Set([
  'base',
  'carro',
  'componente',
  'componentes',
  'falla',
  'fallas',
  'motor',
  'parte',
  'partes',
  'principal',
  'repuesto',
  'repuestos',
  'sistema',
  'sistemas',
  'vehiculo',
  'vehicle',
  'auto',
  'car',
  'machine',
  'machinery',
  'science',
  'wheel',
  'lamp',
  'lamps',
  'light',
  'lights',
  'lighting',
  'fan',
  'fans',
  'centrifugal',
  'carbon',
  'fiber',
  'fibers',
  'fibre',
  'fibres',
  'exhaust',
  'automotive',
  'corporation',
  'company',
  'technology',
  'equipment',
  'material',
  'materials',
  'object',
  'objects',
  'vacuum',
  'vacuums',
  'used',
  'unused',
  'sale',
]);

function normalizarTerminoBusqueda(valor: string): string {
  return valor.replace(/[%_]/g, '').trim();
}

function comillasFiltroPostgrest(valor: string): string {
  if (/[",()]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

function patronIlikeTermino(termino: string): string {
  return comillasFiltroPostgrest(`%${normalizarTerminoBusqueda(termino)}%`);
}

function terminosDesdeVision(valores: string[]): string[] {
  const vistos = new Set<string>();
  return valores
    .flatMap((valor) => [valor, ...valor.split(/\s+/)])
    .map((valor) => normalizarTerminoBusqueda(valor))
    .filter((valor) => valor.length >= 2)
    .filter((valor) => {
      const clave = valor.toLocaleLowerCase();
      return valor.includes(' ') || !TERMINOS_GENERICOS_REPUESTO.has(clave);
    })
    .filter((valor) => {
      const clave = valor.toLocaleLowerCase();
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
}

function filtrosIlike(terminos: string[], campos: string[]): string {
  return terminos
    .flatMap((termino) => {
      const patron = patronIlikeTermino(termino);
      return campos.map((campo) => `${campo}.ilike.${patron}`);
    })
    .join(',');
}

/** Valor literal para `campo.eq.` dentro de un `.or()` de PostgREST. */
function valorEqPostgrestOr(valor: string): string {
  const v = valor.trim();
  if (!v) return '""';
  if (/^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ._-]+$/.test(v)) return v;
  return `"${v.replace(/"/g, '""')}"`;
}

/** Marca: columna o nombre del producto (donde suele ir el detalle). */
function filtroMarcaMarcaONombre(marca: string): string | null {
  const m = marca.trim();
  if (!m) return null;
  const patNombre = patronIlikeTermino(m);
  return `marca.eq.${valorEqPostgrestOr(m)},nombre.ilike.${patNombre}`;
}

/** Modelo: columna o nombre del producto. */
function filtroModeloModeloONombre(modelo: string): string | null {
  const m = modelo.trim();
  if (!m) return null;
  const pat = patronIlikeTermino(m);
  return `modelo.ilike.${pat},nombre.ilike.${pat}`;
}

function normalizarTextoCoincidencia(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function productoCoincideVision(producto: ProductoVision, terminos: string[]): boolean {
  const texto = normalizarTextoCoincidencia(
    [producto.nombre, producto.descripcion, producto.comentarios, producto.categoria].filter(Boolean).join(' ')
  );
  return terminos.some((termino) => {
    const limpio = normalizarTextoCoincidencia(termino);
    if (limpio.length < 2) return false;
    if (limpio.includes(' ')) return limpio.split(/\s+/).every((parte) => texto.includes(parte));
    return texto.includes(limpio);
  });
}

const MAX_ETIQUETA_PIEZA_VISIBLE = 96;
const MAX_FRAG_COMPAT_VISIBLE = 140;
const MAX_PALABRAS_SUGERENCIA_VISIBLE = 10;

/** Primeras n palabras (sin deduplicar), para fallback API u otros textos. */
function primerasNPalabras(text: string, n: number): string {
  const w = text.trim().split(/\s+/).filter(Boolean);
  return w.slice(0, n).join(' ');
}

/**
 * Marca/modelo primero; luego palabras de la pieza sin repetir (clave normalizada).
 * Máximo n palabras en total — copy de sugerencia en catálogo.
 */
function lineaBusquedaHastaNPalabras(pieza: string, mm: string, n: number): string {
  const mmTok = mm.trim().split(/\s+/).filter(Boolean);
  const piezaTok = pieza.trim().split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of [...mmTok, ...piezaTok]) {
    if (out.length >= n) break;
    const k = normalizarTextoCoincidencia(tok);
    if (!k || k.length < 1) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(tok);
  }
  return out.join(' ');
}

/** Quita colas típicas de listas cortadas o frases incompletas ("como:?", "incluyendo:"). */
function limpiarColaIncompleta(valor: string): string {
  let s = valor.trim().replace(/\s+/g, ' ');
  for (let i = 0; i < 4; i++) {
    const next = s
      .replace(/\s+como\??\s*:?\s*$/i, '')
      .replace(/\s+incluyendo\s*(?:el|los|las)?\s*:?\s*$/i, '')
      .replace(/\s+tales\s+como\s*:?\s*$/i, '')
      .replace(/[,:;\s…]+$/gu, '')
      .trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function recortarPorPalabra(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  const slice = t.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > maxLen * 0.45 ? slice.slice(0, lastSpace) : slice;
  return cut.trim();
}

/**
 * Nombre corto para línea de búsqueda / términos: primera idea útil, sin párrafo técnico largo.
 */
function resumirIdentificacionConcretaParaBusqueda(raw: string): string {
  let t = raw.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  const inicioProsaExplicativa =
    /\.\s+(?:Esta|Este|Estos|Estas|Los|Las|L[oa]s\s+n[uú]meros|El\s|La\s|Con\s|Adem[aá]s|Asimismo|Seg[uú]n|Por\s+ejemplo|Se\s+trata|Esta\s+pieza)\b/i;
  const mExp = inicioProsaExplicativa.exec(t);
  if (mExp && mExp.index >= 12) {
    t = t.slice(0, mExp.index).trim();
  } else {
    const partes = t.split(/\.\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/);
    if (partes.length > 1 && partes[0].length >= 12) {
      t = partes[0].trim();
    }
  }
  t = limpiarColaIncompleta(t.replace(/\.$/, '').trim());
  if (t.length > MAX_ETIQUETA_PIEZA_VISIBLE) {
    t = `${recortarPorPalabra(t, MAX_ETIQUETA_PIEZA_VISIBLE - 1)}…`;
  }
  return t;
}

function capFragmentoCompat(frag: string): string {
  const L = limpiarColaIncompleta(frag.trim().replace(/\s+/g, ' '));
  if (!L) return L;
  if (L.length <= MAX_FRAG_COMPAT_VISIBLE) return L;
  return `${recortarPorPalabra(L, MAX_FRAG_COMPAT_VISIBLE - 1)}…`;
}

function oracionesCompatBloque(bloque: string): string[] {
  const b = bloque.trim();
  if (!b) return [];
  const ors = b.split(/\.\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/).map((s) => s.trim()).filter(Boolean);
  return ors.length ? ors : [b];
}

/** Fragmento de compatibilidad que menciona el modelo del usuario (o primer bloque legible si no hay modelo). */
function filtrarCompatibilidadPorModelo(compat: string, modeloUsuario: string): string | null {
  const t = compat.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  const modeloNorm = normalizarTextoCoincidencia(modeloUsuario.trim());
  const bloques = t.split(/\n|;(?=\s)/).map((s) => s.trim()).filter(Boolean);
  const candidatosBloque = bloques.length ? bloques : [t];

  if (!modeloNorm || modeloNorm.length < 2) {
    const primera = candidatosBloque[0];
    const ors = oracionesCompatBloque(primera);
    const base = ors[0].length > 200 && ors.length > 1 ? ors[0] : primera.length > 220 ? ors[0] : primera;
    return capFragmentoCompat(base);
  }

  for (const bloque of candidatosBloque) {
    if (!normalizarTextoCoincidencia(bloque).includes(modeloNorm)) continue;
    for (const or of oracionesCompatBloque(bloque)) {
      if (normalizarTextoCoincidencia(or).includes(modeloNorm)) return capFragmentoCompat(or);
    }
    return capFragmentoCompat(bloque);
  }

  const primerToken = modeloUsuario.trim().split(/\s+/)[0];
  if (primerToken && primerToken.length >= 3) {
    const tokNorm = normalizarTextoCoincidencia(primerToken);
    for (const bloque of candidatosBloque) {
      if (!normalizarTextoCoincidencia(bloque).includes(tokNorm)) continue;
      for (const or of oracionesCompatBloque(bloque)) {
        if (normalizarTextoCoincidencia(or).includes(tokNorm)) return capFragmentoCompat(or);
      }
      return capFragmentoCompat(bloque);
    }
  }

  return null;
}

/**
 * Texto visible para el usuario: máx. 10 palabras (marca/modelo + pieza resumida, sin párrafo de compatibilidad).
 */
function construirLineaBusquedaGeomotorVisible(
  interpretacion: InterpretacionVision | null | undefined,
  marca: string,
  modelo: string
): string | null {
  const piezaCruda = interpretacion?.identificacionConcreta?.trim();
  if (!piezaCruda) return null;
  const pieza =
    resumirIdentificacionConcretaParaBusqueda(piezaCruda) ||
    recortarPorPalabra(limpiarColaIncompleta(piezaCruda), MAX_ETIQUETA_PIEZA_VISIBLE);
  if (!pieza) return null;
  const mm = [marca, modelo].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const linea = lineaBusquedaHastaNPalabras(pieza, mm, MAX_PALABRAS_SUGERENCIA_VISIBLE).trim();
  return linea || null;
}

/** Términos ILIKE solo de pieza / referencias — sin marca ni modelo sueltos (eso va en columnas). */
function terminosBusquedaCatalogoDesdeInforme(
  interpretacion: InterpretacionVision | null | undefined,
  marca: string,
  modelo: string,
  fallbackApi: string[]
): string[] {
  const marcaTrim = marca.trim();
  const modeloTrim = modelo.trim();
  const marcaNorm = marcaTrim ? normalizarTextoCoincidencia(marcaTrim) : '';
  const modeloNorm = modeloTrim ? normalizarTextoCoincidencia(modeloTrim) : '';

  const candidatos: string[] = [];
  const piezaCruda = interpretacion?.identificacionConcreta?.trim();
  if (piezaCruda) {
    const pieza =
      resumirIdentificacionConcretaParaBusqueda(piezaCruda) ||
      recortarPorPalabra(limpiarColaIncompleta(piezaCruda), MAX_ETIQUETA_PIEZA_VISIBLE);
    const compat = interpretacion?.compatibilidadComun?.trim();
    const compatFiltrada = compat ? filtrarCompatibilidadPorModelo(compat, modelo) : null;
    const refCodigos = interpretacion?.codigosYReferencias?.trim();
    if (pieza && modeloTrim) candidatos.push(`${pieza} ${modeloTrim}`);
    if (pieza) candidatos.push(pieza);
    const entreParent = piezaCruda.match(/\(([A-Za-z0-9.\-/]{2,12})\)/g);
    if (entreParent) {
      for (const p of entreParent.slice(0, 3)) {
        const inner = p.slice(1, -1);
        if (inner.length >= 2) candidatos.push(inner);
      }
    }
    const palabras = pieza.split(/\s+/).filter((w) => w.length > 2);
    if (palabras.length >= 2) candidatos.push(palabras.slice(0, 3).join(' '));
    if (palabras.length >= 4) candidatos.push(palabras.slice(0, 5).join(' '));
    if (refCodigos) {
      const refCorta = refCodigos.length > 80 ? recortarPorPalabra(refCodigos, 77) + '…' : refCodigos;
      candidatos.push(refCorta);
    }
    if (compatFiltrada) {
      candidatos.push(compatFiltrada);
      const codigos = compatFiltrada.match(/[A-Za-z0-9]{1,8}-[A-Za-z0-9]{1,8}/g);
      if (codigos) candidatos.push(...codigos.slice(0, 4));
    } else if (compat && modelo && normalizarTextoCoincidencia(compat).includes(normalizarTextoCoincidencia(modelo))) {
      const trozo = oracionesCompatBloque(compat.split(/\n|;(?=\s)/)[0] ?? compat)[0] ?? compat;
      candidatos.push(capFragmentoCompat(trozo));
    }
    if (refCodigos) {
      const codigosRef = refCodigos.match(/[A-Za-z0-9]{1,10}-[A-Za-z0-9]{1,10}/g);
      if (codigosRef) candidatos.push(...codigosRef.slice(0, 4));
    }
  }

  const fromInforme = terminosDesdeVision(candidatos).filter((t) => {
    const k = normalizarTextoCoincidencia(t);
    if (marcaNorm && k === marcaNorm) return false;
    if (modeloNorm && k === modeloNorm) return false;
    return true;
  });

  if (fromInforme.length > 0) return fromInforme.slice(0, 12);

  const fb = terminosDesdeVision(fallbackApi).filter((t) => {
    const k = normalizarTextoCoincidencia(t);
    if (marcaNorm && k === marcaNorm) return false;
    if (modeloNorm && k === modeloNorm) return false;
    return true;
  });
  return fb.slice(0, 14);
}

function canvasAJpegBase64(
  fuente: CanvasImageSource,
  anchoOrigen: number,
  altoOrigen: number,
  maxAncho: number
): string {
  const scale = Math.min(1, maxAncho / anchoOrigen);
  const w = Math.max(1, Math.round(anchoOrigen * scale));
  const h = Math.max(1, Math.round(altoOrigen * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar la imagen.');
  ctx.drawImage(fuente, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  const base64 = dataUrl.split(',')[1];
  if (!base64) throw new Error('No se pudo codificar la imagen.');
  return base64;
}

async function archivoABase64Jpeg(file: File, maxAncho: number): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    try {
      return canvasAJpegBase64(bitmap, bitmap.width, bitmap.height, maxAncho);
    } finally {
      bitmap.close();
    }
  } catch {
    return await new Promise<string>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          resolve(canvasAJpegBase64(img, img.naturalWidth, img.naturalHeight, maxAncho));
        } catch (e) {
          reject(e instanceof Error ? e : new Error('No se pudo procesar la imagen.'));
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(
          new Error(
            'No se pudo leer la imagen. Prueba JPG o PNG, o otra foto (en iPhone a veces conviene “Más compatible”).'
          )
        );
      };
      img.src = url;
    });
  }
}

function mensajeErrorDesconocido(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return 'No se pudo analizar la imagen.';
}

export function IdentificarRepuestoVision({ vertical, onIaModalCapaDelta }: IdentificarRepuestoVisionProps) {
  const esMoto = vertical === VERTICAL_MOTO;
  const navigate = useNavigate();
  const usarCapturaCamara = debeUsarCapturaCamaraEnInput();
  const { user } = useAuth();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null);
  const [archivoNombre, setArchivoNombre] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [archivoPendiente, setArchivoPendiente] = useState<File | null>(null);
  const [marcaVehiculo, setMarcaVehiculo] = useState('');
  const [modeloVehiculo, setModeloVehiculo] = useState('');
  const [cargandoVision, setCargandoVision] = useState(false);
  const [errorVision, setErrorVision] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespuestaVision | null>(null);
  const [productos, setProductos] = useState<ProductoVision[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(false);
  const [errorProductos, setErrorProductos] = useState<string | null>(null);
  const [productoExpandidoId, setProductoExpandidoId] = useState<string | null>(null);
  const [mostrarBusqueda, setMostrarBusqueda] = useState(false);

  const inputCamaraRef = useRef<HTMLInputElement>(null);
  const inputSubirRef = useRef<HTMLInputElement>(null);

  const marcasAuto = useMemo(() => Object.keys(MARCAS_MODELOS).sort(), []);
  const rutaInicioLanding = esMoto ? '/motos' : '/';
  const modelosAuto = useMemo(
    () => (marcaVehiculo ? MARCAS_MODELOS[marcaVehiculo] ?? [] : []),
    [marcaVehiculo]
  );

  const lineaBusquedaGeomotor = useMemo(
    () => construirLineaBusquedaGeomotorVisible(resultado?.interpretacion ?? null, marcaVehiculo, modeloVehiculo),
    [resultado, marcaVehiculo, modeloVehiculo]
  );

  const puedeBuscarEnGeomotor =
    Boolean(lineaBusquedaGeomotor) ||
    Boolean(resultado?.terminosBusqueda && resultado.terminosBusqueda.length > 0);

  useEffect(() => {
    if (!onIaModalCapaDelta) return;
    if (!modalAbierto) return;
    onIaModalCapaDelta(1);
    return () => onIaModalCapaDelta(-1);
  }, [modalAbierto, onIaModalCapaDelta]);

  const abrirModal = () => {
    if (!user) {
      setAvisoLogin('Debes iniciar sesión o registrarte para usar la identificación por IA.');
      return;
    }
    setAvisoLogin(null);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
  };

  const volverAlInicio = () => {
    cerrarModal();
    navigate(rutaInicioLanding);
  };

  const resetear = () => {
    setArchivoNombre(null);
    setPreviewUrl(null);
    setArchivoPendiente(null);
    setResultado(null);
    setErrorVision(null);
    setProductos([]);
    setErrorProductos(null);
    setProductoExpandidoId(null);
    setMostrarBusqueda(false);
    if (inputCamaraRef.current) inputCamaraRef.current.value = '';
    if (inputSubirRef.current) inputSubirRef.current.value = '';
  };

  const onElegirArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = targetFile(e);
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setErrorVision('Elige un archivo de imagen (JPG, PNG, WEBP).');
      e.target.value = '';
      return;
    }
    if (f.size > 12 * 1024 * 1024) {
      setErrorVision('La imagen es demasiado grande (máx. ~12 MB).');
      e.target.value = '';
      return;
    }
    setErrorVision(null);
    setResultado(null);
    setArchivoPendiente(f);
    setArchivoNombre(f.name);
    const url = URL.createObjectURL(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    e.target.value = '';
  };

  const analizarImagen = async () => {
    if (!archivoPendiente) {
      setErrorVision('Selecciona una foto del repuesto o de la pieza.');
      return;
    }
    setCargandoVision(true);
    setErrorVision(null);
    setResultado(null);
    setMostrarBusqueda(false);
    setProductos([]);
    try {
      const b64 = await archivoABase64Jpeg(archivoPendiente, 1280);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setErrorVision('Tu sesión expiró o no es válida. Cierra sesión, vuelve a entrar e inténtalo de nuevo.');
        return;
      }

      const { data, error } = await supabase.functions.invoke<RespuestaVision>('identificar-repuesto-vision', {
        body: {
          imageBase64: b64,
          vertical: esMoto ? 'moto' : 'auto',
          marcaReferencia: marcaVehiculo.trim() || undefined,
          modeloReferencia: modeloVehiculo.trim() || undefined,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) throw error;

      const payload = data && typeof data === 'object' ? data : null;
      if (!payload) {
        setErrorVision('Respuesta vacía del servidor. Comprueba que el .env apunte al mismo proyecto de Supabase donde desplegaste la función.');
        return;
      }

      const sinInforme = !payload.interpretacion?.identificacionConcreta?.trim();
      const haySenales =
        (payload.labels?.length ?? 0) > 0 ||
        Boolean(payload.textoCompleto?.trim()) ||
        (payload.terminosBusqueda?.length ?? 0) > 0;
      const diag = payload.interpretacionDiag;
      const interpretacionDiagFinal =
        sinInforme && haySenales && (diag === undefined || diag === null)
          ? {
              codigo: 'respuesta_sin_diagnostico',
              mensaje:
                'La función respondió sin campo interpretacionDiag (suele ser versión antigua desplegada o otro proyecto). Ejecuta de nuevo npm run supabase:deploy-vision en esta carpeta y verifica que VITE_SUPABASE_URL sea el mismo proyecto donde están los Secrets.',
            }
          : diag;

      setResultado({ ...payload, interpretacionDiag: interpretacionDiagFinal ?? null });
      if (payload.error) setErrorVision(payload.error);
      if (payload.mensaje && payload.configurado === false) {
        setErrorVision(payload.mensaje);
      }

      const hayEtiquetas = (payload.labels?.length ?? 0) > 0;
      const hayTexto = Boolean(payload.textoCompleto?.trim());
      const hayTerminos = (payload.terminosBusqueda?.length ?? 0) > 0;
      const hayResumenEs = Boolean(payload.interpretacion?.identificacionConcreta?.trim());
      if (payload.configurado !== false && !payload.error && !hayEtiquetas && !hayTexto && !hayTerminos && !hayResumenEs) {
        setErrorVision(
          'No se obtuvieron datos útiles de la imagen. Prueba más luz, más cerca del repuesto o formato JPG/PNG.'
        );
      }
    } catch (err) {
      setErrorVision(mensajeErrorDesconocido(err));
    } finally {
      setCargandoVision(false);
    }
  };

  const buscarEnGeomotor = async () => {
    if (!puedeBuscarEnGeomotor) {
      setErrorProductos('No hay datos suficientes para buscar. Analiza la imagen o revisa el informe de la pieza.');
      return;
    }
    const terminosRepuesto = terminosBusquedaCatalogoDesdeInforme(
      resultado?.interpretacion ?? null,
      marcaVehiculo,
      modeloVehiculo,
      resultado?.terminosBusqueda ?? []
    );
    if (terminosRepuesto.length === 0) {
      setErrorProductos('Los resultados son muy genéricos. Indica marca y modelo o prueba otra foto más cercana al repuesto.');
      return;
    }

    setCargandoProductos(true);
    setErrorProductos(null);
    setProductoExpandidoId(null);
    try {
      let query = supabase
        .from('productos')
        .select(
          `
          id, nombre, descripcion, comentarios, categoria, marca, modelo, anio, moneda, precio_usd, imagen_url, imagenes_extra,
          tiendas ( nombre_comercial, nombre, rif, telefono, direccion, latitud, longitud, metodos_pago )
        `
        )
        .eq('activo', true)
        .eq('aprobacion_publica', 'aprobado')
        .eq('vertical', esMoto ? VERTICAL_MOTO : VERTICAL_AUTO);

      const marcaQ = marcaVehiculo.trim();
      const filtroMarca = filtroMarcaMarcaONombre(marcaQ);
      if (filtroMarca) query = query.or(filtroMarca);

      const modeloQ = modeloVehiculo.trim();
      const filtroModelo = filtroModeloModeloONombre(modeloQ);
      if (filtroModelo) query = query.or(filtroModelo);

      const filtrosPieza = filtrosIlike(terminosRepuesto, ['nombre', 'descripcion', 'comentarios', 'categoria']);
      if (filtrosPieza) query = query.or(filtrosPieza);

      const { data, error } = await query.order('nombre').limit(48);
      if (error) throw error;
      type TiendaRow = NonNullable<ProductoVision['tiendas']>;
      const filas = ((data ?? []) as unknown as ProductoVision[])
        .map((p) => {
          const ti = p.tiendas as TiendaRow | TiendaRow[] | null;
          return { ...p, tiendas: Array.isArray(ti) ? ti[0] ?? null : ti };
        })
        .filter((p) => productoCoincideVision(p, terminosRepuesto));
      setProductos(filas);
      setMostrarBusqueda(true);
    } catch (e) {
      setErrorProductos(e instanceof Error ? e.message : 'Error al buscar productos.');
    } finally {
      setCargandoProductos(false);
    }
  };

  const contactarProducto = (p: ProductoVision) => {
    const tel = p.tiendas?.telefono;
    if (!tel) return;
    const url = urlWhatsAppGeomotor(tel, mensajeWhatsappVendedorProducto(p.nombre));
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const imagenCard = esMoto ? '/mecanico moto.png' : '/identificar-repuesto-auto.png';

  return (
    <section
      className={`identificar-repuesto-vision mecanico-virtual ${esMoto ? 'identificar-repuesto-vision--moto' : ''}`}
      aria-labelledby="identificar-repuesto-vision-titulo"
    >
      {avisoLogin && <p className="mecanico-virtual-login-aviso">{avisoLogin}</p>}

      <div className="mecanico-virtual-card identificar-repuesto-vision-card">
        <button
          type="button"
          className="mecanico-virtual-resumen landing-ia-tarjeta-cerrada"
          onClick={abrirModal}
          aria-label="Abrir identificación de repuesto con IA"
        >
          <img
            src={encodeURI(imagenCard)}
            alt=""
            className="mecanico-virtual-imagen landing-ia-tarjeta-imagen"
            width={56}
            height={56}
            loading="lazy"
            decoding="async"
          />
          <div className="mecanico-virtual-resumen-texto landing-ia-tarjeta-texto-solo-titulo">
            <h2 id="identificar-repuesto-vision-titulo" className="landing-seccion-titulo">
              Identifica tu repuesto con nuestra IA
            </h2>
          </div>
        </button>
      </div>

      {modalAbierto && (
        <div
          className="mecanico-virtual-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="identificar-repuesto-vision-modal-titulo"
          onClick={cerrarModal}
        >
          <div
            className="mecanico-virtual-modal-panel identificar-repuesto-vision-modal-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mecanico-virtual-modal-header">
              <h3 id="identificar-repuesto-vision-modal-titulo">Identifica tu repuesto con IA</h3>
              <button type="button" className="identificar-repuesto-vision-modal-cerrar" onClick={cerrarModal}>
                Cerrar
              </button>
            </div>

            <div className="mecanico-virtual-modal-scroll">
              <div className="identificar-repuesto-vision-requisitos">
                <p className="identificar-repuesto-vision-requisitos-titulo">
                  Nuestra herramienta de identificación de partes requiere:
                </p>
                <ol className="identificar-repuesto-vision-requisitos-lista">
                  <li>Toma una foto con buena luz de la pieza.</li>
                  <li>Si tiene etiquetas o número de parte, trata de que sea visible en la foto.</li>
                  <li>Esto es una sugerencia que conviene que sea respaldada por la opinión de un experto.</li>
                </ol>
              </div>

              <div className="mecanico-virtual-controles identificar-repuesto-vision-controles">
                <div className="mecanico-virtual-vehiculo-grid">
                  {esMoto ? (
                    <>
                      <label className="mecanico-virtual-selector">
                        Marca de la moto (opcional; afina búsqueda e informe si la indicas)
                        <select
                          value={marcaVehiculo}
                          onChange={(e) => setMarcaVehiculo(e.target.value)}
                        >
                          <option value="">Cualquiera / no indicar</option>
                          {MARCAS_MOTOS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="mecanico-virtual-selector">
                        Modelo (opcional; se combina con la IA)
                        <input
                          type="text"
                          value={modeloVehiculo}
                          onChange={(e) => setModeloVehiculo(e.target.value.slice(0, 60))}
                          placeholder="Ej: Gixxer 150"
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="mecanico-virtual-selector">
                        Marca del vehículo (opcional; afina búsqueda e informe)
                        <select
                          value={marcaVehiculo}
                          onChange={(e) => {
                            setMarcaVehiculo(e.target.value);
                            setModeloVehiculo('');
                          }}
                        >
                          <option value="">Cualquiera / no indicar</option>
                          {marcasAuto.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="mecanico-virtual-selector">
                        Modelo (opcional; se combina con la IA)
                        <select
                          value={modeloVehiculo}
                          onChange={(e) => setModeloVehiculo(e.target.value)}
                          disabled={!marcaVehiculo}
                        >
                          <option value="">{marcaVehiculo ? 'Selecciona modelo' : 'Marca primero'}</option>
                          {modelosAuto.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                </div>

                <div className="identificar-repuesto-vision-foto-bloque">
                  <input
                    ref={inputCamaraRef}
                    type="file"
                    accept="image/*"
                    capture={usarCapturaCamara ? 'environment' : undefined}
                    className="identificar-repuesto-vision-input-oculto"
                    aria-label="Tomar foto con la cámara del dispositivo"
                    onChange={onElegirArchivo}
                  />
                  <input
                    ref={inputSubirRef}
                    type="file"
                    accept="image/*"
                    className="identificar-repuesto-vision-input-oculto"
                    aria-label="Subir imagen desde el dispositivo"
                    onChange={onElegirArchivo}
                  />
                  <div className="identificar-repuesto-vision-foto-acciones">
                    <button
                      type="button"
                      className="identificar-repuesto-vision-accion-foto"
                      onClick={() => {
                        const el = inputCamaraRef.current;
                        if (!el) return;
                        el.value = '';
                        el.click();
                      }}
                    >
                      Tomar foto
                    </button>
                    <button
                      type="button"
                      className="identificar-repuesto-vision-accion-foto"
                      onClick={() => inputSubirRef.current?.click()}
                    >
                      Subir imagen
                    </button>
                  </div>
                </div>

                {archivoNombre && (
                  <p className="identificar-repuesto-vision-archivo">{archivoNombre}</p>
                )}
                {previewUrl && (
                  <div className="identificar-repuesto-vision-preview">
                    <img src={previewUrl} alt="Vista previa" />
                  </div>
                )}

                <div className="identificar-repuesto-vision-acciones">
                  <button
                    type="button"
                    className="identificar-repuesto-vision-btn-accion identificar-repuesto-vision-btn-accion--primario"
                    onClick={() => void analizarImagen()}
                    disabled={cargandoVision || !archivoPendiente}
                    title={!archivoPendiente ? 'Primero elige una foto con Tomar foto o Subir imagen' : undefined}
                  >
                    {cargandoVision ? 'Analizando imagen y redactando resumen…' : 'Analizar con IA'}
                  </button>
                  <button
                    type="button"
                    className="identificar-repuesto-vision-btn-accion identificar-repuesto-vision-btn-accion--secundario"
                    onClick={resetear}
                  >
                    Nueva foto
                  </button>
                </div>
                {!archivoPendiente && !cargandoVision && (
                  <p className="identificar-repuesto-vision-ayuda-analizar">
                    Elige una foto arriba para habilitar el análisis.
                  </p>
                )}

                {errorVision && <p className="mecanico-virtual-aviso">{errorVision}</p>}

                {resultado &&
                  (resultado.interpretacion?.identificacionConcreta?.trim() ||
                    resultado.labels?.length ||
                    resultado.textoCompleto?.trim() ||
                    (resultado.terminosBusqueda?.length ?? 0) > 0) && (
                  <div className="mecanico-virtual-diagnostico identificar-repuesto-vision-resultado">
                    {resultado.interpretacion?.identificacionConcreta?.trim() && (
                      <div className="identificar-repuesto-vision-interpretacion">
                        <h4 className="identificar-repuesto-vision-interpretacion-titulo">
                          Informe de la pieza
                        </h4>
                        <div className="identificar-repuesto-vision-campo">
                          <span className="identificar-repuesto-vision-campo-label">Identificación</span>
                          <p className="identificar-repuesto-vision-campo-texto">
                            {resultado.interpretacion.identificacionConcreta}
                          </p>
                        </div>
                        {resultado.interpretacion.codigosYReferencias?.trim() && (
                          <div className="identificar-repuesto-vision-campo">
                            <span className="identificar-repuesto-vision-campo-label">
                              Códigos y referencias (foto / OCR)
                            </span>
                            <p className="identificar-repuesto-vision-campo-texto identificar-repuesto-vision-campo-texto--ref">
                              {resultado.interpretacion.codigosYReferencias}
                            </p>
                          </div>
                        )}
                        {resultado.interpretacion.funcion?.trim() && (
                          <div className="identificar-repuesto-vision-campo">
                            <span className="identificar-repuesto-vision-campo-label">Función</span>
                            <p className="identificar-repuesto-vision-campo-texto">
                              {resultado.interpretacion.funcion}
                            </p>
                          </div>
                        )}
                        {resultado.interpretacion.compatibilidadComun?.trim() && (
                          <div className="identificar-repuesto-vision-campo">
                            <span className="identificar-repuesto-vision-campo-label">
                              Compatibilidad habitual
                            </span>
                            <p className="identificar-repuesto-vision-campo-texto">
                              {resultado.interpretacion.compatibilidadComun}
                            </p>
                          </div>
                        )}
                        {resultado.interpretacion.sintomasFallaTipicos?.trim() && (
                          <div className="identificar-repuesto-vision-campo">
                            <span className="identificar-repuesto-vision-campo-label">
                              Síntomas típicos si falla
                            </span>
                            <p className="identificar-repuesto-vision-campo-texto">
                              {resultado.interpretacion.sintomasFallaTipicos}
                            </p>
                          </div>
                        )}
                        {resultado.interpretacion.contextoAdicional?.trim() && (
                          <div className="identificar-repuesto-vision-campo">
                            <span className="identificar-repuesto-vision-campo-label">Contexto</span>
                            <p className="identificar-repuesto-vision-campo-texto">
                              {resultado.interpretacion.contextoAdicional}
                            </p>
                          </div>
                        )}
                        <p className="identificar-repuesto-vision-confianza">
                          Nivel de confianza del análisis:{' '}
                          <strong>{resultado.interpretacion.nivelConfianza}</strong>
                        </p>
                        {resultado.interpretacion.notaUsuario?.trim() && (
                          <p className="identificar-repuesto-vision-nota">{resultado.interpretacion.notaUsuario}</p>
                        )}
                      </div>
                    )}

                    {!resultado.interpretacion?.identificacionConcreta?.trim() && (
                      <p className="identificar-repuesto-vision-sin-resumen">
                        {resultado.interpretacionDiag
                          ? mensajeInterpretacionDiag(resultado.interpretacionDiag)
                          : 'No se pudo generar el informe de la pieza (Gemini/OpenAI). Revisá GEMINI_API_KEY y OPENAI_API_KEY en Supabase → Edge Functions → Secrets del mismo proyecto que VITE_SUPABASE_URL, redesplegá identificar-repuesto-vision y probá de nuevo.'}
                      </p>
                    )}

                    {(resultado.labels?.length || resultado.textoCompleto?.trim()) && (
                      <details className="identificar-repuesto-vision-detalles-tecnico">
                        <summary>Detalle técnico del análisis (referencia)</summary>
                        {resultado.labels && resultado.labels.length > 0 && (
                          <>
                            <p className="identificar-repuesto-vision-detalles-nota">
                              Etiquetas automáticas (suelen venir en inglés):
                            </p>
                            <ul className="identificar-repuesto-vision-etiquetas">
                              {resultado.labels.slice(0, 12).map((l) => (
                                <li key={`${l.description}-${l.score}`}>
                                  <strong>{l.description}</strong>
                                  <span> {Math.round(l.score * 100)}%</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        {resultado.textoCompleto && resultado.textoCompleto.trim() && (
                          <div className="identificar-repuesto-vision-ocr">
                            <h4>Texto crudo detectado en la foto</h4>
                            <pre>{resultado.textoCompleto.slice(0, 1200)}</pre>
                          </div>
                        )}
                      </details>
                    )}

                    {(lineaBusquedaGeomotor ||
                      (resultado.terminosBusqueda && resultado.terminosBusqueda.length > 0)) && (
                      <div className="identificar-repuesto-vision-busqueda-bloque">
                        <p className="identificar-repuesto-vision-terminos">
                          <strong>Búsqueda orientada en Geomotor: </strong>
                          {lineaBusquedaGeomotor
                            ? lineaBusquedaGeomotor
                            : primerasNPalabras(resultado.terminosBusqueda!.join(' '), MAX_PALABRAS_SUGERENCIA_VISIBLE)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {resultado &&
                  (resultado.labels?.length ||
                    lineaBusquedaGeomotor ||
                    (resultado.terminosBusqueda?.length ?? 0) > 0 ||
                    resultado.textoCompleto?.trim() ||
                    resultado.interpretacion?.identificacionConcreta?.trim()) && (
                  <div className="mecanico-virtual-cta identificar-repuesto-vision-cta-geomotor">
                    <button
                      type="button"
                      className="identificar-repuesto-vision-btn-accion identificar-repuesto-vision-btn-accion--primario"
                      onClick={() => void buscarEnGeomotor()}
                      disabled={cargandoProductos || !puedeBuscarEnGeomotor}
                      title={
                        !puedeBuscarEnGeomotor
                          ? 'Necesitas el informe de la pieza o términos del análisis para buscar en el catálogo'
                          : undefined
                      }
                    >
                      {cargandoProductos ? 'Buscando en Geomotor…' : 'Sí, buscar repuesto en Geomotor'}
                    </button>
                  </div>
                )}

                {mostrarBusqueda && (
                  <div className="mecanico-virtual-resultados">
                    <h4>Repuestos relacionados en Geomotor</h4>
                    {errorProductos && <p className="mecanico-virtual-aviso">{errorProductos}</p>}
                    {!cargandoProductos && productos.length === 0 && !errorProductos && (
                      <p>
                        No encontramos coincidencias claras. Prueba otra foto más cercana o amplía marca/modelo y
                        vuelve a analizar.
                      </p>
                    )}
                    <div className="mecanico-virtual-resultados-grid">
                      {productos.map((p) => (
                        <TarjetaProductoBusqueda
                          key={p.id}
                          producto={p}
                          vertical={esMoto ? VERTICAL_MOTO : VERTICAL_AUTO}
                          expandida={productoExpandidoId === p.id}
                          onExpand={() => setProductoExpandidoId(p.id)}
                          onContraer={() => setProductoExpandidoId(null)}
                          onContactar={contactarProducto}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="mecanico-virtual-modal-pie">
              <button type="button" className="mecanico-virtual-modal-volver" onClick={volverAlInicio}>
                Volver
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function targetFile(e: React.ChangeEvent<HTMLInputElement>): File | null {
  const l = e.target.files;
  return l?.length ? l[0] ?? null : null;
}
