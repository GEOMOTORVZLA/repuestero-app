/**
 * Categorías más buscadas — vertical moto.
 * Orden fijo (comercial / prioridad de listado). Debe alinearse con `productos.categoria`
 * cuando `vertical === 'moto'` y con la landing de repuestos para motos.
 */
export const CATEGORIAS_MOTO_MAS_BUSCADAS: readonly string[] = [
  'Frenos',
  'Transmisión',
  'Motor',
  'Cauchos y tripas',
  'Iluminación',
  'Manubrios y puños',
  'Asientos y Carrocería',
  'Maletas',
  'Cascos y Ropa',
  'Alarmas',
] as const;

/** Mismo conjunto para validación o selects; el orden es el de arriba. */
export const CATEGORIAS_PRODUCTO_MOTO: string[] = [...CATEGORIAS_MOTO_MAS_BUSCADAS];

/**
 * Pines de la landing /motos — archivos en `public/` (nombres con espacios/acentos OK).
 * Sube `?v=2` en la ruta en Landing si cambias un asset y el navegador cachea fuerte.
 */
export const IMAGEN_PIN_CATEGORIA_MOTO: Record<(typeof CATEGORIAS_MOTO_MAS_BUSCADAS)[number], string> = {
  Frenos: '/frenos.png',
  Transmisión: '/transmision.png',
  Motor: '/Motor.png',
  'Cauchos y tripas': '/Cauchos y tripas.png',
  Iluminación: '/Iluminación.png',
  'Manubrios y puños': '/manubrios y puños.png',
  'Asientos y Carrocería': '/asiento y carroceria.png',
  Maletas: '/maletas.png',
  'Cascos y Ropa': '/cascos y ropa.png',
  Alarmas: '/alarmas.png',
};

export function imagenPinCategoriaMoto(categoria: string): string | undefined {
  return IMAGEN_PIN_CATEGORIA_MOTO[categoria as keyof typeof IMAGEN_PIN_CATEGORIA_MOTO];
}
