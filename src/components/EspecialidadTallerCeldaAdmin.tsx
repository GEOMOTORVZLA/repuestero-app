import { resumenEspecialidadTallerAdmin } from '../utils/tallerEspecialidades';

type Props = {
  especialidad: unknown;
  onVerDetalle: (items: string[]) => void;
};

export function EspecialidadTallerCeldaAdmin({ especialidad, onVerDetalle }: Props) {
  const { items, linea, tieneDetalle } = resumenEspecialidadTallerAdmin(especialidad);

  if (!tieneDetalle) {
    return <span className="dashboard-admin-especialidad-vacio">—</span>;
  }

  return (
    <button
      type="button"
      className="dashboard-admin-especialidad-resumen"
      onClick={() => onVerDetalle(items)}
      title="Ver todas las especialidades"
      aria-label={`Especialidades: ${linea}. Pulsa para ver el listado completo.`}
    >
      {linea}
    </button>
  );
}
