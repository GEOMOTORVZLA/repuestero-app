/**
 * Mapeo de categorías a palabras clave para buscar repuestos.
 * Hace match con nombre y descripción de productos registrados por vendedores.
 */
export const CATEGORIAS_KEYWORDS: Record<string, string[]> = {
  'Filtros': ['filtro', 'filter'],
  'Frenos': ['freno', 'pastilla', 'disco', 'brake', 'caliper', 'zapata'],
  'Baterías': ['bateria', 'batería', 'battery'],
  'Cauchos': ['caucho', 'llanta', 'neumatico', 'neumático', 'goma', 'tire'],
  'Amortiguadores y suspensiones': ['amortiguador', 'suspension', 'suspensión', 'suspensiones', 'resorte', 'ballesta'],
  'Correas y bandas': ['correa', 'banda', 'distribución', 'distribucion', 'tensor', 'timing'],
  'Bujías y encendido': ['bujía', 'bujia', 'encendido', 'spark', 'bobina'],
  'Aceites y lubricantes': ['aceite', 'lubricante', 'oil', 'grasa'],
  'Luces y faros': ['luz', 'faros', 'faro', 'bombillo', 'led', 'halogena', 'halógena'],
  'Embrague': ['embrague', 'clutch', 'disco embrague'],
  'Autosonido': ['estéreo', 'estereo', 'radio', 'parlante', 'bocina', 'amplificador', 'subwoofer'],
  'Accesorios': ['accesorio', 'funda', 'cubre', 'alfombrilla', 'tapete', 'portavasos', 'bomba'],
};
