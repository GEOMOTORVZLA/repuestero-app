/**
 * Datos preseleccionados para formularios de registro (Venezuela):
 * tipos RIF, códigos de área y compañías de teléfono, especialidades de taller.
 */

/** Tipos de RIF en Venezuela */
export const TIPOS_RIF = ['J', 'G', 'P', 'V', 'E'] as const;
// J: jurídico, G: gobierno, P: pasaportes, V: venezolano, E: extranjero

/** Códigos de área y operadoras móviles Venezuela (preseleccionados) */
export const CODIGOS_TELEFONO = [
  { codigo: '0412', compania: 'Digitel' },
  { codigo: '0422', compania: 'Digitel' },
  { codigo: '0414', compania: 'Movistar' },
  { codigo: '0416', compania: 'Movilnet' },
  { codigo: '0424', compania: 'Movistar' },
  { codigo: '0426', compania: 'Movilnet' },
] as const;

/** Códigos de área fijos (principales ciudades) */
export const CODIGOS_AREA_FIJO = [
  { codigo: '0212', ciudad: 'Caracas' },
  { codigo: '0241', ciudad: 'Valencia' },
  { codigo: '0261', ciudad: 'Maracaibo' },
  { codigo: '0251', ciudad: 'Barquisimeto' },
  { codigo: '0243', ciudad: 'Maracay' },
  { codigo: '0281', ciudad: 'Barcelona' },
  { codigo: '0291', ciudad: 'Maturín' },
  { codigo: '0276', ciudad: 'San Cristóbal' },
  { codigo: '0242', ciudad: 'Puerto Cabello' },
  { codigo: '0287', ciudad: 'Ciudad Guayana' },
] as const;

/** Especialidades del taller (para registro Talleres) */
export const ESPECIALIDADES_TALLER = [
  'Mecánica Ligera',
  'Mecánica Pesada',
  'Frenos',
  'Inyección',
  'Latonería y Pintura',
  'Reparación de Cajas AT/Sinc',
  'Electroauto',
  'Suspensiones',
  'Cajetines de dirección',
  'Personalización',
  'Camiones',
  'Tapicería automotriz',
  'Aire acondicionado',
] as const;
