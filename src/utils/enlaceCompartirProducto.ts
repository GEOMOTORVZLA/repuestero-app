import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import type { VerticalVehiculo } from './verticalVehiculo';
import { rutaInicioVertical } from './verticalVehiculo';

export const PARAM_REPUESTO_COMPARTIDO = 'repuesto';

/** Sitio HTTPS que cualquiera puede abrir (WhatsApp, etc.). En APK el origin suele ser capacitor/localhost. */
const DOMINIO_PUBLICO_DEFECTO = 'https://geomotorvzla.com';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esIdProductoUuid(valor: string): boolean {
  return UUID_RE.test(valor.trim());
}

/**
 * Origen del WebView de Capacitor (p. ej. https://localhost) o capacitor:// — no sirve para enlaces en WhatsApp.
 * No confiar solo en isNativePlatform(): en algunos builds devuelve false y el origin sigue siendo localhost.
 */
function origenNoEsEnlacePublico(origin: string): boolean {
  try {
    const u = new URL(origin);
    const h = u.hostname.toLowerCase();
    const p = u.protocol.toLowerCase();
    if (p === 'capacitor:' || p === 'ionic:' || p === 'file:') return true;
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return true;
    return false;
  } catch {
    return true;
  }
}

/** Base URL para enlaces compartidos: env, o dominio oficial si la app corre empaquetada / en localhost. */
export function baseUrlSitioPublicoCompartir(): string {
  const desdeEnv = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim().replace(/\/$/, '');
  if (desdeEnv) return desdeEnv;
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  if (Capacitor.isNativePlatform() || origenNoEsEnlacePublico(origin)) {
    return DOMINIO_PUBLICO_DEFECTO;
  }
  return origin;
}

export function construirUrlProductoCompartido(productoId: string, vertical: VerticalVehiculo): string {
  const base = baseUrlSitioPublicoCompartir();
  const path = rutaInicioVertical(vertical);
  const q = new URLSearchParams({ [PARAM_REPUESTO_COMPARTIDO]: productoId.trim() });
  return `${base}${path}?${q.toString()}`;
}

export function mensajeWhatsappCompartirRepuesto(nombreProducto: string, url: string): string {
  const n = nombreProducto.trim() || 'este repuesto';
  return `Mira ${n} en Geomotor:\n${url}`;
}

export async function abrirWhatsappConTexto(texto: string): Promise<void> {
  const u = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  const pl = Capacitor.getPlatform();
  if (pl === 'android' || pl === 'ios') {
    await Browser.open({ url: u, windowName: '_system' });
    return;
  }
  window.open(u, '_blank', 'noopener,noreferrer');
}