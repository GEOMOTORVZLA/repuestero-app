import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { CATEGORIAS_PRODUCTO } from '../data/categoriasProducto';
import { CATEGORIAS_PRODUCTO_MOTO } from '../data/categoriasProductoMoto';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_MOTO } from '../utils/verticalVehiculo';
import {
  COLUMNAS_PUBLICACION_ACTIVA,
  filaPublicacionActivaExcel,
  type ProductoPublicacionExcel,
} from '../utils/excelPublicacionesActivas';

type Props = {
  vertical: VerticalVehiculo;
  /** Panel admin: tienda del vendedor elegido. Si no viene, se usa la tienda del usuario. */
  tiendaId?: string | null;
  etiquetaVendedor?: string | null;
  modoAdmin?: boolean;
};

const PAGE = 1000;

function errorPorColumnaCodigo(msg: string | undefined): boolean {
  const m = (msg ?? '').toLowerCase();
  return m.includes('codigo') && (m.includes('does not exist') || m.includes('column'));
}

function hojaCategorias(vertical: VerticalVehiculo): XLSX.WorkSheet {
  const categorias = vertical === VERTICAL_MOTO ? [...CATEGORIAS_PRODUCTO_MOTO] : [...CATEGORIAS_PRODUCTO];
  const rows = [['categoria'], ...categorias.map((v) => [v])];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: Math.max(12, ...categorias.map((v) => v.length)) + 2 }];
  return ws;
}

function slugArchivo(texto: string): string {
  const s = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, 40) || 'vendedor';
}

export function DescargarPublicacionesActivas({
  vertical,
  tiendaId = null,
  etiquetaVendedor = null,
  modoAdmin = false,
}: Props) {
  const { user } = useAuth();
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [esError, setEsError] = useState(false);
  const etiqueta = vertical === VERTICAL_MOTO ? 'motocicleta' : 'automóvil';
  const vendedor = etiquetaVendedor?.trim() || 'el vendedor';
  const faltaVendedor = modoAdmin && !tiendaId;

  const descargar = async () => {
    if (!user || faltaVendedor) return;
    setOcupado(true);
    setMensaje('');
    setEsError(false);
    try {
      let tiendaIds: string[] = [];
      if (modoAdmin) {
        tiendaIds = tiendaId ? [tiendaId] : [];
      } else {
        const { data: tiendas, error: errTiendas } = await supabase
          .from('tiendas')
          .select('id')
          .eq('user_id', user.id);
        if (errTiendas) throw new Error(errTiendas.message || 'No se pudo cargar tu tienda.');
        tiendaIds = (tiendas ?? []).map((t) => t.id);
        if (tiendaIds.length === 0) {
          setEsError(true);
          setMensaje('No hay una tienda asociada a tu usuario. Completa Mi perfil.');
          return;
        }
      }

      const productos: ProductoPublicacionExcel[] = [];
      let desde = 0;
      let conCodigo = true;
      while (true) {
        const columnas = conCodigo
          ? 'codigo, nombre, categoria, comentarios, descripcion, precio_usd, moneda, stock_actual'
          : 'nombre, categoria, comentarios, descripcion, precio_usd, moneda, stock_actual';
        const { data, error } = await supabase
          .from('productos')
          .select(columnas)
          .in('tienda_id', tiendaIds)
          .eq('vertical', vertical)
          .eq('activo', true)
          .eq('aprobacion_publica', 'aprobado')
          .or('stock_actual.is.null,stock_actual.gt.0')
          .order('nombre')
          .order('id')
          .range(desde, desde + PAGE - 1);
        if (error) {
          if (conCodigo && errorPorColumnaCodigo(error.message)) {
            conCodigo = false;
            continue;
          }
          throw new Error(error.message || 'No se pudieron leer las publicaciones.');
        }
        const lote = (data ?? []) as ProductoPublicacionExcel[];
        productos.push(...lote);
        if (lote.length < PAGE) break;
        desde += PAGE;
      }

      if (productos.length === 0) {
        setEsError(true);
        setMensaje(
          modoAdmin
            ? `${vendedor} no tiene publicaciones activas de ${etiqueta}.`
            : `No tienes publicaciones activas de ${etiqueta} para descargar.`
        );
        return;
      }

      const filas = productos.map((p) => filaPublicacionActivaExcel(p));
      const ws = XLSX.utils.aoa_to_sheet([[...COLUMNAS_PUBLICACION_ACTIVA], ...filas]);
      ws['!cols'] = [
        { wch: 18 },
        { wch: 34 },
        { wch: 28 },
        { wch: 42 },
        { wch: 10 },
        { wch: 8 },
        { wch: 10 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Productos');
      XLSX.utils.book_append_sheet(wb, hojaCategorias(vertical), 'Categorias');
      const sufijoVertical = vertical === VERTICAL_MOTO ? 'motocicleta' : 'automovil';
      const nombre = modoAdmin
        ? `publicaciones-activas-${slugArchivo(vendedor)}-${sufijoVertical}.xlsx`
        : `publicaciones-activas-${sufijoVertical}.xlsx`;
      XLSX.writeFile(wb, nombre, { compression: true });

      const sinCodigo = filas.filter((f) => !f[0]).length;
      const deQuien = modoAdmin ? `de ${vendedor}` : '';
      setMensaje(
        sinCodigo > 0
          ? `Listo: ${filas.length} publicación(es) activa(s)${deQuien ? ` ${deQuien}` : ''}. ${sinCodigo} no tienen código: complétalo antes de volver a subir el archivo en Sincronizar.`
          : `Listo: ${filas.length} publicación(es) activa(s)${deQuien ? ` ${deQuien}` : ''}. Puedes modificar el archivo y volver a subirlo en Sincronizar inventario. Las fotos no se cambian.`
      );
    } catch (e) {
      setEsError(true);
      setMensaje(e instanceof Error ? e.message : 'No se pudo generar el Excel.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="dashboard-seccion">
      {!modoAdmin && <h2 className="dashboard-seccion-titulo">Descarga de publicaciones activas</h2>}
      <div className="dashboard-productos-toolbar">
        <p className="dashboard-productos-toolbar-hint">
          {modoAdmin ? (
            <>
              Baja un Excel con lo que <strong>{vendedor}</strong> tiene <strong>publicado</strong> de{' '}
              <strong>{etiqueta}</strong>.
            </>
          ) : (
            <>
              Baja un Excel con todo lo que tienes <strong>publicado</strong> de <strong>{etiqueta}</strong>.
            </>
          )}{' '}
          Las columnas son las de la carga masiva, sin fotos: codigo, nombre, categoria, comentarios,
          precio, moneda y cantidad. No incluye pausados, rechazados ni los que están en cantidad 0.
        </p>
        <p className="dashboard-productos-toolbar-hint">
          Modifica ese archivo y súbelo en modo <strong>Sincronizar inventario</strong>. Se actualizan los
          datos de cada código y las fotos se quedan como están.
        </p>
      </div>
      <div className="dashboard-card">
        <button
          type="button"
          className="dashboard-btn-accion"
          disabled={ocupado || !user || faltaVendedor}
          onClick={() => void descargar()}
        >
          {ocupado ? 'Preparando Excel...' : 'Descargar publicaciones activas (.xlsx)'}
        </button>
        {faltaVendedor && !mensaje && (
          <p className="importar-productos-mensaje" role="status">
            Elige el vendedor para bajar su archivo.
          </p>
        )}
        {mensaje && (
          <p className={`importar-productos-mensaje ${esError ? 'error' : 'ok'}`} role="status">
            {mensaje}
          </p>
        )}
      </div>
    </section>
  );
}
