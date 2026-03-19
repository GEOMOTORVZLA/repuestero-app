import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RegistroRepuestos } from './RegistroRepuestos';
import { MisProductos } from './MisProductos';
import { PerfilUsuario } from './PerfilUsuario';
import { ImportarProductosCSV } from './ImportarProductosCSV';
import './Dashboard.css';

type TabId = 'resumen' | 'productos' | 'estadisticas' | 'perfil';

export function Dashboard() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<TabId>('resumen');
  const [mostrarNuevoProducto, setMostrarNuevoProducto] = useState(false);
  const [mostrarImportarCSV, setMostrarImportarCSV] = useState(false);
  const [refreshProductos, setRefreshProductos] = useState(0);

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
            className={`dashboard-menu-item ${tab === 'resumen' ? 'activo' : ''}`}
            onClick={() => setTab('resumen')}
          >
            Inicio
          </button>
          <button
            type="button"
            className={`dashboard-menu-item ${tab === 'productos' ? 'activo' : ''}`}
            onClick={() => setTab('productos')}
          >
            Mis productos
          </button>
          <button
            type="button"
            className={`dashboard-menu-item ${tab === 'estadisticas' ? 'activo' : ''}`}
            onClick={() => setTab('estadisticas')}
          >
            Estadísticas
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
            <h1 className="dashboard-titulo">Panel de control</h1>
            <p className="dashboard-subtitulo">
              Gestiona tus repuestos, tu tienda y revisa métricas de contactos.
            </p>
          </div>
          <div className="dashboard-usuario">
            <button type="button" className="dashboard-btn-salir" onClick={signOut}>
              Cerrar sesión
            </button>
          </div>
        </header>

        <main className="dashboard-contenido">
          {tab === 'resumen' && (
            <section className="dashboard-seccion">
              <h2 className="dashboard-seccion-titulo">Resumen</h2>
              <div className="dashboard-kpi-grid">
                <div className="dashboard-kpi-card">
                  <p className="dashboard-kpi-label">Productos publicados</p>
                  <p className="dashboard-kpi-valor">—</p>
                  <p className="dashboard-kpi-hint">Aquí veremos el total de repuestos que tienes activos.</p>
                </div>
                <div className="dashboard-kpi-card">
                  <p className="dashboard-kpi-label">Contactos recientes</p>
                  <p className="dashboard-kpi-valor">—</p>
                  <p className="dashboard-kpi-hint">Mostraremos los contactos de los últimos días.</p>
                </div>
                <div className="dashboard-kpi-card">
                  <p className="dashboard-kpi-label">Producto más solicitado</p>
                  <p className="dashboard-kpi-valor">—</p>
                  <p className="dashboard-kpi-hint">Aquí verás qué repuesto recibe más interés.</p>
                </div>
              </div>
            </section>
          )}

          {tab === 'productos' && (
            <section className="dashboard-seccion">
              <div className="dashboard-seccion-header">
                <h2 className="dashboard-seccion-titulo">Mis productos</h2>
                <button
                  type="button"
                  className="dashboard-btn-accion"
                  onClick={() => setMostrarNuevoProducto((v) => !v)}
                >
                  {mostrarNuevoProducto ? 'Cerrar formulario' : 'Agregar producto nuevo'}
                </button>
              </div>
              {mostrarNuevoProducto && (
                <div className="dashboard-card">
                  <RegistroRepuestos onProductoRegistrado={() => setRefreshProductos((n) => n + 1)} />
                </div>
              )}
              <div className="dashboard-card">
                <MisProductos refreshTrigger={refreshProductos} />
              </div>
              <div className="dashboard-importar-row dashboard-importar-row-final">
                <button
                  type="button"
                  className="dashboard-btn-accion"
                  onClick={() => setMostrarImportarCSV((v) => !v)}
                >
                  {mostrarImportarCSV ? 'Cerrar importación' : 'Importar productos (CSV/XLSX)'}
                </button>
              </div>
              {mostrarImportarCSV && (
                <div className="dashboard-card">
                  <ImportarProductosCSV onImportado={() => setRefreshProductos((n) => n + 1)} />
                </div>
              )}
            </section>
          )}

          {tab === 'estadisticas' && (
            <section className="dashboard-seccion">
              <h2 className="dashboard-seccion-titulo">Estadísticas de contacto</h2>
              <div className="dashboard-card">
                <p className="dashboard-texto-placeholder">
                  Aquí agregaremos gráficos y tablas con los productos más contactados, contactos por día
                  y otros indicadores clave para tus ventas.
                </p>
              </div>
            </section>
          )}

{tab === 'perfil' && (
            <section className="dashboard-seccion">
              <h2 className="dashboard-seccion-titulo">Mi perfil</h2>
              <div className="dashboard-card">
                <PerfilUsuario />
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

