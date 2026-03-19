import { useState, useEffect } from 'react';
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
  onMostrarLogin: () => void;
  onMostrarCrearCuenta: () => void;
}

// ?v=2 obliga al navegador a cargar la imagen nueva (sube v=3, v=4… al cambiar el banner)
const HERO_IMAGENES = ['/header-banner.png?v=2', '/header-banner-2.png?v=2'];

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

export function Landing({ onMostrarLogin, onMostrarCrearCuenta }: LandingProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setSlideIndex((i) => (i + 1) % HERO_IMAGENES.length);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="landing">
      <header className="landing-header">
        <h1 className="landing-logo">Geomotor</h1>
        <div className="landing-header-botones">
          <button type="button" className="landing-btn-login" onClick={onMostrarLogin}>
            Iniciar sesión
          </button>
          <button type="button" className="landing-btn-crear" onClick={onMostrarCrearCuenta}>
            Crear cuenta
          </button>
        </div>
      </header>

      <section className="landing-hero-banner">
        <div className="landing-hero-slides">
          {HERO_IMAGENES.map((src, i) => (
            <div
              key={src}
              className={`landing-hero-slide ${i === slideIndex ? 'activo' : ''}`}
              style={{ backgroundImage: `url(${src})` }}
            />
          ))}
        </div>
        <div className="landing-hero-overlay" />
      </section>

      <BusquedaRepuestos />

      <VendedoresCercaDeMi />

      <section className="landing-categorias">
        <h2 className="landing-seccion-titulo">Categorías más buscadas</h2>
        <div className="landing-categorias-grid">
          {CATEGORIAS_REPUESTOS.map((cat) => (
            <button
              key={cat.nombre}
              type="button"
              className="landing-categoria-item"
              onClick={() => setCategoriaSeleccionada(cat.nombre)}
            >
              <div className="landing-categoria-circulo">
                {cat.nombre === 'Filtros' ? (
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
          ))}
        </div>
        {categoriaSeleccionada && (
          <ListaRepuestosPorCategoria
            categoria={categoriaSeleccionada}
            onCerrar={() => setCategoriaSeleccionada(null)}
          />
        )}
      </section>

      <section className="landing-taller">
        <h2 className="landing-seccion-titulo">Encuentra el taller que necesitas aquí</h2>
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
              Geomotor es la plataforma de localización de repuestos automotrices en Venezuela. Conectamos a vendedores, compradores y talleres para facilitar la búsqueda y venta de repuestos por marca, modelo y año.
            </p>
          </div>
          <div className="landing-empresa-col landing-empresa-contacto">
            <h3>Datos de contacto</h3>
            <div className="landing-empresa-datos">
              <div className="landing-empresa-item">
                <span className="landing-empresa-label">Teléfono:</span>
                <a href="tel:+584121234567">+58 412 123 4567</a>
              </div>
              <div className="landing-empresa-item">
                <span className="landing-empresa-label">WhatsApp:</span>
                <a href="https://wa.me/584121234567" target="_blank" rel="noopener noreferrer">+58 412 123 4567</a>
              </div>
              <div className="landing-empresa-item">
                <span className="landing-empresa-label">Email:</span>
                <a href="mailto:contacto@geomotor.com">contacto@geomotor.com</a>
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
              <a href="https://instagram.com/geomotor" target="_blank" rel="noopener noreferrer" className="landing-empresa-red" aria-label="Instagram">
                Instagram
              </a>
              <a href="https://facebook.com/geomotor" target="_blank" rel="noopener noreferrer" className="landing-empresa-red" aria-label="Facebook">
                Facebook
              </a>
              <a href="https://twitter.com/geomotor" target="_blank" rel="noopener noreferrer" className="landing-empresa-red" aria-label="Twitter/X">
                Twitter / X
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <p>© Geomotor</p>
        <button type="button" className="landing-footer-link" onClick={onMostrarLogin}>
          Iniciar sesión
        </button>
      </footer>
    </div>
  );
}
