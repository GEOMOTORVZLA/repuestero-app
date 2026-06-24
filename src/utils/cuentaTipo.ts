import type { User } from '@supabase/supabase-js';

/** Panel de negocio: comprador, vendedor (tienda/productos) o taller (solo servicio). */
export type TipoPanelNegocio = 'comprador' | 'vendedor' | 'taller';

/**
 * @deprecated Usar TipoPanelNegocio. Se mantiene para compatibilidad en historial de contactos.
 */
export type TipoPanel = 'comprador' | 'vendedor_taller';

/**
 * Comprador: registro como usuario, o sin tipo explícito.
 * Vendedor/taller: metadata de registro o filas en tiendas/talleres (cuentas antiguas).
 */
export function getTipoPanelUsuario(user: User | null | undefined): TipoPanel {
  const negocio = getTipoPanelNegocio(user);
  if (negocio === 'comprador') return 'comprador';
  return 'vendedor_taller';
}

/** Tipo de panel según metadata y, si hace falta, filas en BD. */
export function getTipoPanelNegocio(user: User | null | undefined): TipoPanelNegocio {
  if (!user) return 'comprador';
  const md = (user.user_metadata ?? {}) as Record<string, unknown>;
  const raw = md.tipo_cuenta;
  if (raw === 'comprador' || raw === 'usuario') return 'comprador';
  if (raw === 'taller') return 'taller';
  if (raw === 'vendedor') return 'vendedor';
  if (md.perfil_vendedor) return 'vendedor';
  if (md.perfil_taller) return 'taller';
  return 'comprador';
}

export function esPanelComprador(user: User | null | undefined): boolean {
  return getTipoPanelNegocio(user) === 'comprador';
}

export function esCuentaTaller(user: User | null | undefined): boolean {
  return getTipoPanelNegocio(user) === 'taller';
}

export function esCuentaVendedor(user: User | null | undefined): boolean {
  return getTipoPanelNegocio(user) === 'vendedor';
}

export function esPanelNegocio(user: User | null | undefined): boolean {
  const t = getTipoPanelNegocio(user);
  return t === 'vendedor' || t === 'taller';
}

/**
 * Admin solo desde `app_metadata` (no editable por el cliente con updateUser).
 */
export function esUsuarioAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  const app = (user.app_metadata ?? {}) as Record<string, unknown>;
  const r = app.role;
  if (r === 'admin') return true;
  if (typeof r === 'string' && r.trim().toLowerCase() === 'admin') return true;
  return false;
}
