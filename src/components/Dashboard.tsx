import { lazy, Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDashboardPanelTipo } from '../hooks/useDashboardPanelTipo';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO } from '../utils/verticalVehiculo';
import './Dashboard.css';

const DashboardAdmin = lazy(() =>
  import('./DashboardAdmin').then((m) => ({ default: m.DashboardAdmin }))
);
const DashboardComprador = lazy(() =>
  import('./DashboardComprador').then((m) => ({ default: m.DashboardComprador }))
);
const DashboardVendedor = lazy(() =>
  import('./DashboardVendedor').then((m) => ({ default: m.DashboardVendedor }))
);
const DashboardTaller = lazy(() =>
  import('./DashboardTaller').then((m) => ({ default: m.DashboardTaller }))
);

interface DashboardProps {
  /** Vuelve a la página principal (landing) sin cerrar sesión */
  onVolverInicio?: () => void;
  /** Vertical desde la URL (/ vs /motos) para registrar/importar productos */
  vertical?: VerticalVehiculo;
}

function PanelFallback() {
  return <p className="app-loading">Cargando panel…</p>;
}

export function Dashboard({ onVolverInicio, vertical = VERTICAL_AUTO }: DashboardProps) {
  const { user } = useAuth();
  const panelTipo = useDashboardPanelTipo(user);

  if (panelTipo === 'loading') {
    return <PanelFallback />;
  }

  return (
    <Suspense fallback={<PanelFallback />}>
      {panelTipo === 'comprador' ? (
        <DashboardComprador onVolverInicio={onVolverInicio} />
      ) : panelTipo === 'admin' ? (
        <DashboardAdmin vertical={vertical} onVolverInicio={onVolverInicio} />
      ) : panelTipo === 'taller' ? (
        <DashboardTaller onVolverInicio={onVolverInicio} />
      ) : (
        <DashboardVendedor onVolverInicio={onVolverInicio} vertical={vertical} />
      )}
    </Suspense>
  );
}
