import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { ESTADOS_VENEZUELA, getCiudadesPorEstado } from '../data/ciudadesVenezuela';
import { ESPECIALIDADES_TALLER } from '../data/registroVenezuela';
import { MapVendedorUbicacion } from './MapaVendedorUbicacion';
import './BusquedaTalleres.css';

export interface Taller {
  id: string;
  nombre: string | null;
  nombre_comercial: string | null;
  especialidad: string | null;
  marca_vehiculo: string | null;
  acerca_de: string | null;
  estado: string | null;
  ciudad: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  metodos_pago: string[] | null;
}

interface BusquedaTalleresProps {
  onBuscar?: () => void;
}

export function BusquedaTalleres({ onBuscar }: BusquedaTalleresProps) {
  const [especialidad, setEspecialidad] = useState('');
  const [estado, setEstado] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [talleres, setTalleres] = useState<Taller[]>([]);
  const [cargando, setCargando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [contactarTaller, setContactarTaller] = useState<Taller | null>(null);
  const [mostrarMapaEnModal, setMostrarMapaEnModal] = useState(false);

  const ciudadesOpciones = estado ? getCiudadesPorEstado(estado) : [];

  const buscar = async () => {
    setCargando(true);
    setBuscado(true);
    onBuscar?.();
    setTalleres([]);

    let query = supabase
      .from('talleres')
      .select('id, nombre, nombre_comercial, especialidad, marca_vehiculo, acerca_de, estado, ciudad, telefono, email, direccion, latitud, longitud, metodos_pago');

    if (especialidad) {
      query = query.eq('especialidad', especialidad);
    }
    if (estado) {
      query = query.eq('estado', estado);
    }
    if (ciudad) {
      query = query.eq('ciudad', ciudad);
    }

    const { data, error } = await query;

    if (error) {
      setTalleres([]);
      console.error('Error buscando talleres:', error);
    } else {
      setTalleres((data ?? []) as Taller[]);
    }
    setCargando(false);
  };

  const nombreTaller = (t: Taller) => t.nombre_comercial || t.nombre || 'Sin nombre';
  const contactoWhatsApp = (t: Taller) => {
    const tel = (t.telefono ?? '').replace(/\D/g, '');
    if (!tel) return null;
    const num = tel.startsWith('58') ? tel : `58${tel}`;
    return `https://wa.me/${num}`;
  };

  const abrirContactar = (t: Taller) => {
    setContactarTaller(t);
    setMostrarMapaEnModal(false);
  };
  const cerrarContactar = () => {
    setContactarTaller(null);
    setMostrarMapaEnModal(false);
  };

  const tieneUbicacion = (t: Taller) =>
    t.latitud != null && t.longitud != null;

  const linkRutaGoogleMaps = (t: Taller) => {
    if (t.latitud == null || t.longitud == null) return null;
    const dest = `${t.latitud},${t.longitud}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      dest
    )}&travelmode=driving`;
  };

  return (
    <div className="busqueda-talleres">
      <div className="busqueda-talleres-filtros">
        <div className="busqueda-talleres-campo">
          <label htmlFor="taller-especialidad">Especialidad</label>
          <select
            id="taller-especialidad"
            value={especialidad}
            onChange={(e) => setEspecialidad(e.target.value)}
          >
            <option value="">Todas</option>
            {ESPECIALIDADES_TALLER.map((esp) => (
              <option key={esp} value={esp}>{esp}</option>
            ))}
          </select>
        </div>
        <div className="busqueda-talleres-campo">
          <label htmlFor="taller-estado">Estado</label>
          <select
            id="taller-estado"
            value={estado}
            onChange={(e) => { setEstado(e.target.value); setCiudad(''); }}
          >
            <option value="">Todos</option>
            {ESTADOS_VENEZUELA.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div className="busqueda-talleres-campo">
          <label htmlFor="taller-ciudad">Ciudad</label>
          <select
            id="taller-ciudad"
            value={ciudad}
            onChange={(e) => setCiudad(e.target.value)}
            disabled={!estado}
          >
            <option value="">Todas</option>
            {ciudadesOpciones.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="busqueda-talleres-btn"
          onClick={buscar}
          disabled={cargando}
        >
          {cargando ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {cargando ? (
        <p className="busqueda-talleres-mensaje">Buscando talleres…</p>
      ) : buscado && talleres.length === 0 ? (
        <p className="busqueda-talleres-sin-resultados">
          No hay talleres registrados con los filtros seleccionados. Prueba con otras opciones.
        </p>
      ) : buscado && talleres.length > 0 ? (
        <div className="busqueda-talleres-resultados">
          <div className="busqueda-talleres-grid">
            {talleres.map((t) => (
              <article key={t.id} className="busqueda-talleres-card">
                <div className="busqueda-talleres-card-info">
                  <h4 className="busqueda-talleres-card-nombre">{nombreTaller(t)}</h4>
                  <p className="busqueda-talleres-card-especialidad">{t.especialidad || '—'}</p>
                  <p className="busqueda-talleres-card-ubicacion">
                    {[t.estado, t.ciudad].filter(Boolean).join(', ') || 'Ubicación no indicada'}
                  </p>
                </div>
                <div className="busqueda-talleres-card-botones">
                  <button
                    type="button"
                    className="busqueda-talleres-card-btn"
                    onClick={() => abrirContactar(t)}
                  >
                    Contactar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {contactarTaller && (
        <div
          className="busqueda-talleres-modal-overlay"
          onClick={cerrarContactar}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-taller-titulo"
        >
          <div
            className={`busqueda-talleres-modal ${mostrarMapaEnModal && tieneUbicacion(contactarTaller) ? 'busqueda-talleres-modal-con-mapa' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="modal-taller-titulo" className="busqueda-talleres-modal-titulo">
              Datos del taller
            </h3>
            <div className="busqueda-talleres-modal-datos">
              <p className="busqueda-talleres-modal-linea">
                <span className="busqueda-talleres-modal-etiqueta">Nombre</span>{' '}
                {nombreTaller(contactarTaller)}
              </p>
              <p className="busqueda-talleres-modal-linea">
                <span className="busqueda-talleres-modal-etiqueta">Especialidad</span>{' '}
                {contactarTaller.especialidad || '—'}
              </p>
              <p className="busqueda-talleres-modal-linea">
                <span className="busqueda-talleres-modal-etiqueta">Estado</span>{' '}
                {contactarTaller.estado || '—'}
              </p>
              <p className="busqueda-talleres-modal-linea">
                <span className="busqueda-talleres-modal-etiqueta">Ciudad</span>{' '}
                {contactarTaller.ciudad || '—'}
              </p>
              {contactarTaller.telefono && (
                <p className="busqueda-talleres-modal-linea">
                  <span className="busqueda-talleres-modal-etiqueta">Teléfono</span>{' '}
                  {contactarTaller.telefono}
                </p>
              )}
              {contactarTaller.email && (
                <p className="busqueda-talleres-modal-linea">
                  <span className="busqueda-talleres-modal-etiqueta">Correo electrónico</span>{' '}
                  {contactarTaller.email}
                </p>
              )}
              {contactarTaller.direccion && (
                <p className="busqueda-talleres-modal-linea">
                  <span className="busqueda-talleres-modal-etiqueta">Dirección</span>{' '}
                  {contactarTaller.direccion}
                </p>
              )}
            </div>
            <div className="busqueda-talleres-modal-botones">
              {contactarTaller.telefono && contactoWhatsApp(contactarTaller) && (
                <a
                  href={contactoWhatsApp(contactarTaller)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="busqueda-talleres-modal-whatsapp"
                >
                  Contactar por WhatsApp
                </a>
              )}
              {tieneUbicacion(contactarTaller) && (
                <button
                  type="button"
                  className="busqueda-talleres-card-btn"
                  onClick={() => setMostrarMapaEnModal((v) => !v)}
                >
                  {mostrarMapaEnModal ? 'Ocultar ubicación' : 'Ubicación'}
                </button>
              )}
              {tieneUbicacion(contactarTaller) && linkRutaGoogleMaps(contactarTaller) && (
                <a
                  href={linkRutaGoogleMaps(contactarTaller)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="busqueda-talleres-card-btn"
                >
                  Abrir en Google Maps para navegar
                </a>
              )}
              <button
                type="button"
                className="busqueda-talleres-modal-cerrar"
                onClick={cerrarContactar}
              >
                Cerrar
              </button>
            </div>
            {mostrarMapaEnModal && tieneUbicacion(contactarTaller) && (
              <div className="busqueda-talleres-modal-mapa">
                <h4 className="busqueda-talleres-modal-titulo-seccion">Ubicación</h4>
                <MapVendedorUbicacion
                  lat={contactarTaller.latitud!}
                  lng={contactarTaller.longitud!}
                  nombreVendedor={nombreTaller(contactarTaller)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
