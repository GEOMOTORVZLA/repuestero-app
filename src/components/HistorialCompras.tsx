import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { fetchHistorialContactos, type FilaHistorialContacto } from '../services/historialContactosProducto';
import './HistorialCompras.css';

function formatearFecha(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-VE', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function HistorialCompras() {
  const { user } = useAuth();
  const [filas, setFilas] = useState<FilaHistorialContacto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    if (!user) return;
    setCargando(true);
    setError(null);
    const { data, error: err } = await fetchHistorialContactos(supabase, user.id);
    if (err) setError(err);
    setFilas(data);
    setCargando(false);
  };

  useEffect(() => {
    void cargar();
  }, [user?.id]);

  if (!user) {
    return <p className="historial-compras-mensaje">Inicia sesión para ver tu historial.</p>;
  }

  if (cargando) {
    return <p className="historial-compras-mensaje">Cargando historial…</p>;
  }

  if (error) {
    return (
      <div className="historial-compras-error">
        <p>{error}</p>
        <p className="historial-compras-hint">
          Si acabas de configurar la app, ejecuta en Supabase el script{' '}
          <code>supabase-historial-contactos-comprador.sql</code> y vuelve a intentar.
        </p>
      </div>
    );
  }

  if (!filas.length) {
    return (
      <p className="historial-compras-vacio">
        Aún no tienes contactos recientes. Cuando pulses <strong>Contactar vendedor</strong> en un
        producto, aparecerá aquí (máximo los últimos 5).
      </p>
    );
  }

  return (
    <ul className="historial-compras-lista">
      {filas.map((f) => (
        <li key={f.id} className="historial-compras-item">
          <div className="historial-compras-item-header">
            <span className="historial-compras-producto">{f.producto_nombre || 'Producto'}</span>
            <time className="historial-compras-fecha" dateTime={f.contactado_en}>
              {formatearFecha(f.contactado_en)}
            </time>
          </div>
          <p className="historial-compras-tienda">
            Vendedor: <strong>{f.tienda_nombre || '—'}</strong>
          </p>
          {f.precio_texto && (
            <p className="historial-compras-precio">Precio al contactar: {f.precio_texto}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
