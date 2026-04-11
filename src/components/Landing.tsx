import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { CATEGORIAS_MOTO_MAS_BUSCADAS, imagenPinCategoriaMoto } from '../data/categoriasProductoMoto';
import { getUserAvatarUrl } from '../utils/userAvatar';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO } from '../utils/verticalVehiculo';
import { BusquedaRepuestos } from './BusquedaRepuestos';
import { VendedoresCercaDeMi } from './VendedoresCercaDeMi';
import { ListaRepuestosPorCategoria } from './ListaRepuestosPorCategoria';
import { IconoCategoria } from './IconosCategorias';
import imgBaterias from '../assets/categoria-baterias.png';
import imgCauchos from '../assets/categoria-cauchos.png';
import imgAmortiguadores from '../assets/categoria-amortiguadores.png';
import imgCorreasBandas from '../assets/categoria-correas-bandas.png';
import imgBujiasEncendido from '../assets/categoria-bujias-encendido.png';
import imgLucesFaros from '../assets/categoria-luces-faros.png';
import { BusquedaTalleres } from './BusquedaTalleres';
import './Landing.css';

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
const HERO_IMAGENES_AUTO = [
  '/header-banner.png?v=3',
  '/header-banner-2.png?v=3',
  '/header-banner-3.png?v=3',
  '/header-banner-4.png?v=3',
];
/** Banners solo para /motos — archivos en `public/` (sube ?v= si cambias las imágenes). */
const HERO_IMAGENES_MOTO = [
  '/header-banner-moto.png?v=2',
  '/header-banner-moto-2.png?v=2',
  '/header-banner-moto-3.png?v=2',
];

const CATEGORIAS_REPUESTOS = [
  { nombre: 'Filtros' },
  { nombre: 'Frenos' },
  { nombre: 'Baterías' },
  { nombre: 'Cauchos' },
  { nombre: 'Amortiguadores y suspensiones' },
  { nombre: 'Correas y bandas' },
  { nombre: 'Bujías y encendido' },
  { nombre: 'Aceites y lubricantes' },
  { nombre: 'Luces y faros' },
  { nombre: 'Embrague' },
  { nombre: 'Autosonido' },
  { nombre: 'Accesorios' },
];

export function Landing({
  vertical = VERTICAL_AUTO,
  onMostrarLogin,
  onMostrarCrearCuenta,
  sessionUser = null,
  onIrAPanel,
}: LandingProps) {
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

  const abrirPaginaBusquedaRepuestos = (texto: string) => {
    setBusquedaRepuestosMountKey((k) => k + 1);
    setVistaBusquedaRepuestos({ activa: true, texto });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cerrarPaginaBusquedaRepuestos = useCallback(() => {
    setVistaBusquedaRepuestos({ activa: false, texto: '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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

  const overlayLandingActivo =
    vistaBusquedaRepuestos.activa || Boolean(categoriaSeleccionada);

  useEffect(() => {
    if (!overlayLandingActivo) return;
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
    categoriaSeleccionada,
    vistaBusquedaRepuestos.activa,
    cerrarPaginaBusquedaRepuestos,
  ]);

  return (
    <div className={`landing${esMoto ? ' landing--moto' : ''}`}>
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
          )}
        </div>
      </header>

      <section className="landing-hero-banner">
        <div className="landing-hero-slides">
          {heroSlides.map((src, i) => (
            <div
              key={src}
              className={`landing-hero-slide ${i === slideIndex ? 'activo' : ''}`}
              style={{ backgroundImage: `url(${src})` }}
            />
          ))}
        </div>
        <div className="landing-hero-overlay" />
      </section>

      {!vistaBusquedaRepuestos.activa && (
        <BusquedaRepuestos
          vertical={vertical}
          variant="compact"
          onIrAResultados={({ texto }) => abrirPaginaBusquedaRepuestos(texto)}
        />
      )}

      <VendedoresCercaDeMi />

      <section className="landing-categorias">
        <h2 className="landing-seccion-titulo">
          {esMoto ? 'CATEGORÍAS MÁS BUSCADAS EN MOTOS' : 'CATEGORIAS MAS BUSCADAS EN AUTOMOVILES'}
        </h2>
        <div className="landing-categorias-grid">
          {(esMoto
            ? CATEGORIAS_MOTO_MAS_BUSCADAS.map((nombre) => ({ nombre }))
            : CATEGORIAS_REPUESTOS
          ).map((cat) => {
            const srcPinMoto = esMoto ? imagenPinCategoriaMoto(cat.nombre) : undefined;
            return (
            <button
              key={cat.nombre}
              type="button"
              className="landing-categoria-item"
              onClick={() => setCategoriaSeleccionada(cat.nombre)}
            >
              <div className="landing-categoria-circulo">
                {esMoto ? (
                  srcPinMoto ? (
                    <img
                      src={encodeURI(srcPinMoto)}
                      alt={cat.nombre}
                      className="landing-categoria-icono landing-categoria-icono-img landing-categoria-icono-moto"
                    />
                  ) : (
                    <IconoCategoria nombre={cat.nombre} className="landing-categoria-icono" />
                  )
                ) : cat.nombre === 'Filtros' ? (
                  <img
                    src="/categoria-filtros.png"
                    alt="Filtros"
                    className="landing-categoria-icono landing-categoria-icono-img"
                  />
                ) : cat.nombre === 'Frenos' ? (
                  <img
                    src="/categoria-frenos.png"
                    alt="Frenos"
                    className="landing-categoria-icono landing-categoria-icono-img"
                  />
                ) : cat.nombre === 'Baterías' ? (
                  <img
                    src={imgBaterias}
                    alt="Baterías"
                    className="landing-categoria-icono landing-categoria-icono-img"
                  />
                ) : cat.nombre === 'Cauchos' ? (
                  <img
                    src={imgCauchos}
                    alt="Cauchos"
                    className="landing-categoria-icono landing-categoria-icono-img"
                  />
                ) : cat.nombre === 'Amortiguadores y suspensiones' ? (
                  <img
                    src={imgAmortiguadores}
                    alt="Amortiguadores y suspensiones"
                    className="landing-categoria-icono landing-categoria-icono-img"
                  />
                ) : cat.nombre === 'Correas y bandas' ? (
                  <img
                    src={imgCorreasBandas}
                    alt="Correas y bandas"
                    className="landing-categoria-icono landing-categoria-icono-img"
                  />
                ) : cat.nombre === 'Bujías y encendido' ? (
                  <img
                    src={imgBujiasEncendido}
                    alt="Bujías y encendido"
                    className="landing-categoria-icono landing-categoria-icono-img"
                  />
                ) : cat.nombre === 'Luces y faros' ? (
                  <img
                    src={imgLucesFaros}
                    alt="Luces y faros"
                    className="landing-categoria-icono landing-categoria-icono-img"
                  />
                ) : cat.nombre === 'Embrague' ? (
                  <img
                    src="/categoria-embrague.png"
                    alt="Embrague"
                    className="landing-categoria-icono landing-categoria-icono-img"
                  />
                ) : cat.nombre === 'Aceites y lubricantes' ? (
                  <img
                    src="/categoria-aceites-lubricantes.png"
                    alt="Aceites y lubricantes"
                    className="landing-categoria-icono landing-categoria-icono-img"
                  />
                ) : cat.nombre === 'Autosonido' ? (
                  <img
                    src="/categoria-autosonido.png"
                    alt="Autosonido"
                    className="landing-categoria-icono landing-categoria-icono-img"
                  />
                ) : cat.nombre === 'Accesorios' ? (
                  <img
                    src="/categoria-accesorios.png"
                    alt="Accesorios"
                    className="landing-categoria-icono landing-categoria-icono-img"
                  />
                ) : (
                  <IconoCategoria nombre={cat.nombre} className="landing-categoria-icono" />
                )}
              </div>
              <span className="landing-categoria-nombre">{cat.nombre}</span>
            </button>
            );
          })}
        </div>
      </section>

      <section className="landing-taller">
        <h2 className="landing-seccion-titulo">ENCUENTRA EL TALLER QUE NECESITAS AQUI</h2>
        <div className="landing-taller-contenido">
          <img src="/taller.png" alt="Taller" className="landing-taller-imagen" />
          <div className="landing-taller-texto">
            <p>
              Porque sabemos que necesitas saber dónde puedes instalar ese repuesto que vas a comprar o hacer esa reparación que tu vehículo necesita, aquí te ofrecemos una lista de los talleres por categoría y ramo que se encuentran en tu ciudad, no dejes de consultarlo.
            </p>
            <BusquedaTalleres />
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
              <ListaRepuestosPorCategoria
                key={categoriaSeleccionada}
                vertical={vertical}
                categoria={categoriaSeleccionada}
                onCerrar={cerrarOverlayCategoria}
              />
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
              onVolver={cerrarPaginaBusquedaRepuestos}
            />
          </div>
        </div>
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
