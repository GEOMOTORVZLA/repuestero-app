/** Vertical de negocio: repuestos automóvil vs motocicleta. */
export type VerticalVehiculo = 'auto' | 'moto';

export const VERTICAL_AUTO: VerticalVehiculo = 'auto';
export const VERTICAL_MOTO: VerticalVehiculo = 'moto';

export function verticalDesdePathname(pathname: string): VerticalVehiculo {
  const p = pathname.trim().toLowerCase();
  if (p === '/motos' || p.startsWith('/motos/')) return VERTICAL_MOTO;
  return VERTICAL_AUTO;
}

export function rutaInicioVertical(v: VerticalVehiculo): string {
  return v === 'moto' ? '/motos' : '/';
}
