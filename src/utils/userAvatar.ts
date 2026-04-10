import type { User } from '@supabase/supabase-js';

/** URL de foto de perfil (p. ej. Google: picture / avatar_url en identities). */
export function getUserAvatarUrl(user: User): string | null {
  const m = user.user_metadata as Record<string, unknown> | undefined;
  if (m?.avatar_url && typeof m.avatar_url === 'string') return m.avatar_url;
  if (m?.picture && typeof m.picture === 'string') return m.picture;

  for (const id of user.identities ?? []) {
    const data = id.identity_data as Record<string, unknown> | undefined;
    if (!data) continue;
    if (typeof data.avatar_url === 'string') return data.avatar_url;
    if (typeof data.picture === 'string') return data.picture;
  }
  return null;
}

/** Iniciales para avatar por defecto cuando no hay foto (máximo 2 letras). */
export function getUserDisplayInitial(user: User): string {
  const m = user.user_metadata as Record<string, unknown> | undefined;
  const fromMeta = m?.full_name ?? m?.name ?? m?.email;
  const s = String(fromMeta || user.email || '').trim();
  if (!s) return 'US';

  const soloLetras = s.replace(/[_@.\-]+/g, ' ').trim();
  const partes = soloLetras
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .filter(Boolean);

  if (partes.length >= 2) return `${partes[0]}${partes[1]}`;
  if (partes.length === 1) {
    const dos = soloLetras.replace(/\s+/g, '').slice(0, 2).toUpperCase();
    return dos || 'US';
  }
  return 'US';
}
