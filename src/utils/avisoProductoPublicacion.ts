/** Codigos guardados en productos.disponibilidad_aviso */
export type DisponibilidadAviso = 'unica' | 'pocas' | 'muchas';

export const DISPONIBILIDAD_AVISO_OPCIONES: ReadonlyArray<{
  value: DisponibilidadAviso;
  label: string;
}> = [
  { value: 'unica', label: 'ÚNICA DISPONIBLE' },
  { value: 'pocas', label: 'POCAS PIEZAS DISPONIBLES' },
  { value: 'muchas', label: 'MUCHAS DISPONIBLES' },
];

export function esDisponibilidadAviso(v: unknown): v is DisponibilidadAviso {
  return v === 'unica' || v === 'pocas' || v === 'muchas';
}

export function etiquetaDisponibilidadAviso(
  v: string | null | undefined
): string | null {
  if (!esDisponibilidadAviso(v)) return null;
  return DISPONIBILIDAD_AVISO_OPCIONES.find((o) => o.value === v)?.label ?? null;
}