/**
 * Estados y ciudades/municipios de Venezuela para filtrar vendedores por ubicación.
 * Listas predeterminadas para la sección "Repuestos cerca de mi zona".
 */
export const ESTADOS_VENEZUELA = [
  'Distrito Capital',
  'Amazonas',
  'Anzoátegui',
  'Apure',
  'Aragua',
  'Barinas',
  'Bolívar',
  'Carabobo',
  'Cojedes',
  'Delta Amacuro',
  'Falcón',
  'Guárico',
  'La Guaira',
  'Lara',
  'Mérida',
  'Miranda',
  'Monagas',
  'Nueva Esparta',
  'Portuguesa',
  'Sucre',
  'Táchira',
  'Trujillo',
  'Yaracuy',
  'Zulia',
] as const;

/** Ciudades/municipios por estado (capitales y principales localidades) */
export const CIUDADES_POR_ESTADO: Record<string, string[]> = {
  'Distrito Capital': ['Libertador', 'Caracas'],
  Amazonas: ['Puerto Ayacucho', 'San Carlos de Río Negro', 'Maroa', 'San Juan de Manapiare', 'Isla Ratón', 'San Fernando de Atabapo', 'La Esmeralda'],
  Anzoátegui: ['Barcelona', 'Puerto La Cruz', 'Lechería', 'El Tigre', 'Anaco', 'Cantaura', 'Pariaguán', 'Guanta', 'Píritu', 'Aragua de Barcelona', 'Clarines', 'San José de Guanipa'],
  Apure: ['San Fernando de Apure', 'Elorza', 'Guasdualito', 'Biruaca', 'Achaguas', 'San Juan de Payara'],
  Aragua: ['Maracay', 'Turmero', 'La Victoria', 'Cagua', 'Villa de Cura', 'El Limón', 'Palo Negro', 'Las Tejerías', 'El Consejo', 'Ocumare de la Costa', 'Colonia Tovar', 'San Mateo', 'Santa Cruz de Aragua'],
  Barinas: ['Barinas', 'Socopó', 'Barinitas', 'Santa Bárbara', 'Sabaneta', 'Ciudad Bolivia', 'Nutrias'],
  Bolívar: ['Ciudad Guayana', 'Ciudad Bolívar', 'Upata', 'Santa Elena de Uairén', 'El Callao', 'El Dorado', 'Caicara del Orinoco', 'Guasipati', 'Maripa'],
  Carabobo: ['Valencia', 'Puerto Cabello', 'Guacara', 'Naguanagua', 'Los Guayos', 'Mariara', 'San Diego', 'Tocuyito', 'Morón', 'Bejuma', 'Güigüe'],
  Cojedes: ['San Carlos', 'Tinaquillo', 'Tinaco', 'El Baúl'],
  'Delta Amacuro': ['Tucupita', 'Pedernales', 'Curiapo'],
  Falcón: ['Coro', 'Punto Fijo', 'La Vela de Coro', 'Chichiriviche', 'Tucacas', 'Dabajuro', 'Churuguara', 'Puerto Cumarebo', 'San Juan de los Cayos'],
  Guárico: ['San Juan de los Morros', 'Calabozo', 'Valle de La Pascua', 'Altagracia de Orituco', 'Zaraza', 'Ortiz', 'Camaguán', 'El Sombrero'],
  'La Guaira': ['La Guaira', 'Catia La Mar', 'Maiquetía', 'Caraballeda', 'Macuto'],
  Lara: ['Barquisimeto', 'Carora', 'Cabudare', 'El Tocuyo', 'Quíbor', 'Duaca', 'Sarare', 'Sanare'],
  Mérida: ['Mérida', 'El Vigía', 'Tovar', 'Ejido', 'Lagunillas', 'Santo Domingo', 'Bailadores', 'Tucaní', 'La Azulita'],
  Miranda: ['Los Teques', 'Guatire', 'Guarenas', 'Petare', 'Ocumare del Tuy', 'Santa Teresa del Tuy', 'Charallave', 'Cúa', 'Higuerote', 'Caucagua', 'Baruta', 'Chacao', 'El Hatillo', 'San Antonio de los Altos'],
  Monagas: ['Maturín', 'Punta de Mata', 'Caripito', 'Caripe', 'Temblador', 'Barrancas del Orinoco', 'Quiriquire', 'Aragua de Maturín'],
  'Nueva Esparta': ['Porlamar', 'La Asunción', 'Juan Griego', 'Pampatar', 'Santa Ana', 'El Valle del Espíritu Santo', 'San Juan Bautista'],
  Portuguesa: ['Guanare', 'Acarigua', 'Araure', 'Guanarito', 'Ospino', 'Villa Bruzual', 'Biscucuy'],
  Sucre: ['Cumaná', 'Carúpano', 'Güiria', 'Cariaco', 'Cumanacoa', 'Río Caribe', 'Yaguaraparo', 'Irapa'],
  Táchira: ['San Cristóbal', 'Rubio', 'La Grita', 'Táriba', 'Ureña', 'Colón', 'Palmira', 'Capacho Nuevo', 'Michelena', 'La Fría', 'Santa Ana del Táchira', 'San Antonio del Táchira'],
  Trujillo: ['Valera', 'Trujillo', 'Boconó', 'Betijoque', 'Motatán', 'Escuque', 'Pampán', 'Carache', 'Sabana de Mendoza'],
  Yaracuy: ['San Felipe', 'Chivacoa', 'Yaritagua', 'Nirgua', 'Cocorote', 'Guama', 'Aroa'],
  Zulia: ['Maracaibo', 'Cabimas', 'Ciudad Ojeda', 'Santa Rita', 'San Francisco', 'Machiques', 'La Villa del Rosario', 'Encontrados', 'Sinamaica', 'Bachaquero', 'San Carlos del Zulia'],
};

/** Obtener ciudades de un estado */
export function getCiudadesPorEstado(estado: string): string[] {
  return CIUDADES_POR_ESTADO[estado] ?? [];
}
