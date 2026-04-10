import { useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { MARCAS_VEHICULOS } from '../data/marcasVehiculos';
import { MARCAS_MODELOS, ANOS } from '../data/marcasModelos';
import { MARCAS_MOTOS, getModelosPorMarcaMoto } from '../data/marcasMotos';
import { CATEGORIAS_PRODUCTO } from '../data/categoriasProducto';
import { CATEGORIAS_PRODUCTO_MOTO } from '../data/categoriasProductoMoto';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_MOTO } from '../utils/verticalVehiculo';
import {
  MAX_BYTES_FOTO_PRODUCTO,
  MAX_MB_FOTO_PRODUCTO,
  urlImagenProductoVariante,
} from '../utils/imagenProducto';
import {
  MAX_FOTOS_EXTRA,
  normalizarUrlsACuatroSlots,
  slotsArchivosExtraVacios,
} from '../utils/productoImagenesExtra';
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
  const marcasLista = esMoto ? [...MARCAS_MOTOS] : [...MARCAS_VEHICULOS];
  const [nombre, setNombre] = useState(producto.nombre);
  const [categoria, setCategoria] = useState(producto.categoria ?? '');
  const [marca, setMarca] = useState(producto.marca ?? '');
  const [modelo, setModelo] = useState(producto.modelo ?? '');
  const [anio, setAnio] = useState(producto.anio ? String(producto.anio) : '');
  // usamos un solo campo de texto; si no hay comentarios aún, usamos la descripción previa
  const [comentarios, setComentarios] = useState(producto.comentarios ?? producto.descripcion ?? '');
  const [precio, setPrecio] = useState(String(producto.precio_usd));
  const [moneda, setMoneda] = useState<'BS' | 'USD'>(producto.moneda === 'USD' ? 'USD' : 'BS');
  const [estado, setEstado] = useState<'idle' | 'guardando' | 'ok' | 'error'>('idle');
  const [mensaje, setMensaje] = useState('');
  const [nuevaFotoPrincipal, setNuevaFotoPrincipal] = useState<File | null>(null);
  const [nuevasFotosExtraSlots, setNuevasFotosExtraSlots] = useState<(File | null)[]>(() =>
    slotsArchivosExtraVacios()
  );

  const modelosOpciones = marca
    ? esMoto
      ? getModelosPorMarcaMoto(marca)
      : MARCAS_MODELOS[marca] ?? []
    : [];

  const urlsExtrasActuales = useMemo(
    () => normalizarUrlsACuatroSlots(producto.imagenes_extra as string[] | null | undefined),
    [producto.id, producto.imagenes_extra]
  );

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
    if (!marca) {
      setEstado('error');
      setMensaje(esMoto ? 'Selecciona la marca de la moto.' : 'Selecciona la marca del vehículo.');
      return;
    }
    const precioNum = parseFloat(precio.trim().replace(',', '.'));
    if (!precio.trim() || Number.isNaN(precioNum) || precioNum < 0) {
      setEstado('error');
      setMensaje('Ingresa un precio válido.');
      return;
    }
    if (comentarios.length > 500) {
      setEstado('error');
      setMensaje('Los comentarios no pueden superar los 500 caracteres.');
      return;
    }

    setEstado('guardando');
    setMensaje('Guardando cambios del repuesto...');

    const payload: Record<string, unknown> = {
      nombre: nombre.trim(),
      categoria,
      marca: marca === 'Otra' ? null : marca,
      modelo: modelo.trim() || null,
      anio: anio ? parseInt(anio, 10) : null,
      // guardamos el mismo texto en descripción y comentarios
      descripcion: comentarios.trim() || null,
      comentarios: comentarios.trim() || null,
      precio_usd: precioNum,
      moneda,
    };

    // Subir nuevas imágenes si el usuario seleccionó
    let imagenPrincipalUrl = producto.imagen_url ?? null;
    const bucket = supabase.storage.from('productos');
    const MAX_MB = 2;

    if (nuevaFotoPrincipal) {
      if (nuevaFotoPrincipal.size > MAX_MB * 1024 * 1024) {
        setEstado('error');
        setMensaje(`La foto no debe superar ${MAX_MB} MB. Comprímela o elige otra.`);
        return;
      }
      const ext = nuevaFotoPrincipal.name.split('.').pop() || 'jpg';
      const principalPath = `${producto.id}/principal.${ext}`;
      const { error: upPrincipalError } = await bucket.upload(principalPath, nuevaFotoPrincipal, {
        upsert: true,
      });
      if (upPrincipalError) {
        setEstado('error');
        setMensaje('Error al subir la nueva foto principal.');
        return;
      }
      const { data: principalPublic } = bucket.getPublicUrl(principalPath);
      imagenPrincipalUrl = principalPublic.publicUrl;
    }

    const hayNuevasExtras = nuevasFotosExtraSlots.some((f) => f != null);
    let slotsUrls = normalizarUrlsACuatroSlots(producto.imagenes_extra as string[] | null | undefined);

    if (hayNuevasExtras) {
      for (let i = 0; i < MAX_FOTOS_EXTRA; i += 1) {
        const file = nuevasFotosExtraSlots[i];
        if (!file) continue;
        if (file.size > MAX_BYTES_FOTO_PRODUCTO) {
          setEstado('error');
          setMensaje(
            `La foto adicional ${i + 1} no debe superar ${MAX_MB_FOTO_PRODUCTO} MB.`
          );
          return;
        }
        const ext = file.name.split('.').pop() || 'jpg';
        const extraPath = `${producto.id}/extra-${i + 1}.${ext}`;
        const { error: upExtraError } = await bucket.upload(extraPath, file, { upsert: true });
        if (!upExtraError) {
          const { data: extraPublic } = bucket.getPublicUrl(extraPath);
          slotsUrls[i] = extraPublic.publicUrl;
        }
      }
      const tieneAlgunaExtra = slotsUrls.some((s) => s != null && String(s).trim() !== '');
      payload.imagenes_extra = tieneAlgunaExtra ? slotsUrls : null;
    }

    if (imagenPrincipalUrl !== null) {
      payload.imagen_url = imagenPrincipalUrl;
    }

    const { error } = await supabase.from('productos').update(payload).eq('id', producto.id);

    if (error) {
      setEstado('error');
      setMensaje(error.message || 'Error al guardar.');
      return;
    }

    setEstado('ok');
    setMensaje('Repuesto actualizado correctamente.');

    const imagenesExtraGuardadas = hayNuevasExtras
      ? ((payload.imagenes_extra as (string | null)[] | null) ?? producto.imagenes_extra ?? null)
      : producto.imagenes_extra ?? null;

    onSaved({
      ...producto,
      vertical: verticalProd,
      nombre: payload.nombre as string,
      categoria: (payload.categoria as string | null) ?? null,
      marca: (payload.marca as string | null) ?? null,
      modelo: (payload.modelo as string | null) ?? null,
      anio: (payload.anio as number | null) ?? null,
      descripcion: (payload.descripcion as string | null) ?? null,
      comentarios: (payload.comentarios as string | null) ?? null,
      precio_usd: precioNum,
      moneda,
      imagen_url: imagenPrincipalUrl,
      imagenes_extra: imagenesExtraGuardadas,
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
      <select
        value={marca}
        onChange={(e) => {
          setMarca(e.target.value);
          setModelo('');
        }}
        disabled={estado === 'guardando'}
        translate="no"
        className="notranslate"
      >
        <option value="">{esMoto ? 'Marca de la moto' : 'Marca del vehículo'}</option>
        {marcasLista.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      {marca && modelosOpciones.length > 0 && (
        <select
          value={modelo}
          onChange={(e) => setModelo(e.target.value)}
          disabled={estado === 'guardando'}
        >
          <option value="">Modelo (opcional)</option>
          {modelosOpciones.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      )}
      <select
        value={anio}
        onChange={(e) => setAnio(e.target.value)}
        disabled={estado === 'guardando'}
      >
        <option value="">Año (opcional)</option>
        {ANOS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <textarea
        placeholder="Breve descripción del producto (máx. 500 caracteres)"
        value={comentarios}
        onChange={(e) => setComentarios(e.target.value.slice(0, 500))}
        disabled={estado === 'guardando'}
        rows={3}
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
            Dólares (USD)
          </label>
        </div>
        <input
          type="text"
          placeholder={`Precio (${moneda === 'BS' ? 'Bs' : 'USD'}) *`}
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          disabled={estado === 'guardando'}
        />
      </div>
      <div className="registro-repuestos-fotos">
        <label className="registro-repuestos-fotos-label">Subir foto (opcional)</label>
        <p className="registro-repuestos-fotos-peso-ayuda">
          Máximo {MAX_MB_FOTO_PRODUCTO} MB por imagen (JPG, PNG, WebP, etc.).
        </p>
        <input
          type="file"
          accept="image/*"
          disabled={estado === 'guardando'}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            setNuevaFotoPrincipal(file);
          }}
        />
        <span className="registro-repuestos-fotos-label">
          Fotos adicionales (opcionales, hasta {MAX_FOTOS_EXTRA})
        </span>
        <p className="registro-repuestos-fotos-extra-ayuda">
          Cada ranura es independiente: elige una imagen por botón para reemplazar solo esa foto.
        </p>
        <div className="registro-repuestos-fotos-extra-bloque">
          {Array.from({ length: MAX_FOTOS_EXTRA }, (_, idx) => {
            const urlActual = urlsExtrasActuales[idx];
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
                    <img
                      className="registro-repuestos-fotos-extra-thumb"
                      src={urlImagenProductoVariante(urlActual, 'miniatura') ?? urlActual}
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
                <input
                  id={`foto-extra-edit-${idx}`}
                  type="file"
                  accept="image/*"
                  disabled={estado === 'guardando'}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setNuevasFotosExtraSlots((prev) => {
                      const next = [...prev];
                      next[idx] = file;
                      return next;
                    });
                    e.target.value = '';
                  }}
                />
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

