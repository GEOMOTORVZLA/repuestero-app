import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { CATEGORIAS_PRODUCTO } from '../data/categoriasProducto';
import { CATEGORIAS_PRODUCTO_MOTO } from '../data/categoriasProductoMoto';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_MOTO } from '../utils/verticalVehiculo';
import {
  MAX_BYTES_FOTO_PRODUCTO,
  MAX_MB_FOTO_PRODUCTO,
  eliminarImagenProductoEnStorage,
  optimizarImagenProductoParaStorage,
  subirImagenProductoConMiniatura,
} from '../utils/imagenProducto';
import {
  MAX_FOTOS_EXTRA,
  normalizarUrlsACuatroSlots,
  slotsArchivosExtraVacios,
} from '../utils/productoImagenesExtra';
import { esMonedaBolivar } from '../utils/monedaProducto';
import { normalizarInputPrecio, parsePrecioProducto } from '../utils/precioProducto';
import { LIMITE_DESCRIPCION_PRODUCTO } from '../utils/limiteDescripcionProducto';
import {
  DISPONIBILIDAD_AVISO_OPCIONES,
  esDisponibilidadAviso,
  type DisponibilidadAviso,
} from '../utils/avisoProductoPublicacion';
import {
  avisoDesdeStockActual,
  parseStockActualInput,
  patchDesdeStockActual,
} from '../utils/stockActualInventario';
import { ImagenProducto } from './ImagenProducto';
import './RegistroRepuestos.css';

export interface ProductoEditable {
  id: string;
  nombre: string;
  descripcion: string | null;
  comentarios?: string | null;
  categoria?: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  precio_usd: number;
  moneda: string | null;
  imagen_url?: string | null;
  imagenes_extra?: (string | null)[] | string[] | null;
  /** Si no viene de la BD, se asume automóvil */
  vertical?: VerticalVehiculo | null;
  disponibilidad_aviso?: string | null;
  es_oferta?: boolean | null;
  /** Existencia opcional (null = sin control de inventario). */
  stock_actual?: number | null;
  activo?: boolean | null;
}

interface EditarProductoProps {
  producto: ProductoEditable;
  onCancel: () => void;
  onSaved: (productoActualizado: ProductoEditable) => void;
}

export function EditarProducto({ producto, onCancel, onSaved }: EditarProductoProps) {
  const verticalProd = producto.vertical ?? 'auto';
  const esMoto = verticalProd === VERTICAL_MOTO;
  const categoriasOpciones = esMoto ? CATEGORIAS_PRODUCTO_MOTO : CATEGORIAS_PRODUCTO;
  const [nombre, setNombre] = useState(producto.nombre);
  const [categoria, setCategoria] = useState(producto.categoria ?? '');
  // usamos un solo campo de texto; si no hay comentarios aún, usamos la descripción previa
  const [comentarios, setComentarios] = useState(producto.comentarios ?? producto.descripcion ?? '');
  const [precio, setPrecio] = useState(String(producto.precio_usd));
  const [moneda, setMoneda] = useState<'BS' | 'USD'>(esMonedaBolivar(producto.moneda) ? 'BS' : 'USD');
  const [disponibilidadAviso, setDisponibilidadAviso] = useState<DisponibilidadAviso | ''>(
    esDisponibilidadAviso(producto.disponibilidad_aviso) ? producto.disponibilidad_aviso : ''
  );
  const [stockActualInput, setStockActualInput] = useState(
    producto.stock_actual != null && Number.isFinite(Number(producto.stock_actual))
      ? String(producto.stock_actual)
      : ''
  );
  const [esOferta, setEsOferta] = useState(Boolean(producto.es_oferta));
  const [estado, setEstado] = useState<'idle' | 'guardando' | 'ok' | 'error'>('idle');
  const [mensaje, setMensaje] = useState('');
  const [nuevaFotoPrincipal, setNuevaFotoPrincipal] = useState<File | null>(null);
  const [principalUrlLocal, setPrincipalUrlLocal] = useState<string | null>(
    () => (typeof producto.imagen_url === 'string' && producto.imagen_url.trim() ? producto.imagen_url.trim() : null)
  );
  const [nuevasFotosExtraSlots, setNuevasFotosExtraSlots] = useState<(File | null)[]>(() =>
    slotsArchivosExtraVacios()
  );
  const [slotsExtrasLocal, setSlotsExtrasLocal] = useState<(string | null)[]>(() =>
    normalizarUrlsACuatroSlots(producto.imagenes_extra as string[] | null | undefined)
  );
  /** URLs a borrar de Storage al guardar (no se acumulan en BD ni en el bucket). */
  const [urlsAEliminarStorage, setUrlsAEliminarStorage] = useState<string[]>([]);

  const marcarUrlParaBorrarStorage = (url: string | null | undefined) => {
    const u = typeof url === 'string' ? url.trim() : '';
    if (!u) return;
    setUrlsAEliminarStorage((prev) => (prev.includes(u) ? prev : [...prev, u]));
  };

  const borrarFotoPrincipal = () => {
    if (nuevaFotoPrincipal) {
      setNuevaFotoPrincipal(null);
      return;
    }
    if (principalUrlLocal) {
      marcarUrlParaBorrarStorage(principalUrlLocal);
      setPrincipalUrlLocal(null);
    }
  };

  const borrarFotoExtra = (idx: number) => {
    const actual = slotsExtrasLocal[idx];
    if (actual) marcarUrlParaBorrarStorage(actual);
    setNuevasFotosExtraSlots((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
    setSlotsExtrasLocal((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  };

  const guardar = async () => {
    if (!nombre.trim()) {
      setEstado('error');
      setMensaje('Escribe el nombre del repuesto.');
      return;
    }
    if (!categoria) {
      setEstado('error');
      setMensaje('Selecciona la categoría del producto.');
      return;
    }
    const precioNum = parsePrecioProducto(precio);
    if (precioNum == null) {
      setEstado('error');
      setMensaje('Ingresa un precio válido con máximo 2 decimales.');
      return;
    }
    if (comentarios.length > LIMITE_DESCRIPCION_PRODUCTO) {
      setEstado('error');
      setMensaje(`La descripción no puede superar los ${LIMITE_DESCRIPCION_PRODUCTO} caracteres.`);
      return;
    }

    const stockParsed = parseStockActualInput(stockActualInput);
    if (!stockParsed.ok) {
      setEstado('error');
      setMensaje(stockParsed.error);
      return;
    }
    const usaInventario = stockParsed.value != null;
    if (!usaInventario && !esDisponibilidadAviso(disponibilidadAviso)) {
      setEstado('error');
      setMensaje(
        'Selecciona la disponibilidad del producto, o indica una cantidad para calcularla automáticamente.'
      );
      return;
    }

    setEstado('guardando');
    setMensaje('Guardando cambios del repuesto...');

    const inv = patchDesdeStockActual(stockParsed.value, {
      avisoManualSiSinStock: usaInventario
        ? undefined
        : esDisponibilidadAviso(disponibilidadAviso)
          ? disponibilidadAviso
          : null,
    });

    const payload: Record<string, unknown> = {
      nombre: nombre.trim(),
      categoria,
      // Marca/modelo/año ya no se editan aquí (van en la descripción si aplica).
      descripcion: comentarios.trim() || null,
      comentarios: comentarios.trim() || null,
      precio_usd: precioNum,
      moneda,
      es_oferta: esOferta,
      stock_actual: inv.stock_actual,
    };
    if (inv.disponibilidad_aviso !== undefined) {
      payload.disponibilidad_aviso = inv.disponibilidad_aviso;
    } else if (!usaInventario) {
      payload.disponibilidad_aviso = disponibilidadAviso;
    }
    if (inv.activo !== undefined) payload.activo = inv.activo;
    if (inv.stock_confirmado_at !== undefined) payload.stock_confirmado_at = inv.stock_confirmado_at;
    if (inv.pausado_por_stock_vencido !== undefined) {
      payload.pausado_por_stock_vencido = inv.pausado_por_stock_vencido;
    }

    // Subir / borrar imágenes
    let imagenPrincipalUrl = principalUrlLocal;
    const bucket = supabase.storage.from('productos');
    const MAX_MB = 2;
    const urlsStoragePendientes = [...urlsAEliminarStorage];

    if (nuevaFotoPrincipal) {
      if (principalUrlLocal) urlsStoragePendientes.push(principalUrlLocal);
      if (producto.imagen_url) urlsStoragePendientes.push(producto.imagen_url);
      const fotoPrincipalLista = await optimizarImagenProductoParaStorage(nuevaFotoPrincipal, {
        maxBytes: MAX_MB * 1024 * 1024,
      });
      if (fotoPrincipalLista.size > MAX_MB * 1024 * 1024) {
        setEstado('error');
        setMensaje(`La foto no debe superar ${MAX_MB} MB. Comprímela o elige otra.`);
        return;
      }
      const ext = fotoPrincipalLista.name.split('.').pop() || 'jpg';
      const principalPath = `${producto.id}/principal.${ext}`;
      try {
        const subida = await subirImagenProductoConMiniatura(bucket, principalPath, fotoPrincipalLista);
        imagenPrincipalUrl = subida.urlOriginal;
      } catch {
        setEstado('error');
        setMensaje('Error al subir la nueva foto principal.');
        return;
      }
    }

    const hayNuevasExtras = nuevasFotosExtraSlots.some((f) => f != null);
    const slotsUrls = [...slotsExtrasLocal];
    let extrasModificados =
      hayNuevasExtras ||
      urlsAEliminarStorage.some((u) =>
        normalizarUrlsACuatroSlots(producto.imagenes_extra as string[] | null | undefined).includes(u)
      ) ||
      JSON.stringify(slotsExtrasLocal) !==
        JSON.stringify(normalizarUrlsACuatroSlots(producto.imagenes_extra as string[] | null | undefined));

    if (hayNuevasExtras) {
      for (let i = 0; i < MAX_FOTOS_EXTRA; i += 1) {
        const fileRaw = nuevasFotosExtraSlots[i];
        if (!fileRaw) continue;
        if (slotsUrls[i]) urlsStoragePendientes.push(slotsUrls[i]!);
        const file = await optimizarImagenProductoParaStorage(fileRaw, {
          maxBytes: MAX_BYTES_FOTO_PRODUCTO,
        });
        if (file.size > MAX_BYTES_FOTO_PRODUCTO) {
          setEstado('error');
          setMensaje(
            `La foto adicional ${i + 1} no debe superar ${MAX_MB_FOTO_PRODUCTO} MB.`
          );
          return;
        }
        const ext = file.name.split('.').pop() || 'jpg';
        const extraPath = `${producto.id}/extra-${i + 1}.${ext}`;
        try {
          const subidaExtra = await subirImagenProductoConMiniatura(bucket, extraPath, file);
          slotsUrls[i] = subidaExtra.urlOriginal;
          extrasModificados = true;
        } catch {
          /* keep previous slot */
        }
      }
    }

    if (extrasModificados) {
      const tieneAlgunaExtra = slotsUrls.some((s) => s != null && String(s).trim() !== '');
      payload.imagenes_extra = tieneAlgunaExtra ? slotsUrls : null;
    }

    const principalCambio =
      Boolean(nuevaFotoPrincipal) ||
      (principalUrlLocal ?? null) !==
        (typeof producto.imagen_url === 'string' && producto.imagen_url.trim()
          ? producto.imagen_url.trim()
          : null);
    if (principalCambio) {
      payload.imagen_url = imagenPrincipalUrl;
    }

    const { error } = await supabase.from('productos').update(payload).eq('id', producto.id);

    if (error) {
      setEstado('error');
      setMensaje(error.message || 'Error al guardar.');
      return;
    }

    // Limpiar archivos en Storage (best-effort) para no acumular basura.
    const unicas = [...new Set(urlsStoragePendientes.map((u) => u.trim()).filter(Boolean))];
    for (const u of unicas) {
      // No borrar si la URL sigue siendo la foto vigente tras el guardado.
      if (u === imagenPrincipalUrl) continue;
      if (slotsUrls.some((s) => s === u)) continue;
      await eliminarImagenProductoEnStorage(bucket, u);
    }

    setEstado('ok');
    setMensaje('Repuesto actualizado correctamente.');
    setUrlsAEliminarStorage([]);
    setNuevaFotoPrincipal(null);
    setNuevasFotosExtraSlots(slotsArchivosExtraVacios());
    setPrincipalUrlLocal(imagenPrincipalUrl);
    setSlotsExtrasLocal(
      Array.from({ length: MAX_FOTOS_EXTRA }, (_, i) => {
        const s = slotsUrls[i];
        return typeof s === 'string' && s.trim() ? s.trim() : null;
      })
    );

    const imagenesExtraGuardadas = extrasModificados
      ? ((payload.imagenes_extra as (string | null)[] | null) ?? null)
      : producto.imagenes_extra ?? null;

    const avisoGuardado =
      (payload.disponibilidad_aviso as DisponibilidadAviso | null | undefined) ??
      (usaInventario
        ? stockParsed.value != null && stockParsed.value > 0
          ? avisoDesdeStockActual(stockParsed.value)
          : null
        : disponibilidadAviso);

    onSaved({
      ...producto,
      vertical: verticalProd,
      nombre: payload.nombre as string,
      categoria: (payload.categoria as string | null) ?? null,
      descripcion: (payload.descripcion as string | null) ?? null,
      comentarios: (payload.comentarios as string | null) ?? null,
      precio_usd: precioNum,
      moneda,
      imagen_url: principalCambio ? imagenPrincipalUrl : producto.imagen_url ?? null,
      imagenes_extra: imagenesExtraGuardadas,
      disponibilidad_aviso: avisoGuardado,
      es_oferta: esOferta,
      stock_actual: inv.stock_actual,
      activo: (payload.activo as boolean | undefined) ?? producto.activo,
    });
  };

  return (
    <div className="registro-repuestos">
      <h2>{esMoto ? 'Editar repuesto (moto)' : 'Editar repuesto'}</h2>
      <select
        value={categoria}
        onChange={(e) => setCategoria(e.target.value)}
        disabled={estado === 'guardando'}
      >
        <option value="">Categoría del producto</option>
        {categoriasOpciones.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Nombre del repuesto"
        value={nombre}
        onChange={(e) => setNombre(e.target.value.toUpperCase())}
        disabled={estado === 'guardando'}
        spellCheck={false}
      />
      <textarea
        placeholder={`Descripción del producto (máx. ${LIMITE_DESCRIPCION_PRODUCTO} caracteres)`}
        value={comentarios}
        onChange={(e) => setComentarios(e.target.value.slice(0, LIMITE_DESCRIPCION_PRODUCTO))}
        disabled={estado === 'guardando'}
        rows={6}
        className="registro-repuestos-comentarios"
        spellCheck={false}
      />
      <div className="registro-repuestos-precio">
        <div className="registro-repuestos-moneda">
          <label>
            <input
              type="radio"
              name="moneda_editar"
              value="BS"
              checked={moneda === 'BS'}
              onChange={() => setMoneda('BS')}
              disabled={estado === 'guardando'}
            />
            Bolívares (Bs)
          </label>
          <label>
            <input
              type="radio"
              name="moneda_editar"
              value="USD"
              checked={moneda === 'USD'}
              onChange={() => setMoneda('USD')}
              disabled={estado === 'guardando'}
            />
            USD
          </label>
        </div>
        <input
          type="text"
          placeholder={`Precio (${moneda === 'BS' ? 'Bs' : 'USD'}) *`}
          value={precio}
          onChange={(e) => setPrecio(normalizarInputPrecio(e.target.value))}
          disabled={estado === 'guardando'}
        />
      </div>
      <div className="registro-repuestos-avisos-publicacion">
        <label className="registro-repuestos-fotos-label" htmlFor="stock-actual-editar">
          Cantidad disponible (opcional)
        </label>
        <input
          id="stock-actual-editar"
          type="text"
          inputMode="numeric"
          placeholder="Vacío = sin control · 0 = agotar/pausar · ≥1 = unidades"
          value={stockActualInput}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d]/g, '');
            setStockActualInput(v);
            const parsed = parseStockActualInput(v);
            if (parsed.ok && parsed.value != null && parsed.value > 0) {
              const auto = avisoDesdeStockActual(parsed.value);
              setDisponibilidadAviso(auto ?? '');
            }
          }}
          disabled={estado === 'guardando'}
        />
        <p className="registro-repuestos-fotos-peso-ayuda">
          Si indicas cantidad: 1 = única, 2–3 = pocas, 6+ = muchas. Con 0 se pausa y se oculta al público.
        </p>
        <label className="registro-repuestos-fotos-label" htmlFor="disponibilidad-aviso-editar">
          Disponibilidad en la publicación{stockActualInput.trim() ? ' (automática por cantidad)' : ' *'}
        </label>
        <select
          id="disponibilidad-aviso-editar"
          value={disponibilidadAviso}
          onChange={(e) =>
            setDisponibilidadAviso(
              e.target.value === '' ? '' : (e.target.value as DisponibilidadAviso)
            )
          }
          disabled={estado === 'guardando' || Boolean(stockActualInput.trim())}
        >
          <option value="">Elige disponibilidad</option>
          {DISPONIBILIDAD_AVISO_OPCIONES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="registro-repuestos-oferta-check">
          <input
            type="checkbox"
            checked={esOferta}
            onChange={(e) => setEsOferta(e.target.checked)}
            disabled={estado === 'guardando'}
          />
          Marcar como <strong>OFERTA</strong> (se verá titilando en la búsqueda)
        </label>
      </div>
      <div className="registro-repuestos-fotos">
        <label className="registro-repuestos-fotos-label">Foto principal</label>
        <p className="registro-repuestos-fotos-peso-ayuda">
          Máximo {MAX_MB_FOTO_PRODUCTO} MB por imagen (JPG, PNG, WebP, etc.). Usa <strong>Borrar</strong> para
          quitarla del producto y del almacenamiento (al guardar).
        </p>
        <div className="registro-repuestos-fotos-extra-fila registro-repuestos-fotos-principal-fila">
          <div className="registro-repuestos-fotos-extra-vista">
            {nuevaFotoPrincipal ? (
              <span className="registro-repuestos-fotos-extra-nombre">Nueva: {nuevaFotoPrincipal.name}</span>
            ) : principalUrlLocal ? (
              <ImagenProducto
                className="registro-repuestos-fotos-extra-thumb"
                url={principalUrlLocal}
                variante="miniatura"
                alt=""
                width={160}
                height={160}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="registro-repuestos-fotos-extra-sin">Sin foto principal</span>
            )}
          </div>
          <div className="registro-repuestos-fotos-ranura-acciones">
            <input
              type="file"
              accept="image/*"
              disabled={estado === 'guardando'}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setNuevaFotoPrincipal(file);
                e.target.value = '';
              }}
            />
            {(nuevaFotoPrincipal || principalUrlLocal) && (
              <button
                type="button"
                className="registro-repuestos-fotos-borrar"
                disabled={estado === 'guardando'}
                onClick={borrarFotoPrincipal}
              >
                Borrar foto
              </button>
            )}
          </div>
        </div>
        <span className="registro-repuestos-fotos-label">
          Fotos adicionales (opcionales, hasta {MAX_FOTOS_EXTRA})
        </span>
        <p className="registro-repuestos-fotos-extra-ayuda">
          Cada ranura es independiente. Puedes reemplazar o borrar solo esa foto.
        </p>
        <div className="registro-repuestos-fotos-extra-bloque">
          {Array.from({ length: MAX_FOTOS_EXTRA }, (_, idx) => {
            const urlActual = slotsExtrasLocal[idx];
            const archivoNuevo = nuevasFotosExtraSlots[idx];
            return (
              <div key={idx} className="registro-repuestos-fotos-extra-fila">
                <label className="registro-repuestos-fotos-extra-etiqueta" htmlFor={`foto-extra-edit-${idx}`}>
                  Foto adicional {idx + 1}
                </label>
                <div className="registro-repuestos-fotos-extra-vista">
                  {archivoNuevo ? (
                    <span className="registro-repuestos-fotos-extra-nombre">Nueva: {archivoNuevo.name}</span>
                  ) : urlActual ? (
                    <ImagenProducto
                      className="registro-repuestos-fotos-extra-thumb"
                      url={urlActual}
                      variante="miniatura"
                      alt=""
                      width={160}
                      height={160}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="registro-repuestos-fotos-extra-sin">Sin imagen en esta ranura</span>
                  )}
                </div>
                <div className="registro-repuestos-fotos-ranura-acciones">
                  <input
                    id={`foto-extra-edit-${idx}`}
                    type="file"
                    accept="image/*"
                    disabled={estado === 'guardando'}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (file && slotsExtrasLocal[idx]) {
                        marcarUrlParaBorrarStorage(slotsExtrasLocal[idx]);
                      }
                      setNuevasFotosExtraSlots((prev) => {
                        const next = [...prev];
                        next[idx] = file;
                        return next;
                      });
                      e.target.value = '';
                    }}
                  />
                  {(archivoNuevo || urlActual) && (
                    <button
                      type="button"
                      className="registro-repuestos-fotos-borrar"
                      disabled={estado === 'guardando'}
                      onClick={() => borrarFotoExtra(idx)}
                    >
                      Borrar foto
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="registro-repuestos-acciones">
        <button
          type="button"
          className="btn-registrar"
          onClick={guardar}
          disabled={estado === 'guardando'}
        >
          {estado === 'guardando' ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          className="btn-cancelar-editar"
          onClick={onCancel}
          disabled={estado === 'guardando'}
        >
          Cancelar
        </button>
      </div>
      {mensaje && (
        <p className={`mensaje ${estado === 'error' ? 'error' : estado === 'ok' ? 'ok' : ''}`}>
          {mensaje}
        </p>
      )}
    </div>
  );
}

