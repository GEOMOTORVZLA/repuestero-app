import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ESTADOS_VENEZUELA, getCiudadesPorEstado } from '../data/ciudadesVenezuela';
import './RegistroTienda.css';

const METODOS_PAGO = ['Efectivo', 'Pagomovil', 'Transferencia', 'Zelle', 'Binance', 'Cashea'] as const;
type MetodoPago = (typeof METODOS_PAGO)[number];

export function RegistroTienda() {
  const { user } = useAuth();
  const [nombre, setNombre] = useState('');
  const [rif, setRif] = useState('');
  const [estadoUbicacion, setEstadoUbicacion] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [latitud, setLatitud] = useState<number | null>(null);
  const [longitud, setLongitud] = useState<number | null>(null);
  const [latManual, setLatManual] = useState('');
  const [longManual, setLongManual] = useState('');
  const [estado, setEstado] = useState<'idle' | 'detectando' | 'registrando' | 'ok' | 'error'>('idle');
  const [mensaje, setMensaje] = useState('');
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([]);

  const detectarUbicacion = () => {
    setEstado('detectando');
    setMensaje('Solicitando permiso de ubicación...');

    if (!navigator.geolocation) {
      setEstado('error');
      setMensaje('Tu navegador no soporta geolocalización. Usa los campos manuales abajo.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitud(pos.coords.latitude);
        setLongitud(pos.coords.longitude);
        setLatManual(pos.coords.latitude.toString());
        setLongManual(pos.coords.longitude.toString());
        setEstado('idle');
        setMensaje(`Ubicación detectada: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      },
      () => {
        setEstado('idle');
        setMensaje('No se pudo obtener la ubicación. Ingresa latitud y longitud manualmente.');
      },
      { enableHighAccuracy: true }
    );
  };

  const tieneCoordenadas = (): boolean => {
    if (latitud !== null && longitud !== null) return true;
    const lat = parseFloat(latManual.replace(',', '.'));
    const lng = parseFloat(longManual.replace(',', '.'));
    return !Number.isNaN(lat) && !Number.isNaN(lng);
  };

  const obtenerCoordenadas = (): { lat: number; lng: number } | null => {
    if (latitud !== null && longitud !== null) {
      return { lat: latitud, lng: longitud };
    }
    const lat = parseFloat(latManual.replace(',', '.'));
    const lng = parseFloat(longManual.replace(',', '.'));
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      return { lat, lng };
    }
    return null;
  };

  const toggleMetodoPago = (metodo: MetodoPago) => {
    setMetodosPago((prev) =>
      prev.includes(metodo) ? prev.filter((m) => m !== metodo) : [...prev, metodo]
    );
  };

  const registrarTienda = async () => {
    if (!user) return;
    if (!nombre.trim()) {
      setEstado('error');
      setMensaje('Escribe el nombre de la tienda.');
      return;
    }
    if (!rif.trim()) {
      setEstado('error');
      setMensaje('Escribe el RIF de la tienda.');
      return;
    }

    const coords = obtenerCoordenadas();
    if (!coords) {
      setEstado('error');
      setMensaje('Ingresa latitud y longitud. Puedes detectarlas automáticamente o escribirlas manualmente.');
      return;
    }

    setEstado('registrando');
    setMensaje('Registrando tienda...');

    const { error } = await supabase.from('tiendas').insert({
      user_id: user?.id,
      nombre: nombre.trim(),
      nombre_comercial: nombre.trim(),
      rif: rif.trim(),
      estado: estadoUbicacion.trim() || null,
      ciudad: ciudad.trim() || null,
      latitud: coords.lat,
      longitud: coords.lng,
      metodos_pago: metodosPago.length ? metodosPago : null,
    });

    if (error) {
      setEstado('error');
      setMensaje(error.message || 'Error al guardar en Supabase.');
      return;
    }

    setEstado('ok');
    setMensaje('¡Tienda registrada correctamente!');
    setNombre('');
    setRif('');
    setEstadoUbicacion('');
    setCiudad('');
    setLatitud(null);
    setLongitud(null);
    setLatManual('');
    setLongManual('');
    setMetodosPago([]);
  };

  const ciudadesDisponibles = estadoUbicacion ? getCiudadesPorEstado(estadoUbicacion) : [];
  const onEstadoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setEstadoUbicacion(e.target.value);
    setCiudad('');
  };

  return (
    <div className="registro-tienda">
      <h2>Registrar tienda</h2>
      <input
        type="text"
        placeholder="Nombre de la tienda (ej: Repuestos El Socio)"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        disabled={estado === 'registrando'}
      />
      <input
        type="text"
        placeholder="RIF (ej: J-12345678-9)"
        value={rif}
        onChange={(e) => setRif(e.target.value)}
        disabled={estado === 'registrando'}
      />

      <div className="registro-tienda-ubicacion">
        <label>Estado</label>
        <select
          value={estadoUbicacion}
          onChange={onEstadoChange}
          disabled={estado === 'registrando'}
        >
          <option value="">Selecciona estado</option>
          {ESTADOS_VENEZUELA.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <label>Ciudad / Municipio</label>
        <select
          value={ciudad}
          onChange={(e) => setCiudad(e.target.value)}
          disabled={estado === 'registrando' || !estadoUbicacion}
        >
          <option value="">Selecciona ciudad</option>
          {ciudadesDisponibles.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="coordenadas">
        <label>Ubicación</label>
        <div className="botones">
          <button
            type="button"
            onClick={detectarUbicacion}
            disabled={estado === 'detectando' || estado === 'registrando'}
          >
            {estado === 'detectando' ? 'Detectando...' : 'Detectar Ubicación'}
          </button>
        </div>
        <p className="hint">
          O escribe manualmente latitud y longitud (ej: en Google Maps, clic derecho en el mapa → copiar coordenadas)
        </p>
        <div className="campos-coords">
          <input
            type="text"
            placeholder="Latitud (ej: 4.6097)"
            value={latManual}
            onChange={(e) => setLatManual(e.target.value)}
            disabled={estado === 'registrando'}
          />
          <input
            type="text"
            placeholder="Longitud (ej: -74.0817)"
            value={longManual}
            onChange={(e) => setLongManual(e.target.value)}
            disabled={estado === 'registrando'}
          />
        </div>
      </div>

      <div className="registro-tienda-metodos-pago">
        <label>Formas de pago que aceptas</label>
        <p className="registro-tienda-metodos-pago-hint">
          Selecciona cómo pueden pagarte los clientes. Esta información se mostrará al contactar al vendedor.
        </p>
        <div className="registro-tienda-metodos-pago-opciones">
          {METODOS_PAGO.map((metodo) => (
            <label key={metodo} className="registro-tienda-metodos-pago-opcion">
              <input
                type="checkbox"
                value={metodo}
                checked={metodosPago.includes(metodo)}
                onChange={() => toggleMetodoPago(metodo)}
                disabled={estado === 'registrando'}
              />
              {metodo}
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="btn-registrar"
        onClick={registrarTienda}
        disabled={estado === 'registrando' || !tieneCoordenadas() || !rif.trim()}
      >
        {estado === 'registrando' ? 'Registrando...' : 'Registrar Tienda'}
      </button>

      {mensaje && (
        <p className={`mensaje ${estado === 'error' ? 'error' : estado === 'ok' ? 'ok' : ''}`}>
          {mensaje}
        </p>
      )}
    </div>
  );
}
