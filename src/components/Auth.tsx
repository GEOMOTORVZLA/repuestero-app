import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Auth.css';

interface AuthProps {
  onVolver?: () => void;
  onIrARegistro?: () => void;
}

export function Auth({ onVolver, onIrARegistro }: AuthProps) {
  const { signIn, signUp } = useAuth();
  const [modo, setModo] = useState<'login' | 'registro'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [mensajeEsError, setMensajeEsError] = useState(false);
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje('');
    setMensajeEsError(false);
    setCargando(true);

    const { error } = modo === 'login'
      ? await signIn(email, password)
      : await signUp(email, password);

    if (error) {
      const msg = error.toLowerCase().includes('rate limit')
        ? 'Se enviaron demasiados correos en poco tiempo. Espera unos minutos e intenta de nuevo.'
        : error;
      setMensaje(msg);
      setMensajeEsError(true);
      setCargando(false);
      return;
    }

    if (modo === 'registro') {
      setMensaje('Cuenta creada. Revisa tu correo para confirmar, o inicia sesión si ya está activa.');
    }
    setCargando(false);
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
