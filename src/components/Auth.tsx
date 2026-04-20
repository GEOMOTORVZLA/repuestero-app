import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { permitirAccionCliente } from '../utils/rateLimitCliente';
import './Auth.css';

interface AuthProps {
  onVolver?: () => void;
  onIrARegistro?: () => void;
  /** Tras rechazar Google sin registro Geomotor (lo pone App al leer sessionStorage). */
  mensajeInicialError?: string | null;
}

export function Auth({ onVolver, onIrARegistro, mensajeInicialError }: AuthProps) {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [modo, setModo] = useState<'login' | 'registro'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [mensajeEsError, setMensajeEsError] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (mensajeInicialError) {
      setMensaje(mensajeInicialError);
      setMensajeEsError(true);
    }
  }, [mensajeInicialError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje('');
    setMensajeEsError(false);

    const rl = permitirAccionCliente(`auth:${modo}`, {
      maxIntentos: modo === 'login' ? 8 : 5,
      ventanaMs: 10 * 60 * 1000,
      bloqueoMs: 2 * 60 * 1000,
    });
    if (!rl.ok) {
      setMensaje(rl.mensaje);
      setMensajeEsError(true);
      return;
    }

    setCargando(true);

    try {
      const { error } = modo === 'login'
        ? await signIn(email, password)
        : await signUp(email, password);

      if (error) {
        const msg = error.toLowerCase().includes('rate limit')
          ? 'Se enviaron demasiados correos en poco tiempo. Espera unos minutos e intenta de nuevo.'
          : error;
        setMensaje(msg);
        setMensajeEsError(true);
        return;
      }

      if (modo === 'registro') {
        setMensaje('Cuenta creada. Revisa tu correo para confirmar, o inicia sesión si ya está activa.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo conectar. Revisa la red e intenta de nuevo.';
      setMensaje(msg);
      setMensajeEsError(true);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="auth-pagina">
      <main className="auth-main">
        <div className="auth-card">
          {onVolver && (
            <button type="button" className="auth-volver" onClick={onVolver}>
              ← Volver
            </button>
          )}
          <h2 className="auth-titulo">{modo === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
          {modo === 'login' && (
            <>
              <button
                type="button"
                className="auth-btn-google"
                disabled={cargando}
                onClick={async () => {
                  setMensaje('');
                  setMensajeEsError(false);
                  const rl = permitirAccionCliente('auth:google', {
                    maxIntentos: 5,
                    ventanaMs: 10 * 60 * 1000,
                    bloqueoMs: 2 * 60 * 1000,
                  });
                  if (!rl.ok) {
                    setMensaje(rl.mensaje);
                    setMensajeEsError(true);
                    return;
                  }
                  setCargando(true);
                  const { error } = await signInWithGoogle();
                  if (error) {
                    setMensaje(error);
                    setMensajeEsError(true);
                    setCargando(false);
                  }
                }}
              >
                <span className="auth-google-icon" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                </span>
                Iniciar sesión con Google
              </button>
              <p className="auth-o">o con correo y contraseña</p>
            </>
          )}
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-campo">
              <label htmlFor="auth-email">Correo electrónico</label>
              <input
                id="auth-email"
                type="email"
                placeholder="correo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={cargando}
              />
            </div>
            <div className="auth-campo">
              <label htmlFor="auth-password">Contraseña</label>
              <div className="auth-password-wrap">
                <input
                  id="auth-password"
                  type={mostrarPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={cargando}
                />
                <button
                  type="button"
                  className="auth-toggle-password"
                  onClick={() => setMostrarPassword((v) => !v)}
                  title={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {mostrarPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
            <button type="submit" className="auth-submit" disabled={cargando}>
              {cargando ? 'Espera...' : modo === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>
          <p className="auth-switch">
            {modo === 'login' ? (
              <>
                ¿No tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={() => {
                    if (onIrARegistro) {
                      onIrARegistro();
                    } else {
                      setModo('registro');
                    }
                  }}
                >
                  Regístrate
                </button>
              </>
            ) : (
              <>
                ¿Ya tienes cuenta?{' '}
                <button type="button" onClick={() => setModo('login')}>
                  Inicia sesión
                </button>
              </>
            )}
          </p>
          {mensaje && <p className={`auth-mensaje ${mensajeEsError ? 'error' : ''}`}>{mensaje}</p>}
        </div>
      </main>
    </div>
  );
}
