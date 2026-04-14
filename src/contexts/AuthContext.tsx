import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import {
  ensureNegocioDesdeMetadataUsuario,
  INTENTO_LOGIN_KEY,
  marcarIntentoLoginGoogle,
  marcarIntentoLoginPassword,
  rechazarGoogleSiNoHayRegistroGeomotor,
} from '../services/ensureNegocioTrasRegistro';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Acceso con Google para cuentas ya registradas (no para darse de alta). */
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const NETWORK_TIMEOUT_MS = 12000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs = NETWORK_TIMEOUT_MS): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error('Tiempo de espera agotado al conectar con Supabase. Intenta de nuevo.'));
      }, timeoutMs);
    }),
  ]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const incorporarUsuario = async (u: User): Promise<User | null> => {
      await ensureNegocioDesdeMetadataUsuario(u);
      const rechazado = await rechazarGoogleSiNoHayRegistroGeomotor(u);
      return rechazado ? null : u;
    };

    const aplicarSesion = async (session: { user: User } | null) => {
      const raw = session?.user ?? null;
      if (!raw) {
        if (!cancelled) setUser(null);
        return;
      }
      const u = await incorporarUsuario(raw);
      if (!cancelled) setUser(u);
    };

    /**
     * Antes: setLoading(false) iba en .finally() después de aplicarSesion (ensureNegocio + Supabase).
     * Si la red bloqueaba o Supabase tardaba, loading nunca terminaba → pantalla "Cargando..." infinita (Chrome).
     * Ahora: quitamos el bloqueo en cuanto getSession responde y refinamos usuario en segundo plano.
     */
    let sessionRespondio = false;
    const watchdogMs = 12000;
    const watchdog = window.setTimeout(() => {
      if (!cancelled && !sessionRespondio) {
        setLoading(false);
      }
    }, watchdogMs);

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (cancelled) return;
        sessionRespondio = true;
        window.clearTimeout(watchdog);
        const raw = session?.user ?? null;
        if (raw) setUser(raw);
        else setUser(null);
        setLoading(false);
        try {
          await aplicarSesion(session);
        } catch (e) {
          console.error('[Auth] Error al sincronizar sesión con el negocio:', e);
        }
      })
      .catch(() => {
        if (!cancelled) {
          sessionRespondio = true;
          window.clearTimeout(watchdog);
          setUser(null);
          setLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (event === 'SIGNED_OUT') {
          if (!cancelled) setUser(null);
          return;
        }
        if (session?.user) {
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            // Si falla la sincronización extra (red/RLS), mantener sesión base para no "congelar" login.
            const u = await incorporarUsuario(session.user);
            if (!cancelled) setUser(u ?? session.user);
          } else if (!cancelled) {
            setUser(session.user);
          }
        } else if (!cancelled) {
          setUser(null);
        }
      } catch (e) {
        console.error('[Auth] onAuthStateChange fallo:', e);
        if (!cancelled) {
          setUser(session?.user ?? null);
        }
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    marcarIntentoLoginPassword();
    const { error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }));
    if (error) {
      try {
        sessionStorage.removeItem(INTENTO_LOGIN_KEY);
      } catch {
        /* ignore */
      }
    }
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await withTimeout(supabase.auth.signUp({ email, password }));
    return { error: error?.message ?? null };
  };

  const signInWithGoogle = async () => {
    try {
      marcarIntentoLoginGoogle();
      /* Misma URL actual (sin #) para volver del OAuth con la sesión activa */
      const redirectTo = new URL(window.location.pathname, window.location.origin).href;
      const { error } = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
          },
        })
      );
      if (error) {
        try {
          sessionStorage.removeItem(INTENTO_LOGIN_KEY);
        } catch {
          /* ignore */
        }
        return { error: error.message };
      }
      /* El navegador redirige; no hay error local */
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error al conectar con Google' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value: AuthContextType = { user, loading, signIn, signUp, signInWithGoogle, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
