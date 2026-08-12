import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { etiquetaMoneda } from '../utils/monedaProducto';
import { formatearPrecioProducto } from '../utils/precioProducto';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_MOTO } from '../utils/verticalVehiculo';
import {
  claseSemaforoStockPorDias,
  diasDesdeFechaISO,
} from '../utils/stockActualInventario';
import {
  PRODUCTOS_VENDEDOR_LISTA_PAGE,
  contarProductosVendedor,
  fetchPaginaProductosVendedorLista,
  fetchTiendaIdsUsuario,
  type FiltroEstadoListaVendedor,
} from '../utils/productosVendedorConsulta';

type ProductoResumen = {
  id: string;
  nombre: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  precio_usd: number;
  moneda: string | null;
  activo?: boolean | null;
  created_at?: string | null;
  stock_confirmado_at?: string | null;
  vertical?: VerticalVehiculo | null;
};

type KpiId = 'publicados' | 'activos' | 'pausados' | 'proximos' | 'membresia';

const SELECT_DETALLE =
  'id, nombre, marca, modelo, anio, precio_usd, moneda, activo, created_at, stock_confirmado_at, vertical';

function estadoDesdeKpi(kpi: KpiId): FiltroEstadoListaVendedor {
  if (kpi === 'activos') return 'activos';
  if (kpi === 'pausados') return 'pausados';
  if (kpi === 'proximos') return 'proximos_stock';
  return 'todos';
}

function semaforoStockProducto(p: ProductoResumen): 'verde' | 'amarillo' | 'rojo' | 'vencido' | 'sin-fecha' {
  const base = p.stock_confirmado_at ?? p.created_at ?? null;
  return claseSemaforoStockPorDias(diasDesdeFechaISO(base));
}

function formatearFechaMembresia(iso: string | null): string {
  if (!iso) return 'Sin fecha registrada';
  const solo = iso.slice(0, 10);
  const d = Date.parse(solo + 'T12:00:00');
  if (Number.isNaN(d)) return solo;
  return new Date(d).toLocaleDateString('es-VE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatearFechaMembresiaCorta(iso: string | null): string {
  if (!iso) return '—';
  const solo = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(solo)) return solo;
  const [y, m, d] = solo.split('-');
  return `${d}/${m}/${y}`;
}

function diasHastaMembresia(iso: string | null): number | null {
  if (!iso) return null;
  const solo = iso.slice(0, 10);
  const fin = Date.parse(solo + 'T23:59:59');
  if (Number.isNaN(fin)) return null;
  return Math.ceil((fin - Date.now()) / (1000 * 60 * 60 * 24));
}

type ResumenVendedorProps = {
  vertical: VerticalVehiculo;
  refreshTrigger?: number;
};

export function ResumenVendedor({ vertical, refreshTrigger = 0 }: ResumenVendedorProps) {
  const { user } = useAuth();
  const [countPublicados, setCountPublicados] = useState(0);
  const [countActivos, setCountActivos] = useState(0);
  const [countPausados, setCountPausados] = useState(0);
  const [countProximos, setCountProximos] = useState(0);
  const [membresiaHasta, setMembresiaHasta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<KpiId | null>(null);
  const [listaDetalle, setListaDetalle] = useState<ProductoResumen[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [hayMasDetalle, setHayMasDetalle] = useState(false);
  const [offsetDetalle, setOffsetDetalle] = useState(0);
  const [tiendaIds, setTiendaIds] = useState<string[]>([]);

  const esMoto = vertical === VERTICAL_MOTO;
  const etiquetaVertical = esMoto ? 'motocicleta' : 'automóvil';

  const cargar = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    setError(null);
    try {
      const [{ tiendaIds: ids, error: errIds }, tiendaRes] = await Promise.all([
        fetchTiendaIdsUsuario(user.id),
        supabase
          .from('tiendas')
          .select('membresia_hasta')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (errIds) {
        setError(errIds);
        setCountPublicados(0);
        setCountActivos(0);
        setCountPausados(0);
        setCountProximos(0);
        return;
      }
      setTiendaIds(ids);

      const [pub, act, pau, prox] = await Promise.all([
        contarProductosVendedor({ tiendaIds: ids, vertical, estado: 'todos' }),
        contarProductosVendedor({ tiendaIds: ids, vertical, estado: 'activos' }),
        contarProductosVendedor({ tiendaIds: ids, vertical, estado: 'pausados' }),
        contarProductosVendedor({ tiendaIds: ids, vertical, estado: 'proximos_stock' }),
      ]);

      const errCount = pub.error || act.error || pau.error || prox.error;
      if (errCount) setError(errCount);

      setCountPublicados(pub.count);
      setCountActivos(act.count);
      setCountPausados(pau.count);
      setCountProximos(prox.count);

      if (tiendaRes.error) {
        setMembresiaHasta(null);
      } else {
        const raw = (tiendaRes.data as { membresia_hasta?: string | null } | null)?.membresia_hasta;
        setMembresiaHasta(raw != null ? String(raw).slice(0, 10) : null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el resumen.');
    } finally {
      setCargando(false);
    }
  }, [user, vertical]);

  useEffect(() => {
    void cargar();
  }, [cargar, refreshTrigger]);

  useEffect(() => {
    if (!detalle || detalle === 'membresia' || !user) {
      setListaDetalle([]);
      setHayMasDetalle(false);
      setOffsetDetalle(0);
      return;
    }
    let cancelado = false;
    void (async () => {
      setCargandoDetalle(true);
      const ids =
        tiendaIds.length > 0 ? tiendaIds : (await fetchTiendaIdsUsuario(user.id)).tiendaIds;
      const pagina = await fetchPaginaProductosVendedorLista({
        tiendaIds: ids,
        select: SELECT_DETALLE,
        offset: 0,
        vertical,
        estado: estadoDesdeKpi(detalle),
      });
      if (cancelado) return;
      if (pagina.error) {
        setListaDetalle([]);
        setHayMasDetalle(false);
      } else {
        setListaDetalle(pagina.filas as ProductoResumen[]);
        setOffsetDetalle(pagina.filas.length);
        setHayMasDetalle(pagina.hayMas);
      }
      setCargandoDetalle(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [detalle, user, vertical, tiendaIds]);

  const cargarMasDetalle = async () => {
    if (!detalle || detalle === 'membresia' || !user || !hayMasDetalle) return;
    setCargandoDetalle(true);
    try {
      const pagina = await fetchPaginaProductosVendedorLista({
        tiendaIds,
        select: SELECT_DETALLE,
        offset: offsetDetalle,
        vertical,
        estado: estadoDesdeKpi(detalle),
      });
      if (pagina.error) return;
      const filas = pagina.filas as ProductoResumen[];
      setListaDetalle((prev) => {
        const vistos = new Set(prev.map((p) => p.id));
        return [...prev, ...filas.filter((p) => !vistos.has(p.id))];
      });
      setOffsetDetalle((prev) => prev + filas.length);
      setHayMasDetalle(pagina.hayMas);
    } finally {
      setCargandoDetalle(false);
    }
  };

  const diasMemb = diasHastaMembresia(membresiaHasta);
  const membresiaAlerta = diasMemb != null && diasMemb <= 7;

  const tituloDetalle =
    detalle === 'publicados'
      ? 'Productos publicados (' + etiquetaVertical + ')'
      : detalle === 'activos'
        ? 'Productos activos'
        : detalle === 'pausados'
          ? 'Productos pausados'
          : detalle === 'proximos'
            ? 'Próximos a pausarse por tiempo'
            : detalle === 'membresia'
              ? 'Vencimiento de membresía'
              : '';

  if (!user) return null;

  return (
    <section className="dashboard-seccion">
      <h2 className="dashboard-seccion-titulo">Resumen</h2>
      <p className="dashboard-kpi-grid-hint">
        Solo tus productos de {etiquetaVertical}. Pulsa una tarjeta para ver el listado.
      </p>

      {error && <p className="dashboard-admin-error">{error}</p>}

      <div className="dashboard-kpi-grid">
        <button
          type="button"
          className="dashboard-kpi-card dashboard-kpi-card--clickable"
          onClick={() => setDetalle('publicados')}
          disabled={cargando}
        >
          <p className="dashboard-kpi-label">Productos publicados</p>
          <p className="dashboard-kpi-valor">{cargando ? '…' : countPublicados}</p>
          <p className="dashboard-kpi-hint">Todos los de tu vertical {etiquetaVertical}.</p>
        </button>

        <button
          type="button"
          className="dashboard-kpi-card dashboard-kpi-card--clickable"
          onClick={() => setDetalle('activos')}
          disabled={cargando}
        >
          <p className="dashboard-kpi-label">Productos activos</p>
          <p className="dashboard-kpi-valor">{cargando ? '…' : countActivos}</p>
          <p className="dashboard-kpi-hint">Visibles en el buscador (si tienen aprobación).</p>
        </button>

        <button
          type="button"
          className="dashboard-kpi-card dashboard-kpi-card--clickable"
          onClick={() => setDetalle('pausados')}
          disabled={cargando}
        >
          <p className="dashboard-kpi-label">Productos pausados</p>
          <p className="dashboard-kpi-valor">{cargando ? '…' : countPausados}</p>
          <p className="dashboard-kpi-hint">No se muestran en el buscador público.</p>
        </button>

        <button
          type="button"
          className={
            'dashboard-kpi-card dashboard-kpi-card--clickable' +
            (countProximos > 0 ? ' dashboard-kpi-card--alerta' : '')
          }
          onClick={() => setDetalle('proximos')}
          disabled={cargando}
        >
          <p className="dashboard-kpi-label">Próximos a pausarse</p>
          <p className="dashboard-kpi-valor">{cargando ? '…' : countProximos}</p>
          <p className="dashboard-kpi-hint">Semáforo amarillo o rojo por fecha de stock.</p>
        </button>

        <button
          type="button"
          className={
            'dashboard-kpi-card dashboard-kpi-card--clickable' +
            (membresiaAlerta ? ' dashboard-kpi-card--alerta' : '')
          }
          onClick={() => setDetalle('membresia')}
          disabled={cargando}
        >
          <p className="dashboard-kpi-label">Membresía mensual</p>
          <p className="dashboard-kpi-valor">
            {cargando ? '…' : formatearFechaMembresiaCorta(membresiaHasta)}
          </p>
          <p className="dashboard-kpi-hint">
            {diasMemb == null
              ? 'Fecha de vencimiento de tu plan.'
              : diasMemb < 0
                ? 'Venció hace ' + Math.abs(diasMemb) + ' día(s).'
                : diasMemb === 0
                  ? 'Vence hoy.'
                  : 'Quedan ' + diasMemb + ' día(s).'}
          </p>
        </button>
      </div>

      {detalle && (
        <div
          className="dashboard-kpi-modal-backdrop"
          role="presentation"
          onClick={() => setDetalle(null)}
        >
          <div
            className="dashboard-kpi-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-vendedor-kpi-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dashboard-kpi-modal-header">
              <h3 id="dashboard-vendedor-kpi-titulo" className="dashboard-kpi-modal-titulo">
                {tituloDetalle}
              </h3>
              <button
                type="button"
                className="dashboard-kpi-modal-cerrar"
                onClick={() => setDetalle(null)}
              >
                Cerrar
              </button>
            </div>
            <div className="dashboard-kpi-modal-body">
              {detalle === 'membresia' ? (
                <>
                  <p className="dashboard-kpi-modal-meta" style={{ marginTop: 0 }}>
                    Vence el: <strong>{formatearFechaMembresia(membresiaHasta)}</strong>
                  </p>
                  <p className="dashboard-kpi-modal-aviso">
                    {membresiaHasta
                      ? diasMemb != null && diasMemb < 0
                        ? 'Tu membresía está vencida. Renueva para mantener tu tienda activa.'
                        : 'Esta es la fecha de vencimiento de tu membresía mensual registrada en tu tienda.'
                      : 'Aún no hay una fecha de membresía registrada en tu tienda. Si acabas de pagar, puede tardar en actualizarse.'}
                  </p>
                </>
              ) : cargandoDetalle && listaDetalle.length === 0 ? (
                <p className="dashboard-texto-placeholder">Cargando listado…</p>
              ) : listaDetalle.length === 0 ? (
                <p className="dashboard-texto-placeholder">No hay productos en esta categoría.</p>
              ) : (
                <>
                  <p className="dashboard-kpi-modal-meta" style={{ marginTop: 0 }}>
                    {listaDetalle.length} producto{listaDetalle.length === 1 ? '' : 's'}
                    {hayMasDetalle ? ' (hay más)' : ''}
                  </p>
                  <div className="dashboard-kpi-modal-table-wrap">
                    <table className="dashboard-admin-table">
                      <thead>
                        <tr>
                          <th>Nombre</th>
                          <th>Vehículo</th>
                          <th>Precio</th>
                          <th>Estado</th>
                          <th>Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {listaDetalle.map((p) => {
                          const vehiculo = [p.marca, p.modelo, p.anio].filter(Boolean).join(' ');
                          const sem = semaforoStockProducto(p);
                          const activo = p.activo !== false;
                          return (
                            <tr key={p.id}>
                              <td>{p.nombre}</td>
                              <td>{vehiculo || '—'}</td>
                              <td>
                                {etiquetaMoneda(p.moneda)} {formatearPrecioProducto(p.precio_usd)}
                              </td>
                              <td>{activo ? 'Activo' : 'Pausado'}</td>
                              <td>
                                {sem === 'amarillo'
                                  ? 'Amarillo'
                                  : sem === 'rojo'
                                    ? 'Rojo'
                                    : sem === 'vencido'
                                      ? 'Vencido'
                                      : sem === 'verde'
                                        ? 'Verde'
                                        : 'Sin fecha'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {hayMasDetalle && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.75rem' }}>
                      <button
                        type="button"
                        className="dashboard-admin-btn ok"
                        disabled={cargandoDetalle}
                        onClick={() => void cargarMasDetalle()}
                      >
                        {cargandoDetalle
                          ? 'Cargando…'
                          : `Cargar más (${PRODUCTOS_VENDEDOR_LISTA_PAGE})`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="dashboard-kpi-modal-footer">
              <button
                type="button"
                className="dashboard-kpi-modal-cerrar"
                onClick={() => setDetalle(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
