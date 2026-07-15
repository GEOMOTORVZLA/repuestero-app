import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import {
  MAX_BYTES_FOTO_PRODUCTO,
  MAX_MB_FOTO_PRODUCTO,
  optimizarImagenProductoParaStorage,
  urlImagenProductoVariante,
} from '../utils/imagenProducto';
import { urlsFotosProducto } from '../utils/productoImagenesExtra';
import { EspecialidadTallerCeldaAdmin } from './EspecialidadTallerCeldaAdmin';
import { AdminCeldaAutorizacionWeb } from './AdminCeldaAutorizacionWeb';
import { AdminCeldaUbicacion } from './AdminCeldaUbicacion';
import { AdminCeldaUserId } from './AdminCeldaUserId';
import { AdminModalEditarUbicacion } from './AdminModalEditarUbicacion';
import { etiquetaMoneda } from '../utils/monedaProducto';
import { formatearPrecioProducto } from '../utils/precioProducto';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { mensajeNegocioNoListoParaAprobar } from '../utils/validarDatosNegocio';
import './Dashboard.css';

const ADMIN_LIST_LIMIT = 250;
/** Filas máximas en el modal de detalle KPI (evita DOM enorme con miles de productos). */
const ADMIN_KPI_MODAL_ROWS = 250;
const ADMIN_TIENDAS_SELECT =
  'id, user_id, nombre, nombre_comercial, rif, telefono, email, estado, ciudad, latitud, longitud, bloqueado, aprobacion_estado, created_at, membresia_hasta';

const ADMIN_TALLERES_SELECT =
  'id, user_id, nombre, nombre_comercial, rif, especialidad, telefono, email, estado, ciudad, latitud, longitud, bloqueado, aprobacion_estado, created_at, membresia_hasta';

type AdminKpiDetalle =
  | 'usuarios_total'
  | 'vendedores_total'
  | 'vendedores_suspendidos_impago'
  | 'talleres_total'
  | 'compradores_total'
  | 'productos_activos'
  | 'productos_pausados'
  | 'productos_total'
  | 'catalogo_auto'
  | 'catalogo_moto'
  | 'vendedores_pendientes'
  | 'talleres_pendientes'
  | 'productos_pendientes_web';

const KPI_DETALLE_TITULO: Record<AdminKpiDetalle, string> = {
  usuarios_total: 'Usuarios (total)',
  vendedores_total: 'Vendedores — tiendas (total)',
  vendedores_suspendidos_impago: 'Vendedores suspendidos por impago',
  talleres_total: 'Talleres (total)',
  compradores_total: 'Compradores (total)',
  productos_activos: 'Productos activos',
  productos_pausados: 'Productos pausados',
  productos_total: 'Total productos',
  catalogo_auto: 'Catálogo automóvil',
  catalogo_moto: 'Catálogo motocicleta',
  vendedores_pendientes: 'Vendedores por autorizar — tiendas',
  talleres_pendientes: 'Talleres por autorizar',
  productos_pendientes_web: 'Productos por autorizar (web)',
};

/** Escapa % y _ para patrones ILIKE en filtros .or() de PostgREST */
function escapeIlikePatron(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

type AdminTab = 'resumen' | 'usuarios' | 'productos' | 'vendedores' | 'talleres' | 'compradores';

const KPI_DETALLE_IR_TAB: Partial<Record<AdminKpiDetalle, AdminTab>> = {
  usuarios_total: 'usuarios',
  vendedores_total: 'vendedores',
  vendedores_suspendidos_impago: 'vendedores',
  talleres_total: 'talleres',
  compradores_total: 'compradores',
  productos_activos: 'productos',
  productos_pausados: 'productos',
  productos_total: 'productos',
  catalogo_auto: 'productos',
  catalogo_moto: 'productos',
  vendedores_pendientes: 'vendedores',
  talleres_pendientes: 'talleres',
  productos_pendientes_web: 'productos',
};

function etiquetaPestañaAdmin(t: AdminTab): string {
  const m: Record<AdminTab, string> = {
    resumen: 'Inicio admin',
    usuarios: 'Usuarios',
    productos: 'Productos',
    vendedores: 'Vendedores',
    talleres: 'Talleres',
    compradores: 'Compradores',
  };
  return m[t];
}

type AdminKpis = {
  usuarios_total: number;
  vendedores_total: number;
  vendedores_suspendidos_impago?: number;
  talleres_total: number;
  compradores_total: number;
  productos_total: number;
  productos_activos: number;
  productos_pausados: number;
  productos_auto: number;
  productos_moto: number;
  tiendas_pendientes_aprobacion: number;
  talleres_pendientes_aprobacion: number;
  productos_pendientes_web: number;
};

type AprobacionEstado = 'pendiente' | 'aprobado' | 'rechazado';
type FiltroEstadoProductoGestion =
  | 'todos'
  | 'activos'
  | 'pausados'
  | 'por_aprobar'
  | 'agregado_reciente'
  | 'proximos_stock'
  | 'stock_vencido'
  | 'sin_fecha_stock';

const DIAS_PRODUCTO_AGREGADO_RECIENTE = 5;

function esProductoAgregadoReciente(createdAt: string | null | undefined): boolean {
  if (createdAt == null || String(createdAt).trim() === '') return false;
  const creado = new Date(createdAt).getTime();
  if (Number.isNaN(creado)) return false;
  const limiteMs = DIAS_PRODUCTO_AGREGADO_RECIENTE * 24 * 60 * 60 * 1000;
  return Date.now() - creado <= limiteMs;
}

/** Acciones masivas del panel admin sobre productosFiltrados */
type AccionMasivaProductosAdmin = '' | 'activar' | 'pausar' | 'eliminar';

type AdminUsuario = {
  user_id: string;
  email: string | null;
  tipo_cuenta: string | null;
  role: string | null;
  nombre: string | null;
  telefono: string | null;
  creado_en: string | null;
};

type AdminComprador = {
  user_id: string;
  email: string | null;
  nombre: string | null;
  nombre_comercial: string | null;
  rif: string | null;
  telefono: string | null;
  estado: string | null;
  ciudad: string | null;
  creado_en: string | null;
  suspendido_membresia?: boolean | null;
};

type AdminProducto = {
  id: string;
  nombre: string;
  descripcion?: string | null;
  comentarios?: string | null;
  tienda_id?: string | null;
  categoria: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  precio_usd: number | null;
  moneda: string | null;
  activo: boolean | null;
  aprobacion_publica?: string | null;
  imagen_url?: string | null;
  imagenes_extra?: (string | null)[] | string[] | null;
  created_at?: string | null;
  stock_confirmado_at?: string | null;
  pausado_por_stock_vencido?: boolean | null;
  vertical?: string | null;
  tiendas?:
    | { id?: string; nombre_comercial: string | null; nombre: string | null }
    | { id?: string; nombre_comercial: string | null; nombre: string | null }[]
    | null;
};

type AdminTienda = {
  id: string;
  user_id: string;
  nombre: string | null;
  nombre_comercial: string | null;
  rif: string | null;
  telefono: string | null;
  email?: string | null;
  estado: string | null;
  ciudad: string | null;
  latitud?: number | null;
  longitud?: number | null;
  bloqueado: boolean | null;
  aprobacion_estado?: string | null;
  created_at?: string | null;
  membresia_hasta?: string | null;
};

type AdminPerfilMembresia = {
  bloqueado: boolean | null;
  aprobacion_estado?: string | null;
  membresia_hasta?: string | null;
};

/**
 * Fecha calendario YYYY-MM-DD en UTC (misma base que Postgres CURRENT_DATE en Supabase).
 */
function fechaCalendarioUtc(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function extraerFechaCalendarioMembresia(membresiaHasta: string): string | null {
  const parts = String(membresiaHasta).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!parts) return null;
  return `${parts[1]}-${parts[2]}-${parts[3]}`;
}

/**
 * Membresía vencida o sin fecha. Alineado con RLS/KPI SQL:
 * `membresia_hasta IS NULL OR membresia_hasta < CURRENT_DATE`.
 */
function membresiaVencidaOSinFecha(membresiaHasta: string | null | undefined, ahora: Date = new Date()): boolean {
  if (membresiaHasta == null || String(membresiaHasta).trim() === '') return true;
  const fechaMem = extraerFechaCalendarioMembresia(String(membresiaHasta));
  if (!fechaMem) return true;
  return fechaMem < fechaCalendarioUtc(ahora);
}

function perfilBloqueadoPorAdmin(p: AdminPerfilMembresia): boolean {
  return p.bloqueado === true;
}

/** Perfil aprobado: sin visibilidad pública por impago (bloqueo admin o membresía no vigente), alineado con políticas RLS. */
function perfilSuspendidoPorImpago(p: AdminPerfilMembresia): boolean {
  if ((p.aprobacion_estado ?? 'aprobado') !== 'aprobado') return false;
  if (perfilBloqueadoPorAdmin(p)) return true;
  return membresiaVencidaOSinFecha(p.membresia_hasta);
}

/** Columna «Estado pago» en vendedores/talleres: debe coincidir con el KPI suspendidos. */
function etiquetaEstadoImpagoPerfil(v: AdminPerfilMembresia): { texto: string; clase: 'ok' | 'rechazado' } {
  if (!perfilSuspendidoPorImpago(v)) {
    return { texto: 'Al día', clase: 'ok' };
  }
  if (perfilBloqueadoPorAdmin(v)) {
    return { texto: 'Suspendido — bloqueo admin', clase: 'rechazado' };
  }
  if (v.membresia_hasta == null || String(v.membresia_hasta).trim() === '') {
    return { texto: 'Suspendido — sin fecha membresía', clase: 'rechazado' };
  }
  return { texto: 'Suspendido — membresía vencida', clase: 'rechazado' };
}

/** Texto en tablas admin: alineado con la misma lógica que el KPI «suspendidos por impago». */
function etiquetaVisibilidadWebPerfil(v: AdminPerfilMembresia): { texto: string; clase: 'ok' | 'warn' } {
  if ((v.aprobacion_estado ?? 'aprobado') !== 'aprobado') {
    return { texto: '—', clase: 'ok' };
  }
  if (perfilBloqueadoPorAdmin(v)) {
    return { texto: 'Oculta (bloqueo admin)', clase: 'warn' };
  }
  if (membresiaVencidaOSinFecha(v.membresia_hasta)) {
    return { texto: 'Oculta (sin membresía vigente)', clase: 'warn' };
  }
  return { texto: 'Visible en web', clase: 'ok' };
}

/** Tabla admin compacta: OK / NO (detalle en title). */
function etiquetaEstadoImpagoPerfilTabla(v: AdminPerfilMembresia): {
  texto: string;
  clase: 'ok' | 'rechazado';
  title: string;
} {
  const detalle = etiquetaEstadoImpagoPerfil(v);
  return {
    texto: perfilSuspendidoPorImpago(v) ? 'NO' : 'OK',
    clase: detalle.clase,
    title: detalle.texto,
  };
}

/** Tabla admin compacta: una palabra (detalle en title). */
function etiquetaVisibilidadWebPerfilTabla(v: AdminPerfilMembresia): {
  texto: string;
  clase: 'ok' | 'warn';
  title: string;
} {
  const detalle = etiquetaVisibilidadWebPerfil(v);
  if ((v.aprobacion_estado ?? 'aprobado') !== 'aprobado') {
    return { texto: '—', clase: 'ok', title: 'Sin autorización web' };
  }
  if (perfilBloqueadoPorAdmin(v) || membresiaVencidaOSinFecha(v.membresia_hasta)) {
    return { texto: 'Oculta', clase: 'warn', title: detalle.texto };
  }
  return { texto: 'Visible', clase: 'ok', title: detalle.texto };
}

/** Listado suspendidos por impago: RPC admin; si falla el RPC, filtra tiendas vía RLS admin. */
async function fetchTiendasSuspendidasImpago(limit = 2000): Promise<{
  data: AdminTienda[];
  rpcError: string | null;
}> {
  const res = await supabase.rpc('admin_list_tiendas_suspendidas_impago', { p_limit: limit });
  if (!res.error) {
    return { data: (res.data ?? []) as AdminTienda[], rpcError: null };
  }
  const fb = await supabase
    .from('tiendas')
    .select(ADMIN_TIENDAS_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (fb.error) {
    return { data: [], rpcError: res.error.message || fb.error.message };
  }
  const rows = ((fb.data ?? []) as AdminTienda[]).filter(perfilSuspendidoPorImpago);
  return { data: rows, rpcError: res.error.message };
}

/** Talleres suspendidos por impago (sin RPC dedicado: filtra vía RLS admin). */
async function fetchTalleresSuspendidosImpago(limit = 2000): Promise<{
  data: AdminTaller[];
  rpcError: string | null;
}> {
  const fb = await supabase
    .from('talleres')
    .select(ADMIN_TALLERES_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (fb.error) {
    return { data: [], rpcError: fb.error.message };
  }
  const rows = ((fb.data ?? []) as AdminTaller[]).filter(perfilSuspendidoPorImpago);
  return { data: rows, rpcError: null };
}

type AdminTaller = {
  id: string;
  user_id: string;
  nombre: string | null;
  nombre_comercial: string | null;
  rif: string | null;
  especialidad: string[] | string | null;
  telefono: string | null;
  email?: string | null;
  estado: string | null;
  ciudad: string | null;
  latitud?: number | null;
  longitud?: number | null;
  bloqueado: boolean | null;
  aprobacion_estado?: string | null;
  created_at?: string | null;
  membresia_hasta?: string | null;
};

interface DashboardAdminProps {
  onVolverInicio?: () => void;
  /** Vertical de la landing desde la que entró el admin (solo referencia; el filtro por defecto es “todos”) */
  vertical?: VerticalVehiculo;
}

function fmtFecha(v?: string | null) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('es-VE');
  } catch {
    return v;
  }
}

/** Fecha corta para tablas admin (una línea). */
function fmtFechaCortaAdmin(v?: string | null): string {
  if (!v) return '—';
  const parts = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (parts) {
    return `${parts[3]}/${parts[2]}/${parts[1]}`;
  }
  try {
    return new Date(v).toLocaleDateString('es-VE');
  } catch {
    return String(v);
  }
}

function etiquetaMembresiaCompradorTabla(c: AdminComprador): {
  texto: string;
  clase: 'ok' | 'rechazado';
  title: string;
} {
  const susp = c.suspendido_membresia === true;
  return {
    texto: susp ? 'NO' : 'OK',
    clase: susp ? 'rechazado' : 'ok',
    title: susp ? 'Suspendido (impago)' : 'Activo',
  };
}

/** Fecha membresía YYYY-MM-DD sin desfase UTC en la tabla admin. */
function fmtMembresiaHasta(v?: string | null) {
  if (!v) return '—';
  const parts = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (parts) {
    const d = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    return d.toLocaleDateString('es-VE');
  }
  return fmtFecha(v);
}

function fmtCoordAdmin(v?: number | null): string {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return Number(v).toFixed(5);
}

function celdaUbicacionAdmin(lat?: number | null, lng?: number | null): string {
  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return '—';
  }
  const latN = Number(lat);
  const lngN = Number(lng);
  if (Math.abs(latN) < 0.0001 && Math.abs(lngN) < 0.0001) {
    return '0, 0 (sin ubicación)';
  }
  return `${fmtCoordAdmin(latN)}, ${fmtCoordAdmin(lngN)}`;
}

function emailNegocioAdmin(
  negocio: { user_id: string; email?: string | null },
  emailsPorUserId: Map<string, string | null>
): string {
  const deTabla = negocio.email?.trim();
  if (deTabla) return deTabla;
  const deAuth = emailsPorUserId.get(negocio.user_id)?.trim();
  return deAuth || '—';
}

function celdaTextoUnaLineaAdmin(texto: string | null | undefined) {
  const valor = texto?.trim() || '—';
  return (
    <span className="dashboard-admin-texto-una-linea" title={valor !== '—' ? valor : undefined}>
      {valor}
    </span>
  );
}

function celdaEmailAdmin(texto: string | null | undefined) {
  const valor = texto?.trim() || '—';
  return <span className="dashboard-admin-email-texto">{valor}</span>;
}

function celdaRifAdmin(texto: string | null | undefined) {
  const valor = texto?.trim() || '—';
  return <span className="dashboard-admin-rif-texto">{valor}</span>;
}

/** Reciente primero (fechas ISO). */
function cmpIsoDesc(a?: string | null, b?: string | null) {
  const ta = a ? Date.parse(a) : 0;
  const tb = b ? Date.parse(b) : 0;
  return tb - ta;
}

/** Fecha membresía N días desde hoy UTC (misma base que CURRENT_DATE en Supabase). */
function fechaMembresiaDesdeHoyUtc(dias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dias);
  return fechaCalendarioUtc(d);
}

function capFilasKpiModal<T>(arr: T[]): { rows: T[]; total: number; trunc: number } {
  const total = arr.length;
  if (total <= ADMIN_KPI_MODAL_ROWS) return { rows: arr, total, trunc: 0 };
  return { rows: arr.slice(0, ADMIN_KPI_MODAL_ROWS), total, trunc: total - ADMIN_KPI_MODAL_ROWS };
}

function etiquetaAprobacion(estado: string | null | undefined) {
  const e = (estado ?? 'aprobado').toLowerCase();
  if (e === 'pendiente') return 'Pendiente';
  if (e === 'rechazado') return 'Rechazado';
  return 'Aprobado';
}

function claseAprobacion(estado: string | null | undefined): 'ok' | 'warn' | 'pendiente' | 'rechazado' {
  const e = (estado ?? 'aprobado').toLowerCase();
  if (e === 'pendiente') return 'pendiente';
  if (e === 'rechazado') return 'rechazado';
  return 'ok';
}

type TiendaEmbedProducto = { id?: string; nombre_comercial: string | null; nombre: string | null };

function primeraTiendaProducto(p: AdminProducto): TiendaEmbedProducto | null {
  const x = p.tiendas as TiendaEmbedProducto | TiendaEmbedProducto[] | null | undefined;
  if (!x) return null;
  if (Array.isArray(x)) return x[0] ?? null;
  return x;
}

function etiquetaVendedorDesdeProducto(p: AdminProducto, vendedores: AdminTienda[]): string {
  const t = primeraTiendaProducto(p);
  const desdeJoin = t?.nombre_comercial?.trim() || t?.nombre?.trim();
  if (desdeJoin) return desdeJoin;
  const tid = p.tienda_id ?? t?.id;
  if (tid) {
    const v = vendedores.find((x) => x.id === tid);
    const s = v?.nombre_comercial?.trim() || v?.nombre?.trim();
    if (s) return s;
  }
  return '—';
}

function diasDesdeFechaISO(fechaIso: string | null | undefined): number | null {
  if (!fechaIso) return null;
  const ts = Date.parse(fechaIso);
  if (Number.isNaN(ts)) return null;
  const dias = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  return Math.max(0, dias);
}

function semaforoStockGestion(p: {
  stock_confirmado_at?: string | null;
  created_at?: string | null;
}): { clase: 'verde' | 'amarillo' | 'rojo' | 'vencido' | 'sin-fecha'; texto: string } {
  const base = p.stock_confirmado_at ?? p.created_at ?? null;
  const dias = diasDesdeFechaISO(base);
  if (dias == null) return { clase: 'sin-fecha', texto: 'Sin fecha' };
  if (dias <= 9) return { clase: 'verde', texto: `${dias} día(s)` };
  if (dias <= 15) return { clase: 'amarillo', texto: `Por confirmar (${dias})` };
  if (dias <= 20) return { clase: 'rojo', texto: `Crítico (${dias})` };
  return { clase: 'vencido', texto: `Vencido (${dias})` };
}

/** Columnas del listado admin de productos (compartido entre páginas de carga). */
const ADMIN_PRODUCTOS_SELECT =
  'id, nombre, descripcion, comentarios, tienda_id, categoria, marca, modelo, anio, precio_usd, moneda, activo, aprobacion_publica, imagen_url, imagenes_extra, created_at, stock_confirmado_at, pausado_por_stock_vencido, vertical, tiendas(id, nombre, nombre_comercial)';

const ADMIN_PRODUCTOS_PAGE = 1000;

export function DashboardAdmin({ onVolverInicio, vertical: verticalEntrada }: DashboardAdminProps) {
  const { user, signOut } = useAuth();
  const defaultVerticalFiltro: 'todos' | 'auto' | 'moto' =
    verticalEntrada === 'moto' ? 'moto' : 'todos';
  const [tab, setTab] = useState<AdminTab>('resumen');
  const [adminFiltroVertical, setAdminFiltroVertical] = useState<'todos' | 'auto' | 'moto'>(defaultVerticalFiltro);
  /** id de tienda = vendedor en catálogo */
  const [adminFiltroVendedorTiendaId, setAdminFiltroVendedorTiendaId] = useState('');
  const [busquedaProductosAdmin, setBusquedaProductosAdmin] = useState('');
  const [filtroEstadoProductosAdmin, setFiltroEstadoProductosAdmin] =
    useState<FiltroEstadoProductoGestion>('todos');
  /** Valores en los controles; los filtros del listado solo cambian al pulsar «Aplicar filtros». */
  const [adminFiltroVerticalDraft, setAdminFiltroVerticalDraft] =
    useState<'todos' | 'auto' | 'moto'>(defaultVerticalFiltro);
  const [adminFiltroVendedorTiendaIdDraft, setAdminFiltroVendedorTiendaIdDraft] = useState('');
  const [busquedaProductosAdminDraft, setBusquedaProductosAdminDraft] = useState('');
  const [filtroEstadoProductosAdminDraft, setFiltroEstadoProductosAdminDraft] =
    useState<FiltroEstadoProductoGestion>('todos');
  const [cargandoFiltrosProductos, setCargandoFiltrosProductos] = useState(false);
  const [bulkProductosAccion, setBulkProductosAccion] = useState<AccionMasivaProductosAdmin>('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<AdminUsuario[]>([]);
  const [compradores, setCompradores] = useState<AdminComprador[]>([]);
  const [productos, setProductos] = useState<AdminProducto[]>([]);
  const [vendedores, setVendedores] = useState<AdminTienda[]>([]);
  const [talleres, setTalleres] = useState<AdminTaller[]>([]);
  const [accionando, setAccionando] = useState<string | null>(null);
  const [kpis, setKpis] = useState<AdminKpis | null>(null);
  const [busquedaUsuarios, setBusquedaUsuarios] = useState('');
  const [busquedaCompradores, setBusquedaCompradores] = useState('');
  const [busquedaVendedores, setBusquedaVendedores] = useState('');
  const [filtroSoloSuspendidosImpago, setFiltroSoloSuspendidosImpago] = useState(false);
  const [filtroSoloSuspendidosImpagoTalleres, setFiltroSoloSuspendidosImpagoTalleres] = useState(false);
  const [busquedaTalleres, setBusquedaTalleres] = useState('');
  const [fotosMasivasTiendaId, setFotosMasivasTiendaId] = useState('');
  const [fotosMasivasAlcance, setFotosMasivasAlcance] = useState<'todos' | 'sin_foto' | 'seleccionados'>('sin_foto');
  const [fotosMasivasArchivos, setFotosMasivasArchivos] = useState<(File | null)[]>([null, null, null, null]);
  const [fotosMasivasSeleccionados, setFotosMasivasSeleccionados] = useState<string[]>([]);
  const [mensajeFotosMasivas, setMensajeFotosMasivas] = useState<string | null>(null);
  const [fotoActivaAdminProducto, setFotoActivaAdminProducto] = useState<Record<string, number>>({});
  const [kpiDetalle, setKpiDetalle] = useState<AdminKpiDetalle | null>(null);
  /** Listado completo para el modal «suspendidos por impago» (el KPI cuenta todo el sistema; esto evita depender de las 250 filas del tab). */
  const [listaSuspendidasImpagoModal, setListaSuspendidasImpagoModal] = useState<AdminTienda[] | null>(null);
  const [errListaSuspendidasImpagoModal, setErrListaSuspendidasImpagoModal] = useState<string | null>(null);
  /** Listado KPI modal «productos pausados» (misma lógica que SQL: activo distinto de true). */
  const [listaProductosPausadosModal, setListaProductosPausadosModal] = useState<AdminProducto[] | null>(null);
  const [errListaProductosPausadosModal, setErrListaProductosPausadosModal] = useState<string | null>(null);
  const [especialidadTallerModal, setEspecialidadTallerModal] = useState<{
    nombre: string;
    items: string[];
  } | null>(null);
  const [userIdPerfilModal, setUserIdPerfilModal] = useState<{
    nombre: string;
    userId: string;
  } | null>(null);
  const [ubicacionNegocioModal, setUbicacionNegocioModal] = useState<{
    tipo: 'tienda' | 'taller';
    id: string;
    nombre: string;
    latitud: number | null;
    longitud: number | null;
  } | null>(null);

  const cargarProductos = async (opts?: { conIndicadorFiltros?: boolean }) => {
    const conIndicador = opts?.conIndicadorFiltros === true;
    if (conIndicador) setCargandoFiltrosProductos(true);
    const acumulado: AdminProducto[] = [];
    let from = 0;
    try {
      while (true) {
        const pRes = await supabase
          .from('productos')
          .select(ADMIN_PRODUCTOS_SELECT)
          .order('created_at', { ascending: false })
          .range(from, from + ADMIN_PRODUCTOS_PAGE - 1);
        if (pRes.error) {
          setError(pRes.error.message);
          break;
        }
        const batch = (pRes.data ?? []) as AdminProducto[];
        acumulado.push(...batch);
        if (batch.length < ADMIN_PRODUCTOS_PAGE) break;
        from += ADMIN_PRODUCTOS_PAGE;
      }
      setProductos(acumulado);
    } finally {
      if (conIndicador) setCargandoFiltrosProductos(false);
    }
  };

  const aplicarFiltrosProductosAdmin = async () => {
    setBusquedaProductosAdmin(busquedaProductosAdminDraft);
    setAdminFiltroVendedorTiendaId(adminFiltroVendedorTiendaIdDraft);
    setAdminFiltroVertical(adminFiltroVerticalDraft);
    setFiltroEstadoProductosAdmin(filtroEstadoProductosAdminDraft);
    setError(null);
    await cargarProductos({ conIndicadorFiltros: true });
  };

  const restablecerFiltrosProductosAdmin = async () => {
    setBusquedaProductosAdminDraft('');
    setAdminFiltroVendedorTiendaIdDraft('');
    setAdminFiltroVerticalDraft(defaultVerticalFiltro);
    setFiltroEstadoProductosAdminDraft('todos');
    setBusquedaProductosAdmin('');
    setAdminFiltroVendedorTiendaId('');
    setAdminFiltroVertical(defaultVerticalFiltro);
    setFiltroEstadoProductosAdmin('todos');
    setError(null);
    await cargarProductos({ conIndicadorFiltros: true });
  };

  const cargarKpis = async () => {
    const { data, error: e } = await supabase.rpc('admin_dashboard_counts');
    if (!e && data && typeof data === 'object') {
      setKpis(data as AdminKpis);
    }
  };

  const cargarUsuarios = async (buscar: string) => {
    const uRes = await supabase.rpc('admin_list_usuarios', {
      p_buscar: buscar,
      p_limit: ADMIN_LIST_LIMIT,
    });
    if (uRes.error) {
      setUsuarios([]);
      setError(
        `Listado de usuarios: ${uRes.error.message}. ¿Ejecutaste la migración del panel (supabase-admin-busqueda-panel.sql + supabase-admin-panel.sql actualizado)?`
      );
    } else {
      setUsuarios((uRes.data ?? []) as AdminUsuario[]);
    }
  };

  const cargarCompradores = async (buscar: string) => {
    const cRes = await supabase.rpc('admin_list_compradores', {
      p_buscar: buscar,
      p_limit: ADMIN_LIST_LIMIT,
    });
    if (cRes.error) {
      setCompradores([]);
      setError(`Listado de compradores: ${cRes.error.message}. ¿Script SQL del panel actualizado?`);
    } else {
      setCompradores((cRes.data ?? []) as AdminComprador[]);
    }
  };

  const cargarVendedores = async (buscar: string) => {
    let q = supabase
      .from('tiendas')
      .select(ADMIN_TIENDAS_SELECT)
      .order('created_at', { ascending: false })
      .limit(ADMIN_LIST_LIMIT);
    const t = buscar.trim();
    if (t) {
      const esc = escapeIlikePatron(t);
      q = q.or(`rif.ilike.%${esc}%,nombre.ilike.%${esc}%,nombre_comercial.ilike.%${esc}%`);
    }
    const vRes = await q;
    if (vRes.error) setError(vRes.error.message);
    let rows = (vRes.data ?? []) as AdminTienda[];

    // Tiendas suspendidas pueden quedar fuera de las 250 filas recientes; el KPI las cuenta igual.
    if (!t) {
      const { data: suspendidas } = await fetchTiendasSuspendidasImpago(2000);
      if (suspendidas.length) {
        for (const tienda of suspendidas) {
          const idx = rows.findIndex((r) => r.id === tienda.id);
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...tienda };
          } else {
            rows.push(tienda);
          }
        }
        rows.sort((a, b) => {
          const sa = perfilSuspendidoPorImpago(a) ? 0 : 1;
          const sb = perfilSuspendidoPorImpago(b) ? 0 : 1;
          if (sa !== sb) return sa - sb;
          return cmpIsoDesc(a.created_at, b.created_at);
        });
      }
    }

    setVendedores(rows);
  };

  const cargarTalleres = async (buscar: string) => {
    let q = supabase
      .from('talleres')
      .select(ADMIN_TALLERES_SELECT)
      .order('created_at', { ascending: false })
      .limit(ADMIN_LIST_LIMIT);
    const t = buscar.trim();
    if (t) {
      const esc = escapeIlikePatron(t);
      q = q.or(`nombre.ilike.%${esc}%,nombre_comercial.ilike.%${esc}%,telefono.ilike.%${esc}%`);
    }
    const tRes = await q;
    if (tRes.error) setError(tRes.error.message);
    let rows = (tRes.data ?? []) as AdminTaller[];

    if (!t) {
      const { data: suspendidos } = await fetchTalleresSuspendidosImpago(2000);
      if (suspendidos.length) {
        for (const taller of suspendidos) {
          const idx = rows.findIndex((r) => r.id === taller.id);
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...taller };
          } else {
            rows.push(taller);
          }
        }
        rows.sort((a, b) => {
          const sa = perfilSuspendidoPorImpago(a) ? 0 : 1;
          const sb = perfilSuspendidoPorImpago(b) ? 0 : 1;
          if (sa !== sb) return sa - sb;
          return cmpIsoDesc(a.created_at, b.created_at);
        });
      }
    }

    setTalleres(rows);
  };

  const cargar = async (opts?: { silencioso?: boolean }) => {
    const silencioso = opts?.silencioso === true;
    if (!silencioso) {
      setCargando(true);
      setError(null);
    }
    await cargarProductos();
    await cargarKpis();
    await Promise.all([
      cargarUsuarios(''),
      cargarCompradores(''),
      cargarVendedores(''),
      cargarTalleres(''),
    ]);
    if (!silencioso) setCargando(false);
  };

  useEffect(() => {
    void cargar();
  }, []);

  useEffect(() => {
    if (tab !== 'usuarios') return;
    const tm = window.setTimeout(() => {
      void cargarUsuarios(busquedaUsuarios);
    }, 400);
    return () => window.clearTimeout(tm);
  }, [busquedaUsuarios, tab]);

  useEffect(() => {
    if (tab !== 'compradores') return;
    const tm = window.setTimeout(() => {
      void cargarCompradores(busquedaCompradores);
    }, 400);
    return () => window.clearTimeout(tm);
  }, [busquedaCompradores, tab]);

  useEffect(() => {
    if (tab !== 'vendedores') return;
    const tm = window.setTimeout(() => {
      void cargarVendedores(busquedaVendedores);
    }, 400);
    return () => window.clearTimeout(tm);
  }, [busquedaVendedores, tab]);

  useEffect(() => {
    if (tab !== 'talleres') return;
    const tm = window.setTimeout(() => {
      void cargarTalleres(busquedaTalleres);
    }, 400);
    return () => window.clearTimeout(tm);
  }, [busquedaTalleres, tab]);

  useEffect(() => {
    if (!kpiDetalle && !especialidadTallerModal && !userIdPerfilModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setKpiDetalle(null);
        setEspecialidadTallerModal(null);
        setUserIdPerfilModal(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kpiDetalle, especialidadTallerModal, userIdPerfilModal]);

  useEffect(() => {
    if (kpiDetalle !== 'vendedores_suspendidos_impago') {
      setListaSuspendidasImpagoModal(null);
      setErrListaSuspendidasImpagoModal(null);
      return;
    }
    let cancelled = false;
    setListaSuspendidasImpagoModal(null);
    setErrListaSuspendidasImpagoModal(null);
    void (async () => {
      const { data, rpcError } = await fetchTiendasSuspendidasImpago(2000);
      if (cancelled) return;
      if (data.length === 0 && rpcError) {
        setErrListaSuspendidasImpagoModal(rpcError);
        return;
      }
      setListaSuspendidasImpagoModal(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [kpiDetalle]);

  useEffect(() => {
    if (kpiDetalle !== 'productos_pausados') {
      setListaProductosPausadosModal(null);
      setErrListaProductosPausadosModal(null);
      return;
    }
    let cancelled = false;
    setListaProductosPausadosModal(null);
    setErrListaProductosPausadosModal(null);
    void (async () => {
      const res = await supabase
        .from('productos')
        .select(ADMIN_PRODUCTOS_SELECT)
        .or('activo.is.null,activo.eq.false')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (res.error) {
        setErrListaProductosPausadosModal(res.error.message);
        return;
      }
      const rows = (res.data ?? []) as AdminProducto[];
      setListaProductosPausadosModal(rows.filter((p) => p.activo !== true));
    })();
    return () => {
      cancelled = true;
    };
  }, [kpiDetalle]);

  const totalProductos = kpis?.productos_total ?? productos.length;
  const productosActivos = kpis?.productos_activos ?? productos.filter((p) => p.activo).length;
  const productosPausados = kpis?.productos_pausados ?? productos.filter((p) => p.activo !== true).length;
  const productosCountAuto = kpis?.productos_auto ?? productos.filter((p) => (p.vertical ?? 'auto') === 'auto').length;
  const productosCountMoto = kpis?.productos_moto ?? productos.filter((p) => p.vertical === 'moto').length;

  const emailsPorUserId = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const u of usuarios) {
      m.set(u.user_id, u.email);
    }
    return m;
  }, [usuarios]);

  const rifPorUserId = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const v of vendedores) {
      const r = v.rif?.trim();
      if (r) m.set(v.user_id, r);
    }
    for (const t of talleres) {
      const r = t.rif?.trim();
      if (r) m.set(t.user_id, r);
    }
    return m;
  }, [vendedores, talleres]);

  const vendedoresParaFiltroProductos = useMemo(() => {
    return [...vendedores].sort((a, b) => {
      const la = (a.nombre_comercial || a.nombre || '').toLocaleLowerCase('es');
      const lb = (b.nombre_comercial || b.nombre || '').toLocaleLowerCase('es');
      return la.localeCompare(lb, 'es');
    });
  }, [vendedores]);

  const vendedoresVisibles = useMemo(() => {
    let list = [...vendedores];
    if (filtroSoloSuspendidosImpago) {
      list = list.filter(perfilSuspendidoPorImpago);
    }
    list.sort((a, b) => {
      const sa = perfilSuspendidoPorImpago(a) ? 0 : 1;
      const sb = perfilSuspendidoPorImpago(b) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return cmpIsoDesc(a.created_at, b.created_at);
    });
    return list;
  }, [vendedores, filtroSoloSuspendidosImpago]);

  const vendedoresSuspendidosEnLista = useMemo(
    () => vendedores.filter(perfilSuspendidoPorImpago).length,
    [vendedores]
  );

  const talleresVisibles = useMemo(() => {
    let list = [...talleres];
    if (filtroSoloSuspendidosImpagoTalleres) {
      list = list.filter(perfilSuspendidoPorImpago);
    }
    list.sort((a, b) => {
      const sa = perfilSuspendidoPorImpago(a) ? 0 : 1;
      const sb = perfilSuspendidoPorImpago(b) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return cmpIsoDesc(a.created_at, b.created_at);
    });
    return list;
  }, [talleres, filtroSoloSuspendidosImpagoTalleres]);

  const talleresSuspendidosEnLista = useMemo(
    () => talleres.filter(perfilSuspendidoPorImpago).length,
    [talleres]
  );

  const productosFiltrados = useMemo(() => {
    const texto = busquedaProductosAdmin.trim().toLocaleLowerCase('es');
    const terminos = texto.split(/\s+/).filter(Boolean);
    return productos.filter((p) => {
      const vertOk =
        adminFiltroVertical === 'todos' || (p.vertical ?? 'auto') === adminFiltroVertical;
      const tidProd = p.tienda_id ?? primeraTiendaProducto(p)?.id;
      const vendedorOk =
        !adminFiltroVendedorTiendaId || tidProd === adminFiltroVendedorTiendaId;
      const semaforo = semaforoStockGestion(p);
      const estadoOk =
        filtroEstadoProductosAdmin === 'todos' ||
        (filtroEstadoProductosAdmin === 'activos' && p.activo === true) ||
        (filtroEstadoProductosAdmin === 'pausados' && p.activo !== true) ||
        (filtroEstadoProductosAdmin === 'por_aprobar' &&
          (p.aprobacion_publica ?? 'aprobado') === 'pendiente') ||
        (filtroEstadoProductosAdmin === 'agregado_reciente' &&
          esProductoAgregadoReciente(p.created_at)) ||
        (filtroEstadoProductosAdmin === 'proximos_stock' &&
          p.activo === true &&
          (semaforo.clase === 'amarillo' || semaforo.clase === 'rojo')) ||
        (filtroEstadoProductosAdmin === 'stock_vencido' && semaforo.clase === 'vencido') ||
        (filtroEstadoProductosAdmin === 'sin_fecha_stock' && semaforo.clase === 'sin-fecha');
      const fuente = [
        p.nombre,
        p.descripcion,
        p.comentarios,
        p.categoria,
        p.marca,
        p.modelo,
        p.anio != null ? String(p.anio) : '',
        p.precio_usd != null ? String(p.precio_usd) : '',
        etiquetaVendedorDesdeProducto(p, vendedores),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es');
      const textoOk = terminos.length === 0 || terminos.every((t) => fuente.includes(t));
      return vertOk && vendedorOk && estadoOk && textoOk;
    });
  }, [
    productos,
    adminFiltroVertical,
    adminFiltroVendedorTiendaId,
    busquedaProductosAdmin,
    filtroEstadoProductosAdmin,
    vendedores,
  ]);
  const productosObjetivoFotosMasivas = useMemo(() => {
    if (!fotosMasivasTiendaId) return [];
    if (fotosMasivasAlcance === 'seleccionados') {
      return productos.filter((p) => {
        if (!fotosMasivasSeleccionados.includes(p.id)) return false;
        const tidProd = p.tienda_id ?? primeraTiendaProducto(p)?.id;
        return tidProd === fotosMasivasTiendaId;
      });
    }
    return productos.filter((p) => {
      const tidProd = p.tienda_id ?? primeraTiendaProducto(p)?.id;
      if (tidProd !== fotosMasivasTiendaId) return false;
      if (fotosMasivasAlcance === 'sin_foto') {
        return !p.imagen_url || !String(p.imagen_url).trim();
      }
      return true;
    });
  }, [productos, fotosMasivasTiendaId, fotosMasivasAlcance, fotosMasivasSeleccionados]);
  const productosSeleccionablesFotosMasivas = useMemo(() => {
    if (!fotosMasivasTiendaId) return [];
    return productosFiltrados.filter((p) => {
      const tidProd = p.tienda_id ?? primeraTiendaProducto(p)?.id;
      return tidProd === fotosMasivasTiendaId;
    });
  }, [productosFiltrados, fotosMasivasTiendaId]);
  const productosPendientesFiltrados = useMemo(
    () => productosFiltrados.filter((p) => (p.aprobacion_publica ?? 'aprobado') === 'pendiente'),
    [productosFiltrados]
  );
  const vendedoresPendientesVisibles = useMemo(
    () => vendedores.filter((v) => (v.aprobacion_estado ?? 'aprobado') === 'pendiente'),
    [vendedores]
  );
  const talleresPendientesVisibles = useMemo(
    () => talleres.filter((t) => (t.aprobacion_estado ?? 'aprobado') === 'pendiente'),
    [talleres]
  );
  const tiendasPendientes = kpis?.tiendas_pendientes_aprobacion ?? vendedores.filter(
    (v) => (v.aprobacion_estado ?? 'aprobado') === 'pendiente'
  ).length;
  const talleresPendientes = kpis?.talleres_pendientes_aprobacion ?? talleres.filter(
    (t) => (t.aprobacion_estado ?? 'aprobado') === 'pendiente'
  ).length;
  const productosPendientesWeb = kpis?.productos_pendientes_web ?? productos.filter(
    (p) => (p.aprobacion_publica ?? 'aprobado') === 'pendiente'
  ).length;
  const vendedoresSuspendidosImpago =
    kpis?.vendedores_suspendidos_impago ?? vendedores.filter(perfilSuspendidoPorImpago).length;

  const listasKpiResumen = useMemo(() => {
    const u = [...usuarios].sort((a, b) => cmpIsoDesc(a.creado_en, b.creado_en));
    const v = [...vendedores].sort((a, b) => cmpIsoDesc(a.created_at, b.created_at));
    const t = [...talleres].sort((a, b) => cmpIsoDesc(a.created_at, b.created_at));
    const c = [...compradores].sort((a, b) => cmpIsoDesc(a.creado_en, b.creado_en));
    const pReciente = [...productos].sort((a, b) => cmpIsoDesc(a.created_at, b.created_at));
    const pActivos = pReciente.filter((p) => p.activo);
    const pPausados = pReciente.filter((p) => p.activo !== true);
    const pAuto = pReciente.filter((p) => (p.vertical ?? 'auto') === 'auto');
    const pMoto = pReciente.filter((p) => p.vertical === 'moto');
    const pPendWeb = pReciente.filter((p) => (p.aprobacion_publica ?? 'aprobado') === 'pendiente');
    const vPend = v.filter((x) => (x.aprobacion_estado ?? 'aprobado') === 'pendiente');
    const vSuspendImpago = v.filter((x) => perfilSuspendidoPorImpago(x));
    const tPend = t.filter((x) => (x.aprobacion_estado ?? 'aprobado') === 'pendiente');
    return {
      u,
      v,
      t,
      c,
      pReciente,
      pActivos,
      pPausados,
      pAuto,
      pMoto,
      pPendWeb,
      vPend,
      vSuspendImpago,
      tPend,
    };
  }, [usuarios, vendedores, talleres, compradores, productos]);

  const email = user?.email ?? '';

  const setProductoActivo = async (productoId: string, activo: boolean) => {
    setAccionando(`producto-${productoId}`);
    const { error: rpcError } = await supabase.rpc('admin_set_producto_activo', {
      p_producto_id: productoId,
      p_activo: activo,
    });
    if (rpcError) {
      setError(`No se pudo actualizar el producto: ${rpcError.message}`);
    } else {
      setProductos((prev) => prev.map((p) => (p.id === productoId ? { ...p, activo } : p)));
    }
    setAccionando(null);
  };

  const ejecutarAccionMasivaProductosFiltrados = async (accion: AccionMasivaProductosAdmin) => {
    if (!accion) return;
    const ids = productosFiltrados.map((p) => p.id);
    if (ids.length === 0) {
      setError('No hay productos en el listado filtrado.');
      return;
    }

    const etiqueta =
      accion === 'activar'
        ? `activar ${ids.length} producto(s) filtrado(s)`
        : accion === 'pausar'
          ? `pausar ${ids.length} producto(s) filtrado(s)`
          : `ELIMINAR DEFINITIVAMENTE ${ids.length} producto(s) filtrado(s)`;

    if (
      !window.confirm(
        accion === 'eliminar'
          ? `¿Confirmas ${etiqueta}? El vendedor verá en su panel: se eliminaron esos productos por no cumplir las normas. Esta acción no se puede deshacer desde el panel.`
          : `¿${etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)}?`
      )
    ) {
      return;
    }

    setAccionando('bulk-productos-masivo');
    setError(null);

    try {
      if (accion === 'eliminar') {
        const { data, error: rpcError } = await supabase.rpc('admin_eliminar_productos', {
          p_producto_ids: ids,
        });
        if (rpcError) throw rpcError;
        const n = typeof data === 'number' ? data : ids.length;
        setProductos((prev) => prev.filter((p) => !ids.includes(p.id)));
        void cargarKpis();
        if (n < ids.length) {
          setError(`Solo se eliminaron ${n} de ${ids.length} producto(s). Revisa permisos o restricciones en BD.`);
        }
      } else {
        const activo = accion === 'activar';
        const { data, error: rpcError } = await supabase.rpc('admin_set_productos_activo_bulk', {
          p_producto_ids: ids,
          p_activo: activo,
        });
        if (rpcError) throw rpcError;
        const n = typeof data === 'number' ? data : ids.length;
        setProductos((prev) =>
          prev.map((p) => (ids.includes(p.id) ? { ...p, activo } : p))
        );
        void cargarKpis();
        if (n < ids.length) {
          setError(`Solo se actualizaron ${n} de ${ids.length} producto(s). ¿Ejecutaste supabase-admin-panel.sql con las funciones bulk?`);
        }
      }
      setBulkProductosAccion('');
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : 'Error en acción masiva.';
      setError(
        `${msg} Si ves “function does not exist”, ejecuta en Supabase el bloque admin_set_productos_activo_bulk y admin_eliminar_productos de supabase-admin-panel.sql.`
      );
    } finally {
      setAccionando(null);
    }
  };

  const setTiendaBloqueada = async (tiendaId: string, bloqueado: boolean) => {
    setAccionando(`tienda-${tiendaId}`);
    const { error: rpcError } = await supabase.rpc('admin_set_tienda_bloqueada', {
      p_tienda_id: tiendaId,
      p_bloqueada: bloqueado,
    });
    if (rpcError) {
      setError(`No se pudo actualizar el vendedor: ${rpcError.message}`);
    } else {
      setVendedores((prev) => prev.map((t) => (t.id === tiendaId ? { ...t, bloqueado } : t)));
      void cargarKpis();
    }
    setAccionando(null);
  };

  const setTiendaMembresiaHasta = async (tiendaId: string, membresiaHasta: string) => {
    setAccionando(`membresia-${tiendaId}`);
    const { error: rpcError } = await supabase.rpc('admin_set_tienda_membresia_hasta', {
      p_tienda_id: tiendaId,
      p_membresia_hasta: membresiaHasta,
    });
    if (rpcError) {
      setError(
        `No se pudo actualizar la membresía: ${rpcError.message}. ¿Ejecutaste en Supabase el bloque admin que define admin_set_tienda_membresia_hasta (supabase-admin-panel.sql)?`
      );
    } else {
      setVendedores((prev) =>
        prev.map((t) => (t.id === tiendaId ? { ...t, membresia_hasta: membresiaHasta } : t))
      );
      void cargarKpis();
    }
    setAccionando(null);
  };

  const setTallerMembresiaHasta = async (tallerId: string, membresiaHasta: string) => {
    setAccionando(`membresia-taller-${tallerId}`);
    const { error: rpcError } = await supabase.rpc('admin_set_taller_membresia_hasta', {
      p_taller_id: tallerId,
      p_membresia_hasta: membresiaHasta,
    });
    if (rpcError) {
      setError(
        `No se pudo actualizar la membresía del taller: ${rpcError.message}. ¿Ejecutaste en Supabase admin_set_taller_membresia_hasta (supabase-admin-panel.sql o supabase-fix-talleres-visibilidad-publica.sql)?`
      );
    } else {
      setTalleres((prev) =>
        prev.map((t) => (t.id === tallerId ? { ...t, membresia_hasta: membresiaHasta } : t))
      );
      void cargarKpis();
    }
    setAccionando(null);
  };

  const guardarUbicacionNegocio = async (latitud: number, longitud: number) => {
    if (!ubicacionNegocioModal) return;
    const { tipo, id } = ubicacionNegocioModal;
    setAccionando(`ubic-${tipo}-${id}`);
    const rpc =
      tipo === 'tienda' ? 'admin_set_tienda_ubicacion' : 'admin_set_taller_ubicacion';
    const params =
      tipo === 'tienda'
        ? { p_tienda_id: id, p_latitud: latitud, p_longitud: longitud }
        : { p_taller_id: id, p_latitud: latitud, p_longitud: longitud };
    const { error: rpcError } = await supabase.rpc(rpc, params);
    if (rpcError) {
      setError(
        `No se pudo actualizar la ubicación: ${rpcError.message}. ¿Ejecutaste en Supabase admin_set_tienda_ubicacion y admin_set_taller_ubicacion (supabase-admin-panel.sql)?`
      );
    } else {
      if (tipo === 'tienda') {
        setVendedores((prev) =>
          prev.map((t) => (t.id === id ? { ...t, latitud, longitud } : t))
        );
      } else {
        setTalleres((prev) =>
          prev.map((t) => (t.id === id ? { ...t, latitud, longitud } : t))
        );
      }
      setUbicacionNegocioModal(null);
    }
    setAccionando(null);
  };

  const setTallerBloqueado = async (tallerId: string, bloqueado: boolean) => {
    setAccionando(`taller-${tallerId}`);
    const { error: rpcError } = await supabase.rpc('admin_set_taller_bloqueado', {
      p_taller_id: tallerId,
      p_bloqueado: bloqueado,
    });
    if (rpcError) {
      setError(`No se pudo actualizar el taller: ${rpcError.message}`);
    } else {
      setTalleres((prev) => prev.map((t) => (t.id === tallerId ? { ...t, bloqueado } : t)));
      void cargarKpis();
    }
    setAccionando(null);
  };

  const setTiendaAprobacion = async (tiendaId: string, estado: AprobacionEstado) => {
    const tienda = vendedores.find((v) => v.id === tiendaId);
    if (estado === 'aprobado' && tienda) {
      const err = mensajeNegocioNoListoParaAprobar(tienda);
      if (err) {
        setError(`No se puede aprobar: ${tienda.nombre_comercial || tienda.nombre || tiendaId}. ${err}`);
        return;
      }
    }
    setAccionando(`aprob-tienda-${tiendaId}`);
    const { error: rpcError } = await supabase.rpc('admin_set_tienda_aprobacion', {
      p_tienda_id: tiendaId,
      p_estado: estado,
    });
    if (rpcError) {
      setError(
        `No se pudo actualizar la tienda. ¿Ejecutaste supabase-aprobacion-contenido.sql? ${rpcError.message}`
      );
    } else {
      setVendedores((prev) =>
        prev.map((t) => (t.id === tiendaId ? { ...t, aprobacion_estado: estado } : t))
      );
    }
    setAccionando(null);
  };

  const setTallerAprobacion = async (tallerId: string, estado: AprobacionEstado) => {
    const taller = talleres.find((t) => t.id === tallerId);
    if (estado === 'aprobado' && taller) {
      const err = mensajeNegocioNoListoParaAprobar(taller);
      if (err) {
        setError(`No se puede aprobar: ${taller.nombre_comercial || taller.nombre || tallerId}. ${err}`);
        return;
      }
    }
    setAccionando(`aprob-taller-${tallerId}`);
    const { error: rpcError } = await supabase.rpc('admin_set_taller_aprobacion', {
      p_taller_id: tallerId,
      p_estado: estado,
    });
    if (rpcError) {
      setError(
        `No se pudo actualizar el taller. ¿Ejecutaste supabase-aprobacion-contenido.sql? ${rpcError.message}`
      );
    } else {
      await cargarTalleres(busquedaTalleres);
      void cargarKpis();
    }
    setAccionando(null);
  };

  const setProductoAprobacionWeb = async (productoId: string, estado: AprobacionEstado) => {
    setAccionando(`aprob-prod-${productoId}`);
    const { error: rpcError } = await supabase.rpc('admin_set_producto_aprobacion_publica', {
      p_producto_id: productoId,
      p_estado: estado,
    });
    if (rpcError) {
      setError(
        `No se pudo actualizar el producto. ¿Ejecutaste supabase-aprobacion-contenido.sql? ${rpcError.message}`
      );
    } else {
      setProductos((prev) =>
        prev.map((p) => (p.id === productoId ? { ...p, aprobacion_publica: estado } : p))
      );
    }
    setAccionando(null);
  };

  const cambiarFotoMasiva = (idx: number, file: File | null) => {
    setMensajeFotosMasivas(null);
    setFotosMasivasArchivos((prev) => prev.map((f, i) => (i === idx ? file : f)));
  };

  const toggleProductoFotoMasiva = (productoId: string, checked: boolean) => {
    setMensajeFotosMasivas(null);
    setFotosMasivasSeleccionados((prev) => {
      if (checked) return prev.includes(productoId) ? prev : [...prev, productoId];
      return prev.filter((id) => id !== productoId);
    });
  };

  const seleccionarProductosFotosMasivasVisibles = () => {
    setMensajeFotosMasivas(null);
    const ids = productosSeleccionablesFotosMasivas.map((p) => p.id);
    setFotosMasivasSeleccionados((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const limpiarSeleccionFotosMasivas = () => {
    setMensajeFotosMasivas(null);
    setFotosMasivasSeleccionados([]);
  };

  const cambiarFotoAdminProducto = (productoId: string, total: number, delta: number) => {
    if (total <= 1) return;
    setFotoActivaAdminProducto((prev) => {
      const actual = prev[productoId] ?? 0;
      return { ...prev, [productoId]: (actual + delta + total) % total };
    });
  };

  const aplicarFotosMasivas = async () => {
    setMensajeFotosMasivas(null);
    setError(null);

    const tiendaId = fotosMasivasTiendaId.trim();
    const fotoPrincipal = fotosMasivasArchivos[0];
    const objetivos = productosObjetivoFotosMasivas;

    if (!tiendaId) {
      setMensajeFotosMasivas('Selecciona un vendedor.');
      return;
    }
    if (!fotoPrincipal) {
      setMensajeFotosMasivas('Sube al menos la foto 1 (principal).');
      return;
    }
    if (!objetivos.length) {
      setMensajeFotosMasivas('No hay productos para actualizar con el alcance elegido.');
      return;
    }

    const vendedor = vendedores.find((v) => v.id === tiendaId);
    const etiqueta = vendedor?.nombre_comercial || vendedor?.nombre || 'este vendedor';
    if (
      !window.confirm(
        `¿Aplicar estas fotos a ${objetivos.length} producto(s) de "${etiqueta}"?\n\n` +
          'La foto 1 será principal y las demás quedarán como fotos adicionales. Esta acción reemplaza las fotos actuales de esos productos.'
      )
    ) {
      return;
    }

    setAccionando('bulk-fotos-productos');
    try {
      const bucket = supabase.storage.from('productos');
      const urls: string[] = [];
      const lote = `${Date.now()}`;

      for (let i = 0; i < fotosMasivasArchivos.length; i += 1) {
        const raw = fotosMasivasArchivos[i];
        if (!raw) continue;
        const lista = await optimizarImagenProductoParaStorage(raw, {
          maxBytes: MAX_BYTES_FOTO_PRODUCTO,
        });
        if (lista.size > MAX_BYTES_FOTO_PRODUCTO) {
          throw new Error(`La foto ${i + 1} no debe superar ${MAX_MB_FOTO_PRODUCTO} MB.`);
        }
        const ext = lista.name.split('.').pop() || 'jpg';
        const path = `admin-fotos-masivas/${tiendaId}/${lote}/foto-${i + 1}.${ext}`;
        const { error: upErr } = await bucket.upload(path, lista, { upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = bucket.getPublicUrl(path);
        urls[i] = pub.publicUrl;
      }

      const imagenUrl = urls[0];
      const extras = urls.slice(1).filter((u): u is string => typeof u === 'string' && Boolean(u));
      const ids = objetivos.map((p) => p.id);
      const { data, error: rpcError } = await supabase.rpc('admin_set_productos_fotos_masivas', {
        p_producto_ids: ids,
        p_imagen_url: imagenUrl,
        p_imagenes_extra: extras.length ? extras : null,
      });
      if (rpcError) throw rpcError;

      const actualizados = typeof data === 'number' ? data : ids.length;
      setProductos((prev) =>
        prev.map((p) =>
          ids.includes(p.id)
            ? { ...p, imagen_url: imagenUrl, imagenes_extra: extras.length ? extras : null }
            : p
        )
      );
      setMensajeFotosMasivas(`Fotos aplicadas a ${actualizados} producto(s).`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudieron aplicar las fotos masivas.';
      setMensajeFotosMasivas(msg);
      setError(msg);
    } finally {
      setAccionando(null);
    }
  };

  const aprobarProductosPendientesVisibles = async () => {
    const pendientes = productosPendientesFiltrados;
    if (!pendientes.length) return;
    if (!window.confirm(`¿Autorizar ${pendientes.length} producto(s) pendiente(s) visibles en esta lista?`)) return;

    setAccionando('bulk-productos-aprobar');
    setError(null);
    const okIds: string[] = [];
    const errores: string[] = [];

    for (const p of pendientes) {
      const { error: rpcError } = await supabase.rpc('admin_set_producto_aprobacion_publica', {
        p_producto_id: p.id,
        p_estado: 'aprobado',
      });
      if (rpcError) errores.push(`${p.nombre}: ${rpcError.message}`);
      else okIds.push(p.id);
    }

    if (okIds.length) {
      setProductos((prev) =>
        prev.map((p) => (okIds.includes(p.id) ? { ...p, aprobacion_publica: 'aprobado' } : p))
      );
      void cargarKpis();
    }
    if (errores.length) {
      setError(`Se aprobaron ${okIds.length} producto(s), pero fallaron ${errores.length}: ${errores.slice(0, 3).join(' | ')}`);
    }
    setAccionando(null);
  };

  const aprobarVendedoresPendientesVisibles = async () => {
    const pendientes = vendedoresPendientesVisibles;
    if (!pendientes.length) return;
    if (!window.confirm(`¿Autorizar ${pendientes.length} vendedor(es) pendiente(s) visibles?`)) return;

    setAccionando('bulk-vendedores-aprobar');
    setError(null);
    const okIds: string[] = [];
    const errores: string[] = [];

    for (const v of pendientes) {
      const errDatos = mensajeNegocioNoListoParaAprobar(v);
      if (errDatos) {
        errores.push(`${v.nombre_comercial || v.nombre || v.id}: ${errDatos}`);
        continue;
      }
      const { error: rpcError } = await supabase.rpc('admin_set_tienda_aprobacion', {
        p_tienda_id: v.id,
        p_estado: 'aprobado',
      });
      if (rpcError) errores.push(`${v.nombre_comercial || v.nombre || v.id}: ${rpcError.message}`);
      else okIds.push(v.id);
    }

    if (okIds.length) {
      setVendedores((prev) =>
        prev.map((v) => (okIds.includes(v.id) ? { ...v, aprobacion_estado: 'aprobado' } : v))
      );
      void cargarKpis();
    }
    if (errores.length) {
      setError(`Se aprobaron ${okIds.length} vendedor(es), pero fallaron ${errores.length}: ${errores.slice(0, 3).join(' | ')}`);
    }
    setAccionando(null);
  };

  const aprobarTalleresPendientesVisibles = async () => {
    const pendientes = talleresPendientesVisibles;
    if (!pendientes.length) return;
    if (!window.confirm(`¿Autorizar ${pendientes.length} taller(es) pendiente(s) visibles?`)) return;

    setAccionando('bulk-talleres-aprobar');
    setError(null);
    const okIds: string[] = [];
    const errores: string[] = [];

    for (const t of pendientes) {
      const errDatos = mensajeNegocioNoListoParaAprobar(t);
      if (errDatos) {
        errores.push(`${t.nombre_comercial || t.nombre || t.id}: ${errDatos}`);
        continue;
      }
      const { error: rpcError } = await supabase.rpc('admin_set_taller_aprobacion', {
        p_taller_id: t.id,
        p_estado: 'aprobado',
      });
      if (rpcError) errores.push(`${t.nombre_comercial || t.nombre || t.id}: ${rpcError.message}`);
      else okIds.push(t.id);
    }

    if (okIds.length) {
      await cargarTalleres(busquedaTalleres);
      void cargarKpis();
    }
    if (errores.length) {
      setError(`Se aprobaron ${okIds.length} taller(es), pero fallaron ${errores.length}: ${errores.slice(0, 3).join(' | ')}`);
    }
    setAccionando(null);
  };

  const setUsuarioAdmin = async (userId: string, esAdmin: boolean) => {
    setAccionando(`usuario-${userId}`);
    const { error: rpcError } = await supabase.rpc('admin_set_user_role', {
      p_user_id: userId,
      p_role: esAdmin ? 'admin' : '',
    });
    if (rpcError) {
      setError(`No se pudo actualizar el rol: ${rpcError.message}`);
    } else {
      setUsuarios((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, role: esAdmin ? 'admin' : null } : u))
      );
    }
    setAccionando(null);
  };

  const setCompradorSuspendidoMembresia = async (userId: string, suspendido: boolean) => {
    setAccionando(`comp-memb-${userId}`);
    const { error: rpcError } = await supabase.rpc('admin_set_comprador_suspendido_membresia', {
      p_user_id: userId,
      p_suspendido: suspendido,
    });
    if (rpcError) {
      setError(`No se pudo actualizar la membresía del comprador: ${rpcError.message}`);
    } else {
      setCompradores((prev) =>
        prev.map((c) => (c.user_id === userId ? { ...c, suspendido_membresia: suspendido } : c))
      );
    }
    setAccionando(null);
  };

  const eliminarUsuario = async (u: AdminUsuario) => {
    if (!user) return;
    if (u.user_id === user.id) {
      setError('No puedes eliminar tu propia cuenta desde aquí.');
      return;
    }
    const etiqueta = u.email || u.user_id;
    const extraAdmin = u.role === 'admin' ? '\n\nATENCIÓN: este usuario es administrador.' : '';
    if (
      !window.confirm(
        `¿Eliminar definitivamente la cuenta "${etiqueta}"?\n\nSe borrarán sus tiendas, talleres, productos publicados e historial de contactos. Esta acción no se puede deshacer.${extraAdmin}`
      )
    ) {
      return;
    }
    if (
      !window.confirm(
        `Segunda confirmación: ¿borrar para siempre a "${etiqueta}"?`
      )
    ) {
      return;
    }

    setAccionando(`eliminar-${u.user_id}`);
    setError(null);
    const { error: rpcError } = await supabase.rpc('admin_eliminar_usuario', {
      p_user_id: u.user_id,
    });
    if (rpcError) {
      setError(
        `No se pudo eliminar el usuario. Ejecuta en Supabase el script supabase-admin-eliminar-usuario.sql si falta la función RPC. Detalle: ${rpcError.message}`
      );
    } else {
      await Promise.all([cargarKpis(), cargarUsuarios(busquedaUsuarios)]);
    }
    setAccionando(null);
  };

  const irATabDesdeKpi = (t: AdminTab, desdeKpi?: AdminKpiDetalle | null) => {
    if (desdeKpi === 'vendedores_suspendidos_impago') {
      setFiltroSoloSuspendidosImpago(true);
      setBusquedaVendedores('');
    }
    setTab(t);
    setKpiDetalle(null);
  };

  const notaCargaVsKpi = (kpiTotal: number | undefined, cargados: number, limite: number, etiqueta: string) => {
    if (kpiTotal == null) return null;
    if (cargados < kpiTotal) {
      return (
        <p className="dashboard-kpi-modal-aviso">
          Total en sistema (KPI): <strong>{kpiTotal}</strong> {etiqueta}. Este panel cargó{' '}
          <strong>{cargados}</strong> (máx. {limite} en listados). Usa la pestaña correspondiente y búsquedas para
          ver el resto.
        </p>
      );
    }
    return null;
  };

  const truncNotice = (trunc: number) =>
    trunc > 0 ? (
      <p className="dashboard-kpi-modal-aviso">
        Mostrando las primeras <strong>{ADMIN_KPI_MODAL_ROWS}</strong> filas (recientes primero). Quedan{' '}
        <strong>{trunc}</strong> sin listar aquí — abre la pestaña para gestionar o filtrar.
      </p>
    ) : null;

  function tablaTiendas(lista: AdminTienda[], vacio: string) {
    const { rows, total, trunc } = capFilasKpiModal(lista);
    if (total === 0) return <p className="dashboard-texto-placeholder">{vacio}</p>;
    return (
      <>
        {truncNotice(trunc)}
        <div className="dashboard-kpi-modal-table-wrap">
          <table className="dashboard-admin-table">
            <thead>
              <tr>
                <th>Nombre comercial</th>
                <th>RIF</th>
                <th>Correo</th>
                <th>Ubicación (lat, lng)</th>
                <th>Ciudad</th>
                <th>Aprobación</th>
                <th>Bloqueado</th>
                <th>Membresía hasta</th>
                <th>Alta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td>{v.nombre_comercial?.trim() || v.nombre || '—'}</td>
                  <td className="dashboard-admin-rif-td">{celdaRifAdmin(v.rif)}</td>
                  <td>{emailNegocioAdmin(v, emailsPorUserId)}</td>
                  <td className="dashboard-admin-coords">{celdaUbicacionAdmin(v.latitud, v.longitud)}</td>
                  <td>{v.ciudad || '—'}</td>
                  <td>{etiquetaAprobacion(v.aprobacion_estado)}</td>
                  <td>{v.bloqueado ? 'Sí' : 'No'}</td>
                  <td>
                    {fmtMembresiaHasta(v.membresia_hasta)}
                  </td>
                  <td>{fmtFecha(v.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="dashboard-kpi-modal-meta">Registros en esta vista: {total}</p>
      </>
    );
  }

  function tablaTalleres(lista: AdminTaller[], vacio: string) {
    const { rows, total, trunc } = capFilasKpiModal(lista);
    if (total === 0) return <p className="dashboard-texto-placeholder">{vacio}</p>;
    return (
      <>
        {truncNotice(trunc)}
        <div className="dashboard-kpi-modal-table-wrap">
          <table className="dashboard-admin-table">
            <thead>
              <tr>
                <th>Nombre comercial</th>
                <th>RIF</th>
                <th>Teléfono</th>
                <th>Correo</th>
                <th>Ubicación (lat, lng)</th>
                <th>Ciudad</th>
                <th>Aprobación</th>
                <th>Estado pago</th>
                <th>Membresía hasta</th>
                <th>Alta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.nombre_comercial?.trim() || t.nombre || '—'}</td>
                  <td className="dashboard-admin-rif-td">{celdaRifAdmin(t.rif)}</td>
                  <td>{t.telefono || '—'}</td>
                  <td>{emailNegocioAdmin(t, emailsPorUserId)}</td>
                  <td className="dashboard-admin-coords">{celdaUbicacionAdmin(t.latitud, t.longitud)}</td>
                  <td>{t.ciudad || '—'}</td>
                  <td>{etiquetaAprobacion(t.aprobacion_estado)}</td>
                  <td>{etiquetaEstadoImpagoPerfil(t).texto}</td>
                  <td>{fmtMembresiaHasta(t.membresia_hasta)}</td>
                  <td>{fmtFecha(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="dashboard-kpi-modal-meta">Registros en esta vista: {total}</p>
      </>
    );
  }

  function tablaProductos(lista: AdminProducto[], vacio: string) {
    const { rows, total, trunc } = capFilasKpiModal(lista);
    if (total === 0) return <p className="dashboard-texto-placeholder">{vacio}</p>;
    return (
      <>
        {truncNotice(trunc)}
        <div className="dashboard-kpi-modal-table-wrap">
          <table className="dashboard-admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Marca</th>
                <th>Vertical</th>
                <th>Activo</th>
                <th>Aprob. web</th>
                <th>Vendedor</th>
                <th>Alta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td>{p.marca || '—'}</td>
                  <td>{p.vertical ?? 'auto'}</td>
                  <td>{p.activo ? 'Sí' : 'No'}</td>
                  <td>{etiquetaAprobacion(p.aprobacion_publica)}</td>
                  <td>{etiquetaVendedorDesdeProducto(p, vendedores)}</td>
                  <td>{fmtFecha(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="dashboard-kpi-modal-meta">Registros en esta vista: {total}</p>
      </>
    );
  }

  function cuerpoDetalleKpi(): ReactNode {
    if (!kpiDetalle) return null;
    const L = listasKpiResumen;

    switch (kpiDetalle) {
      case 'usuarios_total': {
        const { rows, total, trunc } = capFilasKpiModal(L.u);
        return (
          <>
            {notaCargaVsKpi(kpis?.usuarios_total, usuarios.length, ADMIN_LIST_LIMIT, 'usuarios')}
            {total === 0 ? (
              <p className="dashboard-texto-placeholder">No hay usuarios en el listado cargado.</p>
            ) : (
              <>
                {truncNotice(trunc)}
                <div className="dashboard-kpi-modal-table-wrap">
                  <table className="dashboard-admin-table">
                    <thead>
                      <tr>
                        <th>Correo</th>
                        <th>Nombre</th>
                        <th>Teléfono</th>
                        <th>Tipo</th>
                        <th>Rol</th>
                        <th>RIF</th>
                        <th>User ID</th>
                        <th>Creado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((u) => (
                        <tr key={u.user_id}>
                          <td className="dashboard-admin-email-td">
                            {celdaEmailAdmin(u.email)}
                          </td>
                          <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(u.nombre)}</td>
                          <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(u.telefono)}</td>
                          <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(u.tipo_cuenta)}</td>
                          <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(u.role)}</td>
                          <td className="dashboard-admin-rif-td">
                            {celdaRifAdmin(rifPorUserId.get(u.user_id) ?? null)}
                          </td>
                          <td className="dashboard-admin-userid-td">
                            <AdminCeldaUserId
                              userId={u.user_id}
                              onVer={() =>
                                setUserIdPerfilModal({
                                  nombre: u.email || 'Usuario',
                                  userId: u.user_id,
                                })
                              }
                            />
                          </td>
                          <td className="dashboard-admin-texto-td dashboard-admin-membresia-td">
                            {celdaTextoUnaLineaAdmin(fmtFechaCortaAdmin(u.creado_en))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="dashboard-kpi-modal-meta">Filas mostradas: {rows.length}</p>
              </>
            )}
          </>
        );
      }
      case 'vendedores_total':
        return (
          <>
            {notaCargaVsKpi(kpis?.vendedores_total, vendedores.length, ADMIN_LIST_LIMIT, 'tiendas / vendedores')}
            {tablaTiendas(L.v, 'No hay tiendas en el listado cargado.')}
          </>
        );
      case 'vendedores_suspendidos_impago': {
        const cargandoSuspendidas =
          listaSuspendidasImpagoModal === null && errListaSuspendidasImpagoModal == null;
        const listaMostrar =
          errListaSuspendidasImpagoModal != null ? L.vSuspendImpago : (listaSuspendidasImpagoModal ?? []);
        return (
          <>
            <p className="dashboard-kpi-modal-meta" style={{ marginBottom: '0.75rem' }}>
              Tiendas <strong>aprobadas</strong> que no cumplen condiciones de publicación en la web: bloqueo por admin
              (Suspender por impago) o <strong>sin membresía vigente</strong> (fecha pasada o sin fecha).
            </p>
            {cargandoSuspendidas && (
              <p className="dashboard-texto-placeholder">Cargando listado completo desde el servidor…</p>
            )}
            {errListaSuspendidasImpagoModal != null && (
              <p className="dashboard-kpi-modal-aviso">
                No se pudo cargar el listado completo: {errListaSuspendidasImpagoModal}. Se muestran solo las tiendas
                ya cargadas en esta sesión ({L.vSuspendImpago.length}).
              </p>
            )}
            {!cargandoSuspendidas &&
              kpis?.vendedores_suspendidos_impago != null &&
              listaMostrar.length !== kpis.vendedores_suspendidos_impago && (
                <p className="dashboard-kpi-modal-aviso">
                  El KPI indica <strong>{kpis.vendedores_suspendidos_impago}</strong> y este listado muestra{' '}
                  <strong>{listaMostrar.length}</strong>. Ejecuta en Supabase el bloque SQL del panel admin
                  (funciones <code>tienda_suspendida_por_impago</code> y{' '}
                  <code>admin_list_tiendas_suspendidas_impago</code>) y recarga la página.
                </p>
              )}
            {!cargandoSuspendidas &&
              tablaTiendas(
                listaMostrar,
                errListaSuspendidasImpagoModal != null
                  ? 'No hay coincidencias en el listado de respaldo.'
                  : 'No hay vendedores en esta categoría.'
              )}
          </>
        );
      }
      case 'talleres_total':
        return (
          <>
            {notaCargaVsKpi(kpis?.talleres_total, talleres.length, ADMIN_LIST_LIMIT, 'talleres')}
            {tablaTalleres(L.t, 'No hay talleres en el listado cargado.')}
          </>
        );
      case 'compradores_total': {
        const { rows, total, trunc } = capFilasKpiModal(L.c);
        return (
          <>
            {notaCargaVsKpi(kpis?.compradores_total, compradores.length, ADMIN_LIST_LIMIT, 'compradores')}
            {total === 0 ? (
              <p className="dashboard-texto-placeholder">No hay compradores en el listado cargado.</p>
            ) : (
              <>
                {truncNotice(trunc)}
                <div className="dashboard-kpi-modal-table-wrap">
                  <table className="dashboard-admin-table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Teléfono</th>
                        <th>Ciudad</th>
                        <th>Memb. suspendida</th>
                        <th>Alta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c) => (
                        <tr key={c.user_id}>
                          <td className="dashboard-admin-texto-td dashboard-admin-nombre-td">
                            {celdaTextoUnaLineaAdmin(c.nombre_comercial?.trim() || c.nombre)}
                          </td>
                          <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(c.telefono)}</td>
                          <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(c.ciudad)}</td>
                          <td className="dashboard-admin-status-td">
                            <span
                              className={`dashboard-admin-status dashboard-admin-status--compacto ${
                                c.suspendido_membresia ? 'rechazado' : 'ok'
                              }`}
                              title={c.suspendido_membresia ? 'Sí' : 'No'}
                            >
                              {c.suspendido_membresia ? 'NO' : 'OK'}
                            </span>
                          </td>
                          <td className="dashboard-admin-texto-td dashboard-admin-membresia-td">
                            {celdaTextoUnaLineaAdmin(fmtFechaCortaAdmin(c.creado_en))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="dashboard-kpi-modal-meta">Registros en esta vista: {total}</p>
              </>
            )}
          </>
        );
      }
      case 'productos_activos':
        return tablaProductos(L.pActivos, 'No hay productos activos en el catálogo cargado.');
      case 'productos_pausados': {
        const cargandoPausados =
          listaProductosPausadosModal === null && errListaProductosPausadosModal == null;
        const listaMostrar =
          errListaProductosPausadosModal != null ? L.pPausados : (listaProductosPausadosModal ?? []);
        return (
          <>
            <p className="dashboard-kpi-modal-meta" style={{ marginBottom: '0.75rem' }}>
              Productos con <strong>activo</strong> en falso o sin valor (igual que el KPI en base de datos).
            </p>
            {cargandoPausados && (
              <p className="dashboard-texto-placeholder">Cargando productos pausados desde el servidor…</p>
            )}
            {errListaProductosPausadosModal != null && (
              <p className="dashboard-kpi-modal-aviso">
                No se pudo cargar el listado completo: {errListaProductosPausadosModal}. Se muestran solo los del
                catálogo ya cargado ({L.pPausados.length}).
              </p>
            )}
            {!cargandoPausados &&
              kpis?.productos_pausados != null &&
              listaMostrar.length !== kpis.productos_pausados && (
                <p className="dashboard-kpi-modal-aviso">
                  El KPI indica <strong>{kpis.productos_pausados}</strong> y este listado muestra{' '}
                  <strong>{listaMostrar.length}</strong>. Revisa <code>admin_dashboard_counts</code> y permisos RLS.
                </p>
              )}
            {!cargandoPausados &&
              tablaProductos(
                listaMostrar,
                errListaProductosPausadosModal != null
                  ? 'No hay productos pausados en el listado de respaldo.'
                  : 'No hay productos pausados.'
              )}
          </>
        );
      }
      case 'productos_total':
        return tablaProductos(L.pReciente, 'No hay productos en el catálogo cargado.');
      case 'catalogo_auto':
        return tablaProductos(L.pAuto, 'No hay productos de automóvil en el catálogo cargado.');
      case 'catalogo_moto':
        return tablaProductos(L.pMoto, 'No hay productos de moto en el catálogo cargado.');
      case 'vendedores_pendientes':
        return tablaTiendas(L.vPend, 'No hay tiendas pendientes de autorización.');
      case 'talleres_pendientes':
        return tablaTalleres(L.tPend, 'No hay talleres pendientes de autorización.');
      case 'productos_pendientes_web':
        return tablaProductos(L.pPendWeb, 'No hay productos pendientes de aprobación para la web.');
      default:
        return null;
    }
  }

  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        {email && (
          <div className="dashboard-sidebar-usuario">
            <span className="dashboard-sidebar-email">{email}</span>
          </div>
        )}
        <nav className="dashboard-menu">
          <button type="button" className={`dashboard-menu-item ${tab === 'resumen' ? 'activo' : ''}`} onClick={() => setTab('resumen')}>Inicio admin</button>
          <button type="button" className={`dashboard-menu-item ${tab === 'usuarios' ? 'activo' : ''}`} onClick={() => setTab('usuarios')}>Usuarios</button>
          <button type="button" className={`dashboard-menu-item ${tab === 'productos' ? 'activo' : ''}`} onClick={() => setTab('productos')}>Productos</button>
          <button type="button" className={`dashboard-menu-item ${tab === 'vendedores' ? 'activo' : ''}`} onClick={() => setTab('vendedores')}>Vendedores</button>
          <button type="button" className={`dashboard-menu-item ${tab === 'talleres' ? 'activo' : ''}`} onClick={() => setTab('talleres')}>Talleres</button>
          <button type="button" className={`dashboard-menu-item ${tab === 'compradores' ? 'activo' : ''}`} onClick={() => setTab('compradores')}>Compradores</button>
        </nav>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-header">
          <div className="dashboard-header-titulos">
            <h1 className="dashboard-titulo">Panel administrador</h1>
            <p className="dashboard-subtitulo">
              Usuarios, perfiles, productos y <strong>autorización</strong> para la web (vendedores, talleres y cada
              publicación).
            </p>
          </div>
          <div className="dashboard-usuario">
            <button type="button" className="dashboard-btn-accion" onClick={() => void cargar()}>Actualizar</button>
            {onVolverInicio && <button type="button" className="dashboard-btn-inicio" onClick={onVolverInicio}>Volver al inicio</button>}
            <button type="button" className="dashboard-btn-salir" onClick={signOut}>Cerrar sesión</button>
          </div>
        </header>

        <main className="dashboard-contenido">
          {error && <p className="dashboard-admin-error">{error}</p>}
          {cargando ? (
            <p className="dashboard-texto-placeholder">Cargando datos globales…</p>
          ) : (
            <>
              {tab === 'resumen' && (
                <section className="dashboard-seccion">
                  <h2 className="dashboard-seccion-titulo">Resumen global</h2>
                  <p className="dashboard-kpi-grid-hint">Pulsa una tarjeta para ver el listado detallado (datos ya cargados en esta sesión).</p>
                  <div className="dashboard-kpi-grid">
                    <button
                      type="button"
                      className="dashboard-kpi-card dashboard-kpi-card--clickable"
                      onClick={() => setKpiDetalle('usuarios_total')}
                    >
                      <p className="dashboard-kpi-label">Usuarios (total)</p>
                      <p className="dashboard-kpi-valor">{kpis?.usuarios_total ?? usuarios.length}</p>
                    </button>
                    <button
                      type="button"
                      className="dashboard-kpi-card dashboard-kpi-card--clickable"
                      onClick={() => setKpiDetalle('vendedores_total')}
                    >
                      <p className="dashboard-kpi-label">Vendedores (total)</p>
                      <p className="dashboard-kpi-valor">{kpis?.vendedores_total ?? vendedores.length}</p>
                    </button>
                    <button
                      type="button"
                      className="dashboard-kpi-card dashboard-kpi-card--alerta dashboard-kpi-card--clickable"
                      onClick={() => setKpiDetalle('vendedores_suspendidos_impago')}
                    >
                      <p className="dashboard-kpi-label">Vendedores suspendidos por impago</p>
                      <p className="dashboard-kpi-valor">{vendedoresSuspendidosImpago}</p>
                    </button>
                    <button
                      type="button"
                      className="dashboard-kpi-card dashboard-kpi-card--clickable"
                      onClick={() => setKpiDetalle('talleres_total')}
                    >
                      <p className="dashboard-kpi-label">Talleres (total)</p>
                      <p className="dashboard-kpi-valor">{kpis?.talleres_total ?? talleres.length}</p>
                    </button>
                    <button
                      type="button"
                      className="dashboard-kpi-card dashboard-kpi-card--clickable"
                      onClick={() => setKpiDetalle('compradores_total')}
                    >
                      <p className="dashboard-kpi-label">Compradores (total)</p>
                      <p className="dashboard-kpi-valor">{kpis?.compradores_total ?? compradores.length}</p>
                    </button>
                    <button
                      type="button"
                      className="dashboard-kpi-card dashboard-kpi-card--clickable"
                      onClick={() => setKpiDetalle('productos_activos')}
                    >
                      <p className="dashboard-kpi-label">Productos activos</p>
                      <p className="dashboard-kpi-valor">{productosActivos}</p>
                    </button>
                    <button
                      type="button"
                      className="dashboard-kpi-card dashboard-kpi-card--clickable"
                      onClick={() => setKpiDetalle('productos_pausados')}
                    >
                      <p className="dashboard-kpi-label">Productos pausados</p>
                      <p className="dashboard-kpi-valor">{productosPausados}</p>
                    </button>
                    <button
                      type="button"
                      className="dashboard-kpi-card dashboard-kpi-card--clickable"
                      onClick={() => setKpiDetalle('productos_total')}
                    >
                      <p className="dashboard-kpi-label">Total productos</p>
                      <p className="dashboard-kpi-valor">{totalProductos}</p>
                    </button>
                    <button
                      type="button"
                      className="dashboard-kpi-card dashboard-kpi-card--clickable"
                      onClick={() => setKpiDetalle('catalogo_auto')}
                    >
                      <p className="dashboard-kpi-label">Catálogo auto</p>
                      <p className="dashboard-kpi-valor">{productosCountAuto}</p>
                    </button>
                    <button
                      type="button"
                      className="dashboard-kpi-card dashboard-kpi-card--clickable"
                      onClick={() => setKpiDetalle('catalogo_moto')}
                    >
                      <p className="dashboard-kpi-label">Catálogo moto</p>
                      <p className="dashboard-kpi-valor">{productosCountMoto}</p>
                    </button>
                    <button
                      type="button"
                      className="dashboard-kpi-card dashboard-kpi-card--alerta dashboard-kpi-card--clickable"
                      onClick={() => setKpiDetalle('vendedores_pendientes')}
                    >
                      <p className="dashboard-kpi-label">Vendedores por autorizar</p>
                      <p className="dashboard-kpi-valor">{tiendasPendientes}</p>
                    </button>
                    <button
                      type="button"
                      className="dashboard-kpi-card dashboard-kpi-card--alerta dashboard-kpi-card--clickable"
                      onClick={() => setKpiDetalle('talleres_pendientes')}
                    >
                      <p className="dashboard-kpi-label">Talleres por autorizar</p>
                      <p className="dashboard-kpi-valor">{talleresPendientes}</p>
                    </button>
                    <button
                      type="button"
                      className="dashboard-kpi-card dashboard-kpi-card--alerta dashboard-kpi-card--clickable"
                      onClick={() => setKpiDetalle('productos_pendientes_web')}
                    >
                      <p className="dashboard-kpi-label">Productos por autorizar (web)</p>
                      <p className="dashboard-kpi-valor">{productosPendientesWeb}</p>
                    </button>
                  </div>
                  <p className="dashboard-texto-placeholder" style={{ marginTop: '0.5rem' }}>
                    Revisa las pestañas <strong>Vendedores</strong>, <strong>Talleres</strong> y <strong>Productos</strong>{' '}
                    y usa <strong>Autorizar</strong> / <strong>Rechazar</strong> según corresponda. Ejecuta en Supabase el
                    script <code>supabase-aprobacion-contenido.sql</code> si aún no está aplicado.
                  </p>
                  {!kpis && (
                    <p className="dashboard-admin-productos-hint" style={{ marginTop: '0.35rem' }}>
                      Si los totales no coinciden con la realidad, ejecuta en Supabase el{' '}
                      <code>supabase-admin-panel.sql</code> actualizado (función <code>admin_dashboard_counts</code>).
                    </p>
                  )}
                </section>
              )}

              {tab === 'usuarios' && (
                <section className="dashboard-seccion">
                  <h2 className="dashboard-seccion-titulo">Usuarios registrados</h2>
                  <div className="dashboard-admin-busqueda-fila">
                    <label htmlFor="admin-buscar-usuarios" className="dashboard-admin-busqueda-label">
                      Buscar (correo, nombre, teléfono, tipo o parte del ID)
                    </label>
                    <input
                      id="admin-buscar-usuarios"
                      type="search"
                      className="dashboard-admin-busqueda-input"
                      placeholder="Ej: @gmail, vendedor, uuid…"
                      value={busquedaUsuarios}
                      onChange={(e) => setBusquedaUsuarios(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <span className="dashboard-admin-busqueda-hint">
                      Hasta {ADMIN_LIST_LIMIT} coincidencias. Vacío = recientes primero.
                    </span>
                  </div>
                  <p className="dashboard-admin-productos-hint">
                    Puedes eliminar una cuenta completa (Auth + tiendas/talleres/productos asociados) con{' '}
                    <strong>Eliminar usuario</strong>. Requiere la función RPC{' '}
                    <code>admin_eliminar_usuario</code> — ejecuta <code>supabase-admin-eliminar-usuario.sql</code> en
                    Supabase si aún no lo hiciste.
                  </p>
                  <div className="dashboard-admin-table-wrap">
                    <table className="dashboard-admin-table">
                      <thead>
                        <tr>
                          <th>Correo</th>
                          <th>Nombre</th>
                          <th>Teléfono</th>
                          <th>Tipo</th>
                          <th>Role</th>
                          <th>RIF</th>
                          <th>User ID</th>
                          <th>Creado</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usuarios.map((u) => {
                          const esMiCuenta = user?.id === u.user_id;
                          const ocupado =
                            accionando === `usuario-${u.user_id}` ||
                            accionando === `eliminar-${u.user_id}`;
                          return (
                            <tr key={u.user_id}>
                              <td className="dashboard-admin-email-td">
                                {celdaEmailAdmin(u.email)}
                              </td>
                              <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(u.nombre)}</td>
                              <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(u.telefono)}</td>
                              <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(u.tipo_cuenta || 'sin tipo')}</td>
                              <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(u.role)}</td>
                              <td className="dashboard-admin-rif-td">
                                {celdaRifAdmin(rifPorUserId.get(u.user_id) ?? null)}
                              </td>
                              <td className="dashboard-admin-userid-td">
                                <AdminCeldaUserId
                                  userId={u.user_id}
                                  onVer={() =>
                                    setUserIdPerfilModal({
                                      nombre: u.email || 'Usuario',
                                      userId: u.user_id,
                                    })
                                  }
                                />
                              </td>
                              <td className="dashboard-admin-texto-td dashboard-admin-membresia-td">
                                {celdaTextoUnaLineaAdmin(fmtFechaCortaAdmin(u.creado_en))}
                              </td>
                              <td className="dashboard-admin-acciones-td">
                                <div className="dashboard-admin-acciones-fila">
                                  {u.role === 'admin' ? (
                                    <button
                                      type="button"
                                      className="dashboard-admin-btn danger dashboard-admin-btn--compacto"
                                      disabled={ocupado}
                                      title="Quitar rol admin"
                                      onClick={() => void setUsuarioAdmin(u.user_id, false)}
                                    >
                                      −Admin
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="dashboard-admin-btn dashboard-admin-btn--compacto"
                                      disabled={ocupado}
                                      title="Hacer admin"
                                      onClick={() => void setUsuarioAdmin(u.user_id, true)}
                                    >
                                      +Admin
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn danger dashboard-admin-btn--compacto"
                                    disabled={ocupado || esMiCuenta}
                                    title={
                                      esMiCuenta
                                        ? 'No puedes eliminar la cuenta con la que estás conectado'
                                        : 'Eliminar usuario'
                                    }
                                    onClick={() => void eliminarUsuario(u)}
                                  >
                                    {accionando === `eliminar-${u.user_id}` ? '…' : 'Eliminar'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {tab === 'productos' && (
                <section className="dashboard-seccion">
                  <h2 className="dashboard-seccion-titulo">Productos publicados</h2>
                  <div className="dashboard-admin-filtros-productos">
                    <div className="dashboard-admin-filtro-vertical dashboard-admin-filtro-producto-buscar">
                      <label htmlFor="admin-buscar-productos">Buscar producto</label>
                      <input
                        id="admin-buscar-productos"
                        type="search"
                        value={busquedaProductosAdminDraft}
                        onChange={(e) => setBusquedaProductosAdminDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void aplicarFiltrosProductosAdmin();
                          }
                        }}
                        placeholder="Nombre, descripción, marca, modelo, vendedor..."
                      />
                    </div>
                    <div className="dashboard-admin-filtro-vertical">
                      <label htmlFor="admin-filtro-vendedor-productos">Vendedor</label>
                      <select
                        id="admin-filtro-vendedor-productos"
                        value={adminFiltroVendedorTiendaIdDraft}
                        onChange={(e) => setAdminFiltroVendedorTiendaIdDraft(e.target.value)}
                      >
                        <option value="">Todos los vendedores</option>
                        {vendedoresParaFiltroProductos.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.nombre_comercial?.trim() || v.nombre?.trim() || v.id}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="dashboard-admin-filtro-vertical">
                      <label htmlFor="admin-filtro-vertical">Vertical</label>
                      <select
                        id="admin-filtro-vertical"
                        value={adminFiltroVerticalDraft}
                        onChange={(e) =>
                          setAdminFiltroVerticalDraft(e.target.value as 'todos' | 'auto' | 'moto')
                        }
                      >
                        <option value="todos">Todos</option>
                        <option value="auto">Solo automóvil</option>
                        <option value="moto">Solo moto</option>
                      </select>
                    </div>
                    <div className="dashboard-admin-filtro-vertical">
                      <label htmlFor="admin-filtro-estado-productos">Estado del artículo</label>
                      <select
                        id="admin-filtro-estado-productos"
                        value={filtroEstadoProductosAdminDraft}
                        onChange={(e) =>
                          setFiltroEstadoProductosAdminDraft(e.target.value as FiltroEstadoProductoGestion)
                        }
                      >
                        <option value="todos">Todos los productos</option>
                        <option value="activos">Activos</option>
                        <option value="pausados">Pausados</option>
                        <option value="por_aprobar">Por aprobar</option>
                        <option value="agregado_reciente">Agregado reciente (últimos 5 días)</option>
                        <option value="proximos_stock">Próximos a pausarse por fecha</option>
                        <option value="stock_vencido">Stock vencido</option>
                        <option value="sin_fecha_stock">Sin fecha de stock</option>
                      </select>
                    </div>
                  </div>
                  <div className="dashboard-admin-filtros-productos-acciones">
                    <button
                      type="button"
                      className="dashboard-admin-btn ok"
                      disabled={cargandoFiltrosProductos || cargando}
                      onClick={() => void aplicarFiltrosProductosAdmin()}
                    >
                      {cargandoFiltrosProductos ? 'Cargando catálogo…' : 'Aplicar filtros'}
                    </button>
                    <button
                      type="button"
                      className="dashboard-admin-btn"
                      disabled={cargandoFiltrosProductos || cargando}
                      onClick={() => void restablecerFiltrosProductosAdmin()}
                    >
                      Restablecer filtros
                    </button>
                  </div>
                  <p className="dashboard-admin-productos-hint">
                    El listado usa los valores de arriba solo después de pulsar «Aplicar filtros» (también Enter en
                    la búsqueda). Mostrando {productosFiltrados.length} de {productos.length} producto(s) cargados
                    que coinciden con los filtros aplicados.
                  </p>
                  <div className="dashboard-admin-acciones-masivas dashboard-admin-bulk-productos-toolbar">
                    <label htmlFor="admin-bulk-productos-accion" className="dashboard-admin-filtro-vertical">
                      Acción masiva (sobre el listado filtrado)
                      <select
                        id="admin-bulk-productos-accion"
                        value={bulkProductosAccion}
                        onChange={(e) =>
                          setBulkProductosAccion(e.target.value as AccionMasivaProductosAdmin)
                        }
                        disabled={accionando === 'bulk-productos-masivo'}
                      >
                        <option value="">— Elegir —</option>
                        <option value="activar">Activar todos los filtrados</option>
                        <option value="pausar">Pausar todos los filtrados</option>
                        <option value="eliminar">Eliminar todos los filtrados (irreversible)</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="dashboard-admin-btn ok"
                      disabled={
                        accionando === 'bulk-productos-masivo' ||
                        !bulkProductosAccion ||
                        productosFiltrados.length === 0
                      }
                      onClick={() => void ejecutarAccionMasivaProductosFiltrados(bulkProductosAccion)}
                    >
                      {accionando === 'bulk-productos-masivo'
                        ? 'Procesando…'
                        : `Ejecutar (${productosFiltrados.length})`}
                    </button>
                  </div>
                  <p className="dashboard-admin-productos-hint">
                    Cada fila muestra las miniaturas de la foto principal y las adicionales. Pulsa una imagen para
                    abrirla en tamaño completo en otra pestaña y verificar el contenido antes de autorizar.
                  </p>
                  <div className="dashboard-admin-fotos-masivas">
                    <div className="dashboard-admin-fotos-masivas-header">
                      <div>
                        <h3>Fotos masivas por vendedor</h3>
                        <p>
                          Usa hasta 4 fotos comunes: la foto 1 será principal y las demás adicionales.
                        </p>
                      </div>
                      <span className="dashboard-admin-busqueda-hint">
                        Productos objetivo: {productosObjetivoFotosMasivas.length}
                      </span>
                    </div>
                    <div className="dashboard-admin-fotos-masivas-grid">
                      <label>
                        Vendedor
                        <select
                          value={fotosMasivasTiendaId}
                          onChange={(e) => {
                            setFotosMasivasTiendaId(e.target.value);
                            setFotosMasivasSeleccionados([]);
                            setMensajeFotosMasivas(null);
                          }}
                          disabled={accionando === 'bulk-fotos-productos'}
                        >
                          <option value="">Selecciona vendedor</option>
                          {vendedoresParaFiltroProductos.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.nombre_comercial || v.nombre || v.id}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Alcance
                        <select
                          value={fotosMasivasAlcance}
                          onChange={(e) => {
                            setFotosMasivasAlcance(e.target.value as 'todos' | 'sin_foto' | 'seleccionados');
                            setMensajeFotosMasivas(null);
                          }}
                          disabled={accionando === 'bulk-fotos-productos'}
                        >
                          <option value="sin_foto">Solo productos sin foto principal</option>
                          <option value="todos">Todos los productos del vendedor</option>
                          <option value="seleccionados">Solo productos seleccionados manualmente</option>
                        </select>
                      </label>
                    </div>
                    {fotosMasivasAlcance === 'seleccionados' && (
                      <div className="dashboard-admin-fotos-masivas-seleccion">
                        <p>
                          Seleccionados: {productosObjetivoFotosMasivas.length}. Usa la columna “Seleccionar”
                          en la tabla de productos filtrada.
                        </p>
                        <div className="dashboard-admin-acciones-masivas">
                          <button
                            type="button"
                            className="dashboard-admin-btn"
                            disabled={!fotosMasivasTiendaId || productosSeleccionablesFotosMasivas.length === 0}
                            onClick={seleccionarProductosFotosMasivasVisibles}
                          >
                            Seleccionar visibles de este vendedor ({productosSeleccionablesFotosMasivas.length})
                          </button>
                          <button
                            type="button"
                            className="dashboard-admin-btn warn"
                            disabled={fotosMasivasSeleccionados.length === 0}
                            onClick={limpiarSeleccionFotosMasivas}
                          >
                            Limpiar selección
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="dashboard-admin-fotos-masivas-files">
                      {fotosMasivasArchivos.map((archivo, idx) => (
                        <label key={idx}>
                          Foto {idx + 1}{idx === 0 ? ' (principal)' : ''}
                          <input
                            type="file"
                            accept="image/*"
                            disabled={accionando === 'bulk-fotos-productos'}
                            onChange={(e) => cambiarFotoMasiva(idx, e.target.files?.[0] ?? null)}
                          />
                          {archivo && <span>{archivo.name}</span>}
                        </label>
                      ))}
                    </div>
                    <div className="dashboard-admin-acciones-masivas">
                      <button
                        type="button"
                        className="dashboard-admin-btn ok"
                        disabled={
                          accionando === 'bulk-fotos-productos' ||
                          !fotosMasivasTiendaId ||
                          !fotosMasivasArchivos[0] ||
                          productosObjetivoFotosMasivas.length === 0
                        }
                        onClick={() => void aplicarFotosMasivas()}
                      >
                        {accionando === 'bulk-fotos-productos'
                          ? 'Aplicando fotos...'
                          : `Aplicar fotos a ${productosObjetivoFotosMasivas.length} producto(s)`}
                      </button>
                    </div>
                    {mensajeFotosMasivas && (
                      <p className="dashboard-admin-fotos-masivas-mensaje">{mensajeFotosMasivas}</p>
                    )}
                  </div>
                  <div className="dashboard-admin-acciones-masivas">
                    <button
                      type="button"
                      className="dashboard-admin-btn ok"
                      disabled={
                        productosPendientesFiltrados.length === 0 ||
                        accionando === 'bulk-productos-aprobar' ||
                        accionando === 'bulk-productos-masivo'
                      }
                      onClick={() => void aprobarProductosPendientesVisibles()}
                    >
                      Autorizar pendientes visibles ({productosPendientesFiltrados.length})
                    </button>
                  </div>
                  <div className="dashboard-admin-table-wrap">
                    <table className="dashboard-admin-table">
                      <thead>
                        <tr>
                          {fotosMasivasAlcance === 'seleccionados' && <th>Seleccionar</th>}
                          <th>Fotos</th>
                          <th>Nombre</th>
                          <th>Vendedor</th>
                          <th>Categoría</th>
                          <th>Vertical</th>
                          <th>Vehículo</th>
                          <th>Precio</th>
                          <th>En la web</th>
                          <th>Venta</th>
                          <th>Stock</th>
                          <th>Creado</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productosFiltrados.map((p) => {
                          const mod = claseAprobacion(p.aprobacion_publica);
                          const stock = semaforoStockGestion(p);
                          const fotos = urlsFotosProducto({
                            imagen_url: p.imagen_url ?? null,
                            imagenes_extra: p.imagenes_extra ?? null,
                          });
                          const fotoActivaIdx = Math.min(
                            fotoActivaAdminProducto[p.id] ?? 0,
                            Math.max(0, fotos.length - 1)
                          );
                          const fotoActiva = fotos[fotoActivaIdx] ?? null;
                          return (
                          <tr key={p.id}>
                            {fotosMasivasAlcance === 'seleccionados' && (
                              <td>
                                <input
                                  type="checkbox"
                                  checked={fotosMasivasSeleccionados.includes(p.id)}
                                  disabled={
                                    !fotosMasivasTiendaId ||
                                    (p.tienda_id ?? primeraTiendaProducto(p)?.id) !== fotosMasivasTiendaId ||
                                    accionando === 'bulk-fotos-productos'
                                  }
                                  onChange={(e) => toggleProductoFotoMasiva(p.id, e.target.checked)}
                                  aria-label={`Seleccionar ${p.nombre} para fotos masivas`}
                                />
                              </td>
                            )}
                            <td className="dashboard-admin-td-fotos">
                              {fotos.length === 0 ? (
                                <span className="dashboard-admin-sin-foto">Sin fotos</span>
                              ) : (
                                <div className="dashboard-admin-producto-foto-carrusel">
                                  <button
                                    type="button"
                                    className="dashboard-admin-producto-foto-nav"
                                    disabled={fotos.length <= 1}
                                    onClick={() => cambiarFotoAdminProducto(p.id, fotos.length, -1)}
                                    aria-label="Ver foto anterior"
                                  >
                                    ‹
                                  </button>
                                  {fotoActiva && (
                                    <a
                                      href={fotoActiva}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="dashboard-admin-producto-thumb-link"
                                      title={`Foto ${fotoActivaIdx + 1} de ${fotos.length} — abrir tamaño completo`}
                                    >
                                      <img
                                        src={urlImagenProductoVariante(fotoActiva, 'miniatura') ?? fotoActiva}
                                        alt=""
                                        className="dashboard-admin-producto-thumb"
                                        width={160}
                                        height={160}
                                        loading="lazy"
                                        decoding="async"
                                        sizes="48px"
                                      />
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    className="dashboard-admin-producto-foto-nav"
                                    disabled={fotos.length <= 1}
                                    onClick={() => cambiarFotoAdminProducto(p.id, fotos.length, 1)}
                                    aria-label="Ver foto siguiente"
                                  >
                                    ›
                                  </button>
                                  <span className="dashboard-admin-producto-foto-contador">
                                    {fotoActivaIdx + 1}/{fotos.length}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td>{p.nombre}</td>
                            <td>{etiquetaVendedorDesdeProducto(p, vendedores)}</td>
                            <td>{p.categoria || '—'}</td>
                            <td>{p.vertical === 'moto' ? 'Moto' : 'Auto'}</td>
                            <td>{[p.marca, p.modelo, p.anio].filter(Boolean).join(' · ') || '—'}</td>
                            <td>
                              {p.precio_usd != null
                                ? `${etiquetaMoneda(p.moneda)} ${formatearPrecioProducto(p.precio_usd)}`
                                : '—'}
                            </td>
                            <td>
                              <span
                                className={`dashboard-admin-status ${
                                  mod === 'ok' ? 'ok' : mod === 'pendiente' ? 'pendiente' : 'rechazado'
                                }`}
                              >
                                {etiquetaAprobacion(p.aprobacion_publica)}
                              </span>
                              <div className="dashboard-admin-acciones-mini">
                                {(p.aprobacion_publica ?? 'aprobado') !== 'aprobado' && (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn ok"
                                    disabled={accionando === `aprob-prod-${p.id}` || accionando === 'bulk-productos-masivo'}
                                    onClick={() => void setProductoAprobacionWeb(p.id, 'aprobado')}
                                  >
                                    Autorizar web
                                  </button>
                                )}
                                {(p.aprobacion_publica ?? 'aprobado') !== 'rechazado' && (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn danger"
                                    disabled={accionando === `aprob-prod-${p.id}` || accionando === 'bulk-productos-masivo'}
                                    onClick={() => void setProductoAprobacionWeb(p.id, 'rechazado')}
                                  >
                                    Rechazar web
                                  </button>
                                )}
                                {(p.aprobacion_publica ?? 'aprobado') === 'rechazado' && (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn warn"
                                    disabled={accionando === `aprob-prod-${p.id}` || accionando === 'bulk-productos-masivo'}
                                    onClick={() => void setProductoAprobacionWeb(p.id, 'pendiente')}
                                  >
                                    Dejar pendiente
                                  </button>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className={`dashboard-admin-status ${p.activo ? 'ok' : 'warn'}`}>
                                {p.activo ? 'Activo' : 'Pausado'}
                              </span>
                            </td>
                            <td>
                              <span className={`dashboard-admin-status dashboard-admin-status-stock--${stock.clase}`}>
                                {stock.texto}
                              </span>
                            </td>
                            <td>{fmtFecha(p.created_at)}</td>
                            <td>
                              {p.activo ? (
                                <button
                                  type="button"
                                  className="dashboard-admin-btn warn"
                                  disabled={accionando === `producto-${p.id}` || accionando === 'bulk-productos-masivo'}
                                  onClick={() => void setProductoActivo(p.id, false)}
                                >
                                  Pausar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="dashboard-admin-btn ok"
                                  disabled={accionando === `producto-${p.id}` || accionando === 'bulk-productos-masivo'}
                                  onClick={() => void setProductoActivo(p.id, true)}
                                >
                                  Activar
                                </button>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {tab === 'vendedores' && (
                <section className="dashboard-seccion">
                  <h2 className="dashboard-seccion-titulo">Perfiles de vendedores</h2>
                  <div className="dashboard-admin-busqueda-fila">
                    <label htmlFor="admin-buscar-vendedores" className="dashboard-admin-busqueda-label">
                      Buscar (RIF, nombre o nombre comercial)
                    </label>
                    <input
                      id="admin-buscar-vendedores"
                      type="search"
                      className="dashboard-admin-busqueda-input"
                      placeholder="Ej: J-12345678, repuestos…"
                      value={busquedaVendedores}
                      onChange={(e) => setBusquedaVendedores(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <span className="dashboard-admin-busqueda-hint">
                      Hasta {ADMIN_LIST_LIMIT} filas recientes + suspendidos por impago. Los suspendidos aparecen
                      primero (fila naranja). Para reactivar: <strong>+30 días</strong> / <strong>+1 año</strong>{' '}
                      tras el pago, o <strong>Quitar bloqueo admin</strong> si lo suspendiste manualmente.
                    </span>
                  </div>
                  <div className="dashboard-admin-acciones-masivas">
                    <button
                      type="button"
                      className={`dashboard-admin-btn ${filtroSoloSuspendidosImpago ? 'warn' : ''}`}
                      onClick={() => setFiltroSoloSuspendidosImpago((x) => !x)}
                    >
                      {filtroSoloSuspendidosImpago
                        ? 'Ver todos los vendedores'
                        : `Solo suspendidos por impago (${vendedoresSuspendidosEnLista})`}
                    </button>
                    <button
                      type="button"
                      className="dashboard-admin-btn ok"
                      disabled={
                        vendedoresPendientesVisibles.length === 0 ||
                        accionando === 'bulk-vendedores-aprobar'
                      }
                      onClick={() => void aprobarVendedoresPendientesVisibles()}
                    >
                      Autorizar vendedores pendientes visibles ({vendedoresPendientesVisibles.length})
                    </button>
                  </div>
                  <div className="dashboard-admin-table-wrap">
                    <table className="dashboard-admin-table">
                      <thead>
                        <tr>
                          <th>Nombre comercial</th>
                          <th>RIF</th>
                          <th>Teléfono</th>
                          <th>Correo</th>
                          <th>Estado</th>
                          <th>Ciudad</th>
                          <th>GPS</th>
                          <th>Autorización web</th>
                          <th>Estado pago</th>
                          <th>Visibilidad web</th>
                          <th>Membresía hasta</th>
                          <th>User ID</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendedoresVisibles.length === 0 ? (
                          <tr>
                            <td colSpan={13} className="dashboard-texto-placeholder">
                              {filtroSoloSuspendidosImpago
                                ? 'Ningún vendedor suspendido en el listado cargado. Quita el filtro o recarga la pestaña.'
                                : 'No hay vendedores en el listado.'}
                            </td>
                          </tr>
                        ) : (
                        vendedoresVisibles.map((v) => {
                          const estadoImpago = etiquetaEstadoImpagoPerfilTabla(v);
                          const visWeb = etiquetaVisibilidadWebPerfilTabla(v);
                          const suspendida = perfilSuspendidoPorImpago(v);
                          return (
                          <tr
                            key={v.id}
                            className={suspendida ? 'dashboard-admin-row-impago' : undefined}
                          >
                            <td className="dashboard-admin-texto-td dashboard-admin-nombre-td">
                              {celdaTextoUnaLineaAdmin(v.nombre_comercial || v.nombre)}
                            </td>
                            <td className="dashboard-admin-rif-td">{celdaRifAdmin(v.rif)}</td>
                            <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(v.telefono)}</td>
                            <td className="dashboard-admin-email-td">
                              {celdaEmailAdmin(emailNegocioAdmin(v, emailsPorUserId))}
                            </td>
                            <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(v.estado)}</td>
                            <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(v.ciudad)}</td>
                            <td className="dashboard-admin-ubicacion-td">
                              <AdminCeldaUbicacion
                                latitud={v.latitud}
                                longitud={v.longitud}
                                guardando={accionando === `ubic-tienda-${v.id}`}
                                onEditar={() =>
                                  setUbicacionNegocioModal({
                                    tipo: 'tienda',
                                    id: v.id,
                                    nombre: v.nombre_comercial || v.nombre || 'Vendedor',
                                    latitud: v.latitud ?? null,
                                    longitud: v.longitud ?? null,
                                  })
                                }
                              />
                            </td>
                            <td className="dashboard-admin-autorizacion-td">
                              <AdminCeldaAutorizacionWeb
                                aprobacionEstado={v.aprobacion_estado}
                                accionando={accionando === `aprob-tienda-${v.id}`}
                                onAprobar={() => void setTiendaAprobacion(v.id, 'aprobado')}
                                onRechazar={() => void setTiendaAprobacion(v.id, 'rechazado')}
                                onPendiente={() => void setTiendaAprobacion(v.id, 'pendiente')}
                              />
                            </td>
                            <td className="dashboard-admin-status-td">
                              <span
                                className={`dashboard-admin-status dashboard-admin-status--compacto ${estadoImpago.clase}`}
                                title={estadoImpago.title}
                              >
                                {estadoImpago.texto}
                              </span>
                            </td>
                            <td className="dashboard-admin-status-td">
                              <span
                                className={`dashboard-admin-status dashboard-admin-status--compacto ${visWeb.clase}`}
                                title={visWeb.title}
                              >
                                {visWeb.texto}
                              </span>
                            </td>
                            <td className="dashboard-admin-texto-td dashboard-admin-membresia-td">
                              {celdaTextoUnaLineaAdmin(fmtMembresiaHasta(v.membresia_hasta))}
                            </td>
                            <td className="dashboard-admin-userid-td">
                              <AdminCeldaUserId
                                userId={v.user_id}
                                onVer={() =>
                                  setUserIdPerfilModal({
                                    nombre: v.nombre_comercial || v.nombre || 'Vendedor',
                                    userId: v.user_id,
                                  })
                                }
                              />
                            </td>
                            <td className="dashboard-admin-acciones-td">
                              <div className="dashboard-admin-acciones-fila">
                                {perfilBloqueadoPorAdmin(v) ? (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn ok dashboard-admin-btn--compacto"
                                    disabled={accionando === `tienda-${v.id}` || accionando === `membresia-${v.id}`}
                                    onClick={() => void setTiendaBloqueada(v.id, false)}
                                    title="Quitar bloqueo admin"
                                  >
                                    Quitar
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn danger dashboard-admin-btn--compacto"
                                    disabled={accionando === `tienda-${v.id}` || accionando === `membresia-${v.id}`}
                                    onClick={() => void setTiendaBloqueada(v.id, true)}
                                    title="Suspender por impago"
                                  >
                                    Suspender
                                  </button>
                                )}
                                {(v.aprobacion_estado ?? 'aprobado') === 'aprobado' && suspendida && (
                                  <>
                                    <button
                                      type="button"
                                      className="dashboard-admin-btn ok dashboard-admin-btn--compacto"
                                      disabled={
                                        accionando === `tienda-${v.id}` || accionando === `membresia-${v.id}`
                                      }
                                      title="Renovar membresía 30 días"
                                      onClick={() => void setTiendaMembresiaHasta(v.id, fechaMembresiaDesdeHoyUtc(30))}
                                    >
                                      +30d
                                    </button>
                                    <button
                                      type="button"
                                      className="dashboard-admin-btn ok dashboard-admin-btn--compacto"
                                      disabled={
                                        accionando === `tienda-${v.id}` || accionando === `membresia-${v.id}`
                                      }
                                      title="Renovar membresía 1 año"
                                      onClick={() => void setTiendaMembresiaHasta(v.id, fechaMembresiaDesdeHoyUtc(365))}
                                    >
                                      +1a
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                          );
                        })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {tab === 'talleres' && (
                <section className="dashboard-seccion">
                  <h2 className="dashboard-seccion-titulo">Perfiles de talleres</h2>
                  <div className="dashboard-admin-busqueda-fila">
                    <label htmlFor="admin-buscar-talleres" className="dashboard-admin-busqueda-label">
                      Buscar (nombre, nombre comercial o teléfono)
                    </label>
                    <input
                      id="admin-buscar-talleres"
                      type="search"
                      className="dashboard-admin-busqueda-input"
                      placeholder="Ej: taller, 0414…"
                      value={busquedaTalleres}
                      onChange={(e) => setBusquedaTalleres(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <span className="dashboard-admin-busqueda-hint">
                      Hasta {ADMIN_LIST_LIMIT} filas recientes + suspendidos por impago. Los suspendidos aparecen
                      primero (fila naranja). Para reactivar: <strong>+30 días</strong> / <strong>+1 año</strong>{' '}
                      tras el pago, o <strong>Quitar bloqueo admin</strong> si lo suspendiste manualmente.
                    </span>
                  </div>
                  <div className="dashboard-admin-acciones-masivas">
                    <button
                      type="button"
                      className={`dashboard-admin-btn ${filtroSoloSuspendidosImpagoTalleres ? 'warn' : ''}`}
                      onClick={() => setFiltroSoloSuspendidosImpagoTalleres((x) => !x)}
                    >
                      {filtroSoloSuspendidosImpagoTalleres
                        ? 'Ver todos los talleres'
                        : `Solo suspendidos por impago (${talleresSuspendidosEnLista})`}
                    </button>
                    <button
                      type="button"
                      className="dashboard-admin-btn ok"
                      disabled={
                        talleresPendientesVisibles.length === 0 ||
                        accionando === 'bulk-talleres-aprobar'
                      }
                      onClick={() => void aprobarTalleresPendientesVisibles()}
                    >
                      Autorizar talleres pendientes visibles ({talleresPendientesVisibles.length})
                    </button>
                  </div>
                  <div className="dashboard-admin-table-wrap">
                    <table className="dashboard-admin-table">
                      <thead>
                        <tr>
                          <th>Nombre</th>
                          <th>RIF</th>
                          <th>Especialidad</th>
                          <th>Teléfono</th>
                          <th>Correo</th>
                          <th>Estado</th>
                          <th>Ciudad</th>
                          <th>GPS</th>
                          <th>Autorización web</th>
                          <th>Estado pago</th>
                          <th>Visibilidad web</th>
                          <th>Membresía hasta</th>
                          <th>User ID</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {talleresVisibles.length === 0 ? (
                          <tr>
                            <td colSpan={14} className="dashboard-texto-placeholder">
                              {filtroSoloSuspendidosImpagoTalleres
                                ? 'Ningún taller suspendido en el listado cargado. Quita el filtro o recarga la pestaña.'
                                : 'No hay talleres en el listado.'}
                            </td>
                          </tr>
                        ) : (
                        talleresVisibles.map((t) => {
                          const estadoImpago = etiquetaEstadoImpagoPerfilTabla(t);
                          const visWeb = etiquetaVisibilidadWebPerfilTabla(t);
                          const suspendido = perfilSuspendidoPorImpago(t);
                          return (
                          <tr
                            key={t.id}
                            className={suspendido ? 'dashboard-admin-row-impago' : undefined}
                          >
                            <td className="dashboard-admin-texto-td dashboard-admin-nombre-td">
                              {celdaTextoUnaLineaAdmin(t.nombre_comercial || t.nombre)}
                            </td>
                            <td className="dashboard-admin-rif-td">{celdaRifAdmin(t.rif)}</td>
                            <td className="dashboard-admin-especialidad-td">
                              <EspecialidadTallerCeldaAdmin
                                especialidad={t.especialidad}
                                onVerDetalle={(items) =>
                                  setEspecialidadTallerModal({
                                    nombre: t.nombre_comercial || t.nombre || 'Taller',
                                    items,
                                  })
                                }
                              />
                            </td>
                            <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(t.telefono)}</td>
                            <td className="dashboard-admin-email-td">
                              {celdaEmailAdmin(emailNegocioAdmin(t, emailsPorUserId))}
                            </td>
                            <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(t.estado)}</td>
                            <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(t.ciudad)}</td>
                            <td className="dashboard-admin-ubicacion-td">
                              <AdminCeldaUbicacion
                                latitud={t.latitud}
                                longitud={t.longitud}
                                guardando={accionando === `ubic-taller-${t.id}`}
                                onEditar={() =>
                                  setUbicacionNegocioModal({
                                    tipo: 'taller',
                                    id: t.id,
                                    nombre: t.nombre_comercial || t.nombre || 'Taller',
                                    latitud: t.latitud ?? null,
                                    longitud: t.longitud ?? null,
                                  })
                                }
                              />
                            </td>
                            <td className="dashboard-admin-autorizacion-td">
                              <AdminCeldaAutorizacionWeb
                                aprobacionEstado={t.aprobacion_estado}
                                accionando={accionando === `aprob-taller-${t.id}`}
                                onAprobar={() => void setTallerAprobacion(t.id, 'aprobado')}
                                onRechazar={() => void setTallerAprobacion(t.id, 'rechazado')}
                                onPendiente={() => void setTallerAprobacion(t.id, 'pendiente')}
                              />
                            </td>
                            <td className="dashboard-admin-status-td">
                              <span
                                className={`dashboard-admin-status dashboard-admin-status--compacto ${estadoImpago.clase}`}
                                title={estadoImpago.title}
                              >
                                {estadoImpago.texto}
                              </span>
                            </td>
                            <td className="dashboard-admin-status-td">
                              <span
                                className={`dashboard-admin-status dashboard-admin-status--compacto ${visWeb.clase}`}
                                title={visWeb.title}
                              >
                                {visWeb.texto}
                              </span>
                            </td>
                            <td className="dashboard-admin-texto-td dashboard-admin-membresia-td">
                              {celdaTextoUnaLineaAdmin(fmtMembresiaHasta(t.membresia_hasta))}
                            </td>
                            <td className="dashboard-admin-userid-td">
                              <AdminCeldaUserId
                                userId={t.user_id}
                                onVer={() =>
                                  setUserIdPerfilModal({
                                    nombre: t.nombre_comercial || t.nombre || 'Taller',
                                    userId: t.user_id,
                                  })
                                }
                              />
                            </td>
                            <td className="dashboard-admin-acciones-td">
                              <div className="dashboard-admin-acciones-fila">
                                {perfilBloqueadoPorAdmin(t) ? (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn ok dashboard-admin-btn--compacto"
                                    disabled={
                                      accionando === `taller-${t.id}` ||
                                      accionando === `membresia-taller-${t.id}`
                                    }
                                    onClick={() => void setTallerBloqueado(t.id, false)}
                                    title="Quitar bloqueo admin"
                                  >
                                    Quitar
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn danger dashboard-admin-btn--compacto"
                                    disabled={
                                      accionando === `taller-${t.id}` ||
                                      accionando === `membresia-taller-${t.id}`
                                    }
                                    onClick={() => void setTallerBloqueado(t.id, true)}
                                    title="Suspender por impago"
                                  >
                                    Suspender
                                  </button>
                                )}
                                {(t.aprobacion_estado ?? 'aprobado') === 'aprobado' && suspendido && (
                                  <>
                                    <button
                                      type="button"
                                      className="dashboard-admin-btn ok dashboard-admin-btn--compacto"
                                      disabled={
                                        accionando === `taller-${t.id}` ||
                                        accionando === `membresia-taller-${t.id}`
                                      }
                                      title="Renovar membresía 30 días"
                                      onClick={() =>
                                        void setTallerMembresiaHasta(t.id, fechaMembresiaDesdeHoyUtc(30))
                                      }
                                    >
                                      +30d
                                    </button>
                                    <button
                                      type="button"
                                      className="dashboard-admin-btn ok dashboard-admin-btn--compacto"
                                      disabled={
                                        accionando === `taller-${t.id}` ||
                                        accionando === `membresia-taller-${t.id}`
                                      }
                                      title="Renovar membresía 1 año"
                                      onClick={() =>
                                        void setTallerMembresiaHasta(t.id, fechaMembresiaDesdeHoyUtc(365))
                                      }
                                    >
                                      +1a
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                          );
                        })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {tab === 'compradores' && (
                <section className="dashboard-seccion">
                  <h2 className="dashboard-seccion-titulo">Perfiles de compradores</h2>
                  <div className="dashboard-admin-busqueda-fila">
                    <label htmlFor="admin-buscar-compradores" className="dashboard-admin-busqueda-label">
                      Buscar (correo, nombre, teléfono o parte del ID)
                    </label>
                    <input
                      id="admin-buscar-compradores"
                      type="search"
                      className="dashboard-admin-busqueda-input"
                      placeholder="Ej: @correo, nombre, J-…"
                      value={busquedaCompradores}
                      onChange={(e) => setBusquedaCompradores(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <span className="dashboard-admin-busqueda-hint">
                      Hasta {ADMIN_LIST_LIMIT} filas. La suspensión por pago queda en{' '}
                      <code>app_metadata.suspendido_membresia</code> (la app puede leerla para bloquear funciones de
                      comprador).
                    </span>
                  </div>
                  <div className="dashboard-admin-table-wrap">
                    <table className="dashboard-admin-table">
                      <thead>
                        <tr>
                          <th>Correo</th>
                          <th>Nombre</th>
                          <th>Teléfono</th>
                          <th>Estado</th>
                          <th>Ciudad</th>
                          <th>Membresía</th>
                          <th>User ID</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compradores.map((c) => {
                          const membresia = etiquetaMembresiaCompradorTabla(c);
                          const ocupado = accionando === `comp-memb-${c.user_id}`;
                          return (
                            <tr key={c.user_id}>
                              <td className="dashboard-admin-email-td">
                                {celdaEmailAdmin(c.email)}
                              </td>
                              <td className="dashboard-admin-texto-td dashboard-admin-nombre-td">
                                {celdaTextoUnaLineaAdmin(c.nombre_comercial || c.nombre)}
                              </td>
                              <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(c.telefono)}</td>
                              <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(c.estado)}</td>
                              <td className="dashboard-admin-texto-td">{celdaTextoUnaLineaAdmin(c.ciudad)}</td>
                              <td className="dashboard-admin-status-td">
                                <span
                                  className={`dashboard-admin-status dashboard-admin-status--compacto ${membresia.clase}`}
                                  title={membresia.title}
                                >
                                  {membresia.texto}
                                </span>
                              </td>
                              <td className="dashboard-admin-userid-td">
                                <AdminCeldaUserId
                                  userId={c.user_id}
                                  onVer={() =>
                                    setUserIdPerfilModal({
                                      nombre: c.nombre_comercial || c.nombre || c.email || 'Comprador',
                                      userId: c.user_id,
                                    })
                                  }
                                />
                              </td>
                              <td className="dashboard-admin-acciones-td">
                                <div className="dashboard-admin-acciones-fila">
                                  {c.suspendido_membresia === true ? (
                                    <button
                                      type="button"
                                      className="dashboard-admin-btn ok dashboard-admin-btn--compacto"
                                      disabled={ocupado}
                                      title="Reactivar membresía"
                                      onClick={() => void setCompradorSuspendidoMembresia(c.user_id, false)}
                                    >
                                      Reactivar
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="dashboard-admin-btn danger dashboard-admin-btn--compacto"
                                      disabled={ocupado}
                                      title="Suspender por impago"
                                      onClick={() => void setCompradorSuspendidoMembresia(c.user_id, true)}
                                    >
                                      Suspender
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </main>
        {ubicacionNegocioModal && (
          <div
            className="dashboard-kpi-modal-backdrop"
            role="presentation"
            onClick={() => {
              if (accionando?.startsWith('ubic-')) return;
              setUbicacionNegocioModal(null);
            }}
          >
            <AdminModalEditarUbicacion
              nombre={ubicacionNegocioModal.nombre}
              latitudInicial={ubicacionNegocioModal.latitud}
              longitudInicial={ubicacionNegocioModal.longitud}
              guardando={accionando === `ubic-${ubicacionNegocioModal.tipo}-${ubicacionNegocioModal.id}`}
              onGuardar={(lat, lng) => void guardarUbicacionNegocio(lat, lng)}
              onCerrar={() => {
                if (accionando?.startsWith('ubic-')) return;
                setUbicacionNegocioModal(null);
              }}
            />
          </div>
        )}
        {userIdPerfilModal && (
          <div
            className="dashboard-kpi-modal-backdrop"
            role="presentation"
            onClick={() => setUserIdPerfilModal(null)}
          >
            <div
              className="dashboard-admin-userid-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="dashboard-userid-perfil-titulo"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="dashboard-kpi-modal-header">
                <h3 id="dashboard-userid-perfil-titulo" className="dashboard-kpi-modal-titulo">
                  User ID — {userIdPerfilModal.nombre}
                </h3>
                <button
                  type="button"
                  className="dashboard-kpi-modal-cerrar"
                  onClick={() => setUserIdPerfilModal(null)}
                >
                  Cerrar
                </button>
              </div>
              <p className="dashboard-admin-userid-completo">{userIdPerfilModal.userId}</p>
            </div>
          </div>
        )}
        {especialidadTallerModal && (
          <div
            className="dashboard-kpi-modal-backdrop"
            role="presentation"
            onClick={() => setEspecialidadTallerModal(null)}
          >
            <div
              className="dashboard-admin-especialidad-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="dashboard-especialidad-taller-titulo"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="dashboard-kpi-modal-header">
                <h3 id="dashboard-especialidad-taller-titulo" className="dashboard-kpi-modal-titulo">
                  Especialidades — {especialidadTallerModal.nombre}
                </h3>
                <button
                  type="button"
                  className="dashboard-kpi-modal-cerrar"
                  onClick={() => setEspecialidadTallerModal(null)}
                >
                  Cerrar
                </button>
              </div>
              <ul className="dashboard-admin-especialidad-lista">
                {especialidadTallerModal.items.map((esp) => (
                  <li key={esp}>{esp}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {kpiDetalle && (
          <div
            className="dashboard-kpi-modal-backdrop"
            role="presentation"
            onClick={() => setKpiDetalle(null)}
          >
            <div
              className="dashboard-kpi-modal-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="dashboard-kpi-modal-titulo"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="dashboard-kpi-modal-header">
                <h3 id="dashboard-kpi-modal-titulo" className="dashboard-kpi-modal-titulo">
                  {KPI_DETALLE_TITULO[kpiDetalle]}
                </h3>
                <button type="button" className="dashboard-kpi-modal-cerrar" onClick={() => setKpiDetalle(null)}>
                  Cerrar
                </button>
              </div>
              <div className="dashboard-kpi-modal-body">{cuerpoDetalleKpi()}</div>
              <div className="dashboard-kpi-modal-footer">
                {KPI_DETALLE_IR_TAB[kpiDetalle] && (
                  <button
                    type="button"
                    className="dashboard-btn-accion"
                    onClick={() => irATabDesdeKpi(KPI_DETALLE_IR_TAB[kpiDetalle]!, kpiDetalle)}
                  >
                    Ir a «{etiquetaPestañaAdmin(KPI_DETALLE_IR_TAB[kpiDetalle]!)}»
                  </button>
                )}
                <button type="button" className="dashboard-btn-inicio" onClick={() => setKpiDetalle(null)}>
                  Solo cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

