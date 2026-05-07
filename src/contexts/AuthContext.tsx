import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
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
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Acceso con Google para cuentas ya registradas (no para darse de alta). */
  signInWithGoogle: () => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const OAUTH_NATIVE_REDIRECT = 'com.geomotorvzla.app://auth/callback';

function esAppNativa(): boolean {
  return Capacitor.isNativePlatform();
}

function extraerParametrosOAuthNativo(url: string): URLSearchParams {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  if (parsed.hash.startsWith('#')) {
    const hashParams = new URLSearchParams(parsed.hash.slice(1));
    hashParams.forEach((value, key) => params.set(key, value));
  }
  return params;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hayIntentoGooglePendiente = (): boolean => {
      try {
        return sessionStorage.getItem(INTENTO_LOGIN_KEY) === 'google';
      } catch {
        return false;
      }
    };

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
        if (raw && !hayIntentoGooglePendiente()) setUser(raw);
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
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setPasswordRecovery(false);
        return;
      }

      const raw = session?.user ?? null;
      if (!raw) {
        setUser(null);
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
        setUser(raw);
        return;
      }

      // En login por Google no mostramos sesión base hasta validar registro Geomotor.
      if (!hayIntentoGooglePendiente()) {
        setUser(raw);
      }

      // IMPORTANTE: no bloquear onAuthStateChange con await de consultas Supabase.
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        window.setTimeout(() => {
          void (async () => {
            try {
              const u = await incorporarUsuario(raw);
              if (!cancelled) setUser(u);
            } catch (e) {
              console.error('[Auth] onAuthStateChange fallo:', e);
              if (!cancelled) setUser(raw);
            }
          })();
        }, 0);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!esAppNativa()) return;

    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      if (!url.startsWith(OAUTH_NATIVE_REDIRECT)) return;
      void Browser.close().catch(() => undefined);
      const params = extraerParametrosOAuthNativo(url);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const errorDescription = params.get('error_description');

      if (errorDescription) {
        console.error('[Auth] Google OAuth Android:', errorDescription);
        return;
      }

      if (accessToken && refreshToken) {
        void supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }
    });

    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    marcarIntentoLoginPassword();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  };

  const resetPassword = async (email: string) => {
    const redirectTo = new URL(window.location.pathname, window.location.origin).href;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    return { error: error?.message ?? null };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setPasswordRecovery(false);
    return { error: error?.message ?? null };
  };

  const signInWithGoogle = async () => {
    try {
      marcarIntentoLoginGoogle();
      /* Misma URL actual (sin #) para volver del OAuth con la sesión activa */
      const redirectTo = esAppNativa()
        ? OAUTH_NATIVE_REDIRECT
        : new URL(window.location.pathname, window.location.origin).href;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: esAppNativa(),
        },
      });
      if (error) {
        try {
          sessionStorage.removeItem(INTENTO_LOGIN_KEY);
        } catch {
          /* ignore */
        }
        return { error: error.message };
      }
      if (esAppNativa() && data.url) {
        await Browser.open({ url: data.url, windowName: '_self' });
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

  const value: AuthContextType = {
    user,
    loading,
    passwordRecovery,
    signIn,
    signUp,
    signInWithGoogle,
    resetPassword,
    updatePassword,
    clearPasswordRecovery: () => setPasswordRecovery(false),
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
