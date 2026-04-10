import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { urlImagenProductoVariante } from '../utils/imagenProducto';
import { urlsFotosProducto } from '../utils/productoImagenesExtra';
import { etiquetaEspecialidadesTaller } from '../utils/tallerEspecialidades';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import './Dashboard.css';

const ADMIN_LIST_LIMIT = 250;

/** Escapa % y _ para patrones ILIKE en filtros .or() de PostgREST */
function escapeIlikePatron(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

type AdminTab = 'resumen' | 'usuarios' | 'productos' | 'vendedores' | 'talleres' | 'compradores';

type AdminKpis = {
  usuarios_total: number;
  vendedores_total: number;
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

type AdminUsuario = {
  user_id: string;
  email: string | null;
  tipo_cuenta: string | null;
  role: string | null;
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
  estado: string | null;
  ciudad: string | null;
  bloqueado: boolean | null;
  aprobacion_estado?: string | null;
  created_at?: string | null;
};

type AdminTaller = {
  id: string;
  user_id: string;
  nombre: string | null;
  nombre_comercial: string | null;
  especialidad: string[] | string | null;
  telefono: string | null;
  estado: string | null;
  ciudad: string | null;
  bloqueado: boolean | null;
  aprobacion_estado?: string | null;
  created_at?: string | null;
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

export function DashboardAdmin({ onVolverInicio, vertical: verticalEntrada }: DashboardAdminProps) {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<AdminTab>('resumen');
  const [adminFiltroVertical, setAdminFiltroVertical] = useState<'todos' | 'auto' | 'moto'>(() =>
    verticalEntrada === 'moto' ? 'moto' : 'todos'
  );
  /** id de tienda = vendedor en catálogo */
  const [adminFiltroVendedorTiendaId, setAdminFiltroVendedorTiendaId] = useState('');
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
  const [busquedaTalleres, setBusquedaTalleres] = useState('');

  const cargarProductos = async () => {
    const pRes = await supabase
      .from('productos')
      .select(
        'id, nombre, tienda_id, categoria, marca, modelo, anio, precio_usd, moneda, activo, aprobacion_publica, imagen_url, imagenes_extra, created_at, vertical, tiendas(id, nombre, nombre_comercial)'
      )
      .order('created_at', { ascending: false });
    if (pRes.error) setError(pRes.error.message);
    setProductos((pRes.data ?? []) as AdminProducto[]);
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
      .select(
        'id, user_id, nombre, nombre_comercial, rif, telefono, estado, ciudad, bloqueado, aprobacion_estado, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(ADMIN_LIST_LIMIT);
    const t = buscar.trim();
    if (t) {
      const esc = escapeIlikePatron(t);
      q = q.or(`rif.ilike.%${esc}%,nombre.ilike.%${esc}%,nombre_comercial.ilike.%${esc}%`);
    }
    const vRes = await q;
    if (vRes.error) setError(vRes.error.message);
    setVendedores((vRes.data ?? []) as AdminTienda[]);
  };

  const cargarTalleres = async (buscar: string) => {
    let q = supabase
      .from('talleres')
      .select(
        'id, user_id, nombre, nombre_comercial, especialidad, telefono, estado, ciudad, bloqueado, aprobacion_estado, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(ADMIN_LIST_LIMIT);
    const t = buscar.trim();
    if (t) {
      const esc = escapeIlikePatron(t);
      q = q.or(`nombre.ilike.%${esc}%,nombre_comercial.ilike.%${esc}%,telefono.ilike.%${esc}%`);
    }
    const tRes = await q;
    if (tRes.error) setError(tRes.error.message);
    setTalleres((tRes.data ?? []) as AdminTaller[]);
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

  const totalProductos = kpis?.productos_total ?? productos.length;
  const productosActivos = kpis?.productos_activos ?? productos.filter((p) => p.activo).length;
  const productosPausados = kpis?.productos_pausados ?? productos.filter((p) => p.activo === false).length;
  const productosCountAuto = kpis?.productos_auto ?? productos.filter((p) => (p.vertical ?? 'auto') === 'auto').length;
  const productosCountMoto = kpis?.productos_moto ?? productos.filter((p) => p.vertical === 'moto').length;

  const vendedoresParaFiltroProductos = useMemo(() => {
    return [...vendedores].sort((a, b) => {
      const la = (a.nombre_comercial || a.nombre || '').toLocaleLowerCase('es');
      const lb = (b.nombre_comercial || b.nombre || '').toLocaleLowerCase('es');
      return la.localeCompare(lb, 'es');
    });
  }, [vendedores]);

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const vertOk =
        adminFiltroVertical === 'todos' || (p.vertical ?? 'auto') === adminFiltroVertical;
      const tidProd = p.tienda_id ?? primeraTiendaProducto(p)?.id;
      const vendedorOk =
        !adminFiltroVendedorTiendaId || tidProd === adminFiltroVendedorTiendaId;
      return vertOk && vendedorOk;
    });
  }, [productos, adminFiltroVertical, adminFiltroVendedorTiendaId]);
  const tiendasPendientes = kpis?.tiendas_pendientes_aprobacion ?? vendedores.filter(
    (v) => (v.aprobacion_estado ?? 'aprobado') === 'pendiente'
  ).length;
  const talleresPendientes = kpis?.talleres_pendientes_aprobacion ?? talleres.filter(
    (t) => (t.aprobacion_estado ?? 'aprobado') === 'pendiente'
  ).length;
  const productosPendientesWeb = kpis?.productos_pendientes_web ?? productos.filter(
    (p) => (p.aprobacion_publica ?? 'aprobado') === 'pendiente'
  ).length;
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
    }
    setAccionando(null);
  };

  const setTiendaAprobacion = async (tiendaId: string, estado: AprobacionEstado) => {
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
      setTalleres((prev) =>
        prev.map((t) => (t.id === tallerId ? { ...t, aprobacion_estado: estado } : t))
      );
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
                  <div className="dashboard-kpi-grid">
                    <div className="dashboard-kpi-card"><p className="dashboard-kpi-label">Usuarios (total)</p><p className="dashboard-kpi-valor">{kpis?.usuarios_total ?? usuarios.length}</p></div>
                    <div className="dashboard-kpi-card"><p className="dashboard-kpi-label">Vendedores (total)</p><p className="dashboard-kpi-valor">{kpis?.vendedores_total ?? vendedores.length}</p></div>
                    <div className="dashboard-kpi-card"><p className="dashboard-kpi-label">Talleres (total)</p><p className="dashboard-kpi-valor">{kpis?.talleres_total ?? talleres.length}</p></div>
                    <div className="dashboard-kpi-card"><p className="dashboard-kpi-label">Compradores (total)</p><p className="dashboard-kpi-valor">{kpis?.compradores_total ?? compradores.length}</p></div>
                    <div className="dashboard-kpi-card"><p className="dashboard-kpi-label">Productos activos</p><p className="dashboard-kpi-valor">{productosActivos}</p></div>
                    <div className="dashboard-kpi-card"><p className="dashboard-kpi-label">Productos pausados</p><p className="dashboard-kpi-valor">{productosPausados}</p></div>
                    <div className="dashboard-kpi-card"><p className="dashboard-kpi-label">Total productos</p><p className="dashboard-kpi-valor">{totalProductos}</p></div>
                    <div className="dashboard-kpi-card"><p className="dashboard-kpi-label">Catálogo auto</p><p className="dashboard-kpi-valor">{productosCountAuto}</p></div>
                    <div className="dashboard-kpi-card"><p className="dashboard-kpi-label">Catálogo moto</p><p className="dashboard-kpi-valor">{productosCountMoto}</p></div>
                    <div className="dashboard-kpi-card dashboard-kpi-card--alerta">
                      <p className="dashboard-kpi-label">Vendedores por autorizar</p>
                      <p className="dashboard-kpi-valor">{tiendasPendientes}</p>
                    </div>
                    <div className="dashboard-kpi-card dashboard-kpi-card--alerta">
                      <p className="dashboard-kpi-label">Talleres por autorizar</p>
                      <p className="dashboard-kpi-valor">{talleresPendientes}</p>
                    </div>
                    <div className="dashboard-kpi-card dashboard-kpi-card--alerta">
                      <p className="dashboard-kpi-label">Productos por autorizar (web)</p>
                      <p className="dashboard-kpi-valor">{productosPendientesWeb}</p>
                    </div>
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
                      Buscar (correo, tipo o parte del ID)
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
                          <th>Tipo</th>
                          <th>Role</th>
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
                              <td>{u.email || '—'}</td>
                              <td>{u.tipo_cuenta || 'sin tipo'}</td>
                              <td>{u.role || '—'}</td>
                              <td>{u.user_id}</td>
                              <td>{fmtFecha(u.creado_en)}</td>
                              <td>
                                <div className="dashboard-admin-usuario-acciones">
                                  {u.role === 'admin' ? (
                                    <button
                                      type="button"
                                      className="dashboard-admin-btn danger"
                                      disabled={ocupado}
                                      onClick={() => void setUsuarioAdmin(u.user_id, false)}
                                    >
                                      Quitar admin
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="dashboard-admin-btn"
                                      disabled={ocupado}
                                      onClick={() => void setUsuarioAdmin(u.user_id, true)}
                                    >
                                      Hacer admin
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn danger dashboard-admin-btn--eliminar"
                                    disabled={ocupado || esMiCuenta}
                                    title={
                                      esMiCuenta
                                        ? 'No puedes eliminar la cuenta con la que estás conectado'
                                        : undefined
                                    }
                                    onClick={() => void eliminarUsuario(u)}
                                  >
                                    {accionando === `eliminar-${u.user_id}` ? 'Eliminando…' : 'Eliminar usuario'}
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
                    <div className="dashboard-admin-filtro-vertical">
                      <label htmlFor="admin-filtro-vendedor-productos">Vendedor</label>
                      <select
                        id="admin-filtro-vendedor-productos"
                        value={adminFiltroVendedorTiendaId}
                        onChange={(e) => setAdminFiltroVendedorTiendaId(e.target.value)}
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
                        value={adminFiltroVertical}
                        onChange={(e) => setAdminFiltroVertical(e.target.value as 'todos' | 'auto' | 'moto')}
                      >
                        <option value="todos">Todos</option>
                        <option value="auto">Solo automóvil</option>
                        <option value="moto">Solo moto</option>
                      </select>
                    </div>
                  </div>
                  <p className="dashboard-admin-productos-hint">
                    Cada fila muestra las miniaturas de la foto principal y las adicionales. Pulsa una imagen para
                    abrirla en tamaño completo en otra pestaña y verificar el contenido antes de autorizar.
                  </p>
                  <div className="dashboard-admin-table-wrap">
                    <table className="dashboard-admin-table">
                      <thead>
                        <tr>
                          <th>Fotos</th>
                          <th>Nombre</th>
                          <th>Vendedor</th>
                          <th>Categoría</th>
                          <th>Vertical</th>
                          <th>Vehículo</th>
                          <th>Precio</th>
                          <th>En la web</th>
                          <th>Venta</th>
                          <th>Creado</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productosFiltrados.map((p) => {
                          const mod = claseAprobacion(p.aprobacion_publica);
                          const fotos = urlsFotosProducto({
                            imagen_url: p.imagen_url ?? null,
                            imagenes_extra: p.imagenes_extra ?? null,
                          });
                          return (
                          <tr key={p.id}>
                            <td className="dashboard-admin-td-fotos">
                              {fotos.length === 0 ? (
                                <span className="dashboard-admin-sin-foto">Sin fotos</span>
                              ) : (
                                <div className="dashboard-admin-producto-fotos">
                                  {fotos.map((url, i) => (
                                    <a
                                      key={`${p.id}-img-${i}`}
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="dashboard-admin-producto-thumb-link"
                                      title={`Foto ${i + 1} de ${fotos.length} — abrir tamaño completo`}
                                    >
                                      <img
                                        src={urlImagenProductoVariante(url, 'miniatura') ?? url}
                                        alt=""
                                        className="dashboard-admin-producto-thumb"
                                        width={160}
                                        height={160}
                                        loading="lazy"
                                        decoding="async"
                                        sizes="48px"
                                      />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td>{p.nombre}</td>
                            <td>{etiquetaVendedorDesdeProducto(p, vendedores)}</td>
                            <td>{p.categoria || '—'}</td>
                            <td>{p.vertical === 'moto' ? 'Moto' : 'Auto'}</td>
                            <td>{[p.marca, p.modelo, p.anio].filter(Boolean).join(' · ') || '—'}</td>
                            <td>{p.precio_usd != null ? `${p.moneda === 'BS' ? 'Bs' : 'USD'} ${Number(p.precio_usd).toLocaleString()}` : '—'}</td>
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
                                    disabled={accionando === `aprob-prod-${p.id}`}
                                    onClick={() => void setProductoAprobacionWeb(p.id, 'aprobado')}
                                  >
                                    Autorizar web
                                  </button>
                                )}
                                {(p.aprobacion_publica ?? 'aprobado') !== 'rechazado' && (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn danger"
                                    disabled={accionando === `aprob-prod-${p.id}`}
                                    onClick={() => void setProductoAprobacionWeb(p.id, 'rechazado')}
                                  >
                                    Rechazar web
                                  </button>
                                )}
                                {(p.aprobacion_publica ?? 'aprobado') === 'rechazado' && (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn warn"
                                    disabled={accionando === `aprob-prod-${p.id}`}
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
                            <td>{fmtFecha(p.created_at)}</td>
                            <td>
                              {p.activo ? (
                                <button
                                  type="button"
                                  className="dashboard-admin-btn warn"
                                  disabled={accionando === `producto-${p.id}`}
                                  onClick={() => void setProductoActivo(p.id, false)}
                                >
                                  Pausar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="dashboard-admin-btn ok"
                                  disabled={accionando === `producto-${p.id}`}
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
                      Hasta {ADMIN_LIST_LIMIT} filas. <strong>Suspender por impago</strong> usa el mismo bloqueo que ya tenías (tienda no publicable).
                    </span>
                  </div>
                  <div className="dashboard-admin-table-wrap">
                    <table className="dashboard-admin-table">
                      <thead>
                        <tr>
                          <th>Nombre comercial</th>
                          <th>RIF</th>
                          <th>Teléfono</th>
                          <th>Estado</th>
                          <th>Ciudad</th>
                          <th>Autorización web</th>
                          <th>Bloqueo</th>
                          <th>User ID</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendedores.map((v) => {
                          const ap = claseAprobacion(v.aprobacion_estado);
                          return (
                          <tr key={v.id}>
                            <td>{v.nombre_comercial || v.nombre || '—'}</td>
                            <td>{v.rif || '—'}</td>
                            <td>{v.telefono || '—'}</td>
                            <td>{v.estado || '—'}</td>
                            <td>{v.ciudad || '—'}</td>
                            <td>
                              <span
                                className={`dashboard-admin-status ${
                                  ap === 'ok' ? 'ok' : ap === 'pendiente' ? 'pendiente' : 'rechazado'
                                }`}
                              >
                                {etiquetaAprobacion(v.aprobacion_estado)}
                              </span>
                              <div className="dashboard-admin-acciones-mini">
                                {(v.aprobacion_estado ?? 'aprobado') !== 'aprobado' && (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn ok"
                                    disabled={accionando === `aprob-tienda-${v.id}`}
                                    onClick={() => void setTiendaAprobacion(v.id, 'aprobado')}
                                  >
                                    Autorizar
                                  </button>
                                )}
                                {(v.aprobacion_estado ?? 'aprobado') !== 'rechazado' && (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn danger"
                                    disabled={accionando === `aprob-tienda-${v.id}`}
                                    onClick={() => void setTiendaAprobacion(v.id, 'rechazado')}
                                  >
                                    Rechazar
                                  </button>
                                )}
                                {(v.aprobacion_estado ?? 'aprobado') === 'rechazado' && (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn warn"
                                    disabled={accionando === `aprob-tienda-${v.id}`}
                                    onClick={() => void setTiendaAprobacion(v.id, 'pendiente')}
                                  >
                                    Pendiente
                                  </button>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className={`dashboard-admin-status ${v.bloqueado ? 'warn' : 'ok'}`}>
                                {v.bloqueado ? 'Suspendido (impago u otro)' : 'Membresía activa'}
                              </span>
                            </td>
                            <td>{v.user_id}</td>
                            <td>
                              {v.bloqueado ? (
                                <button
                                  type="button"
                                  className="dashboard-admin-btn ok"
                                  disabled={accionando === `tienda-${v.id}`}
                                  onClick={() => void setTiendaBloqueada(v.id, false)}
                                >
                                  Reactivar membresía
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="dashboard-admin-btn danger"
                                  disabled={accionando === `tienda-${v.id}`}
                                  onClick={() => void setTiendaBloqueada(v.id, true)}
                                >
                                  Suspender por impago
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
                    <span className="dashboard-admin-busqueda-hint">Hasta {ADMIN_LIST_LIMIT} filas.</span>
                  </div>
                  <div className="dashboard-admin-table-wrap">
                    <table className="dashboard-admin-table">
                      <thead>
                        <tr>
                          <th>Nombre</th>
                          <th>Especialidad</th>
                          <th>Teléfono</th>
                          <th>Estado</th>
                          <th>Ciudad</th>
                          <th>Autorización web</th>
                          <th>Bloqueo</th>
                          <th>User ID</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {talleres.map((t) => {
                          const ap = claseAprobacion(t.aprobacion_estado);
                          return (
                          <tr key={t.id}>
                            <td>{t.nombre_comercial || t.nombre || '—'}</td>
                            <td>{etiquetaEspecialidadesTaller(t.especialidad)}</td>
                            <td>{t.telefono || '—'}</td>
                            <td>{t.estado || '—'}</td>
                            <td>{t.ciudad || '—'}</td>
                            <td>
                              <span
                                className={`dashboard-admin-status ${
                                  ap === 'ok' ? 'ok' : ap === 'pendiente' ? 'pendiente' : 'rechazado'
                                }`}
                              >
                                {etiquetaAprobacion(t.aprobacion_estado)}
                              </span>
                              <div className="dashboard-admin-acciones-mini">
                                {(t.aprobacion_estado ?? 'aprobado') !== 'aprobado' && (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn ok"
                                    disabled={accionando === `aprob-taller-${t.id}`}
                                    onClick={() => void setTallerAprobacion(t.id, 'aprobado')}
                                  >
                                    Autorizar
                                  </button>
                                )}
                                {(t.aprobacion_estado ?? 'aprobado') !== 'rechazado' && (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn danger"
                                    disabled={accionando === `aprob-taller-${t.id}`}
                                    onClick={() => void setTallerAprobacion(t.id, 'rechazado')}
                                  >
                                    Rechazar
                                  </button>
                                )}
                                {(t.aprobacion_estado ?? 'aprobado') === 'rechazado' && (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn warn"
                                    disabled={accionando === `aprob-taller-${t.id}`}
                                    onClick={() => void setTallerAprobacion(t.id, 'pendiente')}
                                  >
                                    Pendiente
                                  </button>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className={`dashboard-admin-status ${t.bloqueado ? 'warn' : 'ok'}`}>
                                {t.bloqueado ? 'Suspendido (impago u otro)' : 'Membresía activa'}
                              </span>
                            </td>
                            <td>{t.user_id}</td>
                            <td>
                              {t.bloqueado ? (
                                <button
                                  type="button"
                                  className="dashboard-admin-btn ok"
                                  disabled={accionando === `taller-${t.id}`}
                                  onClick={() => void setTallerBloqueado(t.id, false)}
                                >
                                  Reactivar membresía
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="dashboard-admin-btn danger"
                                  disabled={accionando === `taller-${t.id}`}
                                  onClick={() => void setTallerBloqueado(t.id, true)}
                                >
                                  Suspender por impago
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

              {tab === 'compradores' && (
                <section className="dashboard-seccion">
                  <h2 className="dashboard-seccion-titulo">Perfiles de compradores</h2>
                  <div className="dashboard-admin-busqueda-fila">
                    <label htmlFor="admin-buscar-compradores" className="dashboard-admin-busqueda-label">
                      Buscar (correo, nombre, RIF, teléfono o parte del ID)
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
                          <th>RIF</th>
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
                          const susp = c.suspendido_membresia === true;
                          const ocupado = accionando === `comp-memb-${c.user_id}`;
                          return (
                            <tr key={c.user_id}>
                              <td>{c.email || '—'}</td>
                              <td>{c.nombre_comercial || c.nombre || '—'}</td>
                              <td>{c.rif || '—'}</td>
                              <td>{c.telefono || '—'}</td>
                              <td>{c.estado || '—'}</td>
                              <td>{c.ciudad || '—'}</td>
                              <td>
                                <span className={`dashboard-admin-status ${susp ? 'warn' : 'ok'}`}>
                                  {susp ? 'Suspendido (impago)' : 'Activo'}
                                </span>
                              </td>
                              <td>{c.user_id}</td>
                              <td>
                                {susp ? (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn ok"
                                    disabled={ocupado}
                                    onClick={() => void setCompradorSuspendidoMembresia(c.user_id, false)}
                                  >
                                    Reactivar membresía
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="dashboard-admin-btn danger"
                                    disabled={ocupado}
                                    onClick={() => void setCompradorSuspendidoMembresia(c.user_id, true)}
                                  >
                                    Suspender por impago
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
            </>
          )}
        </main>
      </div>
    </div>
  );
}

