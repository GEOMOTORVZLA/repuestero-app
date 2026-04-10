/**
 * Estados de cuenta alineados con el panel admin:
 * bloqueado, aprobacion_estado, membresia_hasta.
 */

export type EstadoCuentaNegocioInput = {
  bloqueado: boolean | null | undefined;
  aprobacion_estado: string | null | undefined;
  /** YYYY-MM-DD o ISO */
  membresia_hasta: string | null | undefined;
  /** Sin fila en BD aún (solo metadata / alta incompleta) */
  sinFilaEnBd?: boolean;
};

export type BannerEstadoCuenta = {
  titulo: string;
  variante: 'pausada' | 'revision' | 'rechazada' | 'activa';
  alertaMembresia: string | null;
  resumenMembresia: string | null;
};

function normApr(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

/** Igual que en DashboardAdmin: null/vacío se trata como aprobado. */
function aprobacionEfectiva(input: EstadoCuentaNegocioInput): string {
  if (input.sinFilaEnBd) return 'pendiente';
  const v = input.aprobacion_estado;
  if (v == null || String(v).trim() === '') return 'aprobado';
  return normApr(v);
}

/** Días calendario hasta la fecha de fin de membresía (hoy = 0 si vence hoy). */
export function diasHastaMembresia(membresia_hasta: string | null | undefined): number | null {
  if (membresia_hasta == null || String(membresia_hasta).trim() === '') return null;
  const s = String(membresia_hasta).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const fin = new Date(`${s}T12:00:00`);
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  return Math.round((fin.getTime() - hoy.getTime()) / (24 * 60 * 60 * 1000));
}

function fmtFechaVe(iso: string): string {
  const s = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return iso;
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function alertasMembresia(
  membresia_hasta: string | null | undefined
): { alerta: string | null; resumen: string | null } {
  const dias = diasHastaMembresia(membresia_hasta);
  if (dias == null) return { alerta: null, resumen: null };
  const fechaTxt = fmtFechaVe(String(membresia_hasta));

  if (dias < 0) {
    return {
      alerta:
        'TU MEMBRESÍA ESTÁ VENCIDA. RENUEVA CUANTO ANTES PARA EVITAR QUE SE PAUSEN TUS PUBLICACIONES.',
      resumen: null,
    };
  }
  if (dias <= 5) {
    const n = Math.max(0, dias);
    const alerta =
      n === 0
        ? 'TE QUEDAN 0 DÍAS PARA RENOVAR TU MEMBRESÍA O SERÁN PAUSADAS TUS PUBLICACIONES.'
        : n === 1
          ? 'TE QUEDA 1 DÍA PARA RENOVAR TU MEMBRESÍA O SERÁN PAUSADAS TUS PUBLICACIONES.'
          : `TE QUEDAN ${n} DÍAS PARA RENOVAR TU MEMBRESÍA O SERÁN PAUSADAS TUS PUBLICACIONES.`;
    return { alerta, resumen: null };
  }
  return {
    alerta: null,
    resumen: `Te quedan ${dias} días de membresía (vence el ${fechaTxt}).`,
  };
}

/**
 * Prioridad: bloqueo, revisión, rechazo, activa (con avisos de membresía).
 */
export function bannerEstadoCuentaNegocio(input: EstadoCuentaNegocioInput): BannerEstadoCuenta {
  const bloqueado = input.bloqueado === true;
  const apr = aprobacionEfectiva(input);

  if (bloqueado) {
    return {
      titulo: 'CUENTA PAUSADA POR FALTA DE PAGO',
      variante: 'pausada',
      alertaMembresia: null,
      resumenMembresia: null,
    };
  }

  if (apr === 'pendiente') {
    return {
      titulo: 'CUENTA EN REVISION DE APROBACION',
      variante: 'revision',
      alertaMembresia: null,
      resumenMembresia: null,
    };
  }

  if (apr === 'rechazado') {
    return {
      titulo: 'CUENTA NO AUTORIZADA PARA LA WEB',
      variante: 'rechazada',
      alertaMembresia: null,
      resumenMembresia: null,
    };
  }

  const { alerta, resumen } = alertasMembresia(input.membresia_hasta);
  return {
    titulo: 'CUENTA ACTIVA',
    variante: 'activa',
    alertaMembresia: alerta,
    resumenMembresia: resumen,
  };
}