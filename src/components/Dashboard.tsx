import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { useDashboardPanelTipo } from '../hooks/useDashboardPanelTipo';
import { DashboardAdmin } from './DashboardAdmin';
import { DashboardComprador } from './DashboardComprador';
import { RegistroRepuestos } from './RegistroRepuestos';
import { MisProductos } from './MisProductos';
import { PerfilUsuario } from './PerfilUsuario';
import { PerfilTaller } from './PerfilTaller';
import { ImportarProductosCSV } from './ImportarProductosCSV';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO, VERTICAL_MOTO } from '../utils/verticalVehiculo';
import { bannerEstadoCuentaNegocio } from '../utils/estadoCuentaVendedorTaller';
import type { BannerEstadoCuenta } from '../utils/estadoCuentaVendedorTaller';
import { EstadoCuentaNegocioBanner } from './EstadoCuentaNegocioBanner';
import './Dashboard.css';

type TabId = 'resumen' | 'productos' | 'estadisticas' | 'perfil';

interface DashboardProps {
  /** Vuelve a la página principal (landing) sin cerrar sesión */
  onVolverInicio?: () => void;
  /** Vertical desde la URL (/ vs /motos) para registrar/importar productos */
  vertical?: VerticalVehiculo;
}

export function Dashboard({ onVolverInicio, vertical = VERTICAL_AUTO }: DashboardProps) {
  const { user, signOut } = useAuth();
  const panelTipo = useDashboardPanelTipo(user);
  const [tab, setTab] = useState<TabId>('resumen');
  const [mostrarNuevoProducto, setMostrarNuevoProducto] = useState(false);
  const [mostrarImportarCSV, setMostrarImportarCSV] = useState(false);
  /** Vertical para registro/importación (no depende solo de la URL) */
  const [verticalAlta, setVerticalAlta] = useState<VerticalVehiculo>(vertical);
  const [refreshProductos, setRefreshProductos] = useState(0);
  const [bannersCuenta, setBannersCuenta] = useState<{
    tienda: BannerEstadoCuenta | null;
    taller: BannerEstadoCuenta | null;
  }>({ tienda: null, taller: null });

  useEffect(() => {
    setVerticalAlta(vertical);
  }, [vertical]);

  useEffect(() => {
    if (!user || panelTipo !== 'vendedor_taller') {
      setBannersCuenta({ tienda: null, taller: null });
      return;
    }
    let cancelled = false;
    void (async () => {
      const md = (user.user_metadata ?? {}) as Record<string, unknown>;
      const esMetaVendedor =
        md.tipo_cuenta === 'vendedor' || (md.perfil_vendedor != null && typeof md.perfil_vendedor === 'object');
      const esMetaTaller =
        md.tipo_cuenta === 'taller' || (md.perfil_taller != null && typeof md.perfil_taller === 'object');

      const { data: tiendaRow } = await supabase
        .from('tiendas')
        .select('bloqueado, aprobacion_estado, membresia_hasta')
        .eq('user_id', user.id)
        .maybeSingle();
      const { data: tallerRow } = await supabase
        .from('talleres')
        .select('bloqueado, aprobacion_estado, membresia_hasta')
        .eq('user_id', user.id)
        .maybeSingle();

      if (cancelled) return;

      const tr = tiendaRow as {
        bloqueado?: boolean | null;
        aprobacion_estado?: string | null;
        membresia_hasta?: string | null;
      } | null;
      const tar = tallerRow as {
        bloqueado?: boolean | null;
        aprobacion_estado?: string | null;
        membresia_hasta?: string | null;
      } | null;

      let tienda: BannerEstadoCuenta | null = null;
      if (tr) {
        tienda = bannerEstadoCuentaNegocio({
          bloqueado: tr.bloqueado,
          aprobacion_estado: tr.aprobacion_estado,
          membresia_hasta: tr.membresia_hasta != null ? String(tr.membresia_hasta).slice(0, 10) : null,
          sinFilaEnBd: false,
        });
      } else if (esMetaVendedor) {
        tienda = bannerEstadoCuentaNegocio({
          bloqueado: false,
          aprobacion_estado: null,
          membresia_hasta: null,
          sinFilaEnBd: true,
        });
      }

      let taller: BannerEstadoCuenta | null = null;
      if (tar) {
        taller = bannerEstadoCuentaNegocio({
          bloqueado: tar.bloqueado,
          aprobacion_estado: tar.aprobacion_estado,
          membresia_hasta: tar.membresia_hasta != null ? String(tar.membresia_hasta).slice(0, 10) : null,
          sinFilaEnBd: false,
        });
      } else if (esMetaTaller) {
        taller = bannerEstadoCuentaNegocio({
          bloqueado: false,
          aprobacion_estado: null,
          membresia_hasta: null,
          sinFilaEnBd: true,
        });
      }

      setBannersCuenta({ tienda, taller });
    })();
    return () => {
      cancelled = true;
    };
  }, [user, panelTipo]);

  if (panelTipo === 'loading') {
    return <p className="app-loading">Cargando panel…</p>;
  }

  if (panelTipo === 'comprador') {
    return <DashboardComprador onVolverInicio={onVolverInicio} />;
  }

  if (panelTipo === 'admin') {
    return <DashboardAdmin vertical={vertical} onVolverInicio={onVolverInicio} />;
  }

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
          {(bannersCuenta.tienda || bannersCuenta.taller) && (
            <div className="dashboard-cuenta-banners" role="region" aria-label="Estado de tu cuenta">
              {bannersCuenta.tienda ? (
                <EstadoCuentaNegocioBanner etiqueta="Vendedor / tienda" banner={bannersCuenta.tienda} />
              ) : null}
              {bannersCuenta.taller ? (
                <EstadoCuentaNegocioBanner etiqueta="Taller" banner={bannersCuenta.taller} />
              ) : null}
            </div>
          )}
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
              <div
                className="dashboard-productos-toolbar"
                role="group"
                aria-label="Registrar o importar productos según automóvil o motocicleta"
              >
                <p className="dashboard-productos-toolbar-hint">
                  Para <strong>registrar</strong> o <strong>importar</strong>, elige automóvil o motocicleta. Para{' '}
                  <strong>eliminar</strong>, usa la opción en cada producto del listado. Puedes cambiar el selector en
                  cualquier momento; el listado muestra todo junto.
                </p>
                <div className="dashboard-vertical-picker">
                  <span className="dashboard-vertical-picker-label">Registrar o eliminar producto en:</span>
                  <div className="dashboard-vertical-picker-segment">
                    <button
                      type="button"
                      className={verticalAlta === VERTICAL_AUTO ? 'activo' : ''}
                      onClick={() => setVerticalAlta(VERTICAL_AUTO)}
                    >
                      Automóvil
                    </button>
                    <button
                      type="button"
                      className={verticalAlta === VERTICAL_MOTO ? 'activo' : ''}
                      onClick={() => setVerticalAlta(VERTICAL_MOTO)}
                    >
                      Motocicleta
                    </button>
                  </div>
                </div>
              </div>
              {mostrarNuevoProducto && (
                <div className="dashboard-card" key={`registro-${verticalAlta}`}>
                  <RegistroRepuestos
                    vertical={verticalAlta}
                    onProductoRegistrado={() => setRefreshProductos((n) => n + 1)}
                  />
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
                <div className="dashboard-card" key={`import-${verticalAlta}`}>
                  <ImportarProductosCSV
                    vertical={verticalAlta}
                    onImportado={() => setRefreshProductos((n) => n + 1)}
                  />
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
              <div className="dashboard-card" style={{ marginTop: '1rem' }}>
                <PerfilTaller />
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

