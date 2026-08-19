import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { RegistroRepuestos } from './RegistroRepuestos';
import { MisProductos } from './MisProductos';
import { GestionFotosVendedor } from './GestionFotosVendedor';
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

type TabId = 'resumen' | 'publicar' | 'productos' | 'fotos' | 'mostrador' | 'perfil';

interface DashboardVendedorProps {
  onVolverInicio?: () => void;
  vertical?: VerticalVehiculo;
}

export function DashboardVendedor({ onVolverInicio, vertical = VERTICAL_AUTO }: DashboardVendedorProps) {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<TabId>('resumen');
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
            className={`dashboard-menu-item dashboard-menu-item--publicar ${tab === 'publicar' ? 'activo' : ''}`}
            onClick={() => setTab('publicar')}
          >
            Publicar
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
            className={`dashboard-menu-item ${tab === 'fotos' ? 'activo' : ''}`}
            onClick={() => setTab('fotos')}
          >
            Gestión de fotos
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

          {tab === 'publicar' && (
            <section className="dashboard-seccion">
              <h2 className="dashboard-seccion-titulo">Publicar</h2>
              <div
                className="dashboard-productos-toolbar"
                role="group"
                aria-label={`Publicar productos de ${etiquetaVertical}`}
              >
                <p className="dashboard-productos-toolbar-hint">
                  Este panel es solo de <strong>{etiquetaVertical}</strong>. Aquí puedes{' '}
                  <strong>publicar un producto nuevo</strong> o <strong>importar</strong> varios de una vez.
                  Para editar o eliminar, usa <strong>Editar productos</strong>.
                </p>
                <p className="dashboard-productos-toolbar-vertical" role="status">
                  Catálogo activo: <strong>{etiquetaVerticalMayus}</strong>
                </p>
              </div>
              <div className="dashboard-card" key={`registro-${vertical}`}>
                <RegistroRepuestos
                  vertical={vertical}
                  onProductoRegistrado={() => setRefreshProductos((n) => n + 1)}
                />
              </div>
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
            </section>
          )}

          {tab === 'productos' && (
            <section className="dashboard-seccion">
              <h2 className="dashboard-seccion-titulo">Editar productos</h2>
              <div className="mis-productos-alerta-stock mis-productos-alerta-stock--titilar" role="alert">
                <strong>Control de inventario:</strong> todo producto con más de 60 días sin actualización de
                stock será pausado automáticamente y dejará de verse en búsquedas públicas hasta que lo
                reactives.
              </div>
              <div
                className="dashboard-productos-toolbar"
                role="group"
                aria-label={`Editar productos de ${etiquetaVertical}`}
              >
                <p className="dashboard-productos-toolbar-hint">
                  Este panel es solo de <strong>{etiquetaVertical}</strong>. Aquí puedes buscar, editar, pausar
                  o eliminar tus publicaciones. Para un producto nuevo, usa <strong>Publicar</strong>.
                </p>
                <p className="dashboard-productos-toolbar-vertical" role="status">
                  Catálogo activo: <strong>{etiquetaVerticalMayus}</strong>
                </p>
              </div>
              <div className="dashboard-card">
                <MisProductos refreshTrigger={refreshProductos} vertical={vertical} />
              </div>
            </section>
          )}

          {tab === 'fotos' && (
            <section className="dashboard-seccion">
              <h2 className="dashboard-seccion-titulo">Gestión de fotos</h2>
              <p className="dashboard-productos-toolbar-hint">
                Asigna fotos a varios productos de <strong>{etiquetaVertical}</strong>, elige el alcance y aplica
                hasta 4 fotos.
              </p>
              <div className="dashboard-card">
                <GestionFotosVendedor vertical={vertical} refreshTrigger={refreshProductos} />
              </div>
            </section>
          )}

          {tab === 'mostrador' && (
            <section className="dashboard-seccion">
              <h2 className="dashboard-seccion-titulo dashboard-seccion-titulo--mostrador-busqueda">
                BÚSQUEDA EN TUS PRODUCTOS PUBLICADOS
              </h2>
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
          className={`dashboard-nav-movil-item dashboard-nav-movil-item--publicar ${tab === 'publicar' ? 'activo' : ''}`}
          onClick={() => setTab('publicar')}
          title="Publicar producto"
          aria-label="Publicar producto"
        >
          P
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
          className={`dashboard-nav-movil-item ${tab === 'fotos' ? 'activo' : ''}`}
          onClick={() => setTab('fotos')}
        >
          Fotos
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
