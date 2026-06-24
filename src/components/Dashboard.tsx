import { useAuth } from '../contexts/AuthContext';
import { useDashboardPanelTipo } from '../hooks/useDashboardPanelTipo';
import { DashboardAdmin } from './DashboardAdmin';
import { DashboardComprador } from './DashboardComprador';
import { DashboardVendedor } from './DashboardVendedor';
import { DashboardTaller } from './DashboardTaller';
import type { VerticalVehiculo } from '../utils/verticalVehiculo';
import { VERTICAL_AUTO } from '../utils/verticalVehiculo';
import './Dashboard.css';

interface DashboardProps {
  /** Vuelve a la página principal (landing) sin cerrar sesión */
  onVolverInicio?: () => void;
  /** Vertical desde la URL (/ vs /motos) para registrar/importar productos */
  vertical?: VerticalVehiculo;
}

export function Dashboard({ onVolverInicio, vertical = VERTICAL_AUTO }: DashboardProps) {
  const { user } = useAuth();
  const panelTipo = useDashboardPanelTipo(user);

  if (panelTipo === 'loading') {
    return <p className="app-loading">Cargando panel…</p>;
  }

  if (panelTipo === 'comprador') {
    return <DashboardComprador onVolverInicio={onVolverInicio} />;
  }

  if (panelTipo === 'admin') {
    return <DashboardAdmin vertical={vertical} onVolverInicio={onVolverInicio} />;
  }

  if (panelTipo === 'taller') {
    return <DashboardTaller onVolverInicio={onVolverInicio} />;
  }

  return <DashboardVendedor onVolverInicio={onVolverInicio} vertical={vertical} />;
}
