import { Capacitor } from '@capacitor/core';
import { OAUTH_NATIVE_REDIRECT } from './authRedirect';

/** Dominios HTTPS que pueden abrir la app (App Links). */
const HOSTS_APP_LINK = new Set(['geomotorvzla.com', 'www.geomotorvzla.com']);

/**
 * Convierte una URL publica (https://geomotorvzla.com/...?tienda=) en path de React Router.
 * No aplica a OAuth nativo (com.geomotor.app://...).
 */
export function pathDesdeUrlAppLink(url: string): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  if (raw.startsWith(OAUTH_NATIVE_REDIRECT)) return null;

  try {
    const u = new URL(raw);
    const protocol = u.protocol.toLowerCase();
    if (protocol !== 'https:' && protocol !== 'http:') return null;
    if (!HOSTS_APP_LINK.has(u.hostname.toLowerCase())) return null;

    const pathName = u.pathname || '/';
    const search = u.search || '';
    const hash = u.hash || '';
    return `${pathName}${search}${hash}`;
  } catch {
    return null;
  }
}

export function esPlataformaNativaCapacitor(): boolean {
  return Capacitor.isNativePlatform();
}