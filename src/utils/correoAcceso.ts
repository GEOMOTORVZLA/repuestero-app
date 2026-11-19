/** Acceso inventado para negocios creados por el administrador. No recibe correo. */
export const DOMINIO_ACCESO_INTERNO = 'acceso.geomotor';

export function esCorreoAccesoInterno(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase().endsWith(`@${DOMINIO_ACCESO_INTERNO}`);
}

export function usuarioAccesoDesdeNombre(nombre: string): string {
  const slug = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'negocio';
}

export function correoAccesoInterno(local: string): string {
  return `${local.trim().toLowerCase()}@${DOMINIO_ACCESO_INTERNO}`;
}

export async function mensajeErrorFuncion(
  error: unknown,
  data: { error?: string } | null | undefined
): Promise<string> {
  if (data?.error) return data.error;
  const contexto =
    error && typeof error === 'object' && 'context' in error
      ? (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
      : undefined;
  if (contexto?.json) {
    try {
      const cuerpo = await contexto.json();
      if (cuerpo?.error) return cuerpo.error;
    } catch {
      /* el cuerpo no vino en JSON */
    }
  }
  const msg =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: string }).message ?? '')
      : '';
  if (/failed to send|non-2xx|not found|404/i.test(msg)) {
    return 'La función todavía no está publicada en Supabase.';
  }
  return msg || 'No se pudo completar la acción.';
}
