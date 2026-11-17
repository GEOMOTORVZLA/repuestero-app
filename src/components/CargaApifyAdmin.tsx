import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import {
  adaptarFilasApify,
  columnasExcelApify,
  filasApifyParaExcel,
  leerFilasExcelApify,
  type FilaApifyLista,
} from '../utils/adaptarExcelApify';
import { resumenClasificacionImportacion } from '../utils/clasificarCategoriaProducto';
import { resolverCodigosRepetidos } from '../utils/codigosImportacionDuplicados';
import { copiarFotosExternasDeProductos } from '../utils/copiarFotosImportacion';
import { permitirAccionCliente } from '../utils/rateLimitCliente';
import { patchDesdeStockActual } from '../utils/stockActualInventario';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO, VERTICAL_MOTO } from '../utils/verticalVehiculo';
import { esTiendaVitrina, rifVitrina } from '../utils/vitrinaVisita';
import './ImportarProductosCSV.css';
import './CargaApifyAdmin.css';

type VendedorApify = {
  id: string;
  user_id?: string;
  nombre: string | null;
  nombre_comercial: string | null;
  rif: string | null;
  bloqueado: boolean | null;
  aprobacion_estado?: string | null;
  vertical?: string | null;
};

type Props = {
  vendedores: VendedorApify[];
  onImportado?: () => void;
  onAbrirVisor?: (info: { userId: string; vertical: VerticalVehiculo; nombre: string }) => void;
};

function etiquetaVendedor(v: VendedorApify): string {
  return v.nombre_comercial?.trim() || v.nombre?.trim() || v.id;
}

function normalizarCodigo(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '-');
}

async function vaciarCatalogoVitrina(tiendaId: string): Promise<string | null> {
  const ids: string[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('productos')
      .select('id')
      .eq('tienda_id', tiendaId)
      .range(from, from + PAGE - 1);
    if (error) return error.message || 'No se pudo vaciar la vitrina.';
    const batch = (data ?? []) as { id: string }[];
    for (const row of batch) ids.push(row.id);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  for (let i = 0; i < ids.length; i += 400) {
    const { error } = await supabase.rpc('admin_eliminar_productos', {
      p_producto_ids: ids.slice(i, i + 400),
    });
    if (error) return error.message || 'No se pudo vaciar la vitrina.';
  }
  return null;
}

async function mapaCodigosTienda(tiendaId: string): Promise<
  | { ok: true; map: Map<string, string>; existentes: { codigo: string; nombre: string }[] }
  | { ok: false; error: string }
> {
  const map = new Map<string, string>();
  const existentes: { codigo: string; nombre: string }[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('productos')
      .select('id, codigo, nombre')
      .eq('tienda_id', tiendaId)
      .not('codigo', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) {
      return { ok: false, error: error.message || 'No se pudieron leer los códigos de la tienda.' };
    }
    const batch = (data ?? []) as { id: string; codigo: string | null; nombre: string | null }[];
    for (const row of batch) {
      const codigo = normalizarCodigo(String(row.codigo ?? ''));
      if (!codigo || map.has(codigo)) continue;
      map.set(codigo, row.id);
      existentes.push({ codigo, nombre: String(row.nombre ?? '') });
    }
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return { ok: true, map, existentes };
}

function codigoLibre(base: string, ocupados: Set<string>): string {
  const limpio = normalizarCodigo(base);
  if (!limpio) return '';
  if (!ocupados.has(limpio)) {
    ocupados.add(limpio);
    return limpio;
  }
  for (let n = 2; n < 1000; n += 1) {
    const sufijo = `-${n}`;
    const candidato = `${limpio.slice(0, Math.max(1, 64 - sufijo.length))}${sufijo}`;
    if (!ocupados.has(candidato)) {
      ocupados.add(candidato);
      return candidato;
    }
  }
  return limpio;
}

async function buscarVitrina(vertical: VerticalVehiculo): Promise<
  | { ok: true; id: string; nombre: string }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('tiendas')
    .select('id, nombre_comercial, nombre')
    .eq('rif', rifVitrina(vertical))
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message || 'No se pudo leer la vitrina.' };
  if (!data?.id) return { ok: false, error: 'Esta vertical todavía no tiene vitrina con artículos.' };
  const fila = data as { id: string; nombre_comercial: string | null; nombre: string | null };
  return {
    ok: true,
    id: fila.id,
    nombre: fila.nombre_comercial?.trim() || fila.nombre?.trim() || 'la vitrina',
  };
}

export function CargaApifyAdmin({ vendedores, onImportado, onAbrirVisor }: Props) {
  const { user } = useAuth();
  const [vertical, setVertical] = useState<VerticalVehiculo>(VERTICAL_AUTO);
  const [destino, setDestino] = useState<'vitrina' | 'vendedor'>('vitrina');
  const [nombreVitrina, setNombreVitrina] = useState('');
  const [visitaLista, setVisitaLista] = useState<{ userId: string; nombre: string } | null>(null);
  const confirmacionRef = useRef<HTMLDivElement>(null);
  const filasRef = useRef<FilaApifyLista[]>([]);
  const [tiendaId, setTiendaId] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [filas, setFilas] = useState<FilaApifyLista[]>([]);
  const [resumen, setResumen] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState('');
  const [estado, setEstado] = useState<'idle' | 'preparando' | 'listo' | 'confirmar' | 'subiendo' | 'ok' | 'error'>(
    'idle'
  );
  const [pasoTiendaId, setPasoTiendaId] = useState('');
  const [pasoEstado, setPasoEstado] = useState<'idle' | 'contando' | 'confirmar' | 'pasando' | 'ok' | 'error'>('idle');
  const [pasoMensaje, setPasoMensaje] = useState('');
  const [pasoCantidad, setPasoCantidad] = useState(0);

  const ocupado =
    estado === 'preparando' ||
    estado === 'subiendo' ||
    estado === 'confirmar' ||
    pasoEstado === 'contando' ||
    pasoEstado === 'pasando' ||
    pasoEstado === 'confirmar';

  useEffect(() => {
    if (estado !== 'confirmar') return;
    confirmacionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [estado]);
  const vendedoresVertical = useMemo(() => {
    return vendedores
      .filter((v) => {
        if (esTiendaVitrina(v.rif)) return false;
        if ((v.aprobacion_estado ?? 'aprobado') !== 'aprobado') return false;
        if (v.bloqueado === true) return false;
        const vert = (v.vertical ?? 'auto') === 'moto' ? 'moto' : 'auto';
        return vert === vertical;
      })
      .sort((a, b) => etiquetaVendedor(a).localeCompare(etiquetaVendedor(b), 'es'));
  }, [vendedores, vertical]);

  const vendedor = vendedoresVertical.find((v) => v.id === tiendaId) ?? null;
  const tiendasParaPaso = useMemo(() => {
    return vendedores
      .filter((v) => {
        if (esTiendaVitrina(v.rif)) return false;
        if (v.bloqueado === true) return false;
        const vert = (v.vertical ?? 'auto') === 'moto' ? 'moto' : 'auto';
        return vert === vertical;
      })
      .sort((a, b) => etiquetaVendedor(a).localeCompare(etiquetaVendedor(b), 'es'));
  }, [vendedores, vertical]);

  const limpiarLote = () => {
    filasRef.current = [];
    setFilas([]);
    setResumen('');
    setErrores([]);
  };

  const preparar = async (): Promise<boolean> => {
    if (!archivo) return false;
    setEstado('preparando');
    setMensaje('Leyendo el archivo de Apify...');
    setErrores([]);
    limpiarLote();
    try {
      const buffer = await archivo.arrayBuffer();
      const crudas = leerFilasExcelApify(buffer);
      const resultado = adaptarFilasApify(crudas, vertical);
      if (resultado.filas.length === 0) {
        setErrores(resultado.errores.slice(0, 20));
        setEstado('error');
        setMensaje(
          resultado.errores[0] ||
            (resultado.omitidasSinFoto > 0
              ? `Ninguna publicación trae foto (${resultado.omitidasSinFoto} sin foto).`
              : 'No hay publicaciones para preparar.')
        );
        return false;
      }
      const resuelto = resolverCodigosRepetidos(resultado.filas, []);
      const textoClase = resumenClasificacionImportacion(
        vertical,
        resultado.clasificadosPorNombre,
        resultado.quedaronEnRespaldo
      );
      const extras = [
        textoClase,
        resultado.omitidasSinFoto > 0
          ? `${resultado.omitidasSinFoto} sin foto quedaron fuera.`
          : '',
        resultado.descripcionesRecortadas > 0
          ? `${resultado.descripcionesRecortadas} descripciones se recortaron a 2.000 caracteres.`
          : '',
      ].filter(Boolean);
      filasRef.current = resuelto.filas;
      setFilas(resuelto.filas);
      setErrores(resultado.errores.slice(0, 20));
      setResumen(
        `${resuelto.filas.length} artículo(s) listos.${extras.length ? ` ${extras.join(' ')}` : ''}${
          resuelto.resumen ? ` ${resuelto.resumen}` : ''
        }`
      );
      setEstado('listo');
      setMensaje('');
      return true;
    } catch {
      setEstado('error');
      setMensaje('No se pudo leer el Excel.');
      return false;
    }
  };

  const descargar = () => {
    if (filas.length === 0) return;
    const hoja = XLSX.utils.aoa_to_sheet([[...columnasExcelApify()], ...filasApifyParaExcel(filas)]);
    hoja['!cols'] = [
      { wch: 18 },
      { wch: 42 },
      { wch: 28 },
      { wch: 42 },
      { wch: 10 },
      { wch: 8 },
      { wch: 10 },
      { wch: 72 },
    ];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Productos');
    const nombre =
      destino === 'vitrina'
        ? nombreVitrina.trim() || 'vitrina'
        : vendedor
          ? etiquetaVendedor(vendedor)
          : 'apify';
    const slug = nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    XLSX.writeFile(libro, `geomotor-${slug || 'apify'}.xlsx`, { compression: true });
  };

  const destinoListo = destino === 'vitrina' ? nombreVitrina.trim().length >= 2 : Boolean(vendedor);

  const pedirConfirmacion = async () => {
    if (!destinoListo) {
      setEstado('error');
      setMensaje('Escribe el nombre que verá el vendedor, con al menos 2 letras.');
      return;
    }
    if (!archivo && filas.length === 0) {
      setEstado('error');
      setMensaje('Elige el Excel de Apify.');
      return;
    }
    if (filas.length === 0) {
      const leido = await preparar();
      if (!leido) return;
    }
    setEstado('confirmar');
    setMensaje(
      destino === 'vitrina'
        ? `Se reemplaza el catálogo de la vitrina de ${vertical === 'moto' ? 'motocicleta' : 'automóvil'} y se verá como ${nombreVitrina.trim()}. No sale en la web ni en la lista de vendedores. El visor sí lo muestra.`
        : `Se subirán ${filas.length} artículo(s) a ${etiquetaVendedor(vendedor!)}. Los nuevos quedan ocultos en la web hasta que los apruebes en Productos. El visor sí los muestra.`
    );
  };

  const subir = async () => {
    const lote = filas.length > 0 ? filas : filasRef.current;
    if (!user) {
      setEstado('error');
      setMensaje('La sesión no está activa. Entra otra vez como administrador.');
      return;
    }
    if (!destinoListo) {
      setEstado('error');
      setMensaje('Escribe el nombre que verá el vendedor.');
      return;
    }
    if (lote.length === 0) {
      setEstado('error');
      setMensaje('No se leyó el Excel. Vuelve a pulsarlo.');
      return;
    }
    const rl = permitirAccionCliente('apify-admin', {
      maxIntentos: 12,
      ventanaMs: 10 * 60 * 1000,
      bloqueoMs: 3 * 60 * 1000,
    });
    if (!rl.ok) {
      setEstado('error');
      setMensaje(rl.mensaje);
      return;
    }

    setEstado('subiendo');
    let tiendaDestinoId = vendedor?.id ?? '';
    let etiquetaDestino = vendedor ? etiquetaVendedor(vendedor) : '';
    let userVisita = '';
    if (destino === 'vitrina') {
      setMensaje('Preparando la vitrina...');
      const prep = await supabase.rpc('admin_preparar_vitrina', {
        p_vertical: vertical,
        p_nombre_comercial: nombreVitrina.trim(),
        p_vaciar: false,
      });
      if (prep.error) {
        const detalle = [prep.error.message, prep.error.details, prep.error.hint].filter(Boolean).join(' ');
        setEstado('error');
        setMensaje(
          detalle.toLowerCase().includes('schema cache')
            ? 'Falta crear la vitrina en Supabase. Ejecuta supabase-vitrina-visita.sql en el SQL Editor y vuelve a intentar.'
            : detalle || 'No se pudo preparar la vitrina.'
        );
        return;
      }
      const fila = (Array.isArray(prep.data) ? prep.data[0] : prep.data) as
        | { tienda_id?: string; user_id?: string }
        | null;
      if (!fila?.tienda_id || !fila.user_id) {
        setEstado('error');
        setMensaje('No se pudo preparar la vitrina.');
        return;
      }
      tiendaDestinoId = fila.tienda_id;
      userVisita = fila.user_id;
      etiquetaDestino = nombreVitrina.trim();
      const vacio = await vaciarCatalogoVitrina(tiendaDestinoId);
      if (vacio) {
        setEstado('error');
        setMensaje(vacio);
        return;
      }
    }

    setMensaje('Revisando códigos de la tienda...');
    const mapa =
      destino === 'vitrina'
        ? { ok: true as const, map: new Map<string, string>(), existentes: [] as { codigo: string; nombre: string }[] }
        : await mapaCodigosTienda(tiendaDestinoId);
    if (!mapa.ok) {
      setEstado('error');
      setMensaje(mapa.error);
      return;
    }
    const listos = resolverCodigosRepetidos(lote, mapa.existentes).filas;
    const codigos = new Map(mapa.map);
    let okInsert = 0;
    let okUpdate = 0;
    const erroresOp: string[] = [];
    const fotosPendientes: { rowNumber: number; productoId: string; urls: string[] }[] = [];

    for (const fila of listos) {
      const inv = patchDesdeStockActual(fila.cantidad);
      const existenteId = codigos.get(fila.codigo);
      if (existenteId) {
        const patch: Record<string, unknown> = {
          nombre: fila.nombre,
          descripcion: fila.comentarios,
          comentarios: fila.comentarios,
          precio_usd: fila.precio,
          moneda: fila.moneda,
          stock_actual: inv.stock_actual,
          disponibilidad_aviso: inv.disponibilidad_aviso ?? null,
          pausado_por_stock_vencido: inv.pausado_por_stock_vencido ?? false,
          imagen_url: fila.imagenesUrl[0],
          imagenes_extra: fila.imagenesUrl.length > 1 ? fila.imagenesUrl.slice(1) : null,
        };
        if (inv.activo !== undefined) patch.activo = inv.activo;
        if (inv.stock_confirmado_at) patch.stock_confirmado_at = inv.stock_confirmado_at;
        const { error } = await supabase.from('productos').update(patch).eq('id', existenteId);
        if (error) {
          erroresOp.push(`Fila ${fila.rowNumber}: ${error.message || 'No se pudo actualizar.'}`);
          continue;
        }
        fotosPendientes.push({ rowNumber: fila.rowNumber, productoId: existenteId, urls: fila.imagenesUrl });
        okUpdate += 1;
        continue;
      }

      const { data: inserted, error } = await supabase
        .from('productos')
        .insert({
          tienda_id: tiendaDestinoId,
          nombre: fila.nombre,
          categoria: fila.categoria,
          marca: null,
          modelo: null,
          anio: null,
          descripcion: fila.comentarios,
          comentarios: fila.comentarios,
          precio_usd: fila.precio,
          moneda: fila.moneda,
          stock_actual: inv.stock_actual,
          disponibilidad_aviso: inv.disponibilidad_aviso ?? null,
          activo: inv.activo !== undefined ? inv.activo : true,
          aprobacion_publica: 'pendiente',
          stock_confirmado_at: inv.stock_confirmado_at ?? new Date().toISOString(),
          pausado_por_stock_vencido: inv.pausado_por_stock_vencido ?? false,
          vertical,
          codigo: fila.codigo,
          imagen_url: fila.imagenesUrl[0],
          imagenes_extra: fila.imagenesUrl.length > 1 ? fila.imagenesUrl.slice(1) : null,
        })
        .select('id')
        .maybeSingle();
      if (error || !inserted?.id) {
        erroresOp.push(`Fila ${fila.rowNumber}: ${error?.message || 'No se pudo crear.'}`);
        continue;
      }
      codigos.set(fila.codigo, inserted.id);
      fotosPendientes.push({ rowNumber: fila.rowNumber, productoId: inserted.id, urls: fila.imagenesUrl });
      okInsert += 1;
    }

    let fotosCopiadas = 0;
    const fallosFoto: string[] = [];
    if (fotosPendientes.length) {
      setMensaje(`Copiando fotos (${fotosPendientes.length})...`);
      const copia = await copiarFotosExternasDeProductos(fotosPendientes, (hechos, total) => {
        setMensaje(`Copiando fotos (${hechos} de ${total})...`);
      });
      fotosCopiadas = copia.copiadas;
      fallosFoto.push(...copia.fallos);
    }

    const textoFotos =
      fotosPendientes.length > 0 ? ` Fotos guardadas: ${fotosCopiadas}.` : '';
    if (erroresOp.length || fallosFoto.length) {
      setErrores([...erroresOp, ...fallosFoto].slice(0, 20));
    }
    const subidaOk = !(erroresOp.length && okInsert + okUpdate === 0);
    setEstado(subidaOk ? 'ok' : 'error');
    if (subidaOk && userVisita) {
      setVisitaLista({ userId: userVisita, nombre: etiquetaDestino });
    } else if (destino !== 'vitrina') {
      setVisitaLista(null);
    }
    setMensaje(
      destino === 'vitrina'
        ? `Listo en la vitrina de ${etiquetaDestino}: ${okInsert} artículo(s).${textoFotos} Ábrelo en el visor. La web no los muestra.`
        : `Listo en ${etiquetaDestino}: ${okInsert} nuevo(s) ocultos al público, ${okUpdate} actualizado(s).${textoFotos} Apruébalos en Productos cuando el vendedor autorice.`
    );
    if (okInsert + okUpdate > 0) onImportado?.();
  };

  const tiendaPaso = tiendasParaPaso.find((v) => v.id === pasoTiendaId) ?? null;

  const pedirPaso = async () => {
    if (!tiendaPaso) {
      setPasoEstado('error');
      setPasoMensaje('Elige la tienda que ya está creada.');
      return;
    }
    setPasoEstado('contando');
    setPasoMensaje('Revisando la vitrina...');
    const vitrina = await buscarVitrina(vertical);
    if (!vitrina.ok) {
      setPasoEstado('error');
      setPasoMensaje(vitrina.error);
      return;
    }
    const { count, error } = await supabase
      .from('productos')
      .select('id', { count: 'exact', head: true })
      .eq('tienda_id', vitrina.id);
    if (error) {
      setPasoEstado('error');
      setPasoMensaje(error.message || 'No se pudo contar el catálogo.');
      return;
    }
    const total = count ?? 0;
    if (total === 0) {
      setPasoEstado('error');
      setPasoMensaje(`La vitrina de ${vitrina.nombre} no tiene artículos para pasar.`);
      return;
    }
    setPasoCantidad(total);
    setPasoEstado('confirmar');
    setPasoMensaje(
      `Se pasarán ${total} artículo(s) de la vitrina ${vitrina.nombre} a ${etiquetaVendedor(tiendaPaso)}. No se vuelve a subir el Excel. Siguen ocultos en la web hasta que los apruebes en Productos.`
    );
  };

  const pasarATienda = async () => {
    if (!user || !tiendaPaso) return;
    const rl = permitirAccionCliente('apify-pasar-vitrina', {
      maxIntentos: 8,
      ventanaMs: 10 * 60 * 1000,
      bloqueoMs: 3 * 60 * 1000,
    });
    if (!rl.ok) {
      setPasoEstado('error');
      setPasoMensaje(rl.mensaje);
      return;
    }
    setPasoEstado('pasando');
    setPasoMensaje('Pasando el catálogo...');
    const vitrina = await buscarVitrina(vertical);
    if (!vitrina.ok) {
      setPasoEstado('error');
      setPasoMensaje(vitrina.error);
      return;
    }
    const origen = await mapaCodigosTienda(vitrina.id);
    if (!origen.ok) {
      setPasoEstado('error');
      setPasoMensaje(origen.error);
      return;
    }
    const destinoCodigos = await mapaCodigosTienda(tiendaPaso.id);
    if (!destinoCodigos.ok) {
      setPasoEstado('error');
      setPasoMensaje(destinoCodigos.error);
      return;
    }
    const ocupados = new Set(destinoCodigos.existentes.map((fila) => fila.codigo));
    const cambiosCodigo: { id: string; codigo: string }[] = [];
    for (const fila of origen.existentes) {
      const id = origen.map.get(fila.codigo);
      if (!id) continue;
      const libre = codigoLibre(fila.codigo, ocupados);
      if (libre && libre !== fila.codigo) cambiosCodigo.push({ id, codigo: libre });
    }
    for (const cambio of cambiosCodigo) {
      const { error } = await supabase.from('productos').update({ codigo: cambio.codigo }).eq('id', cambio.id);
      if (error) {
        setPasoEstado('error');
        setPasoMensaje(error.message || 'No se pudo ajustar un código repetido.');
        return;
      }
    }

    const ids: string[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('productos')
        .select('id')
        .eq('tienda_id', vitrina.id)
        .range(from, from + PAGE - 1);
      if (error) {
        setPasoEstado('error');
        setPasoMensaje(error.message || 'No se pudo leer el catálogo de la vitrina.');
        return;
      }
      const batch = (data ?? []) as { id: string }[];
      for (const row of batch) ids.push(row.id);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    if (ids.length === 0) {
      setPasoEstado('error');
      setPasoMensaje('La vitrina ya no tiene artículos.');
      return;
    }

    let pasados = 0;
    for (let i = 0; i < ids.length; i += 80) {
      const lote = ids.slice(i, i + 80);
      const { error } = await supabase
        .from('productos')
        .update({ tienda_id: tiendaPaso.id, vertical })
        .in('id', lote);
      if (error) {
        setPasoEstado('error');
        setPasoMensaje(
          pasados > 0
            ? `Se pasaron ${pasados} y luego falló: ${error.message || 'no se pudo completar.'}`
            : error.message || 'No se pudo pasar el catálogo.'
        );
        if (pasados > 0) onImportado?.();
        return;
      }
      pasados += lote.length;
      setPasoMensaje(`Pasando el catálogo (${pasados} de ${ids.length})...`);
    }

    setPasoEstado('ok');
    setPasoMensaje(
      `Listo: ${pasados} artículo(s) quedaron en ${etiquetaVendedor(tiendaPaso)}. La vitrina quedó vacía. Siguen ocultos en la web hasta que los apruebes en Productos.`
    );
    onImportado?.();
  };

  return (
    <section className="dashboard-seccion carga-apify">
      <h2 className="dashboard-seccion-titulo">Apify</h2>
      <p className="dashboard-kpi-grid-hint">
        Sube el Excel tal como lo descarga Apify. La app arma código, nombre, descripción, precio, cantidad,
        fotos y categoría. La vitrina de visita muestra ese catálogo en el visor, con el nombre del negocio,
        sin registrar su tienda y sin publicarlo en la web.
      </p>

      <div className="dashboard-admin-import-vendedor-controles">
        <label>
          Vertical del catálogo
          <select
            value={vertical}
            disabled={ocupado}
            onChange={(e) => {
              setVertical(e.target.value === VERTICAL_MOTO ? VERTICAL_MOTO : VERTICAL_AUTO);
              setTiendaId('');
              setPasoTiendaId('');
              setPasoEstado('idle');
              setPasoMensaje('');
              setVisitaLista(null);
              limpiarLote();
              setEstado('idle');
              setMensaje('');
            }}
          >
            <option value={VERTICAL_AUTO}>Automóvil</option>
            <option value={VERTICAL_MOTO}>Motocicleta</option>
          </select>
        </label>
        <label>
          Destino
          <select
            value={destino}
            disabled={ocupado}
            onChange={(e) => {
              setDestino(e.target.value === 'vendedor' ? 'vendedor' : 'vitrina');
              setVisitaLista(null);
            }}
          >
            <option value="vitrina">Vitrina de visita</option>
            <option value="vendedor">Vendedor ya registrado</option>
          </select>
        </label>
        {destino === 'vitrina' ? (
          <label>
            Nombre que verá
            <input
              type="text"
              value={nombreVitrina}
              disabled={ocupado}
              maxLength={80}
              placeholder="Ej: Mecanipartes"
              onChange={(e) => {
                setNombreVitrina(e.target.value);
                setVisitaLista(null);
              }}
            />
          </label>
        ) : (
          <label>
            Vendedor
            <select
              value={tiendaId}
              disabled={ocupado}
              onChange={(e) => setTiendaId(e.target.value)}
            >
              <option value="">Selecciona un vendedor…</option>
              {vendedoresVertical.map((v) => (
                <option key={v.id} value={v.id}>
                  {etiquetaVendedor(v)}
                  {v.rif?.trim() ? ` · ${v.rif.trim()}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {destino === 'vendedor' && vendedoresVertical.length === 0 && (
        <p className="dashboard-texto-placeholder">
          No hay vendedores activos en esta vertical.
        </p>
      )}

      <input
        type="file"
        accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        disabled={ocupado}
        onChange={(e) => {
          setArchivo(e.target.files && e.target.files[0] ? e.target.files[0] : null);
          setVisitaLista(null);
          limpiarLote();
          setEstado('idle');
          setMensaje('');
        }}
      />

      <div className="importar-productos-botones-row">
        <button
          type="button"
          className="importar-productos-boton"
          disabled={ocupado || !archivo}
          onClick={() => void preparar()}
        >
          {estado === 'preparando' ? 'Preparando...' : 'Preparar archivo'}
        </button>
        <button
          type="button"
          className="importar-productos-link"
          disabled={ocupado || filas.length === 0}
          onClick={descargar}
        >
          Descargar Excel listo
        </button>
        <button
          type="button"
          className="importar-productos-boton"
          disabled={ocupado || (!archivo && filas.length === 0)}
          onClick={() => void pedirConfirmacion()}
        >
          {destino === 'vitrina' ? 'Subir a la vitrina' : 'Subir a la tienda'}
        </button>
        {visitaLista && onAbrirVisor && (
          <button
            type="button"
            className="importar-productos-boton"
            onClick={() =>
              onAbrirVisor({
                userId: visitaLista.userId,
                vertical,
                nombre: visitaLista.nombre,
              })
            }
          >
            Abrir en el visor
          </button>
        )}
      </div>

      {estado === 'confirmar' && destinoListo && (
        <div className="importar-productos-confirmacion" role="alertdialog" ref={confirmacionRef}>
          <p className="importar-productos-confirmacion-titulo">¿Subir este lote?</p>
          <p className="importar-productos-confirmacion-aviso">{mensaje}</p>
          <div className="importar-productos-botones-row">
            <button
              type="button"
              className="importar-productos-boton-cancelar"
              onClick={() => {
                setEstado('listo');
                setMensaje('Subida cancelada. No se modificó la tienda.');
              }}
            >
              No, cancelar
            </button>
            <button type="button" className="importar-productos-boton" onClick={() => void subir()}>
              Sí, subir
            </button>
          </div>
        </div>
      )}

      {mensaje && estado !== 'confirmar' && (
        <p className={`importar-productos-mensaje ${estado === 'error' ? 'error' : estado === 'ok' ? 'ok' : ''}`}>
          {mensaje}
        </p>
      )}

      {resumen && <p className="importar-productos-mensaje ok">{resumen}</p>}

      {filas.length > 0 && (
        <div className="dashboard-admin-table-wrap carga-apify-preview">
          <table className="dashboard-admin-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Precio</th>
              </tr>
            </thead>
            <tbody>
              {filas.slice(0, 8).map((fila) => (
                <tr key={`${fila.codigo}-${fila.rowNumber}`}>
                  <td>{fila.codigo}</td>
                  <td className="dashboard-admin-texto-td">{fila.nombre}</td>
                  <td>{fila.categoria}</td>
                  <td>
                    {fila.precio} {fila.moneda}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filas.length > 8 && (
            <p className="carga-apify-mas">Y {filas.length - 8} más en el archivo.</p>
          )}
        </div>
      )}

      {errores.length > 0 && (
        <div className="importar-productos-errores">
          <ul>
            {errores.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="carga-apify-pasar">
        <h3 className="carga-apify-pasar-titulo">Pasar la vitrina a una tienda</h3>
        <p className="dashboard-kpi-grid-hint">
          Mueve los artículos que ya están en la vitrina de esta vertical a una tienda registrada. No se vuelve a
          subir el Excel.
        </p>
        <div className="dashboard-admin-import-vendedor-controles">
          <label>
            Tienda ya creada
            <select
              value={pasoTiendaId}
              disabled={ocupado}
              onChange={(e) => {
                setPasoTiendaId(e.target.value);
                setPasoEstado('idle');
                setPasoMensaje('');
              }}
            >
              <option value="">Selecciona una tienda…</option>
              {tiendasParaPaso.map((v) => (
                <option key={v.id} value={v.id}>
                  {etiquetaVendedor(v)}
                  {v.rif?.trim() ? ` · ${v.rif.trim()}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="importar-productos-botones-row">
          <button
            type="button"
            className="importar-productos-boton"
            disabled={ocupado || !pasoTiendaId}
            onClick={() => void pedirPaso()}
          >
            {pasoEstado === 'contando' || pasoEstado === 'pasando' ? 'Pasando...' : 'Pasar catálogo a esta tienda'}
          </button>
          {pasoEstado === 'ok' && tiendaPaso?.user_id && onAbrirVisor && (
            <button
              type="button"
              className="importar-productos-boton"
              onClick={() =>
                onAbrirVisor({
                  userId: tiendaPaso.user_id!,
                  vertical,
                  nombre: etiquetaVendedor(tiendaPaso),
                })
              }
            >
              Abrir esta tienda en el visor
            </button>
          )}
        </div>
        {pasoEstado === 'confirmar' && tiendaPaso && (
          <div className="importar-productos-confirmacion" role="alertdialog">
            <p className="importar-productos-confirmacion-titulo">¿Pasar este catálogo?</p>
            <p className="importar-productos-confirmacion-aviso">{pasoMensaje}</p>
            <div className="importar-productos-botones-row">
              <button
                type="button"
                className="importar-productos-boton-cancelar"
                onClick={() => {
                  setPasoEstado('idle');
                  setPasoMensaje('No se movió ningún artículo.');
                }}
              >
                No, cancelar
              </button>
              <button type="button" className="importar-productos-boton" onClick={() => void pasarATienda()}>
                Sí, pasar {pasoCantidad} artículo(s)
              </button>
            </div>
          </div>
        )}
        {pasoMensaje && pasoEstado !== 'confirmar' && (
          <p className={`importar-productos-mensaje ${pasoEstado === 'error' ? 'error' : pasoEstado === 'ok' ? 'ok' : ''}`}>
            {pasoMensaje}
          </p>
        )}
      </div>
    </section>
  );
}
