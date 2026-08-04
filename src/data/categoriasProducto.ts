export const CATEGORIAS_PRODUCTO: string[] = [
  // Categorías actuales de repuestos/accesorios
  'Filtros',
  'Frenos',
  'Baterías',
  'Cauchos y rines',
  'Amortiguadores y suspensiones',
  'Correas y bandas',
  'Bujías y encendido',
  'Aceites y lubricantes',
  'Luces y faros',
  'Embrague',
  'Aire acondicionado Automotriz',
  'Tren Delantero',
  'Transmisiones',
  'Autosonido',
  'Accesorios',
  'Carrocería',
  'Motores y componentes',
  // Categorías adicionales de productos (no usadas en "Categorías más buscadas" por ahora)
  'Sensores automotrices',
  'Conectores',
  'Vidrios',
  'Motores a diesel y componentes',
  'Cajas y componentes',
  'Componentes de tapicería',
  'Componentes de puertas',
  'Otros',
];

/** Nombre anterior → actual (productos ya publicados siguen con el label viejo en BD). */
export const ALIAS_CATEGORIA_PRODUCTO: Record<string, string[]> = {
  'Cauchos y rines': ['Cauchos y rines', 'Cauchos'],
};

/** Valores de `categoria` a consultar en BD para un pin/filtro de categoría. */
export function categoriasEquivalentesConsulta(categoria: string): string[] {
  const aliases = ALIAS_CATEGORIA_PRODUCTO[categoria];
  if (aliases?.length) return aliases;
  return [categoria];
}
