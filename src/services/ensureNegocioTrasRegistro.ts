import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { esUsuarioAdmin } from '../utils/cuentaTipo';

const ensureInflight = new Map<string, Promise<void>>();

type PerfilVendedorMeta = {
  nombre?: string;
  nombre_comercial?: string;
  rif?: string | null;
  estado?: string | null;
  ciudad?: string | null;
  telefono?: string | null;
  latitud?: number;
  longitud?: number;
  metodos_pago?: string[] | null;
  politica_divulgacion_aceptada?: boolean;
  politica_divulgacion_version?: string | null;
  politica_divulgacion_aceptada_en?: string | null;
};

type PerfilTallerMeta = {
  nombre?: string;
  nombre_comercial?: string;
  tipo_persona?: string;
  rif?: string | null;
  especialidad?: string[] | string | null;
  marca_vehiculo?: string | null;
  acerca_de?: string | null;
  estado?: string | null;
  ciudad?: string | null;
  telefono?: string | null;
  email?: string | null;
  latitud?: number;
  longitud?: number;
  metodos_pago?: string[] | null;
  politica_divulgacion_aceptada?: boolean;
  politica_divulgacion_version?: string | null;
  politica_divulgacion_aceptada_en?: string | null;
};

function especialidadTallerDesdeMeta(p: PerfilTallerMeta): string[] {
  const e = p.especialidad;
  if (Array.isArray(e)) return e.filter((x) => typeof x === 'string' && x.trim());
  if (typeof e === 'string' && e.trim()) return [e];
  return [];
}

export async function ensureNegocioDesdeMetadataUsuario(user: User): Promise<void> {
  const prev = ensureInflight.get(user.id);
  if (prev) return prev;
  const job = runEnsureNegocio(user).finally(() => {
    ensureInflight.delete(user.id);
  });
  ensureInflight.set(user.id, job);
  return job;
}

async function runEnsureNegocio(user: User): Promise<void> {
  const md = (user.user_metadata ?? {}) as Record<string, unknown>;
  const tipo = md.tipo_cuenta;

  try {
    if (tipo === 'vendedor') {
      const perfil = md.perfil_vendedor as PerfilVendedorMeta | undefined;
      if (!perfil || typeof perfil !== 'object') return;

      const { data: existente } = await supabase
        .from('tiendas')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existente) return;

      const nombre =
        (perfil.nombre && String(perfil.nombre).trim()) ||
        (perfil.nombre_comercial && String(perfil.nombre_comercial).trim()) ||
        'Mi tienda';
      const nombreComercial =
        (perfil.nombre_comercial && String(perfil.nombre_comercial).trim()) ||
        (perfil.nombre && String(perfil.nombre).trim()) ||
        'Mi tienda';

      const { error } = await supabase.from('tiendas').insert({
        user_id: user.id,
        nombre,
        nombre_comercial: nombreComercial,
        rif: perfil.rif ?? null,
        estado: perfil.estado ?? null,
        ciudad: perfil.ciudad ?? null,
        telefono: perfil.telefono ?? null,
        latitud: typeof perfil.latitud === 'number' ? perfil.latitud : 0,
        longitud: typeof perfil.longitud === 'number' ? perfil.longitud : 0,
        metodos_pago: perfil.metodos_pago?.length ? perfil.metodos_pago : null,
        politica_divulgacion_aceptada: perfil.politica_divulgacion_aceptada === true,
        politica_divulgacion_version:
          typeof perfil.politica_divulgacion_version === 'string'
            ? perfil.politica_divulgacion_version
            : null,
        politica_divulgacion_aceptada_en:
          typeof perfil.politica_divulgacion_aceptada_en === 'string'
            ? perfil.politica_divulgacion_aceptada_en
            : null,
      });
      if (error) console.error('[ensureNegocioTrasRegistro] tiendas:', error.message);
      return;
    }

    if (tipo === 'taller') {
      const perfil = md.perfil_taller as PerfilTallerMeta | undefined;
      if (!perfil || typeof perfil !== 'object') return;

      const { data: existente } = await supabase
        .from('talleres')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existente) return;

      const esp = especialidadTallerDesdeMeta(perfil);
      if (esp.length === 0) {
        console.warn('[ensureNegocioTrasRegistro] taller sin especialidad en metadata');
        return;
      }

      const nombre =
        (perfil.nombre && String(perfil.nombre).trim()) ||
        (perfil.nombre_comercial && String(perfil.nombre_comercial).trim()) ||
        'Mi taller';
      const nombreComercial =
        (perfil.nombre_comercial && String(perfil.nombre_comercial).trim()) ||
        (perfil.nombre && String(perfil.nombre).trim()) ||
        'Mi taller';

      const { error } = await supabase.from('talleres').insert({
        user_id: user.id,
        nombre,
        nombre_comercial: nombreComercial,
        tipo_persona: perfil.tipo_persona === 'juridico' ? 'juridico' : 'natural',
        rif: perfil.rif ?? null,
        especialidad: esp,
        marca_vehiculo: perfil.marca_vehiculo ?? null,
        acerca_de: perfil.acerca_de ?? null,
        estado: perfil.estado ?? null,
        ciudad: perfil.ciudad ?? null,
        telefono: perfil.telefono ?? null,
        email: perfil.email ?? user.email ?? null,
        latitud: typeof perfil.latitud === 'number' ? perfil.latitud : 0,
        longitud: typeof perfil.longitud === 'number' ? perfil.longitud : 0,
        metodos_pago: perfil.metodos_pago?.length ? perfil.metodos_pago : null,
        politica_divulgacion_aceptada: perfil.politica_divulgacion_aceptada === true,
        politica_divulgacion_version:
          typeof perfil.politica_divulgacion_version === 'string'
            ? perfil.politica_divulgacion_version
            : null,
        politica_divulgacion_aceptada_en:
          typeof perfil.politica_divulgacion_aceptada_en === 'string'
            ? perfil.politica_divulgacion_aceptada_en
            : null,
      });
      if (error) console.error('[ensureNegocioTrasRegistro] talleres:', error.message);
    }
  } catch (e) {
    console.error('[ensureNegocioTrasRegistro]', e);
  }
}

const AUTH_FLASH_KEY = 'geomotor-auth-flash';

/** Solo lectura en login con Google (AuthContext marca antes del redirect OAuth). */
export const INTENTO_LOGIN_KEY = 'geomotor-intento-login';

export function marcarIntentoLoginGoogle(): void {
  try {
    sessionStorage.setItem(INTENTO_LOGIN_KEY, 'google');
  } catch {
    /* ignore */
  }
}

export function marcarIntentoLoginPassword(): void {
  try {
    sessionStorage.setItem(INTENTO_LOGIN_KEY, 'password');
  } catch {
    /* ignore */
  }
}

export function leerYConsumirMensajeAuthFlash(): string | null {
  try {
    const v = sessionStorage.getItem(AUTH_FLASH_KEY);
    if (v) sessionStorage.removeItem(AUTH_FLASH_KEY);
    return v;
  } catch {
    return null;
  }
}

function perfilCompradorRelleno(md: Record<string, unknown>): boolean {
  const pc = md.perfil_comprador;
  if (!pc || typeof pc !== 'object') return false;
  const o = pc as Record<string, unknown>;
  return Boolean(
    (o.nombre && String(o.nombre).trim()) ||
      (o.nombre_comercial && String(o.nombre_comercial).trim()) ||
      (o.telefono && String(o.telefono).trim()) ||
      (o.rif && String(o.rif).trim())
  );
}

function filaNegocioAprobada(
  filas: { aprobacion_estado?: string | null; bloqueado?: boolean | null }[] | null
): boolean {
  return (filas ?? []).some(
    (r) => (r.aprobacion_estado ?? '') === 'aprobado' && r.bloqueado !== true
  );
}

/**
 * Google solo si ya hay registro Geomotor y vendedor/taller están aprobados en BD.
 * Comprador: perfil del formulario en metadata y cuenta no suspendida (panel admin).
 */
async function usuarioPuedeEntrarConGoogle(user: User): Promise<boolean> {
  if (esUsuarioAdmin(user)) return true;

  const app = (user.app_metadata ?? {}) as Record<string, unknown>;
  if (app.suspendido_membresia === true) return false;

  const md = (user.user_metadata ?? {}) as Record<string, unknown>;

  const [tRes, lRes] = await Promise.all([
    supabase.from('tiendas').select('aprobacion_estado, bloqueado').eq('user_id', user.id),
    supabase.from('talleres').select('aprobacion_estado, bloqueado').eq('user_id', user.id),
  ]);

  if (filaNegocioAprobada(tRes.data as { aprobacion_estado?: string | null; bloqueado?: boolean | null }[]))
    return true;
  if (filaNegocioAprobada(lRes.data as { aprobacion_estado?: string | null; bloqueado?: boolean | null }[]))
    return true;

  const tipo = md.tipo_cuenta;
  if ((tipo === 'comprador' || tipo === 'usuario') && perfilCompradorRelleno(md)) return true;

  return false;
}

/**
 * Solo si el usuario acaba de pulsar «Entrar con Google» (intento en sessionStorage).
 * Comprueba registro Geomotor + tienda/taller aprobados, o comprador con perfil y no suspendido.
 */
export async function rechazarGoogleSiNoHayRegistroGeomotor(user: User): Promise<boolean> {
  let esIntentoGoogle = false;
  try {
    const v = sessionStorage.getItem(INTENTO_LOGIN_KEY);
    if (v === 'google') {
      esIntentoGoogle = true;
      sessionStorage.removeItem(INTENTO_LOGIN_KEY);
    } else if (v === 'password') {
      sessionStorage.removeItem(INTENTO_LOGIN_KEY);
    }
  } catch {
    /* ignore */
  }
  if (!esIntentoGoogle) return false;

  const ids = user.identities ?? [];
  if (!ids.some((i) => i.provider === 'google')) return false;

  const permitido = await usuarioPuedeEntrarConGoogle(user);
  if (permitido) return false;

  await supabase.auth.signOut();
  try {
    sessionStorage.setItem(
      AUTH_FLASH_KEY,
      'Regístrate como vendedor, comprador o taller y espera la aprobación del administrador. Luego podrás usar Entrar con Google.'
    );
  } catch {
    /* ignore */
  }
  return true;
}