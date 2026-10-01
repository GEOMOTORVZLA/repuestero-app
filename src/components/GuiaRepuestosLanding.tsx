import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  PIEZAS_GUIA_AUTO,
  PIEZAS_TOP15_AUTO,
  piezaGuiaPorId,
  sugerenciasDePieza,
  type PiezaGuiaAuto,
} from '../data/piezasGuiaAuto';
import {
  PIEZAS_GUIA_MOTO,
  PIEZAS_TOP15_MOTO,
  piezaGuiaMotoPorId,
  sugerenciasDePiezaMoto,
} from '../data/piezasGuiaMoto';
import { MARCAS_MODELOS, ANOS } from '../data/marcasModelos';
import { MARCAS_MODELOS_MOTO } from '../data/marcasMotos';
import {
  buscarProductoMasCercanoPorPieza,
  buscarProductosGuiaLibre,
  buscarProductosPorPiezaGuia,
  ordenarProductosPorCercania,
  RESULTADOS_GUIA_MIN,
  resolverPiezaDesdeTexto,
  type FiltroVehiculoGuia,
  type ProductoGuia,
} from '../services/consultaPiezasGuia';
import { registrarEventoContacto } from '../services/eventoContactoFlujo';
import {
  registrarContactoProducto,
  usuarioDebeRegistrarHistorialContactos,
} from '../services/historialContactosProducto';
import { MapVendedorUbicacion } from './MapaVendedorUbicacion';
import { TarjetaProductoBusqueda } from './TarjetaProductoBusqueda';
import { TarjetaGuiaMini } from './TarjetaGuiaMini';
import {
  MENSAJE_AVISO_NAVEGACION_MAPS_TIENDA,
  TEXTO_ENLACE_NAVEGACION_GOOGLE_MAPS,
} from '../constants/googleMapsNavUi';
import { abrirNavegacionGoogleMapsDesdeAqui, urlGoogleMapsDirSoloDestino } from '../utils/googleMapsNavegar';
import { mensajeWhatsappVendedorProducto, urlWhatsAppGeomotor } from '../utils/linkWhatsAppGeomotor';
import { VERTICAL_MOTO, type VerticalVehiculo } from '../utils/verticalVehiculo';
import './GuiaRepuestosLanding.css';
import './BusquedaRepuestos.css';

type RelacionadoUi = { pieza: PiezaGuiaAuto; producto: ProductoGuia | null };
type CeldaTop15 = { pieza: PiezaGuiaAuto; producto: ProductoGuia | null };

function nombreTienda(p: ProductoGuia): string {
  return p.tiendas?.nombre_comercial || p.tiendas?.nombre || 'Vendedor';
}

function tieneUbicacion(p: ProductoGuia): boolean {
  const t = p.tiendas;
  return Boolean(t && t.latitud != null && t.longitud != null);
}

export function GuiaRepuestosLanding({
  vertical,
  onCapaActiva,
}: {
  vertical: VerticalVehiculo;
  onCapaActiva?: (activa: boolean) => void;
}) {
  return <GuiaRepuestosVertical vertical={vertical} onCapaActiva={onCapaActiva} />;
}

function GuiaRepuestosVertical({
  vertical,
  onCapaActiva,
}: {
  vertical: VerticalVehiculo;
  onCapaActiva?: (activa: boolean) => void;
}) {
  const { user } = useAuth();
  const esMoto = vertical === VERTICAL_MOTO;
  const catalogo = esMoto ? PIEZAS_GUIA_MOTO : PIEZAS_GUIA_AUTO;
  const top15 = esMoto ? PIEZAS_TOP15_MOTO : PIEZAS_TOP15_AUTO;
  const lookupPieza = esMoto ? piezaGuiaMotoPorId : piezaGuiaPorId;
  const sugerir = esMoto ? sugerenciasDePiezaMoto : sugerenciasDePieza;
  const mapaMarcas = esMoto ? MARCAS_MODELOS_MOTO : MARCAS_MODELOS;
  const marcas = useMemo(
    () => Object.keys(mapaMarcas).sort((a, b) => a.localeCompare(b, 'es')),
    [mapaMarcas]
  );
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [anio, setAnio] = useState<string>('');
  const modelos = marca ? mapaMarcas[marca] ?? [] : [];

  const [piezaId, setPiezaId] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ProductoGuia[]>([]);
  const [relacionados, setRelacionados] = useState<RelacionadoUi[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoVacio, setAvisoVacio] = useState<string | null>(null);
  const [ficha, setFicha] = useState<ProductoGuia | null>(null);
  const [contactar, setContactar] = useState<ProductoGuia | null>(null);
  const [etiquetaActiva, setEtiquetaActiva] = useState<string>('');
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [vitrinaTop15, setVitrinaTop15] = useState<CeldaTop15[]>([]);
  const [cargandoVitrina, setCargandoVitrina] = useState(false);
  const [cargandoRelacionados, setCargandoRelacionados] = useState(false);

  const topCercanos = (lista: ProductoGuia[]) =>
    ordenarProductosPorCercania(lista, userLoc).slice(0, RESULTADOS_GUIA_MIN);

  const vehiculoListo = Boolean(marca.trim() && (modelos.length === 0 || modelo.trim()));

  const vehiculo = useMemo<FiltroVehiculoGuia>(
    () => ({
      marca: marca.trim(),
      modelo: modelo.trim(),
      anio: anio ? Number(anio) : null,
    }),
    [marca, modelo, anio]
  );

  const cargarRelacionados = useCallback(async (origenId: string, v: FiltroVehiculoGuia) => {
    const sug = sugerir(origenId);
    if (sug.length === 0) {
      setRelacionados([]);
      setCargandoRelacionados(false);
      return;
    }
    setCargandoRelacionados(true);
    const bloques = (
      await Promise.all(
        sug.map(async (s) => {
          const pieza = lookupPieza(s.piezaId);
          if (!pieza) return null;
          const { producto } = await buscarProductoMasCercanoPorPieza({
            pieza,
            vehiculo: v,
            userLoc,
            vertical,
          });
          return { pieza, producto } satisfies RelacionadoUi;
        })
      )
    ).filter((b): b is RelacionadoUi => b != null);
    setRelacionados(bloques);
    setCargandoRelacionados(false);
  }, [userLoc, sugerir, lookupPieza, vertical]);

  const ejecutarPieza = useCallback(
    async (pieza: PiezaGuiaAuto, v: FiltroVehiculoGuia) => {
      setCargando(true);
      setError(null);
      setAvisoVacio(null);
      setRelacionados([]);
      const { filas, error: err } = await buscarProductosPorPiezaGuia({
        pieza,
        vehiculo: v,
        offset: 0,
        vertical,
      });
      setCargando(false);
      if (err) {
        setError(err);
        setResultados([]);
        return;
      }
      setResultados(topCercanos(filas));
      setEtiquetaActiva(pieza.etiqueta);
      if (filas.length === 0) {
        setAvisoVacio(`Nadie tiene publicado «${pieza.etiqueta}» para ${v.marca} ${v.modelo} todavía.`);
      }
      void cargarRelacionados(pieza.id, v);
    },
    [cargarRelacionados, userLoc, vertical]
  );

  const onElegirPieza = (pieza: PiezaGuiaAuto) => {
    if (!vehiculoListo) {
      setAvisoVacio(`Elige primero marca${modelos.length ? ' y modelo' : ''} ${esMoto ? 'de la moto' : 'del vehículo'}.`);
      return;
    }
    setPiezaId(pieza.id);
    setTexto(pieza.etiqueta);
    void ejecutarPieza(pieza, vehiculo);
  };

  const onBuscarTexto = () => {
    if (!vehiculoListo) {
      setAvisoVacio(`Elige primero marca${modelos.length ? ' y modelo' : ''} ${esMoto ? 'de la moto' : 'del vehículo'}.`);
      return;
    }
    const t = texto.trim();
    if (t.length < 2) {
      setAvisoVacio('Escribe el nombre de la pieza o pulsa el tipo en los 15 más reemplazados.');
      return;
    }
    const pieza = resolverPiezaDesdeTexto(t, catalogo);
    if (pieza) {
      setPiezaId(pieza.id);
      void ejecutarPieza(pieza, vehiculo);
      return;
    }
    setPiezaId(null);
    setCargando(true);
    setError(null);
    setRelacionados([]);
    void (async () => {
      const { filas, error: err } = await buscarProductosGuiaLibre({
        texto: t,
        vehiculo,
        offset: 0,
        vertical,
      });
      setCargando(false);
      if (err) {
        setError(err);
        setResultados([]);
        return;
      }
      setResultados(topCercanos(filas));
      setEtiquetaActiva(t);
      if (filas.length === 0) {
        setAvisoVacio(`No hay publicados que coincidan con «${t}» para ${vehiculo.marca} ${vehiculo.modelo}.`);
      } else {
        setAvisoVacio(null);
      }
    })();
  };

  useEffect(() => {
    setModelo('');
  }, [marca]);

  useEffect(() => {
    onCapaActiva?.(panelAbierto);
    return () => onCapaActiva?.(false);
  }, [panelAbierto, onCapaActiva]);

  useEffect(() => {
    if (!panelAbierto) return;
    const y = window.scrollY;
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
    };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = '-' + y + 'px';
    body.style.width = '100%';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || contactar) return;
      setPanelAbierto(false);
    };
    window.addEventListener('keydown', onKey);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      window.scrollTo(0, y);
      window.removeEventListener('keydown', onKey);
    };
  }, [panelAbierto, contactar]);

  useEffect(() => {
    if (!userLoc) return;
    setResultados((prev) => topCercanos(prev));
    setRelacionados((prev) =>
      prev.map((bl) =>
        bl.producto
          ? { ...bl, producto: ordenarProductosPorCercania([bl.producto], userLoc)[0] ?? bl.producto }
          : bl
      )
    );
  }, [userLoc]);

  useEffect(() => {
    if (!panelAbierto || !vehiculoListo) {
      setVitrinaTop15([]);
      setCargandoVitrina(false);
      return;
    }
    let cancelado = false;
    setCargandoVitrina(true);
    void (async () => {
      const celdas = await Promise.all(
        top15.map(async (pieza) => {
          const { producto } = await buscarProductoMasCercanoPorPieza({
            pieza,
            vehiculo,
            userLoc,
            vertical,
          });
          return { pieza, producto };
        })
      );
      if (cancelado) return;
      setVitrinaTop15(celdas);
      setCargandoVitrina(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [panelAbierto, vehiculoListo, vehiculo, userLoc, top15, vertical]);


  const abrirContactar = (p: ProductoGuia) => {
    setContactar(p);
    registrarEventoContacto({
      tipo: 'contactar_modal',
      origen: 'guia_repuestos',
      productoId: p.id,
    });
    if (!user) return;
    void (async () => {
      const debe = await usuarioDebeRegistrarHistorialContactos(supabase, user);
      if (!debe) return;
      await registrarContactoProducto(
        supabase,
        user.id,
        { id: p.id, nombre: p.nombre, precio_usd: p.precio_usd, moneda: p.moneda },
        nombreTienda(p)
      );
    })();
  };

  useEffect(() => {
    if (!contactar) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContactar(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [contactar]);

  return (
    <>
      <section className="guia-repuestos guia-repuestos--cta" aria-label="Busqueda personalizada inteligente">
        <button
          type="button"
          className="guia-repuestos-cta-btn"
          onClick={() => setPanelAbierto(true)}
        >
          BUSQUEDA PERSONALIZADA INTELIGENTE
        </button>
      </section>

      {panelAbierto && (
        <div className="guia-repuestos-overlay" role="dialog" aria-modal="true" aria-labelledby="guia-overlay-titulo">
          <div className="guia-repuestos-overlay-panel">
            <div className="guia-repuestos-overlay-bar">
              <h2 id="guia-overlay-titulo" className="guia-repuestos-overlay-titulo">
                BUSQUEDA PERSONALIZADA INTELIGENTE
              </h2>
              <button
                type="button"
                className="guia-repuestos-volver guia-repuestos-volver--barra"
                onClick={() => setPanelAbierto(false)}
              >
                ← Volver al inicio
              </button>
            </div>
            <div className="guia-repuestos-overlay-body">
              <p className="guia-repuestos-intro">
                Indica tu vehiculo y el repuesto. Mostramos primero a los vendedores mas cercanos (si autorizas la ubicacion).
              </p>
              <div className="guia-repuestos-filtros">
                <label className="guia-repuestos-campo">
                  <span>Marca</span>
                  <select value={marca} onChange={(e) => setMarca(e.target.value)} aria-label="Marca del vehiculo">
                    <option value="">Selecciona</option>
                    {marcas.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="guia-repuestos-campo">
                  <span>Modelo</span>
                  <select value={modelo} onChange={(e) => setModelo(e.target.value)} disabled={!marca} aria-label="Modelo del vehiculo">
                    <option value="">Selecciona</option>
                    {modelos.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="guia-repuestos-campo">
                  <span>Año (opcional)</span>
                  <select value={anio} onChange={(e) => setAnio(e.target.value)} aria-label="Año del vehiculo">
                    <option value="">Cualquiera</option>
                    {ANOS.map((y) => (
                      <option key={y} value={String(y)}>{y}</option>
                    ))}
                  </select>
                </label>
              </div>
              <form
                className="guia-repuestos-busca"
                onSubmit={(e) => {
                  e.preventDefault();
                  onBuscarTexto();
                }}
              >
                <label className="guia-repuestos-campo guia-repuestos-campo--crece">
                  <span>Repuesto que buscas</span>
                  <input
                    type="search"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder={esMoto ? 'Ej. kit de arrastre, pastillas, bujía' : 'Ej. pastillas, bomba de agua, kit de tiempo'}
                    autoComplete="off"
                  />
                </label>
                <button type="submit" className="guia-repuestos-btn">Buscar</button>
              </form>
              {error && <p className="guia-repuestos-aviso guia-repuestos-aviso--error">{error}</p>}
              {avisoVacio && !cargando && <p className="guia-repuestos-aviso">{avisoVacio}</p>}
              {cargando && <p className="guia-repuestos-aviso">Buscando publicaciones…</p>}
              {resultados.length > 0 && (
                <div className="guia-repuestos-bloque">
                  <h3 className="guia-repuestos-subtitulo">
                    Resultados{etiquetaActiva ? ': ' + etiquetaActiva : ''}
                    {userLoc ? ' (mas cercanos primero)' : ''}
                  </h3>
                  <p className="guia-repuestos-cupo">Hasta 5 vendedores más cercanos</p>
                  <div className="guia-mini-lista">
                    {resultados.map((p) => (
                      <TarjetaGuiaMini key={p.id} producto={p} vertical={vertical} onAbrir={setFicha} />
                    ))}
                  </div>
                </div>
              )}
{((piezaId && sugerir(piezaId).length > 0) || relacionados.length > 0 || cargandoRelacionados) && (
                <div className="guia-repuestos-bloque">
                  <h3 className="guia-repuestos-subtitulo">Repuestos relacionados a tu búsqueda</h3>
                  {cargandoRelacionados && (
                    <p className="guia-repuestos-aviso">Buscando relacionados…</p>
                  )}
                  {!cargandoRelacionados && (
                    <div className="guia-mini-lista">
                      {relacionados.map((bl) => (
                        <div key={bl.pieza.id} className="guia-repuestos-rel">
                          <h4 className="guia-repuestos-rel-titulo">{bl.pieza.etiqueta}</h4>
                          {bl.producto ? (
                            <TarjetaGuiaMini producto={bl.producto} vertical={vertical} onAbrir={setFicha} />
                          ) : (
                            <p className="guia-top15-vacio">{esMoto ? 'Sin publicación para esta moto' : 'Sin publicación para este vehículo'}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="guia-repuestos-bloque">
                <h3 className="guia-repuestos-subtitulo">Los 15 más reemplazados</h3>
                {!vehiculoListo && (
                  <p className="guia-repuestos-cupo">
                    {esMoto ? 'Elige marca (y modelo si está listado): se muestra un repuesto cercano de cada tipo.' : 'Elige marca y modelo: se muestra un repuesto cercano de cada tipo.'}
                  </p>
                )}
                {vehiculoListo && cargandoVitrina && (
                  <p className="guia-repuestos-aviso">Buscando un repuesto cercano de cada tipo…</p>
                )}
                {vehiculoListo && !cargandoVitrina && (
                  <div className="guia-top15-mosaico">
                    {vitrinaTop15.map(({ pieza, producto }) => (
                      <article key={pieza.id} className="guia-top15-celda">
                        <button
                          type="button"
                          className={'guia-top15-tipo' + (piezaId === pieza.id ? ' guia-top15-tipo--activo' : '')}
                          onClick={() => onElegirPieza(pieza)}
                        >
                          {pieza.etiqueta}
                        </button>
                        {producto ? (
                          <TarjetaGuiaMini
                            producto={producto}
                            vertical={vertical}
                            onAbrir={(p) => {
                              onElegirPieza(pieza);
                              setFicha(p);
                            }}
                          />
                        ) : (
                          <p className="guia-top15-vacio">{esMoto ? 'Sin publicación para esta moto' : 'Sin publicación para este vehículo'}</p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}


      {ficha && (
        <div
          className="guia-repuestos-ficha-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guia-ficha-titulo"
          onClick={() => setFicha(null)}
        >
          <div className="guia-repuestos-ficha-panel" onClick={(e) => e.stopPropagation()}>
            <div className="guia-repuestos-ficha-bar">
              <button type="button" className="guia-repuestos-volver" onClick={() => setFicha(null)}>
                ← Volver a la búsqueda
              </button>
              <h3 id="guia-ficha-titulo" className="guia-repuestos-ficha-titulo-sr">Detalle del repuesto</h3>
            </div>
            <div className="guia-repuestos-ficha-body">
              <TarjetaProductoBusqueda
                producto={ficha}
                vertical={vertical}
                expandida
                ocultarContraer
                onExpand={() => undefined}
                onContraer={() => setFicha(null)}
                onContactar={(prod) => {
                  abrirContactar(prod);
                }}
              />
              {((piezaId && sugerir(piezaId).length > 0) || relacionados.length > 0 || cargandoRelacionados) && (
                <div className="guia-repuestos-bloque guia-repuestos-bloque--ficha">
                  <h3 className="guia-repuestos-subtitulo">Repuestos relacionados a tu búsqueda</h3>
                  {cargandoRelacionados && (
                    <p className="guia-repuestos-aviso">Buscando relacionados…</p>
                  )}
                  {!cargandoRelacionados && (
                    <div className="guia-mini-lista">
                      {relacionados.map((bl) => (
                        <div key={bl.pieza.id} className="guia-repuestos-rel">
                          <h4 className="guia-repuestos-rel-titulo">{bl.pieza.etiqueta}</h4>
                          {bl.producto ? (
                            <TarjetaGuiaMini producto={bl.producto} vertical={vertical} onAbrir={setFicha} />
                          ) : (
                            <p className="guia-top15-vacio">{esMoto ? 'Sin publicación para esta moto' : 'Sin publicación para este vehículo'}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button type="button" className="guia-repuestos-volver guia-repuestos-volver--abajo" onClick={() => setFicha(null)}>
                ← Volver a la búsqueda
              </button>
            </div>
          </div>
        </div>
      )}

      {contactar && (
        <div
          className="busqueda-repuestos-modal-overlay busqueda-repuestos-modal-overlay--detalle"
          onClick={() => setContactar(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-contactar-guia-titulo"
        >
          <div
            className={`busqueda-repuestos-modal busqueda-repuestos-modal--panel ${tieneUbicacion(contactar) ? 'busqueda-repuestos-modal-con-mapa' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="busqueda-repuestos-modal-header-bar">
              <h3 id="modal-contactar-guia-titulo" className="busqueda-repuestos-modal-header-titulo">
                Datos del vendedor
              </h3>
              <button
                type="button"
                className="busqueda-repuestos-modal-cerrar-x"
                onClick={() => setContactar(null)}
                aria-label="Cerrar ventana"
              >
                Cerrar
              </button>
            </div>
            <div className="busqueda-repuestos-modal-body-scroll">
              {contactar.tiendas && (
                <div className="busqueda-repuestos-modal-datos">
                  <p className="busqueda-repuestos-modal-linea">
                    <span className="busqueda-repuestos-modal-etiqueta">Nombre comercial</span>
                    <span className="busqueda-repuestos-modal-valor-negrita">{nombreTienda(contactar)}</span>
                  </p>
                  {contactar.tiendas.telefono && (
                    <p className="busqueda-repuestos-modal-linea">
                      <span className="busqueda-repuestos-modal-etiqueta">Teléfono</span> {contactar.tiendas.telefono}
                    </p>
                  )}
                  {contactar.tiendas.direccion && (
                    <p className="busqueda-repuestos-modal-linea">
                      <span className="busqueda-repuestos-modal-etiqueta">Dirección</span> {contactar.tiendas.direccion}
                    </p>
                  )}
                </div>
              )}
              <div className="busqueda-repuestos-modal-producto-box">
                <h4 className="busqueda-repuestos-modal-titulo-seccion">Producto seleccionado</h4>
                <p className="busqueda-repuestos-modal-repuesto">{contactar.nombre}</p>
                {((contactar.comentarios ?? contactar.descripcion) || '') && (
                  <p className="busqueda-repuestos-modal-comentarios">
                    {contactar.comentarios ?? contactar.descripcion}
                  </p>
                )}
              </div>
              {contactar.tiendas?.latitud != null && contactar.tiendas?.longitud != null && (
                <>
                  <h4 className="busqueda-repuestos-modal-titulo-seccion">Ubicación</h4>
                  <MapVendedorUbicacion
                    lat={contactar.tiendas.latitud}
                    lng={contactar.tiendas.longitud}
                    nombreVendedor={nombreTienda(contactar)}
                  />
                </>
              )}
              <div className="busqueda-repuestos-modal-botones">
                {contactar.tiendas?.telefono ? (
                  <a
                    href={
                      urlWhatsAppGeomotor(
                        contactar.tiendas.telefono,
                        mensajeWhatsappVendedorProducto(contactar.nombre)
                      )!
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="busqueda-repuestos-modal-whatsapp"
                    onClick={() =>
                      registrarEventoContacto({
                        tipo: 'whatsapp',
                        origen: 'guia_repuestos',
                        productoId: contactar.id,
                      })
                    }
                  >
                    Contactar por WhatsApp
                  </a>
                ) : (
                  <p className="busqueda-repuestos-modal-sin-contacto">Sin teléfono registrado.</p>
                )}
              </div>
              {contactar.tiendas?.latitud != null && contactar.tiendas?.longitud != null && (
                <div className="vendedores-cerca-modal-ruta">
                  <p className="maps-nav-aviso-confirmacion" role="note">
                    {MENSAJE_AVISO_NAVEGACION_MAPS_TIENDA}
                  </p>
                  <a
                    href={urlGoogleMapsDirSoloDestino(
                      contactar.tiendas.latitud,
                      contactar.tiendas.longitud
                    )}
                    className="vendedores-cerca-modal-ruta-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      abrirNavegacionGoogleMapsDesdeAqui(
                        contactar.tiendas!.latitud!,
                        contactar.tiendas!.longitud!
                      );
                    }}
                  >
                    {TEXTO_ENLACE_NAVEGACION_GOOGLE_MAPS}
                  </a>
                </div>
              )}
              <button type="button" className="busqueda-repuestos-modal-cerrar" onClick={() => setContactar(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
