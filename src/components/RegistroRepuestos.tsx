import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { MARCAS_VEHICULOS } from '../data/marcasVehiculos';
import { MARCAS_MODELOS, ANOS } from '../data/marcasModelos';
import { CATEGORIAS_PRODUCTO } from '../data/categoriasProducto';
import './RegistroRepuestos.css';

interface Tienda {
  id: string;
  nombre: string | null;
  nombre_comercial: string | null;
}

interface RegistroRepuestosProps {
  onProductoRegistrado?: () => void;
}

export function RegistroRepuestos({ onProductoRegistrado }: RegistroRepuestosProps) {
  const { user } = useAuth();
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [cargandoTienda, setCargandoTienda] = useState(true);
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [anio, setAnio] = useState('');
  const [comentarios, setComentarios] = useState('');
  const [precio, setPrecio] = useState('');
  const [moneda, setMoneda] = useState<'BS' | 'USD'>('BS');
  const [estado, setEstado] = useState<'idle' | 'registrando' | 'ok' | 'error'>('idle');
  const [mensaje, setMensaje] = useState('');
  const [fotoPrincipal, setFotoPrincipal] = useState<File | null>(null);
  const [fotosExtra, setFotosExtra] = useState<File[]>([]);
  const registrandoRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    const cargarTiendas = async () => {
      setCargandoTienda(true);
      const { data, error } = await supabase
        .from('tiendas')
        .select('id, nombre, nombre_comercial')
        .eq('user_id', user.id)
        .order('nombre');

      if (!error && data && data.length > 0) {
        setTiendas(data ?? []);
        setCargandoTienda(false);
        return;
      }

      // Si no existe tienda, la creamos automáticamente (1 usuario = 1 tienda)
      const md = (user as any)?.user_metadata ?? {};
      const perfil = md?.perfil_vendedor ?? null;

      const nombreAuto =
        (perfil?.nombre_comercial ||
          perfil?.nombre ||
          user.email ||
          'Mi tienda') as string;

      const rifAuto = (perfil?.rif ?? null) as string | null;
      const telefonoAuto = (perfil?.telefono ?? null) as string | null;
      const latAuto =
        perfil?.latitud != null ? parseFloat(String(perfil.latitud).replace(',', '.')) : null;
      const lngAuto =
        perfil?.longitud != null ? parseFloat(String(perfil.longitud).replace(',', '.')) : null;
      const metodosAuto = Array.isArray(perfil?.metodos_pago)
        ? (perfil.metodos_pago as string[])
        : null;

      const { error: insertErr } = await supabase.from('tiendas').insert({
        user_id: user.id,
        nombre: (perfil?.nombre ?? nombreAuto) as string,
        nombre_comercial: nombreAuto,
        rif: rifAuto,
        telefono: telefonoAuto,
        latitud: Number.isFinite(latAuto as number) ? (latAuto as number) : 0,
        longitud: Number.isFinite(lngAuto as number) ? (lngAuto as number) : 0,
        metodos_pago: metodosAuto && metodosAuto.length ? metodosAuto : null,
      });

      if (insertErr) {
        setTiendas([]);
        setCargandoTienda(false);
        return;
      }

      const { data: data2 } = await supabase
        .from('tiendas')
        .select('id, nombre, nombre_comercial')
        .eq('user_id', user.id)
        .order('nombre');

      setTiendas(data2 ?? []);
      setCargandoTienda(false);
    };
    cargarTiendas();
  }, [user]);

  const registrarRepuesto = async () => {
    if (registrandoRef.current) return;
    registrandoRef.current = true;

    const tienda = tiendas[0];
    if (!tienda) {
      registrandoRef.current = false;
      setEstado('error');
      setMensaje('No se encontró una tienda asociada al usuario.');
      return;
    }
    if (!nombre.trim()) {
      registrandoRef.current = false;
      setEstado('error');
      setMensaje('Escribe el nombre del repuesto.');
      return;
    }
    if (!categoria) {
      registrandoRef.current = false;
      setEstado('error');
      setMensaje('Selecciona la categoría del producto.');
      return;
    }
    if (!marca) {
      registrandoRef.current = false;
      setEstado('error');
      setMensaje('Selecciona la marca del vehículo.');
      return;
    }
    const precioNum = parseFloat(precio.trim().replace(',', '.'));
    if (!precio.trim() || Number.isNaN(precioNum) || precioNum < 0) {
      registrandoRef.current = false;
      setEstado('error');
      setMensaje('Ingresa un precio válido.');
      return;
    }
    if (comentarios.length > 500) {
      registrandoRef.current = false;
      setEstado('error');
      setMensaje('Los comentarios no pueden superar los 500 caracteres.');
      return;
    }
    if (!fotoPrincipal) {
      registrandoRef.current = false;
      setEstado('error');
      setMensaje('Sube al menos una foto principal del repuesto.');
      return;
    }
    const MAX_MB = 2;
    const maxBytes = MAX_MB * 1024 * 1024;
    if (fotoPrincipal.size > maxBytes) {
      registrandoRef.current = false;
      setEstado('error');
      setMensaje(`La foto principal no debe superar ${MAX_MB} MB. Comprímela o elige otra.`);
      return;
    }
    const fotoExtraGrande = fotosExtra.find((f) => f.size > maxBytes);
    if (fotoExtraGrande) {
      registrandoRef.current = false;
      setEstado('error');
      setMensaje(`Cada foto adicional no debe superar ${MAX_MB} MB. Comprímelas o quita la más pesada.`);
      return;
    }

    setEstado('registrando');
    setMensaje('Registrando repuesto...');

    const payload: Record<string, unknown> = {
      tienda_id: tienda.id,
      nombre: nombre.trim(),
      categoria,
      marca: marca === 'Otra' ? null : marca,
      modelo: modelo.trim() || null,
      anio: anio ? parseInt(anio, 10) : null,
      // usamos un solo campo de texto para la breve descripción
      descripcion: comentarios.trim() || null,
      comentarios: comentarios.trim() || null,
      precio_usd: precioNum,
      moneda: moneda,
      stock_actual: 0,
      activo: true,
    };

    const { data: insertData, error } = await supabase
      .from('productos')
      .insert(payload)
      .select('id')
      .single();

    if (error || !insertData) {
      registrandoRef.current = false;
      setEstado('error');
      setMensaje(error?.message || 'Error al guardar.');
      return;
    }

    const productoId = insertData.id as string;

    // Subir imágenes a Supabase Storage (bucket "productos")
    const bucket = supabase.storage.from('productos');
    const principalExt = fotoPrincipal.name.split('.').pop() || 'jpg';
    const principalPath = `${productoId}/principal.${principalExt}`;

    const { error: upPrincipalError } = await bucket.upload(principalPath, fotoPrincipal, {
      upsert: true,
    });

    if (upPrincipalError) {
      await supabase.from('productos').delete().eq('id', productoId);
      registrandoRef.current = false;
      setEstado('error');
      setMensaje('Error al subir la foto principal. Intenta de nuevo.');
      return;
    }

    const { data: principalPublic } = bucket.getPublicUrl(principalPath);
    const imagenPrincipalUrl = principalPublic.publicUrl;

    const extras: string[] = [];
    const archivosExtra = fotosExtra.slice(0, 4);
    for (let i = 0; i < archivosExtra.length; i += 1) {
      const file = archivosExtra[i];
      const ext = file.name.split('.').pop() || 'jpg';
      const extraPath = `${productoId}/extra-${i + 1}.${ext}`;
      const { error: upExtraError } = await bucket.upload(extraPath, file, { upsert: true });
      if (!upExtraError) {
        const { data: extraPublic } = bucket.getPublicUrl(extraPath);
        extras.push(extraPublic.publicUrl);
      }
    }

    const { error: updateError } = await supabase
      .from('productos')
      .update({
        imagen_url: imagenPrincipalUrl,
        imagenes_extra: extras.length ? extras : null,
      })
      .eq('id', productoId);

    if (updateError) {
      await supabase.from('productos').delete().eq('id', productoId);
      registrandoRef.current = false;
      setEstado('error');
      setMensaje(updateError.message || 'Error al asociar las fotos al repuesto.');
      return;
    }

    registrandoRef.current = false;
    setEstado('ok');
    setMensaje('¡Producto registrado correctamente!');
    onProductoRegistrado?.();
    setNombre('');
    setCategoria('');
    setMarca('');
    setModelo('');
    setAnio('');
    setComentarios('');
    setPrecio('');
    setMoneda('BS');
    setFotoPrincipal(null);
    setFotosExtra([]);
  };

  if (cargandoTienda) {
    return (
      <div className="registro-repuestos">
        <p className="registro-repuestos-aviso">Preparando tu tienda para publicar productos…</p>
      </div>
    );
  }

  if (tiendas.length === 0) {
    return (
      <div className="registro-repuestos">
        <p className="registro-repuestos-aviso">
          No se pudo preparar tu tienda automáticamente. Ve a “Mi perfil” y guarda tus datos, luego vuelve aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="registro-repuestos">
      <h2>Registrar producto</h2>
      <select
        value={categoria}
        onChange={(e) => setCategoria(e.target.value)}
        disabled={estado === 'registrando'}
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
        disabled={estado === 'registrando'}
        spellCheck={false}
      />
      <select
        value={marca}
        onChange={(e) => { setMarca(e.target.value); setModelo(''); }}
        disabled={estado === 'registrando'}
      >
        <option value="">Marca del vehículo</option>
        {MARCAS_VEHICULOS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      {marca && MARCAS_MODELOS[marca] && (
        <select
          value={modelo}
          onChange={(e) => setModelo(e.target.value)}
          disabled={estado === 'registrando'}
        >
          <option value="">Modelo (opcional)</option>
          {MARCAS_MODELOS[marca].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}
      <select
        value={anio}
        onChange={(e) => setAnio(e.target.value)}
        disabled={estado === 'registrando'}
      >
        <option value="">Año (opcional)</option>
        {ANOS.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      <textarea
        placeholder="Breve descripción del producto (máx. 500 caracteres)"
        value={comentarios}
        onChange={(e) => setComentarios(e.target.value.slice(0, 500))}
        disabled={estado === 'registrando'}
        rows={3}
        className="registro-repuestos-comentarios"
        spellCheck={false}
      />
      <div className="registro-repuestos-precio">
        <div className="registro-repuestos-moneda">
          <label>
            <input
              type="radio"
              name="moneda"
              value="BS"
              checked={moneda === 'BS'}
              onChange={() => setMoneda('BS')}
              disabled={estado === 'registrando'}
            />
            Bolívares (Bs)
          </label>
          <label>
            <input
              type="radio"
              name="moneda"
              value="USD"
              checked={moneda === 'USD'}
              onChange={() => setMoneda('USD')}
              disabled={estado === 'registrando'}
            />
            Dólares (USD)
          </label>
        </div>
        <input
          type="text"
          placeholder={`Precio (${moneda === 'BS' ? 'Bs' : 'USD'}) *`}
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          disabled={estado === 'registrando'}
        />
      </div>
      <div className="registro-repuestos-fotos">
        <label className="registro-repuestos-fotos-label">Subir foto *</label>
        <input
          type="file"
          accept="image/*"
          disabled={estado === 'registrando'}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            setFotoPrincipal(file);
          }}
        />
        <label className="registro-repuestos-fotos-label">Subir fotos (hasta 4, opcionales)</label>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={estado === 'registrando'}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).slice(0, 4);
            setFotosExtra(files);
          }}
        />
      </div>
      <button
        type="button"
        className="btn-registrar"
        onClick={registrarRepuesto}
        disabled={estado === 'registrando' || !nombre.trim() || !marca || !precio.trim()}
      >
        {estado === 'registrando' ? 'Registrando...' : 'Registrar producto'}
      </button>
      {mensaje && (
        <p className={`mensaje ${estado === 'error' ? 'error' : estado === 'ok' ? 'ok' : ''}`}>
          {mensaje}
        </p>
      )}
    </div>
  );
}
