/** Tiendas internas para mostrar un catálogo antes de registrar al vendedor. */
export const RIF_VITRINA_AUTO = 'VITRINA-AUTO';
export const RIF_VITRINA_MOTO = 'VITRINA-MOTO';
export const EMAIL_VITRINA_SUFIJO = '@interno.geomotor';

export function esTiendaVitrina(rif: string | null | undefined): boolean {
  const valor = (rif ?? '').trim().toUpperCase();
  return valor === RIF_VITRINA_AUTO || valor === RIF_VITRINA_MOTO;
}

export function rifVitrina(vertical: 'auto' | 'moto'): string {
  return vertical === 'moto' ? RIF_VITRINA_MOTO : RIF_VITRINA_AUTO;
}

export function esUsuarioVitrina(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase().endsWith(EMAIL_VITRINA_SUFIJO);
}

/** Una vitrina sin nombre de visita no debe aparecer en el visor. */
export function vitrinaMuestraVisita(t: {
  rif?: string | null;
  nombre?: string | null;
  nombre_comercial?: string | null;
}): boolean {
  if (!esTiendaVitrina(t.rif)) return true;
  const nombre = (t.nombre_comercial ?? '').trim() || (t.nombre ?? '').trim();
  return nombre.length >= 2;
}
