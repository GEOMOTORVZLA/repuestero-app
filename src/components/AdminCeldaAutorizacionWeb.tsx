function claseAprobacion(estado: string | null | undefined): 'ok' | 'pendiente' | 'rechazado' {
  const e = (estado ?? 'aprobado').toLowerCase();
  if (e === 'pendiente') return 'pendiente';
  if (e === 'rechazado') return 'rechazado';
  return 'ok';
}

function etiquetaAprobacion(estado: string | null | undefined): string {
  const e = (estado ?? 'aprobado').toLowerCase();
  if (e === 'pendiente') return 'Pendiente';
  if (e === 'rechazado') return 'Rechazado';
  return 'Aprobado';
}

function inicialAprobacion(estado: string | null | undefined): string {
  const e = (estado ?? 'aprobado').toLowerCase();
  if (e === 'pendiente') return 'P';
  if (e === 'rechazado') return 'R';
  return 'A';
}

type Props = {
  aprobacionEstado?: string | null;
  accionando: boolean;
  onAprobar: () => void;
  onRechazar: () => void;
  onPendiente: () => void;
};

export function AdminCeldaAutorizacionWeb({
  aprobacionEstado,
  accionando,
  onAprobar,
  onRechazar,
  onPendiente,
}: Props) {
  const ap = claseAprobacion(aprobacionEstado);
  const estado = (aprobacionEstado ?? 'aprobado').toLowerCase();

  return (
    <div className="dashboard-admin-autorizacion-fila">
      <span
        className={`dashboard-admin-status dashboard-admin-status--inicial ${
          ap === 'ok' ? 'ok' : ap === 'pendiente' ? 'pendiente' : 'rechazado'
        }`}
        title={etiquetaAprobacion(aprobacionEstado)}
      >
        {inicialAprobacion(aprobacionEstado)}
      </span>
      <div className="dashboard-admin-acciones-mini dashboard-admin-acciones-mini--inline">
        {estado !== 'aprobado' && (
          <button
            type="button"
            className="dashboard-admin-btn ok dashboard-admin-btn--inicial"
            disabled={accionando}
            title="Autorizar"
            aria-label="Autorizar"
            onClick={onAprobar}
          >
            A
          </button>
        )}
        {estado !== 'rechazado' && (
          <button
            type="button"
            className="dashboard-admin-btn danger dashboard-admin-btn--inicial"
            disabled={accionando}
            title="Rechazar"
            aria-label="Rechazar"
            onClick={onRechazar}
          >
            R
          </button>
        )}
        {estado === 'rechazado' && (
          <button
            type="button"
            className="dashboard-admin-btn warn dashboard-admin-btn--inicial"
            disabled={accionando}
            title="Marcar pendiente"
            aria-label="Marcar pendiente"
            onClick={onPendiente}
          >
            P
          </button>
        )}
      </div>
    </div>
  );
}
