import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { PerfilTaller } from './PerfilTaller';
import { bannerEstadoCuentaNegocio } from '../utils/estadoCuentaVendedorTaller';
import type { BannerEstadoCuenta } from '../utils/estadoCuentaVendedorTaller';
import { EstadoCuentaNegocioBanner } from './EstadoCuentaNegocioBanner';
import './Dashboard.css';

interface DashboardTallerProps {
  onVolverInicio?: () => void;
}

export function DashboardTaller({ onVolverInicio }: DashboardTallerProps) {
  const { user, signOut } = useAuth();
  const [bannerTaller, setBannerTaller] = useState<BannerEstadoCuenta | null>(null);
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [estadoPassword, setEstadoPassword] = useState<'idle' | 'guardando' | 'ok' | 'error'>('idle');
  const [mensajePassword, setMensajePassword] = useState('');

  useEffect(() => {
    if (!user) {
      setBannerTaller(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const md = (user.user_metadata ?? {}) as Record<string, unknown>;
      const esMetaTaller =
        md.tipo_cuenta === 'taller' || (md.perfil_taller != null && typeof md.perfil_taller === 'object');

      const { data: tallerRow } = await supabase
        .from('talleres')
        .select('bloqueado, aprobacion_estado, membresia_hasta')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      const tar = tallerRow as {
        bloqueado?: boolean | null;
        aprobacion_estado?: string | null;
        membresia_hasta?: string | null;
      } | null;

      if (tar) {
        setBannerTaller(
          bannerEstadoCuentaNegocio({
            bloqueado: tar.bloqueado,
            aprobacion_estado: tar.aprobacion_estado,
            membresia_hasta: tar.membresia_hasta != null ? String(tar.membresia_hasta).slice(0, 10) : null,
            sinFilaEnBd: false,
          }),
        );
      } else if (esMetaTaller) {
        setBannerTaller(
          bannerEstadoCuentaNegocio({
            bloqueado: false,
            aprobacion_estado: null,
            membresia_hasta: null,
            sinFilaEnBd: true,
          }),
        );
      } else {
        setBannerTaller(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const guardarPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensajePassword('');
    if (passwordNueva.length < 6) {
      setEstadoPassword('error');
      setMensajePassword('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (passwordNueva !== passwordConfirm) {
      setEstadoPassword('error');
      setMensajePassword('Las contraseñas no coinciden.');
      return;
    }
    setEstadoPassword('guardando');
    const { error } = await supabase.auth.updateUser({ password: passwordNueva });
    if (error) {
      setEstadoPassword('error');
      setMensajePassword(error.message || 'Error al actualizar la contraseña.');
      return;
    }
    setEstadoPassword('ok');
    setMensajePassword('Contraseña actualizada.');
    setPasswordNueva('');
    setPasswordConfirm('');
  };

  const email = user?.email ?? '';

  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        {email && (
          <div className="dashboard-sidebar-usuario">
            <span className="dashboard-sidebar-email">{email}</span>
          </div>
        )}
        <nav className="dashboard-menu">
          <button type="button" className="dashboard-menu-item activo">
            Datos del taller
          </button>
        </nav>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-header">
          <div className="dashboard-header-titulos">
            <h1 className="dashboard-titulo">Panel de taller</h1>
            <p className="dashboard-subtitulo">
              Consulta y actualiza la información de tu taller registrada en Geomotor.
            </p>
          </div>
          <div className="dashboard-usuario">
            {onVolverInicio && (
              <button type="button" className="dashboard-btn-inicio" onClick={onVolverInicio}>
                Volver al inicio
              </button>
            )}
            <button type="button" className="dashboard-btn-salir" onClick={signOut}>
              Cerrar sesión
            </button>
          </div>
        </header>

        <main className="dashboard-contenido">
          {bannerTaller && (
            <div className="dashboard-cuenta-banners" role="region" aria-label="Estado de tu cuenta">
              <EstadoCuentaNegocioBanner etiqueta="Taller" banner={bannerTaller} />
            </div>
          )}

          <section className="dashboard-seccion">
            <h2 className="dashboard-seccion-titulo">Datos del taller</h2>
            <div className="dashboard-card">
              <PerfilTaller />
            </div>
          </section>

          <section className="dashboard-seccion">
            <h2 className="dashboard-seccion-titulo">Seguridad de la cuenta</h2>
            <div className="dashboard-card">
              <form onSubmit={guardarPassword} className="perfil-usuario-form">
                <div className="perfil-usuario-grid">
                  <div className="perfil-usuario-campo">
                    <label htmlFor="taller-password-nueva">Nueva contraseña</label>
                    <input
                      id="taller-password-nueva"
                      type="password"
                      value={passwordNueva}
                      onChange={(e) => setPasswordNueva(e.target.value)}
                      disabled={estadoPassword === 'guardando'}
                    />
                  </div>
                  <div className="perfil-usuario-campo">
                    <label htmlFor="taller-password-confirm">Confirmar contraseña</label>
                    <input
                      id="taller-password-confirm"
                      type="password"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      disabled={estadoPassword === 'guardando'}
                    />
                  </div>
                </div>
                {mensajePassword && (
                  <p
                    className={`perfil-usuario-mensaje ${
                      estadoPassword === 'error' ? 'error' : estadoPassword === 'ok' ? 'ok' : ''
                    }`}
                  >
                    {mensajePassword}
                  </p>
                )}
                <button
                  type="submit"
                  className="perfil-usuario-boton-secundario"
                  disabled={estadoPassword === 'guardando'}
                >
                  {estadoPassword === 'guardando' ? 'Actualizando...' : 'Actualizar contraseña'}
                </button>
              </form>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
