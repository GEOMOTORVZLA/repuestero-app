import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { etiquetaMoneda } from '../utils/monedaProducto';
import { formatearPrecioProducto } from '../utils/precioProducto';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_MOTO } from '../utils/verticalVehiculo';

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

const SELECT =
  'id, nombre, marca, modelo, anio, precio_usd, moneda, activo, created_at, stock_confirmado_at, vertical';
const PAGE = 1000;

async function cargarProductosVendedor(
  userId: string
): Promise<{ productos: ProductoResumen[]; error: string | null }> {
  const { data: tiendas, error: errTiendas } = await supabase
    .from('tiendas')
    .select('id')
    .eq('user_id', userId);

  if (errTiendas) return { productos: [], error: errTiendas.message || 'Error al cargar tus tiendas.' };
  if (!tiendas?.length) return { productos: [], error: null };

  const tiendaIds = tiendas.map((t) => t.id);
  const acumulado: ProductoResumen[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('productos')
      .select(SELECT)
      .in('tienda_id', tiendaIds)
      .order('nombre')
      .range(from, from + PAGE - 1);
    if (error) return { productos: [], error: error.message || 'Error al cargar productos.' };
    const batch = (data ?? []) as ProductoResumen[];
    acumulado.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return { productos: acumulado, error: null };
}

function diasDesdeFechaISO(fechaIso: string | null | undefined): number | null {
  if (!fechaIso) return null;
  const ts = Date.parse(fechaIso);
  if (Number.isNaN(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24)));
}

/** Misma lógica de semáforo que MisProductos (amarillo/rojo = próximos a pausarse). */
function semaforoStockProducto(p: ProductoResumen): 'verde' | 'amarillo' | 'rojo' | 'vencido' | 'sin-fecha' {
  const base = p.stock_confirmado_at ?? p.created_at ?? null;
  const dias = diasDesdeFechaISO(base);
  if (dias == null) return 'sin-fecha';
  if (dias <= 9) return 'verde';
  if (dias <= 15) return 'amarillo';
  if (dias <= 20) return 'rojo';
  return 'vencido';
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

/** Formato corto venezolano para la tarjeta KPI: DD/MM/YYYY */
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
  const [productos, setProductos] = useState<ProductoResumen[]>([]);
  const [membresiaHasta, setMembresiaHasta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<KpiId | null>(null);

  const esMoto = vertical === VERTICAL_MOTO;
  const etiquetaVertical = esMoto ? 'motocicleta' : 'automóvil';

  const cargar = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    setError(null);
    try {
      const [{ productos: lista, error: errProd }, tiendaRes] = await Promise.all([
        cargarProductosVendedor(user.id),
        supabase
          .from('tiendas')
          .select('membresia_hasta')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (errProd) {
        setProductos([]);
        setError(errProd);
        return;
      }

      const deVertical = lista.filter((p) => (p.vertical ?? 'auto') === vertical);
      setProductos(deVertical);

      if (tiendaRes.error) {
        setMembresiaHasta(null);
      } else {
        const raw = (tiendaRes.data as { membresia_hasta?: string | null } | null)?.membresia_hasta;
        setMembresiaHasta(raw != null ? String(raw).slice(0, 10) : null);
      }
    } catch (e) {
      setProductos([]);
      setError(e instanceof Error ? e.message : 'No se pudo cargar el resumen.');
    } finally {
      setCargando(false);
    }
  }, [user, vertical]);

  useEffect(() => {
    void cargar();
  }, [cargar, refreshTrigger]);

  const activos = useMemo(() => productos.filter((p) => p.activo !== false), [productos]);
  const pausados = useMemo(() => productos.filter((p) => p.activo === false), [productos]);
  const proximos = useMemo(
    () =>
      productos.filter((p) => {
        if (p.activo === false) return false;
        const s = semaforoStockProducto(p);
        return s === 'amarillo' || s === 'rojo';
      }),
    [productos]
  );

  const diasMemb = diasHastaMembresia(membresiaHasta);
  const membresiaAlerta = diasMemb != null && diasMemb <= 7;

  const listaDetalle: ProductoResumen[] = useMemo(() => {
    if (detalle === 'publicados') return productos;
    if (detalle === 'activos') return activos;
    if (detalle === 'pausados') return pausados;
    if (detalle === 'proximos') return proximos;
    return [];
  }, [detalle, productos, activos, pausados, proximos]);

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
          <p className="dashboard-kpi-valor">{cargando ? '…' : productos.length}</p>
          <p className="dashboard-kpi-hint">Todos los de tu vertical {etiquetaVertical}.</p>
        </button>

        <button
          type="button"
          className="dashboard-kpi-card dashboard-kpi-card--clickable"
          onClick={() => setDetalle('activos')}
          disabled={cargando}
        >
          <p className="dashboard-kpi-label">Productos activos</p>
          <p className="dashboard-kpi-valor">{cargando ? '…' : activos.length}</p>
          <p className="dashboard-kpi-hint">Visibles en el buscador (si tienen aprobación).</p>
        </button>

        <button
          type="button"
          className="dashboard-kpi-card dashboard-kpi-card--clickable"
          onClick={() => setDetalle('pausados')}
          disabled={cargando}
        >
          <p className="dashboard-kpi-label">Productos pausados</p>
          <p className="dashboard-kpi-valor">{cargando ? '…' : pausados.length}</p>
          <p className="dashboard-kpi-hint">No se muestran en el buscador público.</p>
        </button>

        <button
          type="button"
          className={
            'dashboard-kpi-card dashboard-kpi-card--clickable' +
            (proximos.length > 0 ? ' dashboard-kpi-card--alerta' : '')
          }
          onClick={() => setDetalle('proximos')}
          disabled={cargando}
        >
          <p className="dashboard-kpi-label">Próximos a pausarse</p>
          <p className="dashboard-kpi-valor">{cargando ? '…' : proximos.length}</p>
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
              ) : listaDetalle.length === 0 ? (
                <p className="dashboard-texto-placeholder">No hay productos en esta categoría.</p>
              ) : (
                <>
                  <p className="dashboard-kpi-modal-meta" style={{ marginTop: 0 }}>
                    {listaDetalle.length} producto{listaDetalle.length === 1 ? '' : 's'}
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
