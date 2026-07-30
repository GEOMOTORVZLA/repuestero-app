import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { RegistroRepuestos } from './RegistroRepuestos';
import { MisProductos } from './MisProductos';
import { VisorMostrador } from './VisorMostrador';
import { ResumenVendedor } from './ResumenVendedor';
import { PerfilUsuario } from './PerfilUsuario';
import { ImportarProductosCSV } from './ImportarProductosCSV';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO, VERTICAL_MOTO } from '../utils/verticalVehiculo';
import { bannerEstadoCuentaNegocio } from '../utils/estadoCuentaVendedorTaller';
import type { BannerEstadoCuenta } from '../utils/estadoCuentaVendedorTaller';
import { EstadoCuentaNegocioBanner } from './EstadoCuentaNegocioBanner';
import './Dashboard.css';

type TabId = 'resumen' | 'productos' | 'mostrador' | 'perfil';

interface DashboardVendedorProps {
  onVolverInicio?: () => void;
  vertical?: VerticalVehiculo;
}

export function DashboardVendedor({ onVolverInicio, vertical = VERTICAL_AUTO }: DashboardVendedorProps) {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<TabId>('resumen');
  const [mostrarNuevoProducto, setMostrarNuevoProducto] = useState(false);
  const [mostrarImportarCSV, setMostrarImportarCSV] = useState(false);
  const [refreshProductos, setRefreshProductos] = useState(0);
  const [bannerTienda, setBannerTienda] = useState<BannerEstadoCuenta | null>(null);
  const [avisoNormasEliminados, setAvisoNormasEliminados] = useState(0);
  const [cerrandoAvisoNormas, setCerrandoAvisoNormas] = useState(false);
  const esMoto = vertical === VERTICAL_MOTO;
  const etiquetaVertical = esMoto ? 'motocicleta' : 'automóvil';
  const etiquetaVerticalMayus = esMoto ? 'Motocicleta' : 'Automóvil';
  useEffect(() => {
    if (!user) {
      setBannerTienda(null);
      setAvisoNormasEliminados(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      const md = (user.user_metadata ?? {}) as Record<string, unknown>;
      const esMetaVendedor =
        md.tipo_cuenta === 'vendedor' || (md.perfil_vendedor != null && typeof md.perfil_vendedor === 'object');

      const { data: tiendaRow } = await supabase
        .from('tiendas')
        .select('bloqueado, aprobacion_estado, membresia_hasta, aviso_normas_productos_eliminados')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      const tr = tiendaRow as {
        bloqueado?: boolean | null;
        aprobacion_estado?: string | null;
        membresia_hasta?: string | null;
        aviso_normas_productos_eliminados?: number | null;
      } | null;

      const nAviso = Number(tr?.aviso_normas_productos_eliminados ?? 0);
      setAvisoNormasEliminados(Number.isFinite(nAviso) && nAviso > 0 ? Math.floor(nAviso) : 0);

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

  const cerrarAvisoNormas = async () => {
    setCerrandoAvisoNormas(true);
    const { error } = await supabase.rpc('vendedor_cerrar_aviso_normas_productos');
    if (!error) {
      setAvisoNormasEliminados(0);
    }
    setCerrandoAvisoNormas(false);
  };

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
            className={`dashboard-menu-item dashboard-menu-item--mostrador ${tab === 'mostrador' ? 'activo' : ''}`}
            onClick={() => setTab('mostrador')}
          >
            VISOR DE MOSTRADOR
          </button>
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
            Editar productos
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
              Gestiona tus repuestos y tu tienda.
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
          {tab === 'resumen' && bannerTienda && (
            <div className="dashboard-cuenta-banners" role="region" aria-label="Estado de tu cuenta">
              <EstadoCuentaNegocioBanner etiqueta="Vendedor / tienda" banner={bannerTienda} />
            </div>
          )}
          {tab === 'resumen' && avisoNormasEliminados > 0 && (
            <div className="dashboard-aviso-normas" role="alert">
              <p className="dashboard-aviso-normas-texto">
                Se eliminaron {avisoNormasEliminados} productos de tus publicaciones por no cumplir con
                nuestras normas, recuerda publicar solo productos referentes a {etiquetaVertical}.
              </p>
              <button
                type="button"
                className="dashboard-aviso-normas-cerrar"
                disabled={cerrandoAvisoNormas}
                onClick={() => void cerrarAvisoNormas()}
              >
                {cerrandoAvisoNormas ? 'Cerrando…' : 'Entendido'}
              </button>
            </div>
          )}
          {tab === 'resumen' && (
            <ResumenVendedor vertical={vertical} refreshTrigger={refreshProductos} />
          )}

          {tab === 'productos' && (
            <section className="dashboard-seccion">
              <div className="dashboard-seccion-header dashboard-seccion-header--solo-accion">
                <button
                  type="button"
                  className={`dashboard-btn-accion dashboard-btn-accion--principal${
                    mostrarNuevoProducto ? '' : ' dashboard-btn-accion--titilar'
                  }`}
                  onClick={() => setMostrarNuevoProducto((v) => !v)}
                >
                  {mostrarNuevoProducto ? 'Cerrar formulario' : 'Publicar producto'}
                </button>
              </div>
              <div className="mis-productos-alerta-stock mis-productos-alerta-stock--titilar" role="alert">
                <strong>Control de inventario:</strong> todo producto con más de 20 días sin actualización de
                stock será pausado automáticamente y dejará de verse en búsquedas públicas hasta que lo
                reactives.
              </div>
              <div
                className="dashboard-productos-toolbar"
                role="group"
                aria-label={`Productos de ${etiquetaVertical}`}
              >
                <p className="dashboard-productos-toolbar-hint">
                  Este panel es solo de <strong>{etiquetaVertical}</strong>. Aquí puedes{' '}
                  <strong>registrar</strong> o <strong>importar</strong> repuestos de {etiquetaVertical}. Para{' '}
                  <strong>eliminar</strong>, usa la opción en cada producto del listado.
                </p>
                <p className="dashboard-productos-toolbar-vertical" role="status">
                  Catálogo activo: <strong>{etiquetaVerticalMayus}</strong>
                </p>
              </div>
              {mostrarNuevoProducto && (
                <div className="dashboard-card" key={`registro-${vertical}`}>
                  <RegistroRepuestos
                    vertical={vertical}
                    onProductoRegistrado={() => setRefreshProductos((n) => n + 1)}
                  />
                </div>
              )}
              <div className="dashboard-importar-row dashboard-importar-row-final">
                <div className="dashboard-importar-bloque">
                  <p className="dashboard-importar-texto">
                    Puedes subir tus productos de {etiquetaVertical} de manera masiva: descarga la plantilla Excel
                    (incluye categorías y marcas válidas), llénala en la hoja Productos y súbela aquí.
                  </p>
                  <button
                    type="button"
                    className="dashboard-btn-accion"
                    onClick={() => setMostrarImportarCSV((v) => !v)}
                  >
                    {mostrarImportarCSV ? 'Cerrar importación' : 'Importar productos (xlsx)'}
                  </button>
                </div>
              </div>
              {mostrarImportarCSV && (
                <div className="dashboard-card" key={`import-${vertical}`}>
                  <ImportarProductosCSV
                    vertical={vertical}
                    onImportado={() => setRefreshProductos((n) => n + 1)}
                  />
                </div>
              )}
              <div className="dashboard-card">
                <MisProductos refreshTrigger={refreshProductos} vertical={vertical} />
              </div>
            </section>
          )}

          {tab === 'mostrador' && (
            <section className="dashboard-seccion">
              <h2 className="dashboard-seccion-titulo dashboard-seccion-titulo--mostrador-busqueda">
                BÚSQUEDA EN TUS PRODUCTOS PUBLICADOS
              </h2>
              <p className="dashboard-productos-toolbar-hint">
                Consulta rápida de tu catálogo de <strong>{etiquetaVertical}</strong> frente al cliente. Busca como
                en la app pública; toca la foto para ampliarla sin ralentizar el listado.
              </p>
              <div className="dashboard-card">
                <VisorMostrador vertical={vertical} refreshTrigger={refreshProductos} />
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
          className={`dashboard-nav-movil-item dashboard-nav-movil-item--mostrador ${tab === 'mostrador' ? 'activo' : ''}`}
          onClick={() => setTab('mostrador')}
          title="Visor de mostrador"
          aria-label="Visor de mostrador"
        >
          Visor
        </button>
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
          Editar
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
