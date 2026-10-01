import { categoriasEquivalentesConsulta } from './categoriasProducto';

/** Ficha de pieza (id estable). No es `productos.categoria`. */
export type PiezaGuiaAuto = {
  id: string;
  etiqueta: string;
  categoriaGeomotor: string;
  alias: string[];
  top15: boolean;
};

export type SugerenciaPiezaGuia = {
  piezaId: string;
  prioridad: 1 | 2 | 3;
};

export const PIEZAS_GUIA_AUTO: PiezaGuiaAuto[] = [
  {
    id: 'pastillas_freno',
    etiqueta: 'Pastillas de freno',
    categoriaGeomotor: 'Frenos',
    alias: ['pastilla', 'pastillas', 'pads', 'balata', 'balatas'],
    top15: true,
  },
  {
    id: 'filtro_aceite',
    etiqueta: 'Filtro de aceite',
    categoriaGeomotor: 'Filtros',
    alias: ['filtro de aceite', 'filtro aceite'],
    top15: true,
  },
  {
    id: 'filtro_aire',
    etiqueta: 'Filtro de aire de motor',
    categoriaGeomotor: 'Filtros',
    alias: ['filtro de aire', 'filtro aire', 'filtro motor'],
    top15: true,
  },
  {
    id: 'bujias',
    etiqueta: 'Bujías de encendido',
    categoriaGeomotor: 'Bujías y encendido',
    alias: ['bujia', 'bujias', 'spark'],
    top15: true,
  },
  {
    id: 'pila_gasolina',
    etiqueta: 'Filtro de gasolina / pila',
    categoriaGeomotor: 'Filtros',
    alias: ['pila de gasolina', 'pila gasolina', 'bomba de gasolina', 'filtro de gasolina', 'filtro gasolina'],
    top15: true,
  },
  {
    id: 'amortiguadores',
    etiqueta: 'Amortiguadores',
    categoriaGeomotor: 'Amortiguadores y suspensiones',
    alias: ['amortiguador', 'amortiguadores', 'gaba', 'strut'],
    top15: true,
  },
  {
    id: 'munones_rotulas',
    etiqueta: 'Muñones / rótulas',
    categoriaGeomotor: 'Tren Delantero',
    alias: ['munon', 'muñon', 'rotula', 'rótula', 'rotulas', 'ball joint'],
    top15: true,
  },
  {
    id: 'terminales_direccion',
    etiqueta: 'Terminales de dirección y axiales',
    categoriaGeomotor: 'Tren Delantero',
    alias: ['terminal', 'terminales', 'axial', 'axiales', 'direccion'],
    top15: true,
  },
  {
    id: 'bujes_meseta',
    etiqueta: 'Bujes de meseta',
    categoriaGeomotor: 'Tren Delantero',
    alias: ['buje', 'bujes', 'meseta', 'tijera'],
    top15: true,
  },
  {
    id: 'bomba_agua',
    etiqueta: 'Bomba de agua',
    categoriaGeomotor: 'Motores y componentes',
    alias: ['bomba de agua', 'bomba agua', 'water pump'],
    top15: true,
  },
  {
    id: 'kit_tiempo',
    etiqueta: 'Kit de correa / cadena de tiempo',
    categoriaGeomotor: 'Correas y bandas',
    alias: ['kit de tiempo', 'correa de tiempo', 'cadena de tiempo', 'timing'],
    top15: true,
  },
  {
    id: 'correa_unica',
    etiqueta: 'Correa única / accesorios',
    categoriaGeomotor: 'Correas y bandas',
    alias: ['correa unica', 'correa única', 'multi rib', 'alternador', 'accesorios'],
    top15: true,
  },
  {
    id: 'termostato',
    etiqueta: 'Termostato y tomas de agua',
    categoriaGeomotor: 'Motores y componentes',
    alias: ['termostato', 'toma de agua', 'tomas de agua'],
    top15: true,
  },
  {
    id: 'bobinas_encendido',
    etiqueta: 'Bobinas de encendido',
    categoriaGeomotor: 'Bujías y encendido',
    alias: ['bobina', 'bobinas', 'coil'],
    top15: true,
  },
  {
    id: 'rodamientos_rueda',
    etiqueta: 'Rodamientos de rueda',
    categoriaGeomotor: 'Tren Delantero',
    alias: ['rodamiento', 'rodamientos', 'mozo', 'ruleman'],
    top15: true,
  },
  {
    id: 'discos_freno',
    etiqueta: 'Discos de freno',
    categoriaGeomotor: 'Frenos',
    alias: ['disco', 'discos', 'rotor'],
    top15: false,
  },
  {
    id: 'liquido_frenos',
    etiqueta: 'Líquido de frenos',
    categoriaGeomotor: 'Frenos',
    alias: ['liquido de freno', 'líquido de freno', 'dot3', 'dot4', 'dot 4'],
    top15: false,
  },
  {
    id: 'kit_caliper',
    etiqueta: 'Kit de pistón / caliper',
    categoriaGeomotor: 'Frenos',
    alias: ['caliper', 'calipers', 'piston de freno', 'pistón'],
    top15: false,
  },
  {
    id: 'mangueras_freno',
    etiqueta: 'Mangueras flexibles de freno',
    categoriaGeomotor: 'Frenos',
    alias: ['manguera de freno', 'mangueras de freno', 'flexible de freno'],
    top15: false,
  },
  {
    id: 'bandas_freno',
    etiqueta: 'Bandas / zapatas de freno',
    categoriaGeomotor: 'Frenos',
    alias: ['banda de freno', 'bandas de freno', 'zapata', 'zapatas'],
    top15: false,
  },
  {
    id: 'tambores_freno',
    etiqueta: 'Tambores de freno',
    categoriaGeomotor: 'Frenos',
    alias: ['tambor', 'tambores'],
    top15: false,
  },
  {
    id: 'cilindros_rueda',
    etiqueta: 'Cilindros de rueda',
    categoriaGeomotor: 'Frenos',
    alias: ['cilindro de rueda', 'cilindros de rueda'],
    top15: false,
  },
  {
    id: 'herrajes_freno',
    etiqueta: 'Kit de resortes y herrajes',
    categoriaGeomotor: 'Frenos',
    alias: ['herraje', 'herrajes', 'resorte de freno'],
    top15: false,
  },
  {
    id: 'bases_amortiguador',
    etiqueta: 'Bases de amortiguador',
    categoriaGeomotor: 'Amortiguadores y suspensiones',
    alias: ['base de amortiguador', 'bases de amortiguador', 'copa amortiguador'],
    top15: false,
  },
  {
    id: 'guardapolvos_amortiguador',
    etiqueta: 'Guardapolvos con topes',
    categoriaGeomotor: 'Amortiguadores y suspensiones',
    alias: ['guardapolvo', 'guardapolvos', 'fuelle amortiguador', 'tope amortiguador'],
    top15: false,
  },
  {
    id: 'espirales',
    etiqueta: 'Espirales de suspensión',
    categoriaGeomotor: 'Amortiguadores y suspensiones',
    alias: ['espiral', 'espirales', 'resorte de suspension'],
    top15: false,
  },
  {
    id: 'mesetas_suspension',
    etiqueta: 'Mesetas / tijeras',
    categoriaGeomotor: 'Tren Delantero',
    alias: ['meseta', 'mesetas', 'tijera', 'tijeras', 'control arm'],
    top15: false,
  },
  {
    id: 'tornillos_estabilizadores',
    etiqueta: 'Tornillos estabilizadores',
    categoriaGeomotor: 'Tren Delantero',
    alias: ['estabilizador', 'muñequito', 'muleta', 'link estabilizador'],
    top15: false,
  },
  {
    id: 'refrigerante',
    etiqueta: 'Refrigerante / anticongelante',
    categoriaGeomotor: 'Aceites y lubricantes',
    alias: ['refrigerante', 'anticongelante', 'coolant'],
    top15: false,
  },
  {
    id: 'mangueras_radiador',
    etiqueta: 'Mangueras de radiador',
    categoriaGeomotor: 'Motores y componentes',
    alias: ['manguera de radiador', 'mangueras de radiador'],
    top15: false,
  },
  {
    id: 'tensores_tiempo',
    etiqueta: 'Tensores y poleas locas',
    categoriaGeomotor: 'Correas y bandas',
    alias: ['tensor', 'tensores', 'polea loca', 'poleas locas'],
    top15: false,
  },
  {
    id: 'estoperas_motor',
    etiqueta: 'Estoperas de levas y cigüeñal',
    categoriaGeomotor: 'Motores y componentes',
    alias: ['estopera', 'estoperas', 'retén', 'reten cigüeñal'],
    top15: false,
  },
  {
    id: 'kit_embrague',
    etiqueta: 'Kit de embrague',
    categoriaGeomotor: 'Embrague',
    alias: ['embrague', 'croche', 'clutch', 'kit de embrague'],
    top15: false,
  },
  {
    id: 'collarin_embrague',
    etiqueta: 'Collarín de embrague',
    categoriaGeomotor: 'Embrague',
    alias: ['collarin', 'collarín', 'release bearing'],
    top15: false,
  },
  {
    id: 'bombines_embrague',
    etiqueta: 'Bombín de embrague',
    categoriaGeomotor: 'Embrague',
    alias: ['bombin', 'bombín', 'bombines', 'cilindro embrague'],
    top15: false,
  },
  {
    id: 'estopera_ciguenal_trasera',
    etiqueta: 'Estopera trasera de cigüeñal',
    categoriaGeomotor: 'Motores y componentes',
    alias: ['estopera trasera', 'reten trasero'],
    top15: false,
  },
  {
    id: 'filtro_gasolina_linea',
    etiqueta: 'Filtro de gasolina externo',
    categoriaGeomotor: 'Filtros',
    alias: ['filtro de linea', 'filtro en linea', 'filtro gasolina externo'],
    top15: false,
  },
  {
    id: 'tamiz_tanque',
    etiqueta: 'Filtro tamiz / cedazo',
    categoriaGeomotor: 'Filtros',
    alias: ['tamiz', 'cedazo', 'filtro de tanque'],
    top15: false,
  },
  {
    id: 'regulador_presion',
    etiqueta: 'Regulador de presión',
    categoriaGeomotor: 'Motores y componentes',
    alias: ['regulador de presion', 'regulador de presión'],
    top15: false,
  },
  {
    id: 'cables_bujia',
    etiqueta: 'Cables de bujía',
    categoriaGeomotor: 'Bujías y encendido',
    alias: ['cable de bujia', 'cables de bujia', 'cables bujia'],
    top15: false,
  },
  {
    id: 'mozos_rueda',
    etiqueta: 'Mozos de rueda',
    categoriaGeomotor: 'Tren Delantero',
    alias: ['mozo', 'mozos', 'bocallave', 'hub'],
    top15: false,
  },
  {
    id: 'estoperas_rueda',
    etiqueta: 'Estoperas de rueda',
    categoriaGeomotor: 'Tren Delantero',
    alias: ['estopera de rueda', 'estoperas de rueda'],
    top15: false,
  },
  {
    id: 'tuerca_tripoide',
    etiqueta: 'Tuerca de punta de tripoide',
    categoriaGeomotor: 'Tren Delantero',
    alias: ['tuerca tripoide', 'tuerca de punta', 'axle nut'],
    top15: false,
  },
];

export const RELACIONES_PIEZAS_AUTO: Record<string, SugerenciaPiezaGuia[]> = {
  pastillas_freno: [
    { piezaId: 'discos_freno', prioridad: 1 },
    { piezaId: 'liquido_frenos', prioridad: 1 },
    { piezaId: 'kit_caliper', prioridad: 2 },
    { piezaId: 'mangueras_freno', prioridad: 3 },
  ],
  bandas_freno: [
    { piezaId: 'tambores_freno', prioridad: 1 },
    { piezaId: 'cilindros_rueda', prioridad: 1 },
    { piezaId: 'herrajes_freno', prioridad: 2 },
  ],
  amortiguadores: [
    { piezaId: 'bases_amortiguador', prioridad: 1 },
    { piezaId: 'guardapolvos_amortiguador', prioridad: 1 },
    { piezaId: 'espirales', prioridad: 2 },
  ],
  mesetas_suspension: [
    { piezaId: 'munones_rotulas', prioridad: 1 },
    { piezaId: 'bujes_meseta', prioridad: 1 },
    { piezaId: 'tornillos_estabilizadores', prioridad: 2 },
  ],
  bomba_agua: [
    { piezaId: 'termostato', prioridad: 1 },
    { piezaId: 'refrigerante', prioridad: 1 },
    { piezaId: 'kit_tiempo', prioridad: 2 },
    { piezaId: 'mangueras_radiador', prioridad: 2 },
  ],
  kit_tiempo: [
    { piezaId: 'bomba_agua', prioridad: 1 },
    { piezaId: 'tensores_tiempo', prioridad: 1 },
    { piezaId: 'estoperas_motor', prioridad: 2 },
  ],
  kit_embrague: [
    { piezaId: 'collarin_embrague', prioridad: 1 },
    { piezaId: 'bombines_embrague', prioridad: 1 },
    { piezaId: 'estopera_ciguenal_trasera', prioridad: 2 },
  ],
  pila_gasolina: [
    { piezaId: 'filtro_gasolina_linea', prioridad: 1 },
    { piezaId: 'tamiz_tanque', prioridad: 1 },
    { piezaId: 'regulador_presion', prioridad: 2 },
  ],
  bujias: [
    { piezaId: 'bobinas_encendido', prioridad: 1 },
    { piezaId: 'cables_bujia', prioridad: 1 },
  ],
  rodamientos_rueda: [
    { piezaId: 'mozos_rueda', prioridad: 1 },
    { piezaId: 'estoperas_rueda', prioridad: 1 },
    { piezaId: 'tuerca_tripoide', prioridad: 2 },
  ],
  bujes_meseta: [{ piezaId: 'mesetas_suspension', prioridad: 1 }, { piezaId: 'munones_rotulas', prioridad: 2 }],
  munones_rotulas: [{ piezaId: 'mesetas_suspension', prioridad: 1 }, { piezaId: 'bujes_meseta', prioridad: 1 }],
  bobinas_encendido: [{ piezaId: 'bujias', prioridad: 1 }, { piezaId: 'cables_bujia', prioridad: 2 }],
  termostato: [{ piezaId: 'bomba_agua', prioridad: 1 }, { piezaId: 'refrigerante', prioridad: 1 }],
};

export const PIEZAS_TOP15_AUTO = PIEZAS_GUIA_AUTO.filter((p) => p.top15);

const POR_ID = new Map(PIEZAS_GUIA_AUTO.map((p) => [p.id, p]));

export function piezaGuiaPorId(id: string): PiezaGuiaAuto | undefined {
  return POR_ID.get(id);
}

export function categoriasConsultaPieza(pieza: PiezaGuiaAuto): string[] {
  return categoriasEquivalentesConsulta(pieza.categoriaGeomotor);
}

export function sugerenciasDePieza(piezaId: string): SugerenciaPiezaGuia[] {
  return [...(RELACIONES_PIEZAS_AUTO[piezaId] ?? [])].sort((a, b) => a.prioridad - b.prioridad);
}
