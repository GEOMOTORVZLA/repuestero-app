import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { MARCAS_VEHICULOS } from '../data/marcasVehiculos';
import { MARCAS_MODELOS, ANOS } from '../data/marcasModelos';
import { CATEGORIAS_PRODUCTO } from '../data/categoriasProducto';
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
  imagenes_extra?: string[] | null;
}

interface EditarProductoProps {
  producto: ProductoEditable;
  onCancel: () => void;
  onSaved: (productoActualizado: ProductoEditable) => void;
}

export function EditarProducto({ producto, onCancel, onSaved }: EditarProductoProps) {
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
  const [nuevasFotosExtra, setNuevasFotosExtra] = useState<File[]>([]);

  const modelosOpciones = marca && MARCAS_MODELOS[marca] ? MARCAS_MODELOS[marca] : [];

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
      setMensaje('Selecciona la marca del vehículo.');
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
    let extras: string[] | null = (producto.imagenes_extra ?? null) as string[] | null;

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

    if (nuevasFotosExtra.length > 0) {
      const extraUrls: string[] = [];
      const archivosExtra = nuevasFotosExtra.slice(0, 4);
      for (let i = 0; i < archivosExtra.length; i += 1) {
        const file = archivosExtra[i];
        const ext = file.name.split('.').pop() || 'jpg';
        const extraPath = `${producto.id}/extra-${i + 1}.${ext}`;
        const { error: upExtraError } = await bucket.upload(extraPath, file, { upsert: true });
        if (!upExtraError) {
          const { data: extraPublic } = bucket.getPublicUrl(extraPath);
          extraUrls.push(extraPublic.publicUrl);
        }
      }
      extras = extraUrls.length ? extraUrls : null;
    }

    if (imagenPrincipalUrl !== null) {
      payload.imagen_url = imagenPrincipalUrl;
    }
    payload.imagenes_extra = extras;

    const { error } = await supabase.from('productos').update(payload).eq('id', producto.id);

    if (error) {
      setEstado('error');
      setMensaje(error.message || 'Error al guardar.');
      return;
    }

    setEstado('ok');
    setMensaje('Repuesto actualizado correctamente.');

    onSaved({
      ...producto,
      nombre: payload.nombre as string,
      categoria: (payload.categoria as string | null) ?? null,
      marca: (payload.marca as string | null) ?? null,
      modelo: (payload.modelo as string | null) ?? null,
      anio: (payload.anio as number | null) ?? null,
      descripcion: (payload.descripcion as string | null) ?? null,
      comentarios: (payload.comentarios as string | null) ?? null,
      precio_usd: precioNum,
      moneda,
    });
  };

  return (
    <div className="registro-repuestos">
      <h2>Editar repuesto</h2>
      <select
        value={categoria}
        onChange={(e) => setCategoria(e.target.value)}
        disabled={estado === 'guardando'}
      >
        <option value="">Categoría del producto</option>
        {CATEGORIAS_PRODUCTO.map((c) => (
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
      >
        <option value="">Marca del vehículo</option>
        {MARCAS_VEHICULOS.map((m) => (
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
        <input
          type="file"
          accept="image/*"
          disabled={estado === 'guardando'}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            setNuevaFotoPrincipal(file);
          }}
        />
        <label className="registro-repuestos-fotos-label">
          Subir fotos (hasta 4, opcionales)
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={estado === 'guardando'}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).slice(0, 4);
            setNuevasFotosExtra(files);
          }}
        />
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

