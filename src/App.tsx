import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { Landing } from './components/Landing';
import { SelectorTipoRegistro } from './components/SelectorTipoRegistro';
import type { TipoRegistro } from './components/SelectorTipoRegistro';
import { FormRegistro } from './components/FormRegistro';
import { Dashboard } from './components/Dashboard';
import './App.css';

function App() {
  const { user, loading } = useAuth();
  const [mostrarAuth, setMostrarAuth] = useState(false);
  const [crearCuentaTipo, setCrearCuentaTipo] = useState<null | 'selector' | TipoRegistro>(null);

  if (loading) {
    return <p className="app-loading">Cargando...</p>;
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
            onVolver={() => {
              setMostrarAuth(false);
              setCrearCuentaTipo(null);
            }}
            onIrARegistro={() => setCrearCuentaTipo('selector')}
          />
        </div>
      );
    }
    return (
      <Landing
        onMostrarLogin={() => setMostrarAuth(true)}
        onMostrarCrearCuenta={() => {
          setMostrarAuth(true);
          setCrearCuentaTipo('selector');
        }}
      />
    );
  }

  return <Dashboard />;
}

export default App;
