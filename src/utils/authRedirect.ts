import { Capacitor } from '@capacitor/core';

/** Deep link OAuth y confirmación de correo en app nativa (Android/iOS). */
export const OAUTH_NATIVE_REDIRECT = 'com.geomotor.app://auth/callback';

/** URL a la que Supabase redirige tras confirmar correo o recuperar contraseña. */
export function authEmailRedirectTo(): string {
  if (Capacitor.isNativePlatform()) {
    return OAUTH_NATIVE_REDIRECT;
  }
  return new URL(window.location.pathname || '/', window.location.origin).href;
}

export function mensajeErrorCorreoAuth(error: string): string {
  const n = error.toLowerCase();
  if (n.includes('rate limit')) {
    return 'Se enviaron demasiados correos en poco tiempo. Espera unos minutos e intenta de nuevo.';
  }
  if (n.includes('error sending confirmation email') || n.includes('error sending email')) {
    return 'No pudimos enviar el correo de confirmación. Revisa la carpeta de spam o intenta más tarde. Si el problema contin�a, contacta a soporte.';
  }
  if (n.includes('email not confirmed')) { 
    return 'Debes confirmar tu correo antes de iniciar sesión. Revisa tu baneja de entrada (y spam) y abre el enlace que te nviamos.';
  }
  if (n.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos. Si no recuerdas tu contraseña, usa "Olvidi mi contraseña".';
  }
  return error;
}
