import { useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { ImagenProducto } from './ImagenProducto';
import {
  MAX_BYTES_FOTO_PRODUCTO,
  MAX_MB_FOTO_PRODUCTO,
  debeEliminarFotoStorageTrasGuardar,
  eliminarImagenProductoEnStorage,
  optimizarImagenProductoParaStorage,
  subirImagenProductoConMiniatura,
  urlImagenProductoVariante,
} from '../utils/imagenProducto';
import {
  MAX_FOTOS_EXTRA,
  normalizarUrlsACuatroSlots,
  slotsArchivosExtraVacios,
  urlsFotosProducto,
} from '../utils/productoImagenesExtra';
import './MisProductos.css';

export type ProductoFotosEditable = {
  id: string;
  nombre: string;
  codigo?: string | null;
  imagen_url?: string | null;
  imagenes_extra?: (string | null)[] | string[] | null;
  /** Para ruta Storage admin-fotos-masivas/{tiendaId}/... */
  tienda_id?: string | null;
};

export type FotosProductoGuardadas = {
  id: string;
  imagen_url: string | null;
  imagenes_extra: (string | null)[] | null;
};

type EditorFotosProductoModalProps = {
  producto: ProductoFotosEditable;
  /** admin usa RPC masiva con un solo id; vendedor actualiza directo. */
  modoGuardado?: 'vendedor' | 'admin';
  onClose: () => void;
  onSaved: (actualizado: FotosProductoGuardadas) => void;
};

/**
 * Modal solo de fotos: ver galería y editar ranuras (principal + extras).
 */
export function EditorFotosProductoModal({
  producto,
  modoGuardado = 'vendedor',
  onClose,
  onSaved,
}: EditorFotosProductoModalProps) {
  const [principalUrl, setPrincipalUrl] = useState<string | null>(() =>
    typeof producto.imagen_url === 'string' && producto.imagen_url.trim()
      ? producto.imagen_url.trim()
      : null
  );
  const [nuevaPrincipal, setNuevaPrincipal] = useState<File | null>(null);
  const [slotsExtras, setSlotsExtras] = useState<(string | null)[]>(() =>
    normalizarUrlsACuatroSlots(producto.imagenes_extra as string[] | null | undefined)
  );
  const [nuevosExtras, setNuevosExtras] = useState<(File | null)[]>(() => slotsArchivosExtraVacios());
  const [urlsAEliminar, setUrlsAEliminar] = useState<string[]>([]);
  const [fotoActiva, setFotoActiva] = useState<string | null>(() => {
    const urls = urlsFotosProducto({
      imagen_url: producto.imagen_url,
      imagenes_extra: producto.imagenes_extra,
    });
    return urls[0] ?? null;
  });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const previewPrincipal = useMemo(() => {
    if (nuevaPrincipal) return URL.createObjectURL(nuevaPrincipal);
    return principalUrl;
  }, [nuevaPrincipal, principalUrl]);

  const galeriaUrls = useMemo(() => {
    const out: string[] = [];
    if (previewPrincipal) out.push(previewPrincipal);
    for (let i = 0; i < MAX_FOTOS_EXTRA; i += 1) {
      const file = nuevosExtras[i];
      if (file) {
        out.push(URL.createObjectURL(file));
        continue;
      }
      const u = slotsExtras[i];
      if (u) out.push(u);
    }
    return out;
  }, [previewPrincipal, nuevosExtras, slotsExtras]);

  const marcarBorrar = (url: string | null | undefined) => {
    const u = typeof url === 'string' ? url.trim() : '';
    if (!u || u.startsWith('blob:')) return;
    setUrlsAEliminar((prev) => (prev.includes(u) ? prev : [...prev, u]));
  };

  const borrarPrincipal = () => {
    if (nuevaPrincipal) {
      setNuevaPrincipal(null);
      setInputKey((k) => k + 1);
      return;
    }
    if (principalUrl) {
      marcarBorrar(principalUrl);
      setPrincipalUrl(null);
      if (fotoActiva === principalUrl) setFotoActiva(null);
    }
  };

  const borrarExtra = (idx: number) => {
    if (nuevosExtras[idx]) {
      setNuevosExtras((prev) => {
        const next = [...prev];
        next[idx] = null;
        return next;
      });
      setInputKey((k) => k + 1);
      return;
    }
    const actual = slotsExtras[idx];
    if (actual) {
      marcarBorrar(actual);
      setSlotsExtras((prev) => {
        const next = [...prev];
        next[idx] = null;
        return next;
      });
      if (fotoActiva === actual) setFotoActiva(null);
    }
  };

  const guardar = async () => {
    setMensaje(null);
    setGuardando(true);
    try {
      const bucket = supabase.storage.from('productos');
      const pendientes = [...urlsAEliminar];
      let imagenUrl = principalUrl;
      // Admin: misma carpeta que la carga masiva (políticas Storage suelen permitirla).
      // Vendedor: carpeta del producto.
      const lote = String(Date.now());
      const tiendaParaPath = (producto.tienda_id || '').trim();
      const prefijoPath =
        modoGuardado === 'admin'
          ? tiendaParaPath
            ? `admin-fotos-masivas/${tiendaParaPath}/${lote}`
            : `admin-fotos-masivas/${producto.id}/${lote}`
          : producto.id;

      if (nuevaPrincipal) {
        if (principalUrl) pendientes.push(principalUrl);
        if (producto.imagen_url) pendientes.push(producto.imagen_url);
        let lista: File;
        try {
          lista = await optimizarImagenProductoParaStorage(nuevaPrincipal, {
            maxBytes: MAX_BYTES_FOTO_PRODUCTO,
          });
        } catch (optErr) {
          if (nuevaPrincipal.size <= MAX_BYTES_FOTO_PRODUCTO) {
            lista = nuevaPrincipal;
          } else {
            throw optErr;
          }
        }
        if (lista.size > MAX_BYTES_FOTO_PRODUCTO) {
          throw new Error(`La foto principal no debe superar ${MAX_MB_FOTO_PRODUCTO} MB.`);
        }
        const ext = lista.name.split('.').pop() || 'jpg';
        const path = `${prefijoPath}/principal.${ext}`;
        const subida = await subirImagenProductoConMiniatura(bucket, path, lista);
        imagenUrl = subida.urlOriginal;
      }

      const slotsUrls = [...slotsExtras];
      for (let i = 0; i < MAX_FOTOS_EXTRA; i += 1) {
        const raw = nuevosExtras[i];
        if (!raw) continue;
        if (slotsUrls[i]) pendientes.push(slotsUrls[i]!);
        let lista: File;
        try {
          lista = await optimizarImagenProductoParaStorage(raw, {
            maxBytes: MAX_BYTES_FOTO_PRODUCTO,
          });
        } catch (optErr) {
          if (raw.size <= MAX_BYTES_FOTO_PRODUCTO) {
            lista = raw;
          } else {
            throw optErr;
          }
        }
        if (lista.size > MAX_BYTES_FOTO_PRODUCTO) {
          throw new Error(`La foto adicional ${i + 1} no debe superar ${MAX_MB_FOTO_PRODUCTO} MB.`);
        }
        const ext = lista.name.split('.').pop() || 'jpg';
        const path = `${prefijoPath}/extra-${i + 1}.${ext}`;
        const subida = await subirImagenProductoConMiniatura(bucket, path, lista);
        slotsUrls[i] = subida.urlOriginal;
      }

      const extrasLimpios = slotsUrls.filter((u): u is string => typeof u === 'string' && Boolean(u.trim()));
      const imagenesExtra = extrasLimpios.length ? extrasLimpios : null;

      if (!nuevaPrincipal && !nuevosExtras.some(Boolean) && !urlsAEliminar.length) {
        throw new Error(
          'No hay cambios: selecciona una foto nueva o borra una ranura antes de guardar.'
        );
      }

      if (modoGuardado === 'admin') {
        const { error: rpcError } = await supabase.rpc('admin_set_productos_fotos_masivas', {
          p_producto_ids: [producto.id],
          p_imagen_url: imagenUrl,
          p_imagenes_extra: imagenesExtra,
        });
        if (rpcError) {
          const { error: updErr } = await supabase
            .from('productos')
            .update({
              imagen_url: imagenUrl,
              imagenes_extra: imagenesExtra,
            })
            .eq('id', producto.id);
          if (updErr) {
            throw new Error(
              `No se pudo guardar en el producto. RPC: ${rpcError.message}. Update: ${updErr.message}`
            );
          }
        }
      } else {
        const { error: updErr } = await supabase
          .from('productos')
          .update({
            imagen_url: imagenUrl,
            imagenes_extra: imagenesExtra,
          })
          .eq('id', producto.id);
        if (updErr) {
          throw new Error(updErr.message || 'No se pudo actualizar el producto.');
        }
      }

      const vigentes = [imagenUrl, ...extrasLimpios];
      for (const u of [...new Set(pendientes.map((x) => x.trim()).filter(Boolean))]) {
        if (!debeEliminarFotoStorageTrasGuardar(u, vigentes, producto.id)) continue;
        await eliminarImagenProductoEnStorage(bucket, u);
      }

      const guardado: FotosProductoGuardadas = {
        id: producto.id,
        imagen_url: imagenUrl,
        imagenes_extra: imagenesExtra,
      };
      onSaved(guardado);
    } catch (e) {
      const raw =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message?: unknown }).message || '')
          : '';
      const texto =
        (e instanceof Error ? e.message : raw) ||
        'No se pudieron guardar las fotos. Revisa tamaño (máx. 2 MB) e inténtalo de nuevo.';
      setMensaje(texto);
      try {
        window.alert(`No se guardaron las fotos:\n\n${texto}`);
      } catch {
        /* ignore */
      }
    } finally {
      setGuardando(false);
    }
  };

  const activaMostrada = fotoActiva && galeriaUrls.includes(fotoActiva) ? fotoActiva : galeriaUrls[0] ?? null;

  return (
    <div
      className="mis-productos-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="mis-productos-detalle gestion-fotos-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Fotos de ${producto.nombre}`}
      >
        <div className="mis-productos-detalle-header">
          <div>
            <h3 className="mis-productos-detalle-nombre">{producto.nombre}</h3>
            {producto.codigo ? (
              <p className="mis-productos-detalle-categoria">Código: {producto.codigo}</p>
            ) : null}
          </div>
          <button type="button" className="mis-productos-detalle-cerrar" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {mensaje ? (
          <p className="gestion-fotos-modal-error" role="alert">
            {mensaje}
          </p>
        ) : null}

        <div className="gestion-fotos-modal-cuerpo">
          <div className="mis-productos-detalle-galeria">
            <div className="mis-productos-detalle-galeria-principal">
              {activaMostrada ? (
                <img
                  src={
                    activaMostrada.startsWith('blob:')
                      ? activaMostrada
                      : urlImagenProductoVariante(activaMostrada, 'vista') ?? activaMostrada
                  }
                  alt={producto.nombre}
                  width={1080}
                  height={1080}
                />
              ) : (
                <div className="mis-productos-card-foto-placeholder">Sin fotos</div>
              )}
            </div>
            {galeriaUrls.length > 0 && (
              <div className="mis-productos-detalle-thumbs">
                {galeriaUrls.map((url, idx) => (
                  <button
                    key={`${url}-${idx}`}
                    type="button"
                    className={`mis-productos-detalle-thumb${activaMostrada === url ? ' activa' : ''}`}
                    onClick={() => setFotoActiva(url)}
                  >
                    <img
                      src={
                        url.startsWith('blob:')
                          ? url
                          : urlImagenProductoVariante(url, 'miniatura') ?? url
                      }
                      alt=""
                      width={72}
                      height={72}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="gestion-fotos-modal-ranuras">
            <p className="gestion-fotos-modal-ranuras-titulo">Editar fotos de este producto</p>
            <p className="gestion-fotos-modal-ranuras-ayuda">
              Cambia o borra cada ranura. Guarda para aplicar solo a este artículo.
            </p>

            <div className="gestion-fotos-modal-ranura">
              <span>Foto 1 (principal)</span>
              <div className="gestion-fotos-modal-ranura-preview">
                {previewPrincipal ? (
                  previewPrincipal.startsWith('blob:') ? (
                    <img src={previewPrincipal} alt="" width={80} height={80} />
                  ) : (
                    <ImagenProducto
                      url={previewPrincipal}
                      variante="miniatura"
                      alt=""
                      width={80}
                      height={80}
                    />
                  )
                ) : (
                  <span className="mis-productos-card-foto-placeholder">Vacía</span>
                )}
              </div>
              <div className="gestion-fotos-modal-ranura-acciones">
                <input
                  key={`p-${inputKey}`}
                  type="file"
                  accept="image/*"
                  disabled={guardando}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setNuevaPrincipal(f);
                    if (f) setFotoActiva(URL.createObjectURL(f));
                  }}
                />
                <button
                  type="button"
                  className="mis-productos-btn-secundario"
                  disabled={guardando || (!nuevaPrincipal && !principalUrl)}
                  onClick={borrarPrincipal}
                >
                  Borrar
                </button>
              </div>
              {nuevaPrincipal && <span className="gestion-fotos-modal-file">{nuevaPrincipal.name}</span>}
            </div>

            {Array.from({ length: MAX_FOTOS_EXTRA }, (_, idx) => {
              const file = nuevosExtras[idx];
              const url = slotsExtras[idx];
              const preview = file ? URL.createObjectURL(file) : url;
              return (
                <div className="gestion-fotos-modal-ranura" key={idx}>
                  <span>Foto {idx + 2}</span>
                  <div className="gestion-fotos-modal-ranura-preview">
                    {preview ? (
                      <img
                        src={
                          preview.startsWith('blob:')
                            ? preview
                            : urlImagenProductoVariante(preview, 'miniatura') ?? preview
                        }
                        alt=""
                        width={80}
                        height={80}
                      />
                    ) : (
                      <span className="mis-productos-card-foto-placeholder">Vacía</span>
                    )}
                  </div>
                  <div className="gestion-fotos-modal-ranura-acciones">
                    <input
                      key={`e-${idx}-${inputKey}`}
                      type="file"
                      accept="image/*"
                      disabled={guardando}
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setNuevosExtras((prev) => {
                          const next = [...prev];
                          next[idx] = f;
                          return next;
                        });
                        if (f) setFotoActiva(URL.createObjectURL(f));
                      }}
                    />
                    <button
                      type="button"
                      className="mis-productos-btn-secundario"
                      disabled={guardando || (!file && !url)}
                      onClick={() => borrarExtra(idx)}
                    >
                      Borrar
                    </button>
                  </div>
                  {file && <span className="gestion-fotos-modal-file">{file.name}</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="gestion-fotos-modal-footer">
          <button
            type="button"
            className="mis-productos-btn-secundario"
            disabled={guardando}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="mis-productos-btn-primario"
            disabled={guardando}
            onClick={() => void guardar()}
          >
            {guardando ? 'Guardando…' : 'Guardar fotos de este producto'}
          </button>
        </div>
      </div>
    </div>
  );
}