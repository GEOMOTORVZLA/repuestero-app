import type { User } from '@supabase/supabase-js';

export type TipoPanel = 'comprador' | 'vendedor_taller';

/**
 * Comprador: registro como usuario, o sin tipo explícito (p. ej. solo Google/correo).
 * Vendedor/taller: metadata de registro o cuentas antiguas con perfil de tienda/taller.
 */
export function getTipoPanelUsuario(user: User | null | undefined): TipoPanel {
  if (!user) return 'comprador';
  const md = (user.user_metadata ?? {}) as Record<string, unknown>;
  const raw = md.tipo_cuenta;
  if (raw === 'comprador' || raw === 'usuario') return 'comprador';
  if (raw === 'vendedor' || raw === 'taller') return 'vendedor_taller';
  if (md.perfil_vendedor) return 'vendedor_taller';
  if (md.perfil_taller) return 'vendedor_taller';
  return 'comprador';
}

export function esPanelComprador(user: User | null | undefined): boolean {
  return getTipoPanelUsuario(user) === 'comprador';
}

/**
 * Admin solo desde `app_metadata` (no editable por el cliente con updateUser).
 * Nunca confiar en `user_metadata.role`: un atacante podría asignarse admin.
 */
export function esUsuarioAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  const app = (user.app_metadata ?? {}) as Record<string, unknown>;
  const r = app.role;
  if (r === 'admin') return true;
  if (typeof r === 'string' && r.trim().toLowerCase() === 'admin') return true;
  return false;
}
