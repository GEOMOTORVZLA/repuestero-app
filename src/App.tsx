import { useState, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { Landing } from './components/Landing';
import { SelectorTipoRegistro } from './components/SelectorTipoRegistro';
import type { TipoRegistro } from './components/SelectorTipoRegistro';
import { FormRegistro } from './components/FormRegistro';
import { Dashboard } from './components/Dashboard';
import { verticalDesdePathname, rutaInicioVertical } from './utils/verticalVehiculo';
import { leerYConsumirMensajeAuthFlash } from './services/ensureNegocioTrasRegistro';
import './App.css';

function AppShell() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const vertical = verticalDesdePathname(location.pathname);

  const [mostrarAuth, setMostrarAuth] = useState(false);
  const [crearCuentaTipo, setCrearCuentaTipo] = useState<null | 'selector' | TipoRegistro>(null);
  const [mostrarPanel, setMostrarPanel] = useState(false);
  const [authMensajeInicial, setAuthMensajeInicial] = useState<string | null>(null);

  useEffect(() => {
    if (!user) setMostrarPanel(false);
  }, [user]);

  useEffect(() => {
    if (loading || user) return;
    const flash = leerYConsumirMensajeAuthFlash();
    if (flash) {
      setAuthMensajeInicial(flash);
      setMostrarAuth(true);
      setCrearCuentaTipo(null);
    }
  }, [loading, user]);

  const irAlInicioVertical = () => {
    navigate(rutaInicioVertical(vertical));
  };

  if (loading) {
    return <p className="app-loading">Cargando...</p>;
  }

  if (user) {
    if (mostrarPanel) {
      return (
        <Dashboard
          vertical={vertical}
          onVolverInicio={() => {
            setMostrarPanel(false);
            irAlInicioVertical();
          }}
        />
      );
    }
    return (
      <Landing
        vertical={vertical}
        sessionUser={user}
        onIrAPanel={() => setMostrarPanel(true)}
      />
    );
  }

  if (!user) {
    if (mostrarAuth) {
      if (crearCuentaTipo === 'selector') {
        return (
          <div className="app">
            <SelectorTipoRegistro
              onVolver={() => {
                setMostrarAuth(false);
                setCrearCuentaTipo(null);
              }}
              onIrALogin={() => setCrearCuentaTipo(null)}
              onSeleccionar={(tipo) => setCrearCuentaTipo(tipo)}
            />
          </div>
        );
      }
      if (crearCuentaTipo === 'vendedor' || crearCuentaTipo === 'usuario' || crearCuentaTipo === 'taller') {
        return (
          <div className="app">
            <FormRegistro
              tipo={crearCuentaTipo}
              onVolver={() => setCrearCuentaTipo('selector')}
              onExito={() => setCrearCuentaTipo(null)}
            />
          </div>
        );
      }
      return (
        <div className="app">
          <Auth
            mensajeInicialError={authMensajeInicial}
            onVolver={() => {
              setMostrarAuth(false);
              setCrearCuentaTipo(null);
              setAuthMensajeInicial(null);
            }}
            onIrARegistro={() => setCrearCuentaTipo('selector')}
          />
        </div>
      );
    }
    return (
      <Landing
        vertical={vertical}
        onMostrarLogin={() => {
          setAuthMensajeInicial(null);
          setMostrarAuth(true);
        }}
        onMostrarCrearCuenta={() => {
          setAuthMensajeInicial(null);
          setMostrarAuth(true);
          setCrearCuentaTipo('selector');
        }}
      />
    );
  }

  return null;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />} />
      <Route path="/motos" element={<AppShell />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
