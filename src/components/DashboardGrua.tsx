import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { PerfilGrua } from './PerfilGrua';
import { bannerEstadoCuentaNegocio } from '../utils/estadoCuentaVendedorTaller';
import type { BannerEstadoCuenta } from '../utils/estadoCuentaVendedorTaller';
import { EstadoCuentaNegocioBanner } from './EstadoCuentaNegocioBanner';
import './Dashboard.css';

type TabGrua = 'datos' | 'seguridad';

interface DashboardGruaProps {
  onVolverInicio?: () => void;
}

export function DashboardGrua({ onVolverInicio }: DashboardGruaProps) {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<TabGrua>('datos');
  const [bannerGrua, setBannerGrua] = useState<BannerEstadoCuenta | null>(null);
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [estadoPassword, setEstadoPassword] = useState<'idle' | 'guardando' | 'ok' | 'error'>('idle');
  const [mensajePassword, setMensajePassword] = useState('');

  useEffect(() => {
    if (!user) {
      setBannerGrua(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const md = (user.user_metadata ?? {}) as Record<string, unknown>;
      const esMetaGrua =
        md.tipo_cuenta === 'grua' || (md.perfil_grua != null && typeof md.perfil_grua === 'object');

      const { data: gruaRow } = await supabase
        .from('gruas')
        .select('bloqueado, aprobacion_estado, membresia_hasta')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      const fila = gruaRow as {
        bloqueado?: boolean | null;
        aprobacion_estado?: string | null;
        membresia_hasta?: string | null;
      } | null;

      if (fila) {
        setBannerGrua(
          bannerEstadoCuentaNegocio({
            bloqueado: fila.bloqueado,
            aprobacion_estado: fila.aprobacion_estado,
            membresia_hasta: fila.membresia_hasta != null ? String(fila.membresia_hasta).slice(0, 10) : null,
            sinFilaEnBd: false,
          })
        );
      } else if (esMetaGrua) {
        setBannerGrua(
          bannerEstadoCuentaNegocio({
            bloqueado: false,
            aprobacion_estado: null,
            membresia_hasta: null,
            sinFilaEnBd: true,
          })
        );
      } else {
        setBannerGrua(null);
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
    <div className="dashboard dashboard-taller dashboard-panel-movil">
      <aside className="dashboard-sidebar">
        {email && (
          <div className="dashboard-sidebar-usuario">
            <span className="dashboard-sidebar-email">{email}</span>
          </div>
        )}
        <nav className="dashboard-menu">
          <button
            type="button"
            className={`dashboard-menu-item ${tab === 'datos' ? 'activo' : ''}`}
            onClick={() => setTab('datos')}
          >
            Datos de la grúa
          </button>
          <button
            type="button"
            className={`dashboard-menu-item ${tab === 'seguridad' ? 'activo' : ''}`}
            onClick={() => setTab('seguridad')}
          >
            Seguridad
          </button>
        </nav>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-header">
          <div className="dashboard-header-titulos">
            <h1 className="dashboard-titulo">Panel de grúa</h1>
            <p className="dashboard-subtitulo">
              Consulta y actualiza los datos de tu servicio de emergencia en Geomotor.
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
          {bannerGrua && (
            <div className="dashboard-cuenta-banners" role="region" aria-label="Estado de tu cuenta">
              <EstadoCuentaNegocioBanner etiqueta="Grúa" banner={bannerGrua} />
            </div>
          )}

          {tab === 'datos' && (
            <section className="dashboard-seccion">
              <h2 className="dashboard-seccion-titulo">Datos de la grúa</h2>
              <div className="dashboard-card">
                <PerfilGrua />
              </div>
            </section>
          )}

          {tab === 'seguridad' && (
            <section className="dashboard-seccion">
              <h2 className="dashboard-seccion-titulo">Seguridad de la cuenta</h2>
              <div className="dashboard-card">
                <form onSubmit={guardarPassword} className="perfil-usuario-form">
                  <div className="perfil-usuario-grid">
                    <div className="perfil-usuario-campo">
                      <label htmlFor="grua-password-nueva">Nueva contraseña</label>
                      <input
                        id="grua-password-nueva"
                        type="password"
                        value={passwordNueva}
                        onChange={(e) => setPasswordNueva(e.target.value)}
                        disabled={estadoPassword === 'guardando'}
                      />
                    </div>
                    <div className="perfil-usuario-campo">
                      <label htmlFor="grua-password-confirm">Confirmar contraseña</label>
                      <input
                        id="grua-password-confirm"
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
          )}
        </main>
      </div>

      <nav className="dashboard-nav-movil" aria-label="Navegación del panel">
        <button
          type="button"
          className={`dashboard-nav-movil-item ${tab === 'datos' ? 'activo' : ''}`}
          onClick={() => setTab('datos')}
        >
          Mi grúa
        </button>
        <button
          type="button"
          className={`dashboard-nav-movil-item ${tab === 'seguridad' ? 'activo' : ''}`}
          onClick={() => setTab('seguridad')}
        >
          Seguridad
        </button>
      </nav>
    </div>
  );
}
