import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { authEmailRedirectTo } from '../utils/authRedirect';
import { esCorreoAccesoInterno, mensajeErrorFuncion } from '../utils/correoAcceso';
import './PerfilUsuario.css';

type Respuesta = { ok?: boolean; error?: string; mensaje?: string };

/** El negocio cambia el acceso inventado por un correo que sí recibe mensajes. */
export function CambiarCorreoAcceso() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'ok' | 'error'>('idle');
  const [mensaje, setMensaje] = useState('');

  if (!user?.email) return null;
  const interno = esCorreoAccesoInterno(user.email);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEstado('enviando');
    setMensaje('');
    const { data, error } = await supabase.functions.invoke<Respuesta>('cambiar-correo-acceso', {
      body: { email: email.trim(), redirectTo: authEmailRedirectTo() },
    });
    if (error || data?.ok === false) {
      setEstado('error');
      setMensaje(await mensajeErrorFuncion(error, data));
      return;
    }
    setEstado('ok');
    setMensaje(data?.mensaje || 'Revisa ese correo y abre el enlace.');
    setEmail('');
  };

  return (
    <form onSubmit={(ev) => void enviar(ev)} className="perfil-usuario-form">
      <p className="dashboard-kpi-grid-hint">
        {interno
          ? 'Este acceso lo creó Geomotor y no recibe mensajes. Escribe tu correo. Te llega un enlace solo a esa bandeja. Al abrirlo, entras con ese correo y este usuario deja de servir.'
          : 'Para cambiar el correo con el que entras, escribe el nuevo. Te llega un enlace a esa bandeja.'}
      </p>
      <div className="perfil-usuario-grid">
        <div className="perfil-usuario-campo">
          <label htmlFor="cambiar-correo-acceso">Correo nuevo de acceso</label>
          <input
            id="cambiar-correo-acceso"
            type="email"
            value={email}
            autoComplete="email"
            disabled={estado === 'enviando'}
            onChange={(ev) => setEmail(ev.target.value)}
            required
          />
        </div>
      </div>
      <button type="submit" className="perfil-usuario-boton-secundario" disabled={estado === 'enviando' || !email.trim()}>
        {estado === 'enviando' ? 'Enviando...' : 'Enviar enlace a mi correo'}
      </button>
      {mensaje && (
        <p className={`perfil-usuario-mensaje ${estado === 'error' ? 'error' : estado === 'ok' ? 'ok' : ''}`}>{mensaje}</p>
      )}
    </form>
  );
}
