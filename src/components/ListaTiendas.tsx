import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { ESTADOS_VENEZUELA, getCiudadesPorEstado } from '../data/ciudadesVenezuela';
import './ListaTiendas.css';

interface Tienda {
  id: string;
  nombre: string;
  nombre_comercial: string;
  rif: string;
  estado: string | null;
  ciudad: string | null;
  latitud: number;
  longitud: number;
}

export function ListaTiendas() {
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Tienda | null>(null);
  const [mensaje, setMensaje] = useState('');

  const cargarTiendas = async () => {
    setCargando(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('tiendas')
      .select('id, nombre, nombre_comercial, rif, estado, ciudad, latitud, longitud')
      .order('nombre');

    if (err) {
      setError(err.message);
      setTiendas([]);
    } else {
      setTiendas(data ?? []);
    }
    setCargando(false);
  };

  useEffect(() => {
    cargarTiendas();
  }, []);

  const eliminarTienda = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar la tienda "${nombre}"?`)) return;

    const { error: err } = await supabase.from('tiendas').delete().eq('id', id);

    if (err) {
      setMensaje(`Error al eliminar: ${err.message}`);
      setTimeout(() => setMensaje(''), 3000);
      return;
    }

    setMensaje('Tienda eliminada.');
    setEditando(null);
    cargarTiendas();
    setTimeout(() => setMensaje(''), 3000);
  };

  const guardarEdicion = async (datos: Partial<Tienda>) => {
    if (!editando) return;
    if (!datos.nombre?.trim() || !datos.nombre_comercial?.trim() || !datos.rif?.trim()) {
      setMensaje('Completa nombre, nombre comercial y RIF.');
      return;
    }
    const lat = typeof datos.latitud === 'number' ? datos.latitud : parseFloat(String(datos.latitud || '').replace(',', '.'));
    const lng = typeof datos.longitud === 'number' ? datos.longitud : parseFloat(String(datos.longitud || '').replace(',', '.'));
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setMensaje('Latitud y longitud deben ser números válidos.');
      return;
    }

    const { error: err } = await supabase
      .from('tiendas')
      .update({
        nombre: datos.nombre.trim(),
        nombre_comercial: datos.nombre_comercial.trim(),
        rif: datos.rif.trim(),
        estado: datos.estado?.trim() || null,
        ciudad: datos.ciudad?.trim() || null,
        latitud: lat,
        longitud: lng,
      })
      .eq('id', editando.id);

    if (err) {
      setMensaje(`Error al guardar: ${err.message}`);
      return;
    }

    setMensaje('Tienda actualizada.');
    setEditando(null);
    cargarTiendas();
    setTimeout(() => setMensaje(''), 3000);
  };

  if (cargando) return <p className="lista-tiendas cargando">Cargando tiendas...</p>;
  if (error) return <p className="lista-tiendas error">Error: {error}</p>;

  return (
    <div className="lista-tiendas">
      <div className="lista-tiendas-header">
        <h2>Tiendas registradas</h2>
        <button type="button" className="btn-refrescar" onClick={cargarTiendas}>
          Refrescar
        </button>
      </div>

      {mensaje && <p className="mensaje">{mensaje}</p>}

      {tiendas.length === 0 ? (
        <p className="sin-tiendas">No hay tiendas registradas.</p>
      ) : (
        <div className="tabla-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>RIF</th>
                <th>Ubicación</th>
                <th>Lat / Lng</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tiendas.map((t) =>
                editando?.id === t.id ? (
                  <EditarFila
                    key={t.id}
                    tienda={t}
                    onGuardar={guardarEdicion}
                    onCancelar={() => setEditando(null)}
                  />
                ) : (
                  <tr key={t.id}>
                    <td>{t.nombre_comercial || t.nombre}</td>
                    <td>{t.rif}</td>
                    <td>{[t.ciudad, t.estado].filter(Boolean).join(', ') || '—'}</td>
                    <td>{t.latitud?.toFixed(4)}, {t.longitud?.toFixed(4)}</td>
                    <td>
                      <button type="button" className="btn-editar" onClick={() => setEditando(t)}>
                        Editar
                      </button>
                      <button type="button" className="btn-eliminar" onClick={() => eliminarTienda(t.id, t.nombre_comercial || t.nombre)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EditarFila({
  tienda,
  onGuardar,
  onCancelar,
}: {
  tienda: Tienda;
  onGuardar: (d: Partial<Tienda>) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(tienda.nombre);
  const [nombreComercial, setNombreComercial] = useState(tienda.nombre_comercial);
  const [rif, setRif] = useState(tienda.rif);
  const [estadoEdit, setEstadoEdit] = useState(tienda.estado ?? '');
  const [ciudadEdit, setCiudadEdit] = useState(tienda.ciudad ?? '');
  const [latitud, setLatitud] = useState(String(tienda.latitud));
  const [longitud, setLongitud] = useState(String(tienda.longitud));

  const ciudadesEdit = estadoEdit ? getCiudadesPorEstado(estadoEdit) : [];

  return (
    <tr className="fila-editar">
      <td colSpan={5}>
        <div className="form-editar">
          <input
            placeholder="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <input
            placeholder="Nombre comercial"
            value={nombreComercial}
            onChange={(e) => setNombreComercial(e.target.value)}
          />
          <input
            placeholder="RIF"
            value={rif}
            onChange={(e) => setRif(e.target.value)}
          />
          <select value={estadoEdit} onChange={(e) => { setEstadoEdit(e.target.value); setCiudadEdit(''); }}>
            <option value="">Estado</option>
            {ESTADOS_VENEZUELA.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <select value={ciudadEdit} onChange={(e) => setCiudadEdit(e.target.value)} disabled={!estadoEdit}>
            <option value="">Ciudad</option>
            {ciudadesEdit.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            placeholder="Latitud"
            value={latitud}
            onChange={(e) => setLatitud(e.target.value)}
          />
          <input
            placeholder="Longitud"
            value={longitud}
            onChange={(e) => setLongitud(e.target.value)}
          />
          <div>
            <button
              type="button"
              className="btn-guardar"
              onClick={() =>
                onGuardar({
                  nombre,
                  nombre_comercial: nombreComercial,
                  rif,
                  estado: estadoEdit || null,
                  ciudad: ciudadEdit || null,
                  latitud: parseFloat(latitud.replace(',', '.')),
                  longitud: parseFloat(longitud.replace(',', '.')),
                })
              }
            >
              Guardar
            </button>
            <button type="button" className="btn-cancelar" onClick={onCancelar}>
              Cancelar
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
