import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { RegistroRepuestos } from './RegistroRepuestos';
import { MisProductos } from './MisProductos';
import { PerfilUsuario } from './PerfilUsuario';
import { ImportarProductosCSV } from './ImportarProductosCSV';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO, VERTICAL_MOTO } from '../utils/verticalVehiculo';
import { bannerEstadoCuentaNegocio } from '../utils/estadoCuentaVendedorTaller';
import type { BannerEstadoCuenta } from '../utils/estadoCuentaVendedorTaller';
import { EstadoCuentaNegocioBanner } from './EstadoCuentaNegocioBanner';
import './Dashboard.css';

type TabId = 'resumen' | 'productos' | 'estadisticas' | 'perfil';

interface DashboardVendedorProps {
  onVolverInicio?: () => void;
  vertical?: VerticalVehiculo;
}

export function DashboardVendedor({ onVolverInicio, vertical = VERTICAL_AUTO }: DashboardVendedorProps) {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<TabId>('resumen');
  const [mostrarNuevoProducto, setMostrarNuevoProducto] = useState(false);
  const [mostrarImportarCSV, setMostrarImportarCSV] = useState(false);
  const [verticalAlta, setVerticalAlta] = useState<VerticalVehiculo>(vertical);
  const [refreshProductos, setRefreshProductos] = useState(0);
  const [bannerTienda, setBannerTienda] = useState<BannerEstadoCuenta | null>(null);

  useEffect(() => {
    setVerticalAlta(vertical);
  }, [vertical]);

  useEffect(() => {
    if (!user) {
      setBannerTienda(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const md = (user.user_metadata ?? {}) as Record<string, unknown>;
      const esMetaVendedor =
        md.tipo_cuenta === 'vendedor' || (md.perfil_vendedor != null && typeof md.perfil_vendedor === 'object');

      const { data: tiendaRow } = await supabase
        .from('tiendas')
        .select('bloqueado, aprobacion_estado, membresia_hasta')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      const tr = tiendaRow as {
        bloqueado?: boolean | null;
        aprobacion_estado?: string | null;
        membresia_hasta?: string | null;
      } | null;

      if (tr) {
        setBannerTienda(
          bannerEstadoCuentaNegocio({
            bloqueado: tr.bloqueado,
            aprobacion_estado: tr.aprobacion_estado,
            membresia_hasta: tr.membresia_hasta != null ? String(tr.membresia_hasta).slice(0, 10) : null,
            sinFilaEnBd: false,
          }),
        );
      } else if (esMetaVendedor) {
        setBannerTienda(
          bannerEstadoCuentaNegocio({
            bloqueado: false,
            aprobacion_estado: null,
            membresia_hasta: null,
            sinFilaEnBd: true,
          }),
        );
      } else {
        setBannerTienda(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const email = user?.email ?? '';

  return (
    <div className="dashboard dashboard-vendedor dashboard-panel-movil">
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
            <h1 className="dashboard-titulo">Panel de vendedor</h1>
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
          {bannerTienda && (
            <div className="dashboard-cuenta-banners" role="region" aria-label="Estado de tu cuenta">
              <EstadoCuentaNegocioBanner etiqueta="Vendedor / tienda" banner={bannerTienda} />
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
              <div className="dashboard-importar-row dashboard-importar-row-final">
                <div className="dashboard-importar-bloque">
                  <p className="dashboard-importar-texto">
                    Puedes subir tus productos de manera masiva: descarga la plantilla Excel (incluye
                    categorías y marcas válidas), llénala en la hoja Productos y súbela aquí.
                  </p>
                  <button
                    type="button"
                    className="dashboard-btn-accion"
                    onClick={() => setMostrarImportarCSV((v) => !v)}
                  >
                    {mostrarImportarCSV ? 'Cerrar importación' : 'Importar productos (CSV/XLSX)'}
                  </button>
                </div>
              </div>
              {mostrarImportarCSV && (
                <div className="dashboard-card" key={`import-${verticalAlta}`}>
                  <ImportarProductosCSV
                    vertical={verticalAlta}
                    onImportado={() => setRefreshProductos((n) => n + 1)}
                  />
                </div>
              )}
              <div className="dashboard-card">
                <MisProductos refreshTrigger={refreshProductos} />
              </div>
            </section>
          )}

          {tab === 'estadisticas' && (
            <section className="dashboard-seccion">
              <h2 className="dashboard-seccion-titulo">Estadísticas de contacto</h2>
              <div className="dashboard-card">
                <p className="dashboard-texto-placeholder">
                  Aquí agregaremos gráficos y tablas con los productos más contactados, contactos por día y otros
                  indicadores clave para tus ventas.
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

      <nav className="dashboard-nav-movil" aria-label="Navegación del panel">
        <button
          type="button"
          className={`dashboard-nav-movil-item ${tab === 'resumen' ? 'activo' : ''}`}
          onClick={() => setTab('resumen')}
        >
          Inicio
        </button>
        <button
          type="button"
          className={`dashboard-nav-movil-item ${tab === 'productos' ? 'activo' : ''}`}
          onClick={() => setTab('productos')}
        >
          Productos
        </button>
        <button
          type="button"
          className={`dashboard-nav-movil-item ${tab === 'estadisticas' ? 'activo' : ''}`}
          onClick={() => setTab('estadisticas')}
        >
          Estadísticas
        </button>
        <button
          type="button"
          className={`dashboard-nav-movil-item ${tab === 'perfil' ? 'activo' : ''}`}
          onClick={() => setTab('perfil')}
        >
          Perfil
        </button>
      </nav>
    </div>
  );
}
