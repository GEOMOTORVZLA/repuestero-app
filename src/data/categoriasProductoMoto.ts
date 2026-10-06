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
  'Amortiguadores',
  'Bastones',
  'Componentes eléctricos',
  'Accesorios',
] as const;

/** Mismo conjunto para validación o selects; el orden es el de arriba. */
export const CATEGORIAS_PRODUCTO_MOTO: string[] = [...CATEGORIAS_MOTO_MAS_BUSCADAS];

/**
 * Pines de la landing /motos — archivos en `public/` (nombres con espacios/acentos OK).
 * Sube `?v=2` en la ruta en Landing si cambias un asset y el navegador cachea fuerte.
 */
export const IMAGEN_PIN_CATEGORIA_MOTO: Record<(typeof CATEGORIAS_MOTO_MAS_BUSCADAS)[number], string> = {
  Frenos: '/frenos.webp?v=1',
  Transmisión: '/transmision.webp?v=1',
  Motor: '/Motor.webp?v=1',
  'Cauchos y tripas': '/Cauchos y tripas.webp?v=1',
  Iluminación: '/Iluminación.webp?v=1',
  'Manubrios y puños': '/manubrios y puños.webp?v=1',
  'Asientos y Carrocería': '/asiento y carroceria.webp?v=1',
  Maletas: '/maletas.webp?v=1',
  'Cascos y Ropa': '/cascos y ropa.webp?v=1',
  Alarmas: '/alarmas.webp?v=1',
  Amortiguadores: '/amortiguadores.webp?v=1',
  Bastones: '/bastones.webp?v=1',
  'Componentes eléctricos': '/componentes electricos.webp?v=1',
  Accesorios: '/accesorios moto.webp?v=1',
};

export function imagenPinCategoriaMoto(categoria: string): string | undefined {
  return IMAGEN_PIN_CATEGORIA_MOTO[categoria as keyof typeof IMAGEN_PIN_CATEGORIA_MOTO];
}
