export type TipoGruaId = 'plataforma' | 'tiro_gancho' | 'motos' | 'pesada';

export type TipoGrua = {
  id: TipoGruaId;
  nombre: string;
  descripcion: string;
};

/** Catálogo operativo de grúas (Venezuela). No mezclar con especialidades de taller. */
export const TIPOS_GRUA: readonly TipoGrua[] = [
  {
    id: 'plataforma',
    nombre: 'Plataforma (cama baja)',
    descripcion: 'Carros, camionetas, 4x4 y cajas automáticas. El vehículo no debe rodar arrastrado.',
  },
  {
    id: 'tiro_gancho',
    nombre: 'Gancho / tiro',
    descripcion: 'Arrastre tradicional para vehículos manuales y rústicos en tramos cortos.',
  },
  {
    id: 'motos',
    nombre: 'Especial para motos',
    descripcion: 'Traslado con amarres para motos, triciclos y motocarros.',
  },
  {
    id: 'pesada',
    nombre: 'Pesada (camiones y gandolas)',
    descripcion: 'Camiones, autobuses, gandolas y rescate de carga pesada.',
  },
] as const;

export function nombreTipoGrua(id: string): string {
  return TIPOS_GRUA.find((t) => t.id === id)?.nombre ?? id;
}
