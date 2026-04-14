import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  registrarContactoProducto,
  usuarioDebeRegistrarHistorialContactos,
} from '../services/historialContactosProducto';
import { MARCAS_MODELOS, ANOS } from '../data/marcasModelos';
import { MARCAS_VEHICULOS } from '../data/marcasVehiculos';
import { MARCAS_MOTOS, getModelosPorMarcaMoto } from '../data/marcasMotos';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO } from '../utils/verticalVehiculo';
import { MapVendedorUbicacion } from './MapaVendedorUbicacion';
import { TarjetaProductoBusqueda } from './TarjetaProductoBusqueda';
import {
  MENSAJE_AVISO_NAVEGACION_MAPS_TIENDA,
  TEXTO_ENLACE_NAVEGACION_GOOGLE_MAPS,
} from '../constants/googleMapsNavUi';
import { abrirNavegacionGoogleMapsDesdeAqui, urlGoogleMapsDirSoloDestino } from '../utils/googleMapsNavegar';
import { mensajeWhatsappVendedorProducto, urlWhatsAppGeomotor } from '../utils/linkWhatsAppGeomotor';
import './BusquedaRepuestos.css';

/** Distancia en km entre dos puntos (Haversine) */
function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface TiendaContacto {
  nombre_comercial: string | null;
  nombre: string | null;
  rif: string | null;
  telefono: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  metodos_pago: string[] | null;
}

interface ProductoResultado {
  id: string;
  nombre: string;
  descripcion: string | null;
  comentarios: string | null;
  precio_usd: number;
  moneda: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  imagen_url: string | null;
  imagenes_extra: string[] | null;
  tiendas: TiendaContacto | null;
}

/** Tamaño de página en listados públicos (se pide una fila extra para saber si hay más). */
const PAGE_SIZE_RESULTADOS_PUBLICOS = 24;

type ParamsBusquedaProductos = {
  texto: string;
  marca: string;
  modelo: string;
  anio: string;
};

function ordenarPorUbicacionUsuario(
  lista: ProductoResultado[],
  u: { lat: number; lng: number }
): ProductoResultado[] {
  return [...lista].sort((a, b) => {
    const hasA = a.tiendas?.latitud != null && a.tiendas?.longitud != null;
    const hasB = b.tiendas?.latitud != null && b.tiendas?.longitud != null;
    if (!hasA && !hasB) return 0;
    if (!hasA) return 1;
    if (!hasB) return -1;
    const dA = distanciaKm(u.lat, u.lng, a.tiendas!.latitud!, a.tiendas!.longitud!);
    const dB = distanciaKm(u.lat, u.lng, b.tiendas!.latitud!, b.tiendas!.longitud!);
    return dA - dB;
  });
}

type SugerenciaRepuesto = { nombre: string; detalle: string | null };

function resaltarCoincidencia(texto: string, consulta: string) {
  const q = consulta.trim();
  if (!q) return texto;
  const lower = texto.toLowerCase();
  const i = lower.indexOf(q.toLowerCase());
  if (i === -1) return texto;
  return (
    <>
      {texto.slice(0, i)}
      <mark className="busqueda-repuestos-sugerencia-match">{texto.slice(i, i + q.length)}</mark>
      {texto.slice(i + q.length)}
    </>
  );
}

export type BusquedaRepuestosVariant = 'compact' | 'full';

export interface BusquedaRepuestosProps {
  /** compact = solo caja de búsqueda (landing); full = filtros + resultados + modales */
  variant?: BusquedaRepuestosVariant;
  /** Catálogo y consultas: automóvil o moto */
  vertical?: VerticalVehiculo;
  /** Al pulsar Enter o elegir sugerencia en modo compacto */
  onIrAResultados?: (payload: { texto: string }) => void;
  /** Texto inicial al abrir la página de resultados */
  initialTexto?: string;
  /** Botón volver (página de resultados) */
  onVolver?: () => void;
}

export function BusquedaRepuestos({
  variant = 'full',
  vertical = VERTICAL_AUTO,
  onIrAResultados,
  initialTexto = '',
  onVolver,
}: BusquedaRepuestosProps) {
  const { user } = useAuth();
  const esCompacto = variant === 'compact';
  const esMoto = vertical === 'moto';
  const marcasOpciones = esMoto ? [...MARCAS_MOTOS] : [...MARCAS_VEHICULOS];
  const wrapTextoRef = useRef<HTMLDivElement>(null);
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [anio, setAnio] = useState('');
  const [sugerencias, setSugerencias] = useState<SugerenciaRepuesto[]>([]);
  const [dropdownAbierto, setDropdownAbierto] = useState(false);
  const [indiceSugerencia, setIndiceSugerencia] = useState(-1);
  const [resultados, setResultados] = useState<ProductoResultado[]>([]);
  const resultadosRef = useRef(resultados);
  resultadosRef.current = resultados;
  const [buscando, setBuscando] = useState(false);
  const [hayMasResultados, setHayMasResultados] = useState(false);
  const [cargandoMasResultados, setCargandoMasResultados] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const paramsUltimaBusquedaRef = useRef<ParamsBusquedaProductos | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(true);
  /** En página completa: texto introductorio bajo el título; se oculta al ejecutar una búsqueda válida */
  const [mostrarIntroBusquedaPagina, setMostrarIntroBusquedaPagina] = useState(true);

  const modelosOpciones = marca
    ? esMoto
      ? getModelosPorMarcaMoto(marca)
      : MARCAS_MODELOS[marca] ?? []
    : [];

  useEffect(() => {
    if (!esCompacto && resultados.length > 0) {
      setSugerencias([]);
      setDropdownAbierto(false);
      setIndiceSugerencia(-1);
      return;
    }

    const texto = textoBusqueda.trim();
    if (texto.length < 2) {
      setSugerencias([]);
      setDropdownAbierto(false);
      setIndiceSugerencia(-1);
      return;
    }

    const t = setTimeout(() => {
      void (async () => {
        const like = `%${texto}%`;
        const { data, error } = await supabase
          .from('productos')
          .select('nombre, marca, modelo')
          .eq('activo', true)
          .eq('aprobacion_publica', 'aprobado')
          .eq('vertical', vertical)
          .or(`nombre.ilike.${like},descripcion.ilike.${like},comentarios.ilike.${like}`)
          .order('nombre')
          .limit(24);

        if (error) return;
        if (!esCompacto && resultadosRef.current.length > 0) return;

        const vistos = new Set<string>();
        const lista: SugerenciaRepuesto[] = [];
        for (const row of data ?? []) {
          const n = typeof row.nombre === 'string' ? row.nombre.trim() : '';
          if (!n || vistos.has(n)) continue;
          vistos.add(n);
          const detalle = [row.marca, row.modelo].filter(Boolean).join(' · ') || null;
          lista.push({ nombre: n, detalle });
          if (lista.length >= 8) break;
        }
        setSugerencias(lista);
        setIndiceSugerencia(-1);
        if (lista.length) setDropdownAbierto(true);
      })();
    }, 220);

    return () => clearTimeout(t);
  }, [textoBusqueda, vertical, esCompacto, resultados.length]);

  useEffect(() => {
    const cerrar = (e: MouseEvent) => {
      if (wrapTextoRef.current && !wrapTextoRef.current.contains(e.target as Node)) {
        setDropdownAbierto(false);
      }
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, []);

  useEffect(() => {
    if (resultados.length > 0) {
      setFiltrosAbiertos(false);
    } else {
      setFiltrosAbiertos(true);
    }
  }, [resultados.length]);

  const seleccionarSugerencia = (s: SugerenciaRepuesto) => {
    setTextoBusqueda(s.nombre);
    setDropdownAbierto(false);
    setIndiceSugerencia(-1);
  };

  const armarQueryListaProductos = (p: ParamsBusquedaProductos) => {
    let query = supabase
      .from('productos')
      .select(`
        id,
        activo,
        nombre,
        descripcion,
        comentarios,
        precio_usd,
        moneda,
        marca,
        modelo,
        anio,
        imagen_url,
        imagenes_extra,
        tiendas ( nombre_comercial, nombre, rif, telefono, direccion, latitud, longitud, metodos_pago )
      `)
      .eq('activo', true)
      .eq('aprobacion_publica', 'aprobado')
      .eq('vertical', vertical);

    if (p.texto) {
      const like = `%${p.texto}%`;
      query = query.or(
        `nombre.ilike.${like},descripcion.ilike.${like},comentarios.ilike.${like},marca.ilike.${like},modelo.ilike.${like},categoria.ilike.${like}`
      );
    }

    if (p.marca) query = query.eq('marca', p.marca);
    if (p.modelo) query = query.eq('modelo', p.modelo);
    if (p.anio) query = query.eq('anio', parseInt(p.anio, 10));

    return query.order('nombre').order('id');
  };

  const solicitarUbicacionActual = async (): Promise<{ lat: number; lng: number } | null> => {
    if (!navigator.geolocation) return null;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const buscar = async (textoOverride?: string) => {
    const texto = (textoOverride !== undefined ? textoOverride : textoBusqueda).trim();
    if (!texto && !marca.trim() && !modelo.trim() && !anio.trim()) {
      setMensaje('Escribe qué repuesto buscas o aplica al menos un filtro.');
      return;
    }

    if (textoOverride !== undefined) {
      setTextoBusqueda(textoOverride);
    }

    setMostrarIntroBusquedaPagina(false);
    setBuscando(true);
    setCargandoMasResultados(false);
    setMensaje('');
    setDropdownAbierto(false);
    setIndiceSugerencia(-1);
    setHayMasResultados(false);

    const params: ParamsBusquedaProductos = {
      texto,
      marca: marca.trim(),
      modelo: modelo.trim(),
      anio: anio.trim(),
    };

    let ubicacionActual = userLocation;
    if (!ubicacionActual) {
      ubicacionActual = await solicitarUbicacionActual();
      if (ubicacionActual) setUserLocation(ubicacionActual);
    }

    const query = armarQueryListaProductos(params);
    const { data, error } = await query.range(0, PAGE_SIZE_RESULTADOS_PUBLICOS);

    if (error) {
      setMensaje(error.message || 'Error al buscar.');
      setResultados([]);
      setBuscando(false);
      paramsUltimaBusquedaRef.current = null;
      setSugerencias([]);
      setDropdownAbierto(false);
      return;
    }

    const filas = (data as unknown as ProductoResultado[]) ?? [];
    const hayMas = filas.length > PAGE_SIZE_RESULTADOS_PUBLICOS;
    const primeraPagina = hayMas
      ? filas.slice(0, PAGE_SIZE_RESULTADOS_PUBLICOS)
      : filas;

    paramsUltimaBusquedaRef.current = params;
    setResultados(
      ubicacionActual ? ordenarPorUbicacionUsuario(primeraPagina, ubicacionActual) : primeraPagina
    );
    setHayMasResultados(hayMas);
    if (!primeraPagina.length) {
      setMensaje('No hay repuestos que coincidan con tu búsqueda.');
      paramsUltimaBusquedaRef.current = null;
    }
    setBuscando(false);
  };

  const cargarMasResultados = async () => {
    const params = paramsUltimaBusquedaRef.current;
    if (!params || !hayMasResultados || cargandoMasResultados || buscando) return;

    setCargandoMasResultados(true);
    setMensaje('');
    const offset = resultados.length;
    const { data, error } = await armarQueryListaProductos(params).range(
      offset,
      offset + PAGE_SIZE_RESULTADOS_PUBLICOS
    );

    if (error) {
      setMensaje(error.message || 'Error al cargar más resultados.');
      setCargandoMasResultados(false);
      return;
    }

    const filas = (data as unknown as ProductoResultado[]) ?? [];
    const hayMas = filas.length > PAGE_SIZE_RESULTADOS_PUBLICOS;
    const chunk = hayMas ? filas.slice(0, PAGE_SIZE_RESULTADOS_PUBLICOS) : filas;

    setResultados((prev) => {
      const merged = [...prev, ...chunk];
      return userLocation ? ordenarPorUbicacionUsuario(merged, userLocation) : merged;
    });
    setHayMasResultados(hayMas);
    setCargandoMasResultados(false);
  };

  /** Primera carga de la página de resultados con el texto que trae desde la landing */
  useEffect(() => {
    if (esCompacto) return;
    const t = initialTexto.trim();
    if (!t) return;
    void buscar(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intencional: ejecutar al abrir la vista con initialTexto
  }, [esCompacto, initialTexto]);

  const onTecladoTexto = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setDropdownAbierto(false);
      setIndiceSugerencia(-1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const desdeSugerencia =
        dropdownAbierto && indiceSugerencia >= 0 && sugerencias[indiceSugerencia]
          ? sugerencias[indiceSugerencia].nombre
          : null;
      const textoFinal = (desdeSugerencia ?? textoBusqueda).trim();
      if (!textoFinal) {
        setMensaje('Escribe qué repuesto buscas.');
        return;
      }
      setMensaje('');
      if (esCompacto) {
        onIrAResultados?.({ texto: textoFinal });
        return;
      }
      if (desdeSugerencia) void buscar(desdeSugerencia);
      else void buscar();
      return;
    }
    if (!sugerencias.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDropdownAbierto(true);
      setIndiceSugerencia((i) => (i < sugerencias.length - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDropdownAbierto(true);
      setIndiceSugerencia((i) => (i > 0 ? i - 1 : sugerencias.length - 1));
    }
  };

  const nombreTienda = (p: ProductoResultado) => {
    const t = p.tiendas;
    return t?.nombre_comercial || t?.nombre || 'Vendedor';
  };

  const [productoExpandidoId, setProductoExpandidoId] = useState<string | null>(null);
  const [contactarProducto, setContactarProducto] = useState<ProductoResultado | null>(null);
  const [ubicacionProducto, setUbicacionProducto] = useState<ProductoResultado | null>(null);
  const [preguntandoUbicacion, setPreguntandoUbicacion] = useState<ProductoResultado | null>(null);
  const abrirContactar = (p: ProductoResultado) => {
    setContactarProducto(p);
    if (user) {
      void (async () => {
        const debe = await usuarioDebeRegistrarHistorialContactos(supabase, user);
        if (!debe) return;
        await registrarContactoProducto(
          supabase,
          user.id,
          {
            id: p.id,
            nombre: p.nombre,
            precio_usd: p.precio_usd,
            moneda: p.moneda,
          },
          nombreTienda(p)
        );
      })();
    }
  };
  const cerrarContactar = () => {
    setContactarProducto(null);
  };

  useEffect(() => {
    if (!contactarProducto) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContactarProducto(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [contactarProducto]);

  const tieneUbicacion = (p: ProductoResultado) => {
    const t = p.tiendas;
    return t && t.latitud != null && t.longitud != null;
  };

  const usarMiUbicacion = (p: ProductoResultado) => {
    setPreguntandoUbicacion(null);
    if (!navigator.geolocation) {
      setUbicacionProducto(p);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const u = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(u);
        setResultados((prev) => ordenarPorUbicacionUsuario(prev, u));
        setUbicacionProducto(p);
      },
      () => {
        setUbicacionProducto(p);
      }
    );
  };

  const noUsarMiUbicacion = (p: ProductoResultado) => {
    setPreguntandoUbicacion(null);
    setUbicacionProducto(p);
  };

  const cerrarUbicacion = () => {
    setUbicacionProducto(null);
  };

  const lanzarBusquedaDesdeCompacto = () => {
    const t = textoBusqueda.trim();
    if (!t) {
      setMensaje('Escribe qué repuesto buscas.');
      return;
    }
    setMensaje('');
    onIrAResultados?.({ texto: t });
  };

  const bloqueTextoYSugerencias = (
    <>
      {!esCompacto && (
        <label htmlFor="busqueda-repuesto-texto" className="busqueda-repuestos-texto-label">
          ¿Qué repuesto necesitas?
        </label>
      )}
      <div
        className={`busqueda-repuestos-texto-fila ${esCompacto ? 'busqueda-repuestos-texto-fila--compact' : ''}`}
      >
        <div
          className={`busqueda-repuestos-texto-inner ${esCompacto ? 'busqueda-repuestos-texto-inner--compact' : ''}`}
          ref={wrapTextoRef}
        >
          <input
            id="busqueda-repuesto-texto"
            type="text"
            value={textoBusqueda}
            onChange={(e) => {
              setTextoBusqueda(e.target.value);
              if (
                e.target.value.trim().length >= 2 &&
                (esCompacto || resultados.length === 0)
              ) {
                setDropdownAbierto(true);
              }
            }}
            onFocus={() => {
              if (
                textoBusqueda.trim().length >= 2 &&
                sugerencias.length &&
                (esCompacto || resultados.length === 0)
              ) {
                setDropdownAbierto(true);
              }
            }}
            onKeyDown={onTecladoTexto}
            placeholder={
              esMoto
                ? 'Ej: kit de frenos, cadena, batería, espejo, casco…'
                : 'Ej: bomba de gasolina, sensor de oxígeno, pastillas de freno...'
            }
            disabled={buscando}
            spellCheck={false}
            autoComplete="off"
            role="combobox"
            aria-expanded={
              dropdownAbierto &&
              (esCompacto || resultados.length === 0) &&
              sugerencias.length > 0
            }
            aria-controls={
              esCompacto || resultados.length === 0 ? 'busqueda-repuestos-sugerencias-lista' : undefined
            }
            aria-activedescendant={
              dropdownAbierto && indiceSugerencia >= 0
                ? `sugerencia-repuesto-${indiceSugerencia}`
                : undefined
            }
            aria-labelledby={esCompacto ? 'busqueda-landing-titulo' : undefined}
          />
          {dropdownAbierto &&
            sugerencias.length > 0 &&
            (esCompacto || resultados.length === 0) && (
            <ul
              id="busqueda-repuestos-sugerencias-lista"
              className={`busqueda-repuestos-sugerencias ${esCompacto ? 'busqueda-repuestos-sugerencias--compact' : ''}`}
              role="listbox"
            >
              {sugerencias.map((s, idx) => (
                <li key={s.nombre} role="presentation">
                  <button
                    type="button"
                    id={`sugerencia-repuesto-${idx}`}
                    role="option"
                    aria-selected={idx === indiceSugerencia}
                    className={`busqueda-repuestos-sugerencia-item ${idx === indiceSugerencia ? 'activa' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (esCompacto) {
                        setMensaje('');
                        onIrAResultados?.({ texto: s.nombre });
                      } else {
                        seleccionarSugerencia(s);
                      }
                    }}
                    onMouseEnter={() => setIndiceSugerencia(idx)}
                  >
                    <span className="busqueda-repuestos-sugerencia-nombre">
                      {resaltarCoincidencia(s.nombre, textoBusqueda)}
                    </span>
                    {s.detalle && (
                      <span className="busqueda-repuestos-sugerencia-detalle">{s.detalle}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {esCompacto && (
          <button
            type="button"
            className="busqueda-repuestos-btn busqueda-repuestos-btn--compact"
            onClick={lanzarBusquedaDesdeCompacto}
            disabled={buscando}
            aria-label="Buscar repuestos"
          >
            Buscar
          </button>
        )}
      </div>
    </>
  );

  return (
    <section
      className={`busqueda-repuestos ${esCompacto ? 'busqueda-repuestos--compact' : 'busqueda-repuestos--pagina'}`}
      id={esCompacto ? 'buscar' : undefined}
    >
      {esCompacto ? (
        <>
          <h2 id="busqueda-landing-titulo" className="busqueda-repuestos-titulo busqueda-repuestos-titulo--landing">
            {esMoto
              ? 'BUSCA EL REPUESTO PARA TU MOTO'
              : 'BUSCA EL REPUESTO O PRODUCTO QUE NECESITAS'}
          </h2>
          <div className="busqueda-repuestos-form busqueda-repuestos-form--solo-texto">
            <div className="busqueda-repuestos-texto-bloque busqueda-repuestos-texto-bloque--compact">
              {bloqueTextoYSugerencias}
            </div>
          </div>
        </>
      ) : (
        <>
          {onVolver && (
            <div className="busqueda-repuestos-pagina-barra">
              <button type="button" className="busqueda-repuestos-volver" onClick={onVolver}>
                ← Volver al inicio
              </button>
            </div>
          )}

          <div
            className={`busqueda-repuestos-pagina-layout ${
              resultados.length > 0 ? 'filtros-ocultables' : ''
            } ${filtrosAbiertos ? 'filtros-abiertos' : ''}`}
          >
            <aside
              id="busqueda-filtros-sidebar"
              className="busqueda-repuestos-sidebar"
              aria-label="Filtros de búsqueda"
            >
              <h3 className="busqueda-repuestos-sidebar-titulo">Filtra tu búsqueda</h3>
              <div className="busqueda-repuestos-sidebar-filtros">
                <div className="busqueda-repuestos-campo">
                  <label htmlFor="marca">Marca</label>
                  <select
                    id="marca"
                    value={marca}
                    onChange={(e) => {
                      setMarca(e.target.value);
                      setModelo('');
                    }}
                    disabled={buscando}
                  >
                    <option value="">Selecciona la marca</option>
                    {marcasOpciones.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="busqueda-repuestos-campo">
                  <label htmlFor="modelo">Modelo</label>
                  <select
                    id="modelo"
                    value={modelo}
                    onChange={(e) => setModelo(e.target.value)}
                    disabled={buscando || !marca}
                  >
                    <option value="">Todos los modelos</option>
                    {modelosOpciones.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="busqueda-repuestos-campo">
                  <label htmlFor="anio">Año</label>
                  <select
                    id="anio"
                    value={anio}
                    onChange={(e) => setAnio(e.target.value)}
                    disabled={buscando}
                  >
                    <option value="">Cualquier año</option>
                    {ANOS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className="busqueda-repuestos-btn busqueda-repuestos-btn--sidebar"
                  onClick={() => void buscar()}
                  disabled={buscando}
                >
                  {buscando ? 'Buscando...' : 'Aplicar filtros'}
                </button>
              </div>
            </aside>

            <div className="busqueda-repuestos-pagina-main">
              {resultados.length > 0 && (
                <div className="busqueda-repuestos-filtro-movil-barra">
                  <button
                    type="button"
                    className="busqueda-repuestos-filtro-movil-btn"
                    onClick={() => setFiltrosAbiertos((v) => !v)}
                    aria-expanded={filtrosAbiertos}
                    aria-controls="busqueda-filtros-sidebar"
                  >
                    {filtrosAbiertos ? 'Ocultar filtro' : 'Filtro'}
                  </button>
                </div>
              )}
              {mostrarIntroBusquedaPagina && (
                <>
                  <h2 className="busqueda-repuestos-titulo busqueda-repuestos-titulo--pagina">Resultados de búsqueda</h2>
                  <p className="busqueda-repuestos-subtitulo busqueda-repuestos-subtitulo--pagina">
                    Puedes cambiar las palabras de búsqueda aquí. Para afinar por vehículo usa la columna izquierda y pulsa{' '}
                    <strong>Aplicar filtros</strong>.
                  </p>
                </>
              )}

              <div className="busqueda-repuestos-texto-bloque busqueda-repuestos-texto-bloque--pagina">
                {bloqueTextoYSugerencias}
              </div>

              {mensaje && (
                <p className={`busqueda-repuestos-mensaje ${resultados.length ? '' : 'aviso'}`}>{mensaje}</p>
              )}

              {resultados.length > 0 && (
                <div className="busqueda-repuestos-resultados">
                  <h3 className="busqueda-repuestos-resultados-titulo">
                    Resultados ({resultados.length}
                    {hayMasResultados ? ', hay más en el catálogo' : ''})
                  </h3>
                  <div className="busqueda-repuestos-grid">
                    {resultados.map((p) => (
                      <TarjetaProductoBusqueda
                        key={p.id}
                        producto={p}
                        expandida={productoExpandidoId === p.id}
                        onExpand={() => setProductoExpandidoId(p.id)}
                        onContraer={() => setProductoExpandidoId(null)}
                        onContactar={abrirContactar}
                      />
                    ))}
                  </div>
                  {hayMasResultados && (
                    <div className="busqueda-repuestos-cargar-mas">
                      <button
                        type="button"
                        className="busqueda-repuestos-btn busqueda-repuestos-btn--cargar-mas"
                        onClick={() => void cargarMasResultados()}
                        disabled={cargandoMasResultados || buscando}
                      >
                        {cargandoMasResultados ? 'Cargando…' : 'Cargar más resultados'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {mensaje && esCompacto && (
        <p className={`busqueda-repuestos-mensaje ${resultados.length ? '' : 'aviso'}`}>{mensaje}</p>
      )}

      {!esCompacto && preguntandoUbicacion && (
        <div className="busqueda-repuestos-modal-overlay" onClick={() => setPreguntandoUbicacion(null)} role="dialog" aria-modal="true">
          <div className="busqueda-repuestos-modal busqueda-repuestos-modal-ubicacion-pregunta" onClick={(e) => e.stopPropagation()}>
            <p className="busqueda-repuestos-modal-pregunta-texto">
              ¿Usar tu ubicación actual para ordenar los vendedores de más cercano a más lejano?
            </p>
            <div className="busqueda-repuestos-modal-botones">
              <button
                type="button"
                className="busqueda-repuestos-card-btn"
                onClick={() => usarMiUbicacion(preguntandoUbicacion)}
              >
                Sí
              </button>
              <button
                type="button"
                className="busqueda-repuestos-modal-cerrar"
                onClick={() => noUsarMiUbicacion(preguntandoUbicacion)}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {!esCompacto &&
        ubicacionProducto &&
        ubicacionProducto.tiendas?.latitud != null &&
        ubicacionProducto.tiendas?.longitud != null && (
        <div className="busqueda-repuestos-modal-overlay busqueda-repuestos-modal-overlay-mapa" onClick={cerrarUbicacion} role="dialog" aria-modal="true">
          <div className="busqueda-repuestos-modal busqueda-repuestos-modal-mapa" onClick={(e) => e.stopPropagation()}>
            <h3 className="busqueda-repuestos-modal-titulo-seccion">Ubicación del vendedor</h3>
            <p className="busqueda-repuestos-modal-vendedor-nombre">{nombreTienda(ubicacionProducto)}</p>
            <MapVendedorUbicacion
              lat={ubicacionProducto.tiendas.latitud}
              lng={ubicacionProducto.tiendas.longitud}
              nombreVendedor={nombreTienda(ubicacionProducto)}
              userLat={userLocation?.lat}
              userLng={userLocation?.lng}
            />
            <button type="button" className="busqueda-repuestos-modal-cerrar busqueda-repuestos-modal-cerrar-mapa" onClick={cerrarUbicacion}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {!esCompacto && contactarProducto && (
        <div
          className="busqueda-repuestos-modal-overlay busqueda-repuestos-modal-overlay--detalle"
          onClick={cerrarContactar}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-contactar-titulo"
        >
          <div
            className={`busqueda-repuestos-modal busqueda-repuestos-modal--panel ${tieneUbicacion(contactarProducto) ? 'busqueda-repuestos-modal-con-mapa' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="busqueda-repuestos-modal-header-bar">
              <h3 id="modal-contactar-titulo" className="busqueda-repuestos-modal-header-titulo">
                Datos del vendedor
              </h3>
              <button
                type="button"
                className="busqueda-repuestos-modal-cerrar-x"
                onClick={cerrarContactar}
                aria-label="Cerrar ventana"
              >
                ×
              </button>
            </div>
            <div className="busqueda-repuestos-modal-body-scroll">
            {contactarProducto.tiendas && (
              <div className="busqueda-repuestos-modal-datos">
                <p className="busqueda-repuestos-modal-linea">
                  <span className="busqueda-repuestos-modal-etiqueta">Nombre comercial</span>
                  <span className="busqueda-repuestos-modal-valor-negrita">
                    {contactarProducto.tiendas.nombre_comercial || contactarProducto.tiendas.nombre || '—'}
                  </span>
                </p>
                {contactarProducto.tiendas.rif != null && contactarProducto.tiendas.rif !== '' && (
                  <p className="busqueda-repuestos-modal-linea"><span className="busqueda-repuestos-modal-etiqueta">RIF</span> {contactarProducto.tiendas.rif}</p>
                )}
                {contactarProducto.tiendas.telefono && (
                  <p className="busqueda-repuestos-modal-linea"><span className="busqueda-repuestos-modal-etiqueta">Teléfono</span> {contactarProducto.tiendas.telefono}</p>
                )}
                {contactarProducto.tiendas.direccion && (
                  <p className="busqueda-repuestos-modal-linea"><span className="busqueda-repuestos-modal-etiqueta">Dirección</span> {contactarProducto.tiendas.direccion}</p>
                )}
                {Array.isArray(contactarProducto.tiendas.metodos_pago) && contactarProducto.tiendas.metodos_pago.length > 0 && (
                  <div className="busqueda-repuestos-modal-linea busqueda-repuestos-modal-metodos-pago">
                    <span className="busqueda-repuestos-modal-etiqueta">Formas de pago</span>
                    <div className="busqueda-repuestos-modal-metodos-pago-lista">
                      {contactarProducto.tiendas.metodos_pago.map((m) => (
                        <span key={m} className="busqueda-repuestos-modal-metodo-pago-chip">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="busqueda-repuestos-modal-producto-box">
              <h4 className="busqueda-repuestos-modal-titulo-seccion">Producto seleccionado</h4>
              <p className="busqueda-repuestos-modal-repuesto">{contactarProducto.nombre}</p>
              {((contactarProducto.comentarios ?? contactarProducto.descripcion) || '') && (
                <p className="busqueda-repuestos-modal-comentarios">
                  {contactarProducto.comentarios ?? contactarProducto.descripcion}
                </p>
              )}
            </div>
            {contactarProducto.tiendas?.latitud != null && contactarProducto.tiendas?.longitud != null && (
              <>
                <h4 className="busqueda-repuestos-modal-titulo-seccion">Ubicación</h4>
                <MapVendedorUbicacion
                  lat={contactarProducto.tiendas.latitud}
                  lng={contactarProducto.tiendas.longitud}
                  nombreVendedor={nombreTienda(contactarProducto)}
                  userLat={userLocation?.lat}
                  userLng={userLocation?.lng}
                />
              </>
            )}
            <div className="busqueda-repuestos-modal-botones">
              {contactarProducto.tiendas?.telefono ? (
                <a
                  href={
                    urlWhatsAppGeomotor(
                      contactarProducto.tiendas.telefono,
                      mensajeWhatsappVendedorProducto(contactarProducto.nombre),
                    )!
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="busqueda-repuestos-modal-whatsapp"
                >
                  Contactar por WhatsApp
                </a>
              ) : (
                <p className="busqueda-repuestos-modal-sin-contacto">Sin teléfono registrado.</p>
              )}
            </div>
            {contactarProducto.tiendas?.latitud != null && contactarProducto.tiendas?.longitud != null && (
              <div className="vendedores-cerca-modal-ruta">
                <p className="maps-nav-aviso-confirmacion" role="note">
                  {MENSAJE_AVISO_NAVEGACION_MAPS_TIENDA}
                </p>
                <a
                  href={urlGoogleMapsDirSoloDestino(
                    contactarProducto.tiendas.latitud,
                    contactarProducto.tiendas.longitud
                  )}
                  className="vendedores-cerca-modal-ruta-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    abrirNavegacionGoogleMapsDesdeAqui(
                      contactarProducto.tiendas!.latitud!,
                      contactarProducto.tiendas!.longitud!
                    );
                  }}
                >
                  {TEXTO_ENLACE_NAVEGACION_GOOGLE_MAPS}
                </a>
              </div>
            )}
            <button type="button" className="busqueda-repuestos-modal-cerrar" onClick={cerrarContactar}>
              Cerrar
            </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
