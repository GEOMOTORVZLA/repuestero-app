import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { HistorialCompras } from './HistorialCompras';
import { PerfilComprador } from './PerfilComprador';
import './Dashboard.css';

type TabComprador = 'historial' | 'perfil';

interface DashboardCompradorProps {
  onVolverInicio?: () => void;
}

export function DashboardComprador({ onVolverInicio }: DashboardCompradorProps) {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<TabComprador>('historial');
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
          <button
            type="button"
            className={`dashboard-menu-item ${tab === 'historial' ? 'activo' : ''}`}
            onClick={() => setTab('historial')}
          >
            Historial
          </button>
          <button
            type="button"
            className={`dashboard-menu-item ${tab === 'perfil' ? 'activo' : ''}`}
            onClick={() => setTab('perfil')}
          >
            Mi perfil
          </button>
        </nav>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-header">
          <div className="dashboard-header-titulos">
            <h1 className="dashboard-titulo">Tu espacio en Geomotor</h1>
            <p className="dashboard-subtitulo">
              Historial de contactos con vendedores y datos de tu cuenta.
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
          {tab === 'historial' && (
            <section className="dashboard-seccion">
              <h2 className="dashboard-seccion-titulo">Historial</h2>
              <p className="dashboard-texto-placeholder" style={{ marginTop: 0, marginBottom: '1rem' }}>
                Tus últimas acciones de <strong>Contactar vendedor</strong> en productos (máximo 5).
              </p>
              <div className="dashboard-card">
                <HistorialCompras />
              </div>
            </section>
          )}

          {tab === 'perfil' && (
            <section className="dashboard-seccion">
              <h2 className="dashboard-seccion-titulo">Mi perfil</h2>
              <div className="dashboard-card">
                <PerfilComprador />
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
