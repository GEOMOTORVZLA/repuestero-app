import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { Landing } from './components/Landing';
import { SelectorTipoRegistro } from './components/SelectorTipoRegistro';
import type { TipoRegistro } from './components/SelectorTipoRegistro';
import { FormRegistro } from './components/FormRegistro';
import { PoliticaDivulgacionDatos } from './components/PoliticaDivulgacionDatos';
import { Dashboard } from './components/Dashboard';
import { verticalDesdePathname, rutaInicioVertical } from './utils/verticalVehiculo';
import { leerYConsumirMensajeAuthFlash } from './services/ensureNegocioTrasRegistro';
import './App.css';

function esElementoVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function cerrarDialogoActivo(): boolean {
  const dialogos = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
    .filter(esElementoVisible);
  const dialogo = dialogos.at(-1);
  if (!dialogo) return false;

  const botones = Array.from(dialogo.querySelectorAll<HTMLButtonElement>('button'));
  const botonCerrar = botones.find((btn) => {
    const texto = btn.textContent?.trim().toLocaleLowerCase() ?? '';
    const aria = btn.getAttribute('aria-label')?.toLocaleLowerCase() ?? '';
    return aria.includes('cerrar') || texto === 'cerrar' || texto === 'volver' || texto === '×';
  });

  if (botonCerrar) {
    botonCerrar.click();
    return true;
  }

  dialogo.click();
  return true;
}

function AppShell() {
  const { user, loading, passwordRecovery, clearPasswordRecovery } = useAuth();
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

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeListener: (() => void) | undefined;
    void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (cerrarDialogoActivo()) return;

      if (passwordRecovery) {
        clearPasswordRecovery();
        setMostrarAuth(false);
        setCrearCuentaTipo(null);
        return;
      }

      if (user && mostrarPanel) {
        setMostrarPanel(false);
        irAlInicioVertical();
        return;
      }

      if (!user) {
        if (crearCuentaTipo === 'vendedor' || crearCuentaTipo === 'usuario' || crearCuentaTipo === 'taller') {
          setCrearCuentaTipo('selector');
          return;
        }

        if (crearCuentaTipo === 'selector') {
          setCrearCuentaTipo(null);
          setMostrarAuth(false);
          return;
        }

        if (mostrarAuth) {
          setMostrarAuth(false);
          setAuthMensajeInicial(null);
          return;
        }
      }

      const rutaInicio = rutaInicioVertical(vertical);
      if (location.pathname !== rutaInicio) {
        if (canGoBack) navigate(-1);
        else navigate(rutaInicio);
        return;
      }

      void CapacitorApp.exitApp();
    }).then((handle) => {
      removeListener = () => handle.remove();
    });

    return () => {
      removeListener?.();
    };
  }, [
    clearPasswordRecovery,
    crearCuentaTipo,
    location.pathname,
    mostrarAuth,
    mostrarPanel,
    navigate,
    passwordRecovery,
    user,
    vertical,
  ]);

  const irAlInicioVertical = () => {
    navigate(rutaInicioVertical(vertical));
  };

  if (loading) {
    return <p className="app-loading">Cargando...</p>;
  }

  if (passwordRecovery) {
    return (
      <div className="app">
        <Auth
          restablecerPassword
          onVolver={() => {
            clearPasswordRecovery();
            setMostrarAuth(false);
            setCrearCuentaTipo(null);
          }}
        />
      </div>
    );
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
  useEffect(() => {
    document.title = 'Geomotor';
  }, []);

  return (
    <Routes>
      <Route path="/" element={<AppShell />} />
      <Route path="/motos" element={<AppShell />} />
      <Route path="/legal/politica-divulgacion-datos" element={<PoliticaDivulgacionDatos />} />
      <Route path="/motos/legal/politica-divulgacion-datos" element={<PoliticaDivulgacionDatos />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
