import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { CATEGORIAS_MOTO_MAS_BUSCADAS, imagenPinCategoriaMoto } from '../data/categoriasProductoMoto';
import { getUserAvatarUrl } from '../utils/userAvatar';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO } from '../utils/verticalVehiculo';
import { BusquedaRepuestos } from './BusquedaRepuestos';
import { IconoCategoria } from './IconosCategorias';
import {
  PARAM_REPUESTO_COMPARTIDO,
  PARAM_TIENDA_COMPARTIDA,
  esIdProductoUuid,
  esIdTiendaUuid,
  guardarTiendaCatalogoPendiente,
  leerTiendaCatalogoPendiente,
  limpiarTiendaCatalogoPendiente,
} from '../utils/enlaceCompartirProducto';
import {
  mensajeWhatsappSoporteGeomotor,
  TELEFONO_SOPORTE_GEOMOTOR,
  urlWhatsAppGeomotor,
} from '../utils/linkWhatsAppGeomotor';
import './Landing.css';

const GuiaRepuestosLanding = lazy(() =>
  import('./GuiaRepuestosLanding').then((m) => ({ default: m.GuiaRepuestosLanding }))
);
const VendedoresCercaDeMi = lazy(() =>
  import('./VendedoresCercaDeMi').then((m) => ({ default: m.VendedoresCercaDeMi }))
);
const ListaRepuestosPorCategoria = lazy(() =>
  import('./ListaRepuestosPorCategoria').then((m) => ({ default: m.ListaRepuestosPorCategoria }))
);
const BusquedaTalleres = lazy(() =>
  import('./BusquedaTalleres').then((m) => ({ default: m.BusquedaTalleres }))
);
const BusquedaGruas = lazy(() =>
  import('./BusquedaGruas').then((m) => ({ default: m.BusquedaGruas }))
);

interface LandingProps {
  vertical?: VerticalVehiculo;
  /** Sin sesión: acceso a login y registro */
  onMostrarLogin?: () => void;
  onMostrarCrearCuenta?: () => void;
  /** Con sesión: página principal con acceso al panel */
  sessionUser?: User | null;
  onIrAPanel?: () => void;
}

// ?v= obliga al navegador a refrescar caché al cambiar banners (sube el número cuando cambien)
type HeroSlide = { key: string; src: string; sm: string };

const HERO_IMAGENES_AUTO: HeroSlide[] = [
  { key: 'a1', src: '/header-banner.webp?v=1', sm: '/header-banner-sm.webp?v=1' },
  { key: 'a2', src: '/header-banner-2.webp?v=1', sm: '/header-banner-2-sm.webp?v=1' },
  { key: 'a3', src: '/header-banner-3.webp?v=1', sm: '/header-banner-3-sm.webp?v=1' },
  { key: 'a4', src: '/header-banner-4.webp?v=1', sm: '/header-banner-4-sm.webp?v=1' },
];
const HERO_IMAGENES_MOTO: HeroSlide[] = [
  { key: 'm1', src: '/header-banner-moto.webp?v=1', sm: '/header-banner-moto-sm.webp?v=1' },
  { key: 'm2', src: '/header-banner-moto-2.webp?v=1', sm: '/header-banner-moto-2-sm.webp?v=1' },
  { key: 'm3', src: '/header-banner-moto-3.webp?v=1', sm: '/header-banner-moto-3-sm.webp?v=1' },
];

const ICONO_CATEGORIA_AUTO: Record<string, string> = {
  Filtros: '/categoria-filtros.webp?v=1',
  Frenos: '/categoria-frenos.webp?v=1',
  Baterías: '/categoria-baterias.webp?v=1',
  'Cauchos y rines': '/categoria-cauchos.webp?v=1',
  'Amortiguadores y suspensiones': '/categoria-amortiguadores.webp?v=1',
  'Correas y bandas': '/categoria-correas-bandas.webp?v=1',
  'Bujías y encendido': '/categoria-bujias-encendido.webp?v=1',
  'Aceites y lubricantes': '/categoria-aceites-lubricantes.webp?v=1',
  'Luces y faros': '/categoria-luces-faros.webp?v=1',
  Embrague: '/categoria-embrague.webp?v=1',
  'Aire acondicionado Automotriz': '/aire acondicionado.webp?v=1',
  'Tren Delantero': '/tren delantero.webp?v=1',
  Transmisiones: '/transmisiones.webp?v=1',
  Autosonido: '/categoria-autosonido.webp?v=1',
  Accesorios: '/categoria-accesorios.webp?v=1',
  Carrocería: '/carroceria.webp?v=1',
  'Motores y componentes': '/motores y componentes.webp?v=1',
  'Motores a diesel y componentes': '/motores a diesel y componentes.webp?v=1',
};

const CATEGORIAS_REPUESTOS = [
  { nombre: 'Filtros' },
  { nombre: 'Frenos' },
  { nombre: 'Baterías' },
  { nombre: 'Cauchos y rines' },
  { nombre: 'Amortiguadores y suspensiones' },
  { nombre: 'Correas y bandas' },
  { nombre: 'Bujías y encendido' },
  { nombre: 'Aceites y lubricantes' },
  { nombre: 'Luces y faros' },
  { nombre: 'Embrague' },
  { nombre: 'Aire acondicionado Automotriz' },
  { nombre: 'Tren Delantero' },
  { nombre: 'Transmisiones' },
  { nombre: 'Autosonido' },
  { nombre: 'Accesorios' },
  { nombre: 'Carrocería' },
  { nombre: 'Motores y componentes' },
  { nombre: 'Motores a diesel y componentes' },
];

export function Landing({
  vertical = VERTICAL_AUTO,
  onMostrarLogin,
  onMostrarCrearCuenta,
  sessionUser = null,
  onIrAPanel,
}: LandingProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const productoIdDesdeUrl = useMemo(() => {
    const raw = searchParams.get(PARAM_REPUESTO_COMPARTIDO)?.trim();
    if (!raw || !esIdProductoUuid(raw)) return null;
    return raw;
  }, [searchParams]);

  const tiendaIdDesdeUrl = useMemo(() => {
    const raw = searchParams.get(PARAM_TIENDA_COMPARTIDA)?.trim();
    if (raw && esIdTiendaUuid(raw)) return raw;
    return leerTiendaCatalogoPendiente();
  }, [searchParams]);

  useEffect(() => {
    if (tiendaIdDesdeUrl) guardarTiendaCatalogoPendiente(tiendaIdDesdeUrl);
  }, [tiendaIdDesdeUrl]);

  const limpiarEnlaceTiendaUrl = useCallback(() => {
    limpiarTiendaCatalogoPendiente();
    if (!searchParams.has(PARAM_TIENDA_COMPARTIDA)) return;
    const next = new URLSearchParams(searchParams);
    next.delete(PARAM_TIENDA_COMPARTIDA);
    const q = next.toString();
    navigate({ pathname: location.pathname, search: q ? `?${q}` : '' }, { replace: true });
  }, [navigate, location.pathname, searchParams]);

  const pedirLoginParaCatalogoCompartido = useCallback(() => {
    if (tiendaIdDesdeUrl) guardarTiendaCatalogoPendiente(tiendaIdDesdeUrl);
    onMostrarLogin?.();
  }, [onMostrarLogin, tiendaIdDesdeUrl]);

  const esMoto = vertical === 'moto';
  const heroSlides = useMemo(() => (esMoto ? HERO_IMAGENES_MOTO : HERO_IMAGENES_AUTO), [esMoto]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(null);
  /** Pantalla dedicada de resultados (después de buscar desde la landing) */
  const [vistaBusquedaRepuestos, setVistaBusquedaRepuestos] = useState<{ activa: boolean; texto: string }>({
    activa: false,
    texto: '',
  });
  const [busquedaRepuestosMountKey, setBusquedaRepuestosMountKey] = useState(0);
  const [guiaCapaActiva, setGuiaCapaActiva] = useState(false);

  const abrirPaginaBusquedaRepuestos = (texto: string) => {
    setBusquedaRepuestosMountKey((k) => k + 1);
    setVistaBusquedaRepuestos({ activa: true, texto });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cerrarPaginaBusquedaRepuestos = useCallback(() => {
    setVistaBusquedaRepuestos({ activa: false, texto: '' });
    if (searchParams.has(PARAM_REPUESTO_COMPARTIDO)) {
      navigate({ pathname: location.pathname, search: '' }, { replace: true });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [navigate, location.pathname, searchParams]);

  const cerrarOverlayCategoria = useCallback(() => {
    setCategoriaSeleccionada(null);
  }, []);

  const avatarUrl = sessionUser ? getUserAvatarUrl(sessionUser) : null;
  const [avatarConError, setAvatarConError] = useState(false);

  useEffect(() => {
    setAvatarConError(false);
  }, [avatarUrl, sessionUser?.id]);

  useEffect(() => {
    const n = heroSlides.length;
    const id = setInterval(() => {
      setSlideIndex((i) => (i + 1) % n);
    }, 5000);
    return () => clearInterval(id);
  }, [heroSlides]);

  useEffect(() => {
    setSlideIndex(0);
    setVistaBusquedaRepuestos({ activa: false, texto: '' });
    setCategoriaSeleccionada(null);
    setBusquedaRepuestosMountKey((k) => k + 1);
  }, [vertical]);

  /** Abrir búsqueda al entrar con ?repuesto=uuid (enlace compartido). */
  useEffect(() => {
    if (!productoIdDesdeUrl) return;
    setVistaBusquedaRepuestos({ activa: true, texto: '' });
    setBusquedaRepuestosMountKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [productoIdDesdeUrl]);

  const overlayLandingActivo =
    vistaBusquedaRepuestos.activa ||
    Boolean(categoriaSeleccionada) ||
    Boolean(tiendaIdDesdeUrl) ||
    guiaCapaActiva;
  const ocultarWhatsappFlotante = overlayLandingActivo;
  const urlWhatsappSoporte = urlWhatsAppGeomotor(
    TELEFONO_SOPORTE_GEOMOTOR,
    mensajeWhatsappSoporteGeomotor()
  );

  useEffect(() => {
    if (!overlayLandingActivo || guiaCapaActiva) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (categoriaSeleccionada) {
        setCategoriaSeleccionada(null);
        return;
      }
      if (vistaBusquedaRepuestos.activa) cerrarPaginaBusquedaRepuestos();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [
    overlayLandingActivo,
    guiaCapaActiva,
    categoriaSeleccionada,
    vistaBusquedaRepuestos.activa,
    cerrarPaginaBusquedaRepuestos,
  ]);

  return (
    <div className={`landing${esMoto ? ' landing--moto' : ''}${overlayLandingActivo ? ' landing--capa-overlay' : ''}`}>
      <header
        className="landing-header"
        aria-hidden={overlayLandingActivo}
        inert={overlayLandingActivo ? true : undefined}
      >
        <div className="landing-header-izq">
          <h1 className="landing-logo">Geomotor</h1>
          <nav className="landing-vertical-nav" aria-label="Tipo de vehículo">
            <Link
              to="/"
              className={`landing-vertical-nav-link${!esMoto ? ' landing-vertical-nav-link--activo' : ''}`}
            >
              Autos
            </Link>
            <Link
              to="/motos"
              className={`landing-vertical-nav-link${esMoto ? ' landing-vertical-nav-link--activo' : ''}`}
            >
              Motos
            </Link>
          </nav>
        </div>
        <div className="landing-header-derecha">
          {sessionUser ? (
            <div className="landing-header-sesion" role="group" aria-label="Cuenta de usuario">
              <button
                type="button"
                className="landing-mi-cuenta"
                onClick={() => onIrAPanel?.()}
                title="Ir al panel de control"
              >
                <span className="landing-avatar-wrap" aria-hidden>
                  {avatarUrl && !avatarConError ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="landing-avatar-img"
                      onError={() => setAvatarConError(true)}
                    />
                  ) : (
                    <span className="landing-avatar-icono" aria-hidden>
                      <svg viewBox="0 0 24 24" focusable="false">
                        <circle cx="12" cy="8" r="4.2" />
                        <path d="M4.2 19.2c0-3.1 3.5-5.6 7.8-5.6s7.8 2.5 7.8 5.6" />
                      </svg>
                    </span>
                  )}
                </span>
                <span className="landing-mi-cuenta-label">Mi cuenta</span>
              </button>
            </div>
          ) : (
            <div className="landing-header-auth">
              <div className="landing-header-botones">
                <button type="button" className="landing-btn-login" onClick={() => onMostrarLogin?.()}>
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  className="landing-btn-crear"
                  onClick={() => onMostrarCrearCuenta?.()}
                >
                  Crear cuenta
                </button>
              </div>
              <p className="landing-header-auth-aviso">Solo para vendedores, talleres y grúas</p>
            </div>
          )}
        </div>
      </header>

      <section className="landing-hero-banner">
        <div className="landing-hero-slides">
          {heroSlides.map((slide, i) => {
            const n = heroSlides.length;
            const cargar = i === slideIndex || i === (slideIndex + 1) % n;
            return (
              <div
                key={slide.key}
                className={`landing-hero-slide ${i === slideIndex ? 'activo' : ''}`}
              >
                {cargar ? (
                  <picture>
                    <source
                      type="image/webp"
                      srcSet={`${slide.sm} 960w, ${slide.src} 1920w`}
                      sizes="(max-width: 900px) 960px, 100vw"
                    />
                    <img
                      src={slide.sm}
                      alt=""
                      className="landing-hero-slide-img"
                      width={1920}
                      height={447}
                      decoding={i === 0 ? 'sync' : 'async'}
                      fetchPriority={i === 0 ? 'high' : 'low'}
                      loading={i === 0 ? 'eager' : 'lazy'}
                    />
                  </picture>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="landing-hero-overlay" />
      </section>

      {!vistaBusquedaRepuestos.activa && (
        <BusquedaRepuestos
          key={`compact-${vertical}-${busquedaRepuestosMountKey}`}
          vertical={vertical}
          variant="compact"
          onIrAResultados={({ texto }) => abrirPaginaBusquedaRepuestos(texto)}
        />
      )}

      {!vistaBusquedaRepuestos.activa && (
        <Suspense fallback={<p className="landing-lazy-fallback landing-lazy-fallback--guia">Cargando guía de repuestos…</p>}>
          <GuiaRepuestosLanding key={vertical} vertical={vertical} onCapaActiva={setGuiaCapaActiva} />
        </Suspense>
      )}

      <Suspense fallback={<p className="landing-lazy-fallback">Cargando vendedores…</p>}>
        <VendedoresCercaDeMi
          vertical={vertical}
          tiendaIdDesdeEnlace={tiendaIdDesdeUrl}
          onLimpiarEnlaceTienda={limpiarEnlaceTiendaUrl}
          onRequiereLoginParaCatalogo={pedirLoginParaCatalogoCompartido}
        />
      </Suspense>

      <section className="landing-categorias">
        <h2 className="landing-seccion-titulo">
          {esMoto ? 'CATEGORÍAS MÁS BUSCADAS EN MOTOS' : 'CATEGORIAS MAS BUSCADAS EN AUTOMOVILES'}
        </h2>
        <div className="landing-categorias-grid">
          {(esMoto
            ? CATEGORIAS_MOTO_MAS_BUSCADAS.map((nombre) => ({ nombre }))
            : CATEGORIAS_REPUESTOS
          ).map((cat) => {
            return (
            <button
              key={cat.nombre}
              type="button"
              className="landing-categoria-item"
              onClick={() => setCategoriaSeleccionada(cat.nombre)}
            >
              <div className="landing-categoria-circulo">
                {(() => {
                  const srcIcono = esMoto
                    ? imagenPinCategoriaMoto(cat.nombre)
                    : ICONO_CATEGORIA_AUTO[cat.nombre];
                  if (!srcIcono) {
                    return <IconoCategoria nombre={cat.nombre} className="landing-categoria-icono" />;
                  }
                  return (
                    <img
                      src={encodeURI(srcIcono)}
                      alt=""
                      className={
                        'landing-categoria-icono landing-categoria-icono-img' +
                        (esMoto ? ' landing-categoria-icono-moto' : '')
                      }
                      loading="lazy"
                      decoding="async"
                    />
                  );
                })()}
              </div>
              <span className="landing-categoria-nombre">{cat.nombre}</span>
            </button>
            );
          })}
        </div>
      </section>

      <section className="landing-emergencia">
        <h2 className="landing-seccion-titulo">GRÚAS Y EMERGENCIAS VIALES</h2>
        <div className="landing-emergencia-contenido">
          <img
            src={esMoto ? '/sticker-grua-moto-v3.webp' : '/sticker-grua-v3.webp'}
            alt={esMoto ? 'Grúa de motos' : 'Grúas'}
            className="landing-emergencia-sticker"
            width={esMoto ? 705 : 718}
            height={esMoto ? 499 : 513}
            loading="lazy"
            decoding="async"
          />
          <div className="landing-emergencia-texto">
            <p>
              Si te quedaste varado, busca grúa o auxilio vial en tu estado.
            </p>
            <Suspense fallback={<p className="landing-lazy-fallback">Cargando emergencias…</p>}>
              <BusquedaGruas key={vertical} vertical={vertical} />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="landing-taller">
        <div className="landing-taller-contenido">
          <img
            src={esMoto ? '/sticker-taller-moto-v3.webp' : '/sticker-taller-v3.webp'}
            alt={esMoto ? 'Taller de motos' : 'Taller'}
            className="landing-taller-sticker"
            width={esMoto ? 684 : 683}
            height={525}
            loading="lazy"
            decoding="async"
          />
          <h2 className="landing-seccion-titulo">ENCUENTRA EL TALLER QUE NECESITAS AQUI</h2>
          <div className="landing-taller-texto">
            <Suspense fallback={<p className="landing-lazy-fallback">Cargando talleres…</p>}>
              <BusquedaTalleres vertical={vertical} />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="landing-beneficios">
        <h2 className="landing-seccion-titulo">¿Por qué Geomotor?</h2>
        <div className="landing-grid">
          <div className="landing-card">
            <img src="/tienda.png" alt="Tienda" className="landing-card-img" />
            <h3>Registra tu tienda</h3>
            <p>
              Registra tu tienda, tu ubicación en el GPS y listo, ya eres parte de Geomotor de localización de repuestos.
            </p>
          </div>
          <div className="landing-card">
            <img src="/catalogo.png" alt="Catálogo" className="landing-card-img" />
            <h3>Catálogo de repuestos</h3>
            <p>
              Ingresa a nuestra base de datos todos los repuestos por marca, modelo y año que quieras ofrecer.
            </p>
          </div>
          <div className="landing-card">
            <img src="/bs-usd.png" alt="Bs o USD" className="landing-card-img" />
            <h3>Bs o USD</h3>
            <p>
              Elige la opción del precio de tus artículos Bs o USD $ la que más te convenga.
            </p>
          </div>
          <div className="landing-card">
            <img src="/tarifas.png" alt="Tarifas" className="landing-card-img" />
            <h3>Tarifas</h3>
            <p>
              Olvídate de las comisiones por venta, nuestro modelo de negocio solo se basa en una tarifa muy pequeña mensual, no recargues tus costos.
            </p>
          </div>
          <div className="landing-card">
            <img src="/contacto-whatsapp.png" alt="Contacto" className="landing-card-img" />
            <h3>Contacto</h3>
            <p>
              Si vendes o si compras podrás contactar al vendedor en el momento que decidas, sin misterios, la comunicación es la clave del negocio.
            </p>
          </div>
          <div className="landing-card">
            <img src="/transaccion.png" alt="Transacción" className="landing-card-img" />
            <h3>Transacción</h3>
            <p>
              La venta siempre la cierras tú directamente, tus cobros y pagos serán directos sin intermediarios ni comisiones.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-empresa">
        <h2 className="landing-seccion-titulo">Sobre Geomotor</h2>
        <div className="landing-empresa-contenido">
          <div className="landing-empresa-col landing-empresa-info">
            <h3>Información sobre la empresa</h3>
            <p className="landing-empresa-descripcion">
              Geomotor es la plataforma de localización de repuestos automotrices en Venezuela usando como base un
              servicio de GPS. Conectamos a vendedores, compradores y talleres en sus ubicaciones exactas para facilitar
              la búsqueda y venta de repuestos y artículos para autos y motos.
            </p>
          </div>
          <div className="landing-empresa-col landing-empresa-contacto">
            <h3>Datos de contacto</h3>
            <div className="landing-empresa-datos">
              <div className="landing-empresa-item">
                <span className="landing-empresa-label">Teléfono:</span>
                <a href="tel:+584241978797">+58 0424-1978797</a>
              </div>
              <div className="landing-empresa-item">
                <span className="landing-empresa-label">WhatsApp:</span>
                <a href="https://wa.me/584241978797" target="_blank" rel="noopener noreferrer">+58 0424-1978797</a>
              </div>
              <div className="landing-empresa-item">
                <span className="landing-empresa-label">Email:</span>
                <a href="mailto:geomotorvzla@gmail.com">geomotorvzla@gmail.com</a>
              </div>
              <div className="landing-empresa-item">
                <span className="landing-empresa-label">Dirección:</span>
                <span>Caracas, Venezuela</span>
              </div>
            </div>
          </div>
          <div className="landing-empresa-col landing-empresa-redes">
            <h3>Redes sociales</h3>
            <div className="landing-empresa-redes-links">
              <a href="https://www.instagram.com/geomotorvzla/" target="_blank" rel="noopener noreferrer" className="landing-empresa-red" aria-label="Instagram @geomotorvzla">
                Instagram @geomotorvzla
              </a>
              <a href="https://www.facebook.com/geomotorvzla" target="_blank" rel="noopener noreferrer" className="landing-empresa-red" aria-label="Facebook Geomotor Vzla">
                Facebook Geomotor Vzla
              </a>
              <a href="https://www.tiktok.com/@geomotorvzla" target="_blank" rel="noopener noreferrer" className="landing-empresa-red" aria-label="TikTok Geomotor Venezuela">
                TikTok Geomotor Venezuela
              </a>
            </div>
          </div>
        </div>
      </section>

      {categoriaSeleccionada && (
        <div
          className="resultados-busqueda-pagina-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Repuestos en ${categoriaSeleccionada}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrarOverlayCategoria();
          }}
        >
          <div
            className="resultados-busqueda-pagina-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="resultados-busqueda-pagina-panel-scroll">
              <Suspense fallback={<p className="landing-lazy-fallback">Cargando categoría…</p>}>
                <ListaRepuestosPorCategoria
                  key={categoriaSeleccionada}
                  vertical={vertical}
                  categoria={categoriaSeleccionada}
                  onCerrar={cerrarOverlayCategoria}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {vistaBusquedaRepuestos.activa && (
        <div
          className="resultados-busqueda-pagina-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Búsqueda de repuestos"
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrarPaginaBusquedaRepuestos();
          }}
        >
          <div
            className="resultados-busqueda-pagina-panel resultados-busqueda-pagina-panel--amplia"
            onClick={(e) => e.stopPropagation()}
          >
            <BusquedaRepuestos
              key={`${vertical}-${busquedaRepuestosMountKey}`}
              vertical={vertical}
              variant="full"
              initialTexto={vistaBusquedaRepuestos.texto}
              productoIdDesdeEnlace={vistaBusquedaRepuestos.activa ? productoIdDesdeUrl : null}
              onVolver={cerrarPaginaBusquedaRepuestos}
            />
          </div>
        </div>
      )}

      {!ocultarWhatsappFlotante && urlWhatsappSoporte && (
        <a
          href={urlWhatsappSoporte}
          className="landing-whatsapp-fab"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Escribir a Geomotor por WhatsApp"
          title="WhatsApp Geomotor"
        >
          <span className="landing-whatsapp-fab-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" focusable="false">
              <path
                fill="currentColor"
                d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
              />
            </svg>
          </span>
          <span className="landing-whatsapp-fab-texto">WhatsApp</span>
        </a>
      )}

      <footer
        className="landing-footer"
        aria-hidden={overlayLandingActivo}
        inert={overlayLandingActivo ? true : undefined}
      >
        <p className="landing-footer-marca">
          Geomotor
          <sup className="landing-footer-tm" aria-label="marca comercial">
            ™
          </sup>{' '}
          2026
        </p>
      </footer>
    </div>
  );
}
